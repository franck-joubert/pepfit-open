// Sommeil (planche sante-energie v2, D15 à D18) : la nuit choisie (nuit par nuit), sa durée et ses horaires, les stades et
// leur part du temps au lit, les réveils, l'efficacité et la respiration, l'historique sur 7 et 30 nuits, la source.
// Santé Connect, et Whoop quand il est connecté (sa nuit prime) : sans Whoop, ni performance, ni besoin, ni régularité, ni cycles (rien d'inventé).
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { sante } from "../natif/sante";
import { fusionnerNuits, nuitsWhoop } from "../whoop/lecture";
import { fusionnerNuitsWithings, nuitsWithings } from "../withings/lecture";
import type { SommeilNuit } from "../natif/sante/types";
import { useTheme } from "../theme";
import { couleursSante } from "../theme/effets";
import { espace, police } from "../theme/typo";
import { Texte } from "../ui/Texte";
import { etatSanteConnect, LigneSanteConnect } from "./Composition";
import { useCharge } from "./contexte";
import { formater } from "../i18n/temps";
import { approx, heure, jourCourt, jourMois, nombre } from "./format";
import { dureeSommeil } from "./sante-vue";
import { nomSource } from "./sante-donnees";
import { BarreSegments, NavJour, Point, Section, Valeur } from "./sante-ui";
import { analyserNuit, debutJourLocal, historiqueNuits, moyenneMinutes, moyennePendant, STADES } from "./sommeil-calc";
import { EcranSuivi, Filet, Groupe, Ligne } from "./suivi-ui";

const JOUR = 86_400_000;

function libelleNuit(n: SommeilNuit): string {
  const a = new Date(n.debut), b = new Date(n.fin);
  const debut = a.getMonth() === b.getMonth() ? String(a.getDate()) : jourMois(n.debut);
  return t("sante.nuitDu", { a: debut, b: jourMois(n.fin) });
}

export function Sommeil() {
  useLangue();
  const { couleurs, mode } = useTheme();
  const c = couleursSante[mode];
  const [x, recharger] = useCharge(async (db) => {
    const maintenant = Date.now();
    const [nuitsSante, resp, etat, nuitsW, nuitsWi] = await Promise.all([
      sante.nuits(debutJourLocal(maintenant) - 31 * JOUR, maintenant).catch(() => null),
      sante.mesures("respiration", 31).catch(() => null),
      etatSanteConnect(),
      nuitsWhoop(db, debutJourLocal(maintenant) - 31 * JOUR, maintenant),
      nuitsWithings(db, debutJourLocal(maintenant) - 31 * JOUR, maintenant),
    ]);
    // Whoop prime, puis Withings : leur nuit remplace celle de Santé Connect du même réveil
    const nuits = fusionnerNuits(fusionnerNuitsWithings(nuitsSante ?? [], nuitsWi), nuitsW);
    return { nuits, resp: resp ?? [], etat, maintenant };
  });
  const [rang, setRang] = useState<number | null>(null);
  const nuits = x?.nuits ?? [];
  const i = rang ?? nuits.length - 1;
  const n = nuits[i];
  const a = n ? analyserNuit(n) : null;
  const resp = n && x ? moyennePendant(x.resp, n.debut, n.fin) : null;
  const couleurStade = { eveil: c.eveil, leger: c.leger, profond: c.profond, paradoxal: c.paradoxal };
  const fin = debutJourLocal(x?.maintenant ?? Date.now());
  const h7 = historiqueNuits(nuits, 7, fin);
  const h30 = historiqueNuits(nuits, 30, fin);
  const lignesNuit = a
    ? [
        a.latenceMin != null ? <Ligne titre={t("sante.latence")} valeur={<Valeur v={nombre(a.latenceMin, 0)} unite={t("sante.minutesUnite")} />} /> : null,
        a.reveils != null ? <Ligne titre={t("sante.reveils")} valeur={nombre(a.reveils, 0)} /> : null,
        resp != null ? <Ligne titre={t("sante.respiration")} sous={nomSource(x?.resp[0]?.origine)} valeur={<Valeur v={nombre(resp, 1)} unite={t("sante.parMin")} />} /> : null,
      ].filter((l) => l != null)
    : [];

  return (
    <EcranSuivi titre={t("sante.sommeil")}>
      {n && a ? (
        <>
          <View style={{ marginHorizontal: espace.s, flexDirection: "row" }}>
            <NavJour
              etale
              libelle={libelleNuit(n)}
              onPrecedent={() => setRang(Math.max(0, i - 1))}
              onSuivant={() => setRang(Math.min(nuits.length - 1, i + 1))}
              suivantPossible={i < nuits.length - 1}
              libellePrecedent={t("sante.nuitPrecedente")}
              libelleSuivant={t("sante.nuitSuivante")}
            />
          </View>
          <View style={styles.tete}>
            <View>
              <Texte variante="chiffreFort" style={{ lineHeight: 52, letterSpacing: -0.88 }}>
                {dureeSommeil(a.sommeilMin)}
              </Texte>
              <Texte variante="corps" couleur="t2" style={{ marginTop: 2 }}>
                {t("sante.sommeilDe", { source: nomSource(a.origine) })}
              </Texte>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Texte variante="titre" style={{ lineHeight: 26 }}>{approx(`${nombre(a.efficacite, 0)} %`)}</Texte>
              <Texte variante="corps" couleur="t2" style={{ marginTop: 2 }}>
                {t("sante.efficacite")}
              </Texte>
              <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>{`${heure(a.debut)} → ${heure(a.fin)}`}</Texte>
            </View>
          </View>
          {a.stades ? (
            <>
              <Section>{t("sante.stadesAuLit", { d: dureeSommeil(a.auLitMin) })}</Section>
              <Groupe>
                <View style={{ paddingHorizontal: espace.l, paddingTop: 14, paddingBottom: espace.l }}>
                  <BarreSegments hauteur={16} segments={STADES.map((s) => ({ couleur: couleurStade[s], valeur: a.stades![s].minutes }))} />
                </View>
                {STADES.map((s, j) => (
                  <View key={s}>
                    {j ? <Filet /> : null}
                    <Ligne
                      avant={<Point couleur={couleurStade[s]} />}
                      titre={t(`sante.stade.${s}` as "sante.stade.eveil")}
                      valeur={<Valeur v={dureeSommeil(a.stades![s].minutes)} unite={`${a.stades![s].part} %`} />}
                    />
                  </View>
                ))}
              </Groupe>
            </>
          ) : null}
          {/* Nuit : l'efficacité est déjà en tête (audit, constat 34) ; ici ce qu'on n'a pas encore vu, s'il existe. */}
          {lignesNuit.length ? (
            <>
              <Section>{t("sante.nuit")}</Section>
              <Groupe>
                {lignesNuit.map((l, j) => (
                  <View key={j}>
                    {j ? <Filet /> : null}
                    {l}
                  </View>
                ))}
              </Groupe>
            </>
          ) : null}
          <Section>{t("sante.historique")}</Section>
          <Groupe>
            <Historique titre={t("sante.nuits7")} l={h7} fin={fin} large />
          </Groupe>
          <Groupe>
            <Historique titre={t("sante.nuits30")} l={h30} fin={fin} />
          </Groupe>
        </>
      ) : (
        <Texte variante="corps" couleur="t2" style={{ marginHorizontal: espace.l, marginTop: espace.l }}>
          {t("sante.pasDeNuit")}
        </Texte>
      )}
      <Section>{t("sante.sources")}</Section>
      <Groupe>
        <LigneSanteConnect etat={x?.etat ?? "absente"} aide={t("sante.sessionsSommeil")} onChange={() => recharger()} />
      </Groupe>
    </EcranSuivi>
  );
}

/** Barres de sommeil par nuit (rose Santé à plat, la dernière pleine, D18) sur une grille 4, 8 et 12 h. */
function Historique({ titre, l, fin, large }: { titre: string; l: (number | null)[]; fin: number; large?: boolean }) {
  const { couleurs } = useTheme();
  const W = useWindowDimensions().width - espace.l * 4 - 28;
  const H = 132;
  const base = H - 18;
  const k = (base - 6) / 720;
  const pas = W / l.length;
  const bw = large ? 26 : 6;
  const moy = moyenneMinutes(l);
  const etiquette = (j: number) => {
    const d = fin - (l.length - 1 - j) * JOUR;
    if (j === l.length - 1) return t("suivi.aujCourt");
    if (large) return jourCourt(d);
    return j === 1 || j === 15 ? formater(d, { day: "2-digit", month: "2-digit" }) : "";
  };
  return (
    <View style={{ paddingHorizontal: espace.l, paddingTop: 14, paddingBottom: espace.m }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Texte variante="corps" style={{ fontFamily: police.medium }}>
          {titre}
        </Texte>
        {moy != null ? (
          <Texte variante="meta" couleur="t3">
            {t("sante.moyenneNuit", { d: dureeSommeil(moy) })}
          </Texte>
        ) : null}
      </View>
      <Svg width={W + 28} height={H} style={{ marginTop: 10 }} accessibilityLabel={moy != null ? `${titre} : ${t("sante.moyenneNuit", { d: dureeSommeil(moy) })}` : titre}>
        {[4, 8, 12].map((h) => (
          <G key={h}>
            <Line x1={0} x2={W} y1={base - h * 60 * k} y2={base - h * 60 * k} stroke={couleurs.line} strokeWidth={1} />
            <SvgText x={W + 6} y={base - h * 60 * k + 4} fontSize={11} fontFamily={police.regular} fill={couleurs.t3}>{`${h} h`}</SvgText>
          </G>
        ))}
        <Line x1={0} x2={W} y1={base} y2={base} stroke={couleurs.line2} strokeWidth={1} />
        {l.map((m, j) => {
          const x = j * pas + (pas - bw) / 2;
          const der = j === l.length - 1;
          const e = etiquette(j);
          return (
            <G key={j}>
              {m ? <Rect x={x} y={base - m * k} width={bw} height={m * k} rx={large ? 3 : 2} fill={couleurs.partieSante} opacity={der ? 1 : 0.5} /> : null}
              {e ? (
                <SvgText x={x + bw / 2} y={H - 2} fontSize={11} fontFamily={police.regular} textAnchor="middle" fill={der ? couleurs.t1 : couleurs.t3}>
                  {e}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: espace.m, marginHorizontal: espace.l, marginBottom: espace.l },
});
