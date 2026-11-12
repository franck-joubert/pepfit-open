// Page Récupération, les briques de la planche recuperation (validée le 31/10, avec un petit « % » à côté du score) : le
// grand anneau du jour (le score sur 100, le mot dessous, jamais de rouge), la phrase d'action et l'indicateur de précision,
// la cible d'Effort que le score règle, « D'où vient ce chiffre » (les quatre parts, leur zone en bande et la nuit en point,
// leur apport), le tiroir « Comprendre la Récupération » et la courbe de la VFC dans sa zone.
// Données : recup-donnees.ts ; calculs : recup-pepfit.ts (scoreRecup, la seule fonction de score).
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { lireSexe } from "../../db/depots/profil";
import { locale, t } from "../../i18n/index";
import { avantDelai, DELAI_LECTURE_MS } from "../../natif/sante/logique";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Appui } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { scoreEffort, type Cible } from "../effort-pepfit";
import { nombre } from "../format";
import { MiniPrecision } from "../precision/MiniPrecision";
import { assurerNuitsRecup, finNuit, lireRecupJour } from "../recup-donnees";
import { depsNuitsAppareil } from "../recup-appareil";
import { ajustementCible, CLES_PARTS, RECUP, type ClePart, type ResultatRecup } from "../recup-pepfit";
import { lireCible } from "../sport-stats-donnees";
import { CYCLE } from "../../cycle/modele";
import { Anneau, BlocVide, Groupe, LigneMesure, Lignes, TitreGroupe, useMesure } from "./gabarit";
import { heuresMinutes, manqueNuit, motRecup, phraseRecup, texteRecup } from "./recup-vue";
import { texteDemi, texteEffort } from "./scores-calc";

export interface DonneesRecupJour {
  jour: number;
  r: ResultatRecup;
  /** Fin de la nuit (« Ce matin, 7:02 »), null sans heure. */
  heure: number | null;
  cible: Cible | null;
  feminin: boolean;
}

/** La Récupération d'un jour (minuit), sa nuit, sa cible ; aujourd'hui et hier, les nuits sont relues d'abord. */
export function useRecupJour(jour: number, maintenant: number): DonneesRecupJour | null {
  const { db } = useApp();
  const [d, setD] = useState<DonneesRecupJour | null>(null);
  const charger = useCallback(async () => {
    const deps = await depsNuitsAppareil().catch(() => ({}));
    const [r, heure, cible, sexe] = await Promise.all([
      lireRecupJour(db, jour),
      finNuit(db, jour, deps).catch(() => null),
      lireCible(db, jour, maintenant).catch(() => null),
      lireSexe(db).catch(() => null),
    ]);
    setD({ jour, r, heure, cible, feminin: sexe === "f" });
  }, [db, jour, maintenant]);
  useEffect(() => {
    charger().catch(console.error);
  }, [charger]);
  useEffect(() => {
    const d = new Date(maintenant);
    if (jour < new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime() || jour > maintenant) return;
    let vivant = true;
    depsNuitsAppareil()
      .then((deps) => avantDelai(assurerNuitsRecup(db, { ...deps, maintenant: Date.now() }), DELAI_LECTURE_MS))
      .then((n) => (vivant && n ? charger() : undefined))
      .catch(console.warn);
    return () => {
      vivant = false;
    };
  }, [db, jour, maintenant, charger]);
  useFocusEffect(
    useCallback(() => {
      charger().catch(console.error);
    }, [charger]),
  );
  return d && d.jour === jour ? d : null;
}

// ---------------------------------------------------------------- le jour

/** Le grand anneau (156 dp) : le score sur 100 dans la couleur de la page, « 90 % » au centre, le mot dessous. */
export function AnneauRecup({ r, feminin }: { r: ResultatRecup; feminin: boolean }) {
  const { couleurs } = useTheme();
  const score = r.score;
  const mot = r.niveau ? motRecup(r.niveau, feminin) : null;
  return (
    <View style={styles.anneauBoite} accessible accessibilityLabel={score != null && mot ? t("recup.luAnneau", { valeur: texteRecup(score), mot }) : t("recup.pasDeScoreTitre")}>
      <Anneau part={score != null ? score / 100 : 0} taille={156} />
      <View style={styles.dedans} pointerEvents="none">
        <Texte numberOfLines={1} style={[styles.chiffre, { color: score == null ? couleurs.t2 : couleurs.t1 }]}>
          {score == null ? "–" : nombre(score, 0)}
          {score != null ? <Texte style={[styles.pourcent, { color: couleurs.t2 }]}>{t("recup.pourcent", { n: "" })}</Texte> : null}
        </Texte>
        {mot ? <Texte style={[styles.mot, { color: couleurs.t2 }]}>{mot}</Texte> : null}
      </View>
    </View>
  );
}

/** La phrase d'action, puis « Ce matin, 7:02 » et l'indicateur mini de la précision de ce matin. */
export function PhraseRecup({ d, aujourdhui }: { d: DonneesRecupJour; aujourdhui: boolean }) {
  const { couleurs } = useTheme();
  const { r } = d;
  const manque = r.nuit ? manqueNuit(r) : null;
  const quand = manque
    ? t(manque === "vfcFc" ? (aujourdhui ? "recup.sansVfcFc" : "recup.sansVfcFcLa") : aujourdhui ? "recup.sansMontre" : "recup.sansMontreLa")
    : d.heure != null
      ? t(aujourdhui ? "recup.ceMatin" : "recup.ceMatinLa", { heure: new Date(d.heure).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }) })
      : t(aujourdhui ? "recup.ceMatinSeul" : "recup.ceMatinLaSeul");
  return (
    <>
      {r.niveau ? <Texte style={[styles.phrase, { color: couleurs.t1 }]}>{phraseRecup(r.niveau, r.prudent, d.feminin)}</Texte> : null}
      <View style={styles.quand}>
        <Texte variante="meta" couleur="t3" style={styles.quandTexte}>
          {quand}
        </Texte>
        <MiniPrecision calcul="recup" valeur={r.precision} />
      </View>
    </>
  );
}

/** Ce qui manque cette nuit : sans la montre (le score reste, D4), ou pas de score du tout. */
export function BlocNuit({ r, aujourdhui }: { r: ResultatRecup; aujourdhui: boolean }) {
  if (r.score == null)
    return !r.nuit && aujourdhui ? (
      <BlocVide titre={t("recup.pasEncoreTitre")} texte={t("recup.pasEncoreTexte")} style={styles.bloc} />
    ) : (
      <BlocVide titre={t("recup.pasDeScoreTitre")} texte={t("recup.pasDeScoreTexte")} style={styles.bloc} />
    );
  const manque = manqueNuit(r);
  if (manque === "vfcFc") return <BlocVide titre={t("recup.sansVfcFcTitre")} texte={t("recup.sansVfcFcTexte")} style={styles.bloc} />;
  if (manque)
    return (
      <BlocVide
        titre={t("recup.sansMontreTitre")}
        texte={t(r.detail.sommeil.source === "telephone" ? "recup.sansMontreTexte" : "recup.sansMontreTexteSeul")}
        style={styles.bloc}
      />
    );
  return null;
}

/** La cible d'Effort que la Récupération règle (NOTES § 5), qui ouvre la page Effort. */
export function CarteCible({ d, aujourdhui }: { d: DonneesRecupJour; aujourdhui: boolean }) {
  const { couleurs } = useTheme();
  const { r, cible } = d;
  const tuile = (
    <View style={[styles.tuile, { backgroundColor: couleurs.pictoRepas }]}>
      <Icone nom="eclair" couleur={couleurs.t2} taille={20} />
    </View>
  );
  const ouvrir = () => router.push({ pathname: "/sante/effort", params: { jour: String(d.jour) } });
  if (!cible)
    return (
      <Groupe style={styles.cible}>
        <LigneMesure avant={tuile} titre={t("recup.sansCible")} sous={t("recup.sansCibleSous")} onPress={ouvrir} />
      </Groupe>
    );
  const a = ajustementCible(r.forme);
  const sous =
    cible.base === "repos"
      ? t("recup.cibleRepos")
      : r.score != null && r.prudent
        ? t("recup.ciblePrudente")
        : a > 0
          ? t("recup.cibleRelevee", { n: a })
          : a < 0
            ? t("recup.cibleBaissee", { n: -a })
            : t("recup.cibleHabituelle");
  const titre = t(aujourdhui ? "recup.cible" : "recup.cibleJour", { bas: texteDemi(cible.bas), haut: texteDemi(cible.haut) });
  return (
    <Groupe style={styles.cible}>
      <LigneMesure avant={tuile} titre={titre} sous={sous} onPress={ouvrir} libelle={t("recup.luCible", { bas: texteDemi(cible.bas), haut: texteDemi(cible.haut) })} />
    </Groupe>
  );
}

/** Une piste fine : la zone habituelle en bande, la nuit en point (l'échelle peut aller à l'envers : la FC au repos). */
function Piste({ min, max, zone, x }: { min: number; max: number; zone: readonly [number, number]; x: number }) {
  const m = useMesure();
  const { couleurs } = useTheme();
  const pos = (q: number) => Math.max(0, Math.min(1, (q - min) / (max - min)));
  const [za, zb] = [pos(zone[0]), pos(zone[1])].sort((a, b) => a - b) as [number, number];
  return (
    <View style={[styles.piste, { backgroundColor: m.voile }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.zone, { left: `${za * 100}%`, width: `${(zb - za) * 100}%`, backgroundColor: m.doux }]} />
      <View style={[styles.point, { left: `${pos(x) * 100}%`, backgroundColor: couleurs.t1, borderColor: m.groupe }]} />
    </View>
  );
}

/** Une part : titre et zone habituelle à gauche, valeur et apport à droite, la piste dessous. */
function Part({
  titre,
  sous,
  valeur,
  unite,
  apport,
  piste,
  ajuste = false,
}: {
  titre: string;
  sous: string;
  valeur: string;
  unite?: string;
  apport: number;
  piste?: React.ReactNode;
  /** Norme de la même phase du cycle (planche cycle, écran 6) : la mention « ajusté à ta phase » sous la zone. */
  ajuste?: boolean;
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const lu = t("recup.luPart", { titre, valeur: unite ? `${valeur} ${unite}` : valeur, sous: ajuste ? `${sous}, ${t("cycle.recup.ajuste")}` : sous, n: apport });
  return (
    <View style={styles.part} accessible accessibilityLabel={lu}>
      <View style={styles.partHaut}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="corps" style={{ fontSize: 15 }}>
            {titre}
          </Texte>
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
          {ajuste ? (
            <View style={styles.ajuste}>
              <Icone nom="cycle" couleur={m.fort} taille={14} />
              <Texte variante="meta" style={{ color: m.fort, fontFamily: police.medium }}>
                {t("cycle.recup.ajuste")}
              </Texte>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Texte style={[styles.partValeur, { color: couleurs.t1 }]}>
            {valeur}
            {unite ? <Texte variante="meta" couleur="t3">{` ${unite}`}</Texte> : null}
          </Texte>
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {t("recup.apport", { n: apport })}
          </Texte>
        </View>
      </View>
      {piste}
    </View>
  );
}

/** « D'où vient ce chiffre » : les quatre parts, puis la somme (41 + 20 + 22 + 7). */
export function DouVientRecup({ r }: { r: ResultatRecup }) {
  const v = r.detail.vfc;
  const f = r.detail.fc;
  const so = r.detail.sommeil;
  const ch = r.detail.charge;
  // ajustée à la phase du cycle (planche cycle, écran 6) : « ta zone en seconde moitié : 47 à 55 ms »
  const aj = r.ajuste;
  const zoneTexte = (n: NonNullable<typeof v.norme>, unite: string, phase: boolean) =>
    t(phase && aj ? (aj.moitie === "seconde" ? "cycle.recup.zoneSeconde" : "cycle.recup.zonePremiere") : "recup.taZone", { bas: nombre(n.zone[0], 0), haut: nombre(n.zone[1], 0), unite });
  const sousNorme = (val: number | null, n: typeof v.norme, unite: string, phase = false) =>
    val == null ? t("recup.absente") : n && n.q > 0 ? zoneTexte(n, unite, phase) : t("recup.zoneBientot", { n: n?.n ?? 0 });
  const charge = (() => {
    if (ch.moyJour == null) return t("recup.chargeAbsente");
    const hier = ch.veille > 0 ? t("recup.charge.hier", { v: texteEffort(scoreEffort(ch.veille)) }) : t("recup.charge.reposHier");
    const avant =
      ch.avantVeille > 0
        ? t(ch.veille > 0 ? "recup.charge.avantHier" : "recup.charge.avantHierEffort", { v: texteEffort(scoreEffort(ch.avantVeille)) })
        : t("recup.charge.reposAvantHier");
    return `${hier}, ${avant}`;
  })();
  const sommeilSous =
    so.dormi == null
      ? t("recup.absente")
      : so.source === "telephone"
        ? t("recup.besoinTelephone", { besoin: heuresMinutes(so.besoin) })
        : so.dette != null
          ? t("recup.besoinDette", { besoin: heuresMinutes(so.besoin), dette: heuresMinutes(so.dette) })
          : t("recup.besoin", { besoin: heuresMinutes(so.besoin) });
  const apport = (k: ClePart) => r.apports[k].apport;
  const somme = CLES_PARTS.map((k) => nombre(apport(k), 0)).join(" + ");
  return (
    <>
      <TitreGroupe>{t("recup.douVient")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <Part
              key="vfc"
              titre={t("recup.part.vfc")}
              sous={r.sansVfc ? t("recup.sansVfc") : sousNorme(v.valeur, v.norme, t("recup.ms"), aj?.vfc != null)}
              ajuste={aj?.vfc != null && v.valeur != null}
              valeur={v.valeur != null ? nombre(v.valeur, 0) : "–"}
              unite={v.valeur != null ? t("recup.ms") : undefined}
              apport={apport("vfc")}
              piste={v.valeur != null && v.norme && v.norme.q > 0 ? <Piste min={v.norme.centre * 0.6} max={v.norme.centre * 1.5} zone={v.norme.zone} x={v.valeur} /> : undefined}
            />,
            <Part
              key="fc"
              titre={t("recup.part.fc")}
              sous={sousNorme(f.valeur, f.norme, t("recup.bpm"), aj?.fc != null)}
              ajuste={aj?.fc != null && f.valeur != null}
              valeur={f.valeur != null ? nombre(f.valeur, 0) : "–"}
              unite={f.valeur != null ? t("recup.bpm") : undefined}
              apport={apport("fc")}
              piste={f.valeur != null && f.norme && f.norme.q > 0 ? <Piste min={f.norme.centre + 7} max={f.norme.centre - 7} zone={f.norme.zone} x={f.valeur} /> : undefined}
            />,
            <Part
              key="sommeil"
              titre={t("recup.part.sommeil")}
              sous={sommeilSous}
              valeur={so.dormi != null ? heuresMinutes(so.dormi) : "–"}
              apport={apport("sommeil")}
              piste={so.dormi != null ? <Piste min={so.besoin * 0.6} max={so.besoin * 1.2} zone={[so.besoin * 0.9, so.besoin * 1.1]} x={so.dormi} /> : undefined}
            />,
            <Part
              key="charge"
              titre={t("recup.part.charge")}
              sous={charge}
              valeur={ch.r != null ? nombre(ch.r, 1) : "–"}
              unite={ch.r != null ? t("recup.fois") : undefined}
              apport={apport("charge")}
              piste={ch.r != null ? <Piste min={0} max={2.5} zone={RECUP.charge.zone} x={ch.r} /> : undefined}
            />,
            <LigneMesure
              key="total"
              titre={t("recup.taRecup")}
              sous={r.garde ? `${somme}, ${t("recup.garde", { n: RECUP.garde.plafond })}` : somme}
              valeur={texteRecup(r.calcule)}
            />,
          ]}
        </Lignes>
      </Groupe>
      <Texte variante="corps" couleur="t2" style={styles.note}>
        {aj
          ? t(aj.moitie === "seconde" ? "cycle.recup.noteSeconde" : "cycle.recup.notePremiere", {
              cycles: CYCLE.recup.cycles,
              n: Math.max(aj.vfc ?? 0, aj.fc ?? 0),
              sans: aj.sans != null ? texteRecup(aj.sans) : t("cycle.recup.sansScore"),
            })
          : t("recup.note")}
      </Texte>
    </>
  );
}

/** « Comprendre la Récupération › » : une ligne de 44 dp qui ouvre le tiroir. */
export function LienComprendreRecup({ onPress }: { onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" onPress={onPress} style={styles.lien}>
      <Texte style={[styles.lienTexte, { color: couleurs.t1 }]}>{t("recup.comprendre")}</Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Appui>
  );
}

// ---------------------------------------------------------------- le tiroir

/** La règle du tiroir : de 0 à 100, trois segments (Fatigué, Correct, Prêt) et le point du jour. */
function Regle({ largeur, score }: { largeur: number; score: number | null }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const H = 66;
  const y0 = 30;
  const [s1, s2] = RECUP.seuils;
  const x = (v: number) => 4 + (v / 100) * (largeur - 8);
  const segs: [number, number, string][] = [
    [0, s1, t("recup.niveau.fatigue")],
    [s1, s2, t("recup.niveau.correct")],
    [s2, 100, t("recup.niveau.pret")],
  ];
  return (
    <Svg width={largeur} height={H} accessibilityLabel={t("recup.regleLue", { jour: score != null ? t("recup.regleJour", { n: score }) : "" })}>
      {segs.map(([a, b, nom], i) => (
        <G key={nom}>
          <Rect x={x(a) + (i ? 3 : 0)} y={y0 - 3} width={Math.max(0, x(b) - x(a) - (i ? 3 : 0) - (i < 2 ? 3 : 0))} height={6} rx={3} fill={i === 2 ? m.fort : m.doux} fillOpacity={i === 2 ? 1 : 0.55} />
          <SvgText x={(x(a) + x(b)) / 2} y={y0 + 26} textAnchor="middle" fontSize={13} fill={couleurs.t2}>
            {nom}
          </SvgText>
        </G>
      ))}
      {[0, s1, s2, 100].map((v, i) => (
        <SvgText key={v} x={x(v)} y={y0 - 12} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} fontSize={11.5} fill={couleurs.t3}>
          {nombre(v, 0)}
        </SvgText>
      ))}
      {score != null ? <Circle cx={x(score)} cy={y0} r={8} fill={couleurs.carteOpaque} stroke={couleurs.t1} strokeWidth={2.5} /> : null}
    </Svg>
  );
}

/** La barre des quatre poids (ligne 3 du tiroir). */
function BarrePoids() {
  const m = useMesure();
  return (
    <View style={styles.poids}>
      {CLES_PARTS.map((k, i) => (
        <View key={k} style={{ flex: RECUP.poids[k], height: 6, borderRadius: 3, backgroundColor: i === 0 ? m.fort : m.doux, opacity: i === 0 ? 1 : 0.6 }} />
      ))}
    </View>
  );
}

/** Le tiroir « Comprendre la Récupération » (écran 4) : la règle, puis cinq lignes numérotées. */
export function TiroirRecup({ visible, onFermer, score }: { visible: boolean; onFermer: () => void; score: number | null }) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const pc = (k: ClePart) => nombre(RECUP.poids[k] * 100, 0);
  const lignes: [string, string][] = [
    [t("recup.tiroir.1fort"), t("recup.tiroir.1")],
    [t("recup.tiroir.2fort"), t("recup.tiroir.2")],
    [t("recup.tiroir.3fort"), t("recup.tiroir.3")],
    [t("recup.tiroir.4fort"), t("recup.tiroir.4")],
    [t("recup.tiroir.5fort"), t("recup.tiroir.5")],
  ];
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("recup.comprendre")}>
      <View onLayout={(e) => setLargeur(Math.floor(e.nativeEvent.layout.width))} style={styles.regle}>
        {largeur > 0 ? <Regle largeur={largeur} score={score} /> : null}
      </View>
      <View style={styles.liste}>
        {lignes.map(([fort, suite], i) => (
          <View key={i} style={styles.item}>
            <View style={[styles.num, { backgroundColor: couleurs.btnTonalFond }]}>
              <Texte style={[styles.numTexte, { color: couleurs.t1 }]}>{nombre(i + 1, 0)}</Texte>
            </View>
            <View style={{ flex: 1 }}>
              <Texte variante="corps" style={[styles.itemTexte, { color: couleurs.t2 }]}>
                <Texte variante="corps" style={[styles.itemTexte, { color: couleurs.t1, fontFamily: police.semibold }]}>
                  {fort}
                </Texte>
                {suite}
              </Texte>
              {i === 2 ? (
                <>
                  <BarrePoids />
                  <Texte variante="meta" couleur="t2" style={styles.poidsTexte}>
                    {t("recup.tiroir.poids", { vfc: pc("vfc"), fc: pc("fc"), sommeil: pc("sommeil"), effort: pc("charge") })}
                  </Texte>
                </>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </Feuille>
  );
}

// ---------------------------------------------------------------- graphes

/**
 * La VFC des 42 dernières nuits dans sa zone (3c) : la bande est la zone de chaque nuit (la moyenne des 42 nuits d'avant, plus
 * ou moins un écart type), le trait la moyenne de 7 nuits, chaque nuit un point ; la dernière nuit est marquée.
 */
export function GrapheVfc({ nuits, largeur }: { nuits: readonly { jour: number; vfc: number | null; zone: readonly [number, number] | null }[]; largeur: number }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const H = 200;
  const haut = 26;
  const bas = 150;
  const valeurs = nuits.flatMap((n) => [n.vfc, n.zone?.[0], n.zone?.[1]]).filter((v): v is number => v != null);
  if (!valeurs.length) return null;
  const lo = Math.min(...valeurs) * 0.92;
  const hi = Math.max(...valeurs) * 1.06;
  const n = nuits.length;
  const x = (i: number) => 8 + (i / Math.max(1, n - 1)) * (largeur - 16);
  const y = (v: number) => bas - ((v - lo) / (hi - lo || 1)) * (bas - haut);
  const avecZone = nuits.map((nu, i) => ({ i, z: nu.zone })).filter((p): p is { i: number; z: readonly [number, number] } => p.z != null);
  const bande = avecZone.length
    ? `M${avecZone.map((p) => `${x(p.i).toFixed(1)} ${y(p.z[1]).toFixed(1)}`).join("L")}L${[...avecZone].reverse().map((p) => `${x(p.i).toFixed(1)} ${y(p.z[0]).toFixed(1)}`).join("L")}Z`
    : "";
  const sept = nuits.map((_, i) => {
    const l = nuits.slice(Math.max(0, i - 6), i + 1).map((q) => q.vfc).filter((v): v is number => v != null);
    return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
  });
  const trait = sept.map((v, i) => (v == null ? "" : `${i && sept[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join("");
  const derniere = [...nuits.keys()].reverse().find((i) => nuits[i]!.vfc != null);
  const graduations = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  return (
    <Svg width={largeur} height={H} accessibilityLabel={t("recup.grapheVfc")}>
      {bande ? <Path d={bande} fill={m.doux} fillOpacity={0.4} /> : null}
      {nuits.map((nu, i) =>
        nu.vfc != null && i !== derniere ? <Circle key={nu.jour} cx={x(i)} cy={y(nu.vfc)} r={2.6} fill={couleurs.t2} fillOpacity={nu.zone && (nu.vfc < nu.zone[0] || nu.vfc > nu.zone[1]) ? 0.85 : 0.5} /> : null,
      )}
      <Path d={trait} fill="none" stroke={m.fort} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {derniere != null ? (
        <>
          <Circle cx={x(derniere)} cy={y(nuits[derniere]!.vfc!)} r={5} fill={m.fort} />
          <SvgText x={Math.min(largeur - 2, x(derniere))} y={y(nuits[derniere]!.vfc!) - 12} textAnchor="end" fontSize={13} fontWeight="600" fill={couleurs.t1}>
            {`${nombre(nuits[derniere]!.vfc!, 0)} ${t("recup.ms")}`}
          </SvgText>
        </>
      ) : null}
      <Line x1={0} x2={largeur} y1={bas + 22} y2={bas + 22} stroke={couleurs.line} strokeWidth={1} />
      {graduations.map((i, k) => (
        <SvgText key={k} x={x(i)} y={H - 4} textAnchor={k === 0 ? "start" : k === 3 ? "end" : "middle"} fontSize={11} fill={couleurs.t3}>
          {new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(new Date(nuits[i]!.jour + 12 * 3_600_000))}
        </SvgText>
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  anneauBoite: { width: 156, height: 156, alignSelf: "center", marginTop: 18, alignItems: "center", justifyContent: "center" },
  dedans: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  chiffre: { fontFamily: police.semibold, fontSize: 52, lineHeight: 58, letterSpacing: -1.6, fontVariant: ["tabular-nums"] },
  pourcent: { fontFamily: police.regular, fontSize: 20, letterSpacing: 0 },
  mot: { fontFamily: police.regular, fontSize: 14, marginTop: -2 },
  phrase: { textAlign: "center", fontFamily: police.medium, fontSize: 16.5, marginTop: 16, marginHorizontal: 16 },
  quand: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: 4, marginHorizontal: 16, gap: 4 },
  quandTexte: { fontSize: 13 },
  bloc: { marginTop: 16 },
  cible: { marginTop: 16 },
  tuile: { width: 40, height: 40, borderRadius: rayon.m, alignItems: "center", justifyContent: "center", marginRight: 2 },
  part: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  partHaut: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  partValeur: { fontFamily: police.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  piste: { height: 4, borderRadius: 2, marginTop: 12, overflow: "visible" },
  zone: { position: "absolute", top: 0, bottom: 0, borderRadius: 2 },
  point: { position: "absolute", top: -4, width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 2 },
  note: { fontSize: 13.5, lineHeight: 20, marginTop: 12, marginHorizontal: 16 },
  ajuste: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  lien: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, alignSelf: "flex-start", marginTop: 4, marginHorizontal: 16 },
  lienTexte: { fontFamily: police.medium, fontSize: 14 },
  regle: { marginTop: 4, marginBottom: 14 },
  liste: { gap: 14, paddingBottom: 8 },
  item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numTexte: { fontFamily: police.semibold, fontSize: 12 },
  itemTexte: { fontSize: 14, lineHeight: 21 },
  poids: { flexDirection: "row", gap: 4, marginTop: 8 },
  poidsTexte: { marginTop: 6, lineHeight: 18 },
});
