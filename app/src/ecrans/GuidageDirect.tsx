import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion, withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import type { Jetons } from "../theme/jetons";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { duree as durees } from "../theme/mouvement";
import { Texte } from "../ui/Texte";
import { cibleEtape, dureePrevueS, lignesFeuille, nomEtape, type Etape, type Verdict } from "./etapes-course";
import { allureTexte, chronoTexte, distanceTexte, positionRepere, zoneDe } from "./suivi-direct-vue";
import { approx } from "./format";
import type { RefZones } from "./zones-fc";
import { libelleAllure, libelleDistance } from "./unites";

// Course guidée en plein écran (planche seance-duree § 3, validée le 29/10) : bande des étapes et ligne de l'étape en cours
// (une seule cible, qui ouvre la feuille des étapes), ce qui reste en grand, la FC avec la mini-jauge des zones et son
// verdict, la jauge de l'étape, l'étape suivante ; au changement d'étape, l'annonce et le bilan de l'étape finie.

const couleurZone = (c: Jetons, z: number | null) => (z ? c[`zone${z}` as keyof Jetons] : c.t2);

// Annonce d'étape et « Ensuite » (revue finale n° 53) : l'une remplace l'autre en fondu au lieu d'un saut. Entrée : opacité
// 0 → 1 et 6 dp → 0, 200 ms ; sortie : fondu de 150 ms ; courbe de sortie. « Réduire les animations » : le fondu seul.
const GLISSE_ANNONCE = 6;
const entreeAnnonce: EntryExitAnimationFunction = () => {
  "worklet";
  const o = { duration: durees.entree, easing: courbes.sortie };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: GLISSE_ANNONCE }] },
    animations: { opacity: withTiming(1, o), transform: [{ translateY: withTiming(0, o) }] },
  };
};
const sortieAnnonce = FadeOut.duration(durees.sortie).easing(courbes.sortie);
const fonduReduit = {
  entering: FadeIn.duration(durees.entree).easing(courbes.sortie).reduceMotion(ReduceMotion.Never),
  exiting: FadeOut.duration(durees.sortie).easing(courbes.sortie).reduceMotion(ReduceMotion.Never),
};
function useFonduEtape() {
  return useReduit() ? fonduReduit : { entering: entreeAnnonce, exiting: sortieAnnonce };
}

/** « 3/6 · 1 km en zone 4 » : le nom en gras, la zone dans sa couleur (et toujours écrite). */
export function TexteEtape({ etape, court = false, gras = true }: { etape: Etape; court?: boolean; gras?: boolean }) {
  const { couleurs } = useTheme();
  const cible = cibleEtape(etape);
  return (
    <>
      <Texte style={{ fontFamily: gras ? police.semibold : police.medium, color: couleurs.t1 }}>{nomEtape(etape)}</Texte>
      {cible ? `, ${cible}` : ""}
      {etape.zone ? (
        <>
          {` ${t("gps.guide.en")} `}
          <Texte style={{ fontFamily: police.semibold, color: couleurZone(couleurs, etape.zone) }}>{t(court ? "gps.guide.zCourt" : "gps.guide.zoneMin", { n: etape.zone })}</Texte>
        </>
      ) : null}
    </>
  );
}

/** Bande des étapes (largeur selon la durée prévue, couleur de la zone visée ; faites pleines, à venir pâles) et ligne de l'étape. */
export function BandeEtapes({ etapes, i, fait, allureSKm, onPress }: { etapes: readonly Etape[]; i: number; fait: number; allureSKm: number; onPress: () => void }) {
  const { couleurs } = useTheme();
  const et = etapes[i];
  return (
    <Appui accessibilityRole="button" accessibilityLabel={`${t("gps.guide.voir")}, ${t("gps.guide.etapeSur", { n: Math.min(i + 1, etapes.length), total: etapes.length })}`} onPress={onPress} style={styles.bandeTap}>
      <View style={styles.bande}>
        {etapes.map((e, k) => (
          <View key={k} style={[styles.seg, { flexGrow: dureePrevueS(e, allureSKm), backgroundColor: couleurZone(couleurs, e.zone ?? 1) }]}>
            {k < i ? null : <View style={[styles.voileSeg, { backgroundColor: couleurs.bg, left: k === i ? `${Math.round(fait * 100)}%` : 0 }]} />}
          </View>
        ))}
      </View>
      <View style={styles.quoiL}>
        <Texte numberOfLines={1} couleur="t2" style={styles.quoi}>
          {et ? <TexteEtape etape={et} /> : <Texte style={{ fontFamily: police.semibold }}>{t("gps.guide.fini")}</Texte>}
        </Texte>
        <Icone nom="right" taille={18} couleur={couleurs.t3} />
      </View>
    </Appui>
  );
}

/**
 * Ce qui reste de l'étape en grand (« 420 m », « 1:30 ») et son libellé (« reste · 4'02" /km ») ; une étape sans cible
 * (exercice sans durée ni distance) montre le temps écoulé, on la passe avec « Étape ». En pause, le chiffre se grise.
 */
export function ResteEtape({ reste, ecouleS, allure, pause }: { reste: { reste: number; unite: "m" | "s" } | null; ecouleS: number; allure: number | null; pause: boolean }) {
  const { couleurs } = useTheme();
  const valeur = !reste
    ? chronoTexte(ecouleS * 1000)
    : reste.unite === "s"
      ? chronoTexte(reste.reste * 1000)
      : reste.reste >= 1000
        ? distanceTexte(reste.reste)
        : String(Math.ceil(reste.reste));
  const unite = reste?.unite === "m" ? (reste.reste >= 1000 ? libelleDistance() : "m") : null;
  return (
    <View style={styles.resteBloc}>
      <View style={styles.resteLigne}>
        <Texte numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.reste, { color: pause ? couleurs.t3 : couleurs.t1 }]}>
          {valeur}
        </Texte>
        {unite ? (
          <Texte couleur="t2" style={styles.resteU}>
            {unite}
          </Texte>
        ) : null}
      </View>
      <Texte couleur="t2" style={styles.sLib} numberOfLines={1}>
        {t(reste ? "gps.guide.reste" : "seance.plein.ecoule")}
        {allure != null ? `, ${allureTexte(allure)} ${libelleAllure()}` : ""}
        {pause ? <Texte style={styles.pauseT}>{`, ${t("gps.enPause")}`}</Texte> : null}
      </Texte>
    </View>
  );
}

/** FC, mini-jauge des cinq zones (zone visée pleine, repère à la FC du moment) et verdict. */
export function FcEtape({ bpm, fcMax, visee, verdict }: { bpm: number | null; fcMax: RefZones; visee: number | null; verdict: Verdict | null }) {
  const { couleurs } = useTheme();
  const zone = bpm != null ? zoneDe(bpm, fcMax) : 0;
  return (
    <View style={styles.fc}>
      <View style={styles.fcV}>
        <Texte style={styles.fcB}>{bpm != null ? String(bpm) : "—"}</Texte>
        <Texte couleur="t2" style={styles.fcU}>
          {t("gps.bpm")}
        </Texte>
      </View>
      <View style={styles.miniZ} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4, 5].map((n) => (
          <View key={n} style={[styles.miniI, { backgroundColor: couleurZone(couleurs, n), opacity: n === visee ? 1 : 0.28 }]} />
        ))}
        {bpm != null && zone ? <View style={[styles.rep, { left: `${positionRepere(bpm, fcMax) * 100}%`, backgroundColor: couleurs.t1, borderColor: couleurs.bg }]} /> : null}
      </View>
      {verdict ? <TexteVerdict v={verdict} /> : null}
    </View>
  );
}

function TexteVerdict({ v }: { v: Verdict }) {
  const { couleurs } = useTheme();
  const c = couleurZone(couleurs, v.zone);
  const z = t("gps.guide.zCourt", { n: v.zone });
  if (v.genre === "zone")
    return (
      <View style={styles.zn} accessibilityLiveRegion="polite">
        <Icone nom="check" taille={15} couleur={c} />
        <Texte style={[styles.znT, { color: c }]}>{t("gps.guide.dansZone", { n: v.zone })}</Texte>
      </View>
    );
  // Hors zone : seul « Z3 » prend la couleur de la zone (le vert ne doit pas dire « c'est bien »).
  const fleche = v.genre === "haut" ? "monter" : v.genre === "bas" ? "descendre" : null;
  const suite = t(v.genre === "haut" ? "gps.guide.ralentis" : v.genre === "bas" ? "gps.guide.accelere" : v.genre === "redescend" ? "gps.guide.redescend" : "gps.guide.monte");
  return (
    <View style={styles.zn} accessibilityLiveRegion="polite">
      {fleche ? <Icone nom={fleche} taille={15} couleur={couleurs.t1} /> : null}
      <Texte style={[styles.znT, styles.znNeutre]}>
        <Texte style={{ color: c, fontFamily: police.semibold }}>{z}</Texte>
        {`, ${suite}`}
      </Texte>
    </View>
  );
}

/** Jauge de l'étape : la part qui reste, dans la couleur de la zone visée ; elle se vide. */
export function JaugeEtape({ part, zone }: { part: number; zone: number | null }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.piste, { backgroundColor: couleurs.s2 }]}>
      <View style={[styles.pisteI, { width: `${Math.max(0, Math.min(1, part)) * 100}%`, backgroundColor: couleurZone(couleurs, zone) }]} />
    </View>
  );
}

/** « Ensuite · Récup 1:30 en zone 1 ». */
export function Ensuite({ etape }: { etape: Etape }) {
  const { couleurs } = useTheme();
  const fondu = useFonduEtape();
  return (
    <Animated.View entering={fondu.entering} exiting={fondu.exiting} style={styles.ensuite}>
      <Icone nom="suiv" taille={18} couleur={couleurs.t3} />
      <Texte couleur="t2" style={styles.ensuiteT} numberOfLines={1}>
        {`${t("gps.guide.ensuite")}, `}
        <TexteEtape etape={etape} gras={false} />
      </Texte>
    </Animated.View>
  );
}

/** Annonce du changement d'étape (texte dit par la voix, vibration) et bilan de l'étape finie, quelques secondes. */
export function AnnonceEtape({ texte, voix, bilan }: { texte: string; voix: boolean; bilan: { fort: string; suite: string } | null }) {
  const { couleurs } = useTheme();
  const fondu = useFonduEtape();
  return (
    <Animated.View entering={fondu.entering} exiting={fondu.exiting}>
      <View style={[styles.annonce, { backgroundColor: couleurs.s1 }]} accessibilityLiveRegion="polite">
        <Icone nom="voix" taille={20} couleur={voix ? couleurs.t1 : couleurs.t3} />
        <Texte style={styles.annonceT} numberOfLines={2}>{`« ${texte} »`}</Texte>
        <Icone nom="vibre" taille={20} couleur={couleurs.t1} />
      </View>
      {bilan ? (
        <View style={styles.bilan}>
          <Icone nom="check" taille={18} couleur={couleurs.valide} />
          <Texte couleur="t2" style={styles.bilanT} numberOfLines={1}>
            <Texte style={{ fontFamily: police.medium, color: couleurs.t1 }}>{bilan.fort}</Texte>
            {bilan.suite}
          </Texte>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Durée, distance et allure du moment, en ligne sous la carte. */
/** `distance` null : tapis, intérieur (sans GPS) : la durée, et la FC moyenne quand un capteur la donne (une seule fois). */
export function ChiffresGuides({ duree, distance, allure, fcMoy = null }: { duree: string; distance: string | null; allure: string; fcMoy?: number | null }) {
  return (
    <View style={styles.chiffres}>
      <Chiffre valeur={duree} libelle={t("gps.duree")} />
      {distance != null ? <Chiffre valeur={distance} unite={libelleDistance()} libelle={t("gps.distance")} /> : null}
      {distance != null ? <Chiffre valeur={allure} unite={libelleAllure()} libelle={t("gps.allure")} /> : null}
      {distance == null && fcMoy != null ? <Chiffre valeur={String(fcMoy)} unite={t("gps.bpm")} libelle={t("gps.fcMoyenne")} /> : null}
      {distance == null ? <View style={styles.chiffre} /> : null}
    </View>
  );
}

/** Trois chiffres en ligne sous la boîte (sports et cours : pas, effort, FC moyenne), même style que ceux de la course. */
export function ChiffresListe({ items }: { items: readonly { valeur: string; unite?: string; libelle: string }[] }) {
  return (
    <View style={styles.chiffres}>
      {items.map((i) => (
        <Chiffre key={i.libelle} valeur={i.valeur} unite={i.unite} libelle={i.libelle} />
      ))}
      {Array.from({ length: Math.max(0, 3 - items.length) }, (_, k) => (
        <View key={k} style={styles.chiffre} />
      ))}
    </View>
  );
}

function Chiffre({ valeur, unite, libelle }: { valeur: string; unite?: string; libelle: string }) {
  return (
    <View style={styles.chiffre}>
      <Texte numberOfLines={1} style={styles.chiffreV}>
        {valeur}
        {unite ? (
          <Texte couleur="t2" style={styles.chiffreU}>
            {` ${unite}`}
          </Texte>
        ) : null}
      </Texte>
      <Texte couleur="t2" style={styles.chiffreL}>
        {libelle}
      </Texte>
    </View>
  );
}

/** Ce qu'a donné une étape finie (feuille) : « 3:55 », « 15:02 · 2,61 km ». */
export interface EtapeFaite {
  dureeS: number;
  distanceM: number;
}

/** Feuille des étapes : faites (temps fait), en cours (ce qui reste), à venir (les efforts d'un bloc repliés en une ligne). */
export function FeuilleEtapes({ visible, onFermer, titre, etapes, i, faites, resteTexte, finVers, allureSKm }: {
  visible: boolean;
  onFermer: () => void;
  titre: string;
  etapes: readonly Etape[];
  i: number;
  faites: readonly EtapeFaite[];
  resteTexte: string | null;
  finVers: string | null;
  allureSKm: number;
}) {
  const { couleurs } = useTheme();
  const lignes = lignesFeuille(etapes, i, allureSKm);
  const sous = [i < etapes.length ? t("gps.guide.etapeSur", { n: i + 1, total: etapes.length }) : t("gps.guide.fini"), finVers ? t("gps.guide.finVers", { h: finVers }) : null].filter(Boolean).join(", ");
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre} sousTitre={sous}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.etapes}>
        {lignes.map((l, k) => {
          const faite = faites[l.i];
          const droite =
            l.etat === "faite" && faite
              ? `${chronoTexte(faite.dureeS * 1000)}${l.etape.distanceM || faite.distanceM < 100 || l.etape.genre === "recup" ? "" : `, ${distanceTexte(faite.distanceM)} ${libelleDistance()}`}`
              : l.etat === "en_cours"
                ? (resteTexte ?? "")
                : l.jusqua
                  ? approx(t("gps.guide.minCourt", { n: Math.round(l.prevueS / 60) }))
                  : "";
          const enCours = l.etat === "en_cours";
          return (
            <View key={l.i} style={[styles.et, enCours ? { backgroundColor: couleurs.s2, marginHorizontal: -10, paddingHorizontal: 10, borderRadius: rayon.l } : null, k && !enCours && lignes[k - 1]?.etat !== "en_cours" ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line } : null]}>
              <View style={styles.marque}>
                {l.etat === "faite" ? (
                  <Icone nom="check" taille={18} couleur={couleurs.valide} />
                ) : enCours ? (
                  <View style={[styles.ici, { borderColor: couleurs.t1 }]} />
                ) : (
                  <View style={[styles.pt, { backgroundColor: couleurs.line2 }]} />
                )}
              </View>
              <Texte numberOfLines={1} couleur={enCours ? "t1" : "t2"} style={[styles.etQ, enCours ? { fontFamily: police.semibold } : null]}>
                {l.jusqua ? (
                  <>
                    {t("gps.guide.aRang", { de: l.etape.rang ?? "", a: l.jusqua.rang ?? "" })}
                    {cibleEtape(l.etape) ? `, ${cibleEtape(l.etape)}` : ""}
                    {l.etape.zone ? (
                      <>
                        {` ${t("gps.guide.en")} `}
                        <Texte style={{ fontFamily: police.semibold, color: couleurZone(couleurs, l.etape.zone) }}>{t("gps.guide.zCourt", { n: l.etape.zone })}</Texte>
                      </>
                    ) : null}
                    {l.recupS ? `, ${t("gps.guide.recupCourt", { d: chronoTexte(l.recupS * 1000) })}` : ""}
                  </>
                ) : (
                  <TexteEtape etape={l.etape} court gras={enCours} />
                )}
              </Texte>
              <Texte couleur={enCours ? "t1" : "t2"} style={[styles.etR, enCours ? { fontFamily: police.medium } : null]}>
                {droite}
              </Texte>
            </View>
          );
        })}
      </ScrollView>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  bandeTap: { paddingTop: 6, paddingHorizontal: espace.l, paddingBottom: 4, borderRadius: rayon.l },
  bande: { flexDirection: "row", gap: 2, height: 6 },
  seg: { flexBasis: 0, minWidth: 3, height: 6, borderRadius: 3, overflow: "hidden" },
  voileSeg: { position: "absolute", top: 0, bottom: 0, right: 0, opacity: 0.62 },
  quoiL: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espace.s, minHeight: 36, marginTop: 6 },
  quoi: { flex: 1, fontSize: 15 },
  resteBloc: { flex: 1, minWidth: 0 },
  resteLigne: { flexDirection: "row", alignItems: "baseline" },
  reste: { flexShrink: 1, fontFamily: police.light, fontSize: 84, lineHeight: 88, letterSpacing: -2.9, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  resteU: { fontFamily: police.regular, fontSize: 30, marginLeft: 4, letterSpacing: -0.3 },
  sLib: { fontSize: 13, marginTop: -2 },
  pauseT: { fontFamily: police.semibold },
  fc: { alignItems: "flex-end", paddingBottom: 10 },
  fcV: { flexDirection: "row", alignItems: "baseline" },
  fcB: { fontFamily: police.light, fontSize: 34, lineHeight: 38, letterSpacing: -0.7, fontVariant: ["tabular-nums"] },
  fcU: { fontSize: 14, marginLeft: 3 },
  miniZ: { flexDirection: "row", gap: 3, width: 142, height: 5, marginTop: 6 },
  miniI: { flex: 1, borderRadius: 3 },
  rep: { position: "absolute", top: -4, width: 7, height: 13, marginLeft: -3.5, borderRadius: 3, borderWidth: 2 },
  zn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  znT: { fontSize: 13, fontFamily: police.semibold },
  znNeutre: { fontFamily: police.medium },
  piste: { height: 6, marginTop: 10, borderRadius: 3, overflow: "hidden" },
  pisteI: { height: 6, borderRadius: 3 },
  ensuite: { flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: 12 },
  ensuiteT: { flex: 1, fontSize: 14 },
  annonce: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: rayon.l },
  annonceT: { flex: 1, fontSize: 13 },
  bilan: { flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: 10 },
  bilanT: { flex: 1, fontSize: 13 },
  chiffres: { flexDirection: "row", paddingTop: 12, paddingHorizontal: espace.l },
  chiffre: { flex: 1, minWidth: 0 },
  chiffreV: { fontFamily: police.medium, fontSize: 20, letterSpacing: -0.2, fontVariant: ["tabular-nums"] },
  chiffreU: { fontFamily: police.regular, fontSize: 13 },
  chiffreL: { fontSize: 12 },
  etapes: { paddingTop: 14, paddingBottom: espace.l },
  et: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  marque: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  pt: { width: 8, height: 8, borderRadius: 4 },
  ici: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
  etQ: { flex: 1, fontSize: 14 },
  etR: { fontSize: 13 },
});
