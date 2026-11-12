// Page Sommeil, planche sommeil du 03/11 (A1 à A6) : le bloc « Dette de sommeil · 7 nuits » sous le héros (ses états : à
// rattraper, rien, dette lourde, sous le seuil de précision), son tiroir « Ta dette de sommeil » (A2) et le bloc « Besoin de
// la nuit » (A5), qui remplace « Besoin · Whoop ». Tout vient de pepfit (recup-pepfit.ts, le calcul de la Récupération) ; les
// durées de l'appareil comptent comme celles de tout capteur, ses calculs jamais.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { t, tp } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Feuille } from "../../ui/Feuille";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { heure, jourEtroit } from "../format";
import { MiniPrecision } from "../precision/MiniPrecision";
import { arrondiDette, RECUP, type BesoinNuit, type Dette } from "../recup-pepfit";
import { Cles, Duo, Groupe, MARGE, Note, useMesure, ValeurDuo } from "./gabarit";
import { Pastille, PisteBesoin, useCouleursBesoin } from "./GraphesSommeil";
import { decaler } from "./periodes";
import { instantCoucher, type SommeilDuJour } from "./sommeil-dette";
import { hm } from "./sommeil-stats";

const P = RECUP.dette;
/** Une nuit de moins de 3 h : la montre était-elle portée ? (dette lourde) */
const NUIT_COURTE = 180;

/** L'en-tête d'un bloc chiffré : son titre et l'indicateur de précision de l'appli, sur les 7 nuits du calcul (D17). */
function Entete({ titre, precision }: { titre: string; precision: number }) {
  return (
    <View style={styles.entete}>
      <Texte variante="entete" couleur="t3" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {titre}
      </Texte>
      <MiniPrecision calcul="sommeil" valeur={precision} style={{ marginRight: -6 }} />
    </View>
  );
}

/** La ligne d'action sous le bloc (« Ce soir, couche-toi vers 23:00 ») ; sans `onPress`, sans chevron. */
function Plan({ titre, sous, icone = "lune", onPress }: { titre: string; sous: string; icone?: NomIcone; onPress?: () => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={`${titre}, ${sous}`} style={[styles.plan, { borderTopColor: m.sep }]}>
      <Icone nom={icone} couleur={icone === "lune" ? m.fort : couleurs.t2} taille={20} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte style={styles.planTitre}>{titre}</Texte>
        <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
          {sous}
        </Texte>
      </View>
      {onPress ? <Icone nom="right" couleur={couleurs.t3} taille={16} /> : null}
    </Pressable>
  );
}

/** Les 7 nuits, de la plus ancienne à la dernière : le manque sous la ligne d'objectif, le surplus au-dessus, plus pâles
 * à mesure qu'elles pèsent moins ; un rond en tirets pour une nuit sans mesure. */
function Nuits7({ d, jour, largeur }: { d: Dette; jour: number; largeur: number }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const y0 = 18, k = 0.26, max = 180, slot = largeur / 7, bw = 22, H = y0 + max * k + 22;
  const chrono = d.lignes.slice().reverse();
  const lettre = (i: number) => jourEtroit(decaler(jour, i - (chrono.length - 1)));
  const lu = chrono
    .map((l, i) => {
      const o = { jour: lettre(i), d: hm(Math.abs(l.ecart)) };
      return t(!l.mesuree ? "mesuresSommeil.dette.nuitSans" : l.ecart > 0 ? "mesuresSommeil.dette.nuitManque" : l.ecart < 0 ? "mesuresSommeil.dette.nuitPlus" : "mesuresSommeil.dette.nuitObjectif", o);
    })
    .join(", ");
  return (
    <Svg width={largeur} height={H} accessibilityRole="image" accessibilityLabel={t("mesuresSommeil.dette.grapheLu", { nuits: lu })} style={{ marginTop: 14 }}>
      <Line x1={0} x2={largeur} y1={y0} y2={y0} stroke={couleurs.t2} strokeWidth={1} strokeDasharray="3 3" />
      {chrono.map((l, i) => {
        const x = slot * i + (slot - bw) / 2;
        const op = 0.35 + 0.65 * l.poids;
        if (!l.mesuree) return <Circle key={i} cx={x + bw / 2} cy={y0} r={4.5} fill="none" stroke={couleurs.t2} strokeWidth={1.25} strokeDasharray="2 2" />;
        if (l.ecart > 0) return <Rect key={i} x={x} y={y0 + 1.5} width={bw} height={Math.max(3, Math.min(max, l.ecart) * k)} rx={3} fill={m.fort} opacity={op} />;
        const h = Math.max(3, Math.min(60, -l.ecart) * k);
        return <Rect key={i} x={x} y={y0 - 1.5 - h} width={bw} height={h} rx={3} fill={couleurs.t2} opacity={op} />;
      })}
      {chrono.map((_, i) => (
        <SvgText
          key={`l${i}`}
          x={slot * i + slot / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize={11}
          fontFamily={i === chrono.length - 1 ? police.semibold : police.regular}
          fill={i === chrono.length - 1 ? couleurs.t1 : couleurs.t2}
        >
          {lettre(i)}
        </SvgText>
      ))}
    </Svg>
  );
}

/**
 * Le bloc « Dette de sommeil · 7 nuits » et sa note ; `jour` : le minuit du réveil de la dernière nuit. `sansPlan` : le soir,
 * la carte « Ce soir » dit déjà le coucher conseillé (planche sommeil, B1) : pas de ligne « Ce soir, couche-toi vers ».
 */
export function BlocDette({ s, jour, dormi, onSources, onAgenda, sansPlan = false }: { s: SommeilDuJour; jour: number; dormi: number; onSources: () => void; onAgenda: () => void; sansPlan?: boolean }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const [largeur, setLargeur] = useState(0);
  const [comprendre, setComprendre] = useState(false);
  const d = s.dette;
  const trous = d.mesurees < P.fenetre;
  const cles = [
    { libelle: t("mesuresSommeil.dette.manque"), carre: m.fort },
    { libelle: t("mesuresSommeil.dette.enPlus"), carre: couleurs.t2 },
    { libelle: t("mesuresSommeil.objectifD", { d: hm(s.objectif) }), trait: "tiret" as const },
    ...(trous ? [{ libelle: t("mesuresSommeil.dette.sansMesure"), creux: true, couleur: couleurs.t2 }] : []),
  ];
  const a = arrondiDette(d.aRattraper);
  const soirs = tp("mesuresSommeil.soirs", d.soirs);
  const coucher = s.coucher != null ? heure(instantCoucher(s.coucher, jour)) : null;

  let tete: ReactNode, lu: string, dit: string | null = null, plan: ReactNode = null, note: string;
  if (!d.chiffre) {
    // sous le seuil de précision : les nuits restent visibles, aucun chiffre d'action (D17)
    tete = <ValeurDuo valeur={t("mesuresSommeil.dette.pasDeChiffre")} sous={t(s.appareil === "telephone" ? "mesuresSommeil.dette.pasDeChiffreTel" : "mesuresSommeil.dette.pasDeChiffreSous", { n: d.mesurees })} />;
    lu = t("mesuresSommeil.dette.luSeuil");
    plan = <Plan icone="info" titre={t("mesuresSommeil.dette.dors")} sous={t("mesuresSommeil.dette.seuilSous", { n: P.precisionMin })} onPress={onSources} />;
    note = t("mesuresSommeil.dette.seuilNote", { p: d.precision, n: P.precisionMin });
  } else if (d.lourde) {
    const courtes = d.lignes.filter((l) => l.dormi != null && l.dormi < NUIT_COURTE).length;
    tete = <Duo gauche={<ValeurDuo valeur={t("mesuresSommeil.dette.lourde")} sous={t("mesuresSommeil.dette.lourdeSous")} />} droite={<ValeurDuo droite valeur={hm(d.cumul)} sous={t("mesuresSommeil.dette.manque7")} />} />;
    lu = t("mesuresSommeil.dette.luLourde", { cumul: hm(d.cumul) });
    dit = t("mesuresSommeil.dette.lourdeDit");
    plan = courtes ? <Plan icone="info" titre={tp("mesuresSommeil.dette.courtes", courtes)} sous={t("mesuresSommeil.dette.courtesSous")} onPress={onAgenda} /> : null;
    note = t("mesuresSommeil.dette.medecin");
  } else if (d.aRattraper === 0) {
    tete = <ValeurDuo valeur={t("mesuresSommeil.dette.rien")} sous={t("mesuresSommeil.dette.rienSous")} />;
    lu = t("mesuresSommeil.dette.luRien");
    plan = coucher ? <Plan titre={t("mesuresSommeil.dette.garde", { heure: coucher })} sous={t("mesuresSommeil.dette.gardeSous")} /> : null;
    note = t("mesuresSommeil.dette.noteRien", { cumul: hm(d.cumul) });
  } else {
    tete = <Duo gauche={<ValeurDuo valeur={hm(a)} sous={t("mesuresSommeil.dette.aRattraper")} />} droite={<ValeurDuo droite valeur={soirs} sous={t("mesuresSommeil.dette.eponger")} />} />;
    lu = t("mesuresSommeil.dette.lu", { a: hm(a), soirs });
    plan = coucher && !sansPlan ? <Plan titre={t("mesuresSommeil.dette.ceSoir", { heure: coucher })} sous={t("mesuresSommeil.dette.ceSoirSous", { n: P.avance })} /> : null;
    note =
      s.appareil === "telephone"
        ? t("mesuresSommeil.dette.noteTel")
        : trous
          ? t("mesuresSommeil.dette.noteTrous", { n: d.mesurees })
          : t("mesuresSommeil.dette.noteCumul", { cumul: hm(d.cumul) });
  }

  return (
    <>
      <Entete titre={t("mesuresSommeil.dette.titre")} precision={d.precision} />
      <Groupe bloc>
        <Pressable accessibilityRole="button" accessibilityLabel={lu} onPress={() => setComprendre(true)} onLayout={(e) => setLargeur(Math.floor(e.nativeEvent.layout.width))}>
          {tete}
          {largeur > 0 ? <Nuits7 d={d} jour={jour} largeur={largeur} /> : <View style={{ height: 14 + 18 + 180 * 0.26 + 22 }} />}
          <Cles cles={cles} style={{ marginTop: 8 }} />
          {dit ? (
            <Texte variante="corps" couleur="t2" style={styles.dit}>
              {dit}
            </Texte>
          ) : null}
        </Pressable>
        {plan}
      </Groupe>
      <Note style={{ marginHorizontal: MARGE }}>{note}</Note>
      <FeuilleDette visible={comprendre} onFermer={() => setComprendre(false)} s={s} dormi={dormi} />
    </>
  );
}

/** A2 · « Ta dette de sommeil » : les trois chiffres, l'appareil (en détail seulement), le poids des nuits, pourquoi pas tout
 * rattraper, les sources. */
function FeuilleDette({ visible, onFermer, s, dormi }: { visible: boolean; onFermer: () => void; s: SommeilDuJour; dormi: number }) {
  const m = useMesure();
  const d = s.dette;
  const chiffres: [string, string, string][] = [
    [t("mesuresSommeil.dette.manqueNuit"), s.matin.besoin.chiffre ? hm(Math.max(0, s.matin.besoin.total - dormi)) : "—", t("mesuresSommeil.dette.manqueNuitTexte")],
    [t("mesuresSommeil.dette.manque7Titre"), hm(d.cumul), t("mesuresSommeil.dette.manque7Texte", { d: hm(s.objectif) })],
    [t("mesuresSommeil.dette.rattraperTitre"), d.chiffre ? hm(arrondiDette(d.aRattraper)) : "—", t("mesuresSommeil.dette.rattraperTexte")],
  ];
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("mesuresSommeil.dette.comprendre")} sousTitre={t("mesuresSommeil.dette.troisChiffres")}>
      <View style={{ paddingHorizontal: MARGE, paddingBottom: 16 }}>
        {chiffres.map(([titre, v, texte]) => (
          <View key={titre} style={[styles.chiffre, { borderBottomColor: m.sep }]}>
            <View style={styles.chiffreTete}>
              <Texte style={styles.chiffreTitre}>{titre}</Texte>
              <Texte style={styles.chiffreValeur}>{v}</Texte>
            </View>
            <Texte variante="meta" couleur="t2" style={{ marginTop: 3, lineHeight: 18 }}>
              {texte}
            </Texte>
          </View>
        ))}
        {s.appareil ? (
          <View style={styles.source}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texte style={styles.sourceTitre}>{t(`mesuresSommeil.dette.mesurePar.${s.appareil}` as "mesuresSommeil.dette.mesurePar.montre")}</Texte>
              <Texte variante="meta" couleur="t2" style={{ marginTop: 2, lineHeight: 17 }}>
                {t("mesuresSommeil.dette.mesureSous", { n: d.mesurees })}
              </Texte>
            </View>
            <MiniPrecision calcul="sommeil" valeur={d.precision} style={{ marginRight: -6 }} />
          </View>
        ) : null}
        <View style={[styles.sep, { backgroundColor: m.sep }]} />
        <Texte style={styles.h3}>{t("mesuresSommeil.dette.poids")}</Texte>
        <View style={styles.poids} accessible accessibilityRole="image" accessibilityLabel={t("mesuresSommeil.dette.poidsLu")}>
          {Array.from({ length: P.fenetre }, (_, i) => (i + 1) / P.fenetre).map((p) => (
            <View key={p} style={{ flex: 1, height: `${p * 100}%`, opacity: 0.35 + 0.65 * p, backgroundColor: m.fort, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 }} />
          ))}
        </View>
        <View style={styles.poidsL}>
          <Texte variante="meta" couleur="t2">{t("mesuresSommeil.dette.poidsAncienne")}</Texte>
          <Texte variante="meta" couleur="t2">{t("mesuresSommeil.dette.poidsDerniere")}</Texte>
        </View>
        <Texte style={styles.h3}>{t("mesuresSommeil.dette.pourquoi")}</Texte>
        <Texte variante="corps" couleur="t2" style={{ marginTop: 6, lineHeight: 20 }}>
          {t("mesuresSommeil.dette.pourquoiTexte")}
        </Texte>
        <Texte style={styles.h3}>{t("mesuresSommeil.dette.sources")}</Texte>
        <Texte variante="meta" couleur="t3" style={{ marginTop: 4, lineHeight: 18 }}>
          {t("mesuresSommeil.dette.sourcesTexte")}
        </Texte>
      </View>
    </Feuille>
  );
}

/** A5 · « Besoin de la nuit » : réalisé sur le besoin calculé par pepfit, le manque, ses trois parts et d'où elles viennent. */
export function BlocBesoinNuit({ b, dormi }: { b: BesoinNuit; dormi: number }) {
  const cb = useCouleursBesoin();
  if (!(b.total > 0)) return null;
  const total = b.chiffre ? b.total : b.objectif;
  const parts = b.chiffre
    ? ([
        ["objectif", b.objectif, cb.base],
        ["rattrapage", b.rattrapage, cb.dette],
        ["effort", b.effort, cb.effort],
      ] as const)
    : null;
  const pct = b.ratioEffort != null ? Math.round((b.ratioEffort - 1) * 100) : null;
  const note = !b.chiffre
    ? t("mesuresSommeil.besoinSeuil", { n: P.precisionMin })
    : [
        t("mesuresSommeil.besoinNote.objectif", { o: hm(b.objectif) }),
        b.rattrapage > 0 ? t("mesuresSommeil.besoinNote.rattrapage", { r: hm(b.rattrapage), v: hm(arrondiDette(b.veille ?? 0)), max: P.avance }) : "",
        b.effort > 0 && pct != null ? t("mesuresSommeil.besoinNote.effort", { e: hm(b.effort), pct }) : "",
        b.rattrapage <= 0 && b.effort <= 0 ? t("mesuresSommeil.besoinNote.rien") : "",
      ].join("") + ".";
  return (
    <>
      <Entete titre={t("mesuresSommeil.besoinNuit")} precision={b.precision} />
      <Groupe bloc>
        <Duo
          gauche={
            <>
              <Texte numberOfLines={1} style={styles.besoinValeur}>
                {hm(dormi)}
                <Texte variante="corps" couleur="t2">{` ${t("mesuresSommeil.surBesoin", { d: hm(total) })}`}</Texte>
              </Texte>
              <Texte variante="meta" couleur="t3" style={{ marginTop: 1 }}>
                {b.chiffre ? t("mesuresSommeil.realise") : t("mesuresSommeil.realiseObjectif")}
              </Texte>
            </>
          }
          droite={b.chiffre ? <ValeurDuo droite valeur={hm(Math.max(0, b.total - dormi))} sous={t("mesuresSommeil.deDette")} /> : undefined}
        />
        <View accessible accessibilityRole="image" accessibilityLabel={t("mesuresSommeil.pisteLu", { dormi: hm(dormi), total: hm(total) })}>
          <PisteBesoin base={parts ? b.objectif : total} dette={parts ? b.rattrapage : 0} effort={parts ? b.effort : 0} fait={dormi / total} />
        </View>
        {parts ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            {parts.map(([k, v, c]) => (
              <View key={k} style={{ flex: 1 }}>
                <Pastille couleur={c} libelle={t(`mesuresSommeil.besoin.${k}` as "mesuresSommeil.besoin.objectif")} taille={10} />
                <Texte style={styles.part}>{hm(v)}</Texte>
              </View>
            ))}
          </View>
        ) : null}
      </Groupe>
      <Note style={{ marginHorizontal: MARGE }}>{note}</Note>
    </>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 22, marginBottom: -6, marginHorizontal: MARGE },
  plan: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, marginTop: 12, marginHorizontal: -16, marginBottom: -12, paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  planTitre: { fontFamily: police.medium, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  dit: { fontSize: 13.5, lineHeight: 20, marginTop: 12 },
  besoinValeur: { fontFamily: police.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, fontVariant: ["tabular-nums"] },
  part: { fontFamily: police.medium, fontSize: 15, marginTop: 3, fontVariant: ["tabular-nums"] },
  chiffre: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  chiffreTete: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  chiffreTitre: { fontFamily: police.medium, fontSize: 15 },
  chiffreValeur: { fontFamily: police.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  source: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  sourceTitre: { fontFamily: police.semibold, fontSize: 13 },
  sep: { height: StyleSheet.hairlineWidth, marginTop: 16 },
  h3: { fontFamily: police.semibold, fontSize: 15, marginTop: 18 },
  poids: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 10, height: 30 },
  poidsL: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
});
