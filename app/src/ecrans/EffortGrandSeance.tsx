// L'Effort d'une séance en grand (planche effort-pepfit, écran 4 ; planche sport-stats v2, S11) : 34 dp à droite du nom et de
// la date, le chiffre seul (aucune unité, le 31/10), « effort ⓘ » dessous. Le toucher ouvre l'infobulle « d'où vient ce
// chiffre » : avec la FC, zone par zone, minutes × poids, le total en points, puis le score (4a) ; avec le ressenti, le
// ressenti × son poids, la durée, puis le total (4b) ; avec le barème, la durée × le barème du sport, « ~ ». Elle paraît depuis
// le chiffre (échelle 0,97 → 1 et fondu, 160 ms) et se ferme en fondu ; « Réduire les animations » : le fondu seul. Elle se
// ferme au toucher du chiffre ou d'elle-même. En muscu avec séries (docs/CODE-EFFORT-CHARGE.md) : les séries, le ressenti
// s'il est dit, les zones de FC ; et, avec la FC seulement, les parts musculaire et cardio en lecture seule (PartsEffort).
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { police, rayon } from "../theme/typo";
import { Icone } from "../ui/Icone";
import { courbes } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import type { EffortDeSeance } from "./effort-charges";
import { CHARGE_EFFORT, partsSeance } from "./effort-pepfit";
import { nombre } from "./format";
import { texteEffort } from "./mesures/scores-calc";

const texte = (e: EffortDeSeance) => texteEffort(e.score);
const poids = (n: number) => nombre(n, n % 1 ? 1 : 0);

export function EffortGrand({ effort, ouvert, onBasculer }: { effort: EffortDeSeance; ouvert: boolean; onBasculer: () => void }) {
  const { couleurs, mode } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: ouvert }}
      accessibilityLabel={t("sportStats.luEffortSeance", { valeur: texte(effort) })}
      onPress={onBasculer}
      hitSlop={4}
      style={({ pressed }) => [styles.grand, (ouvert || pressed) && { backgroundColor: mode === "nuit" ? "rgba(249,115,22,0.12)" : "rgba(232,89,12,0.08)" }]}
    >
      <Texte style={[styles.valeur, { color: couleurs.t1 }]}>{texte(effort)}</Texte>
      <View style={styles.sous}>
        <Texte numberOfLines={1} style={[styles.sousTexte, { color: couleurs.t2 }]}>
          {t("sportStats.effortMot")}
        </Texte>
        <Icone nom="info" couleur={couleurs.t3} taille={14} />
      </View>
    </Pressable>
  );
}

/** Les lignes du calcul : une pastille, un libellé, le facteur, les points de la ligne. */
function lignesCalcul(e: EffortDeSeance, zones: readonly string[], accent: string, neutre: string) {
  if (e.muscu != null) {
    const fc = e.methode === "fc" ? lignesZones(e, zones) : [];
    return [
      { cle: "s", couleur: accent, libelle: t("sportStats.calcul.series", { n: e.series ?? 0 }), facteur: "", points: "" },
      ...(e.ressenti ? [{ cle: "r", couleur: accent, libelle: t("sportStats.calcul.ressenti", { mot: t(`seance.effort.${e.ressenti}`) }), facteur: "", points: "" }] : []),
      ...fc,
    ];
  }
  if (e.methode === "fc") return lignesZones(e, zones);
  return lignesSansFc(e, accent, neutre);
}

function lignesZones(e: EffortDeSeance, zones: readonly string[]) {
  return (e.zones ?? [])
      .map((m, k) => ({ m: Math.round(m), k }))
      .filter((x) => x.m > 0)
      .map((x) => ({
        cle: `z${x.k}`,
        couleur: zones[x.k]!,
        libelle: t("sportStats.calcul.zone", { n: x.k + 1, min: x.m }),
        facteur: `× ${CHARGE_EFFORT.zones[x.k]}`,
        points: nombre(x.m * CHARGE_EFFORT.zones[x.k]!, 0),
      }));
}

function lignesSansFc(e: EffortDeSeance, accent: string, neutre: string) {
  const min = Math.round(e.minutes);
  if (e.methode === "ressenti" && e.ressenti) {
    return [
      { cle: "r", couleur: accent, libelle: t("sportStats.calcul.ressenti", { mot: t(`seance.effort.${e.ressenti}`) }), facteur: `× ${poids(CHARGE_EFFORT.ressenti[e.ressenti])}`, points: "" },
      { cle: "d", couleur: neutre, libelle: t("sportStats.calcul.duree"), facteur: t("effort.minN", { n: min }), points: "" },
    ];
  }
  return [
    { cle: "b", couleur: accent, libelle: t("sportStats.calcul.bareme"), facteur: `× ${poids(e.minutes > 0 ? e.charge / e.minutes : 0)}`, points: "" },
    { cle: "d", couleur: neutre, libelle: t("sportStats.calcul.duree"), facteur: t("effort.minN", { n: min }), points: "" },
  ];
}

/** L'infobulle « d'où vient ce chiffre », posée sous le chiffre, alignée à droite (sa pointe au-dessus du chiffre). */
export function BulleCalcul({ effort, onFermer }: { effort: EffortDeSeance; onFermer: () => void }) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: reduit ? 120 : 160, easing: courbes.sortie });
  }, [v, reduit]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: reduit ? 1 : 0.97 + 0.03 * v.value }] }));
  const fond = mode === "nuit" ? "#3a2a1e" : "#ffffff";
  const filet = mode === "nuit" ? "rgba(255,255,255,0.08)" : "rgba(232,89,12,0.14)";
  const zones = [couleurs.zone1, couleurs.zone2, couleurs.zone3, couleurs.zone4, couleurs.zone5];
  const lignes = lignesCalcul(effort, zones, couleurs.partieEntrainement, couleurs.t3);
  const titre =
    effort.muscu != null
      ? effort.methode === "fc" ? "sportStats.calcul.titreSeriesFc" : "sportStats.calcul.titreSeries"
      : effort.methode === "fc" ? "sportStats.calcul.titreFc" : effort.methode === "ressenti" ? "sportStats.calcul.titreRessenti" : "sportStats.calcul.titreBareme";
  const pied =
    effort.muscu != null
      ? t(effort.estime ? "sportStats.calcul.piedSeriesSansRepere" : "sportStats.calcul.piedSeries")
      : effort.methode === "fc"
      ? t(effort.estime ? "sportStats.calcul.piedFcMuscu" : "sportStats.calcul.piedFc")
      : effort.methode === "ressenti"
        ? t("sportStats.calcul.piedRessenti", Object.fromEntries(Object.entries(CHARGE_EFFORT.ressenti).map(([k, x]) => [k, poids(x)])))
        : t("sportStats.calcul.piedBareme");
  const source = effort.methode === "fc" && effort.sourceFc ? t(`sportStats.calcul.source.${effort.sourceFc}` as "sportStats.calcul.source.capteur") : null;
  return (
    <Animated.View
      accessibilityRole="text"
      style={[
        styles.bulle,
        { backgroundColor: fond, borderColor: filet, boxShadow: mode === "nuit" ? "0px 16px 36px -12px rgba(0,0,0,0.85), 0px 2px 6px rgba(0,0,0,0.4)" : "0px 16px 36px -14px rgba(120,40,8,0.42), 0px 2px 6px rgba(120,40,8,0.12)" },
        style,
      ]}
    >
      <View style={[styles.pointe, { backgroundColor: fond, borderColor: filet }]} />
      <Pressable onPress={onFermer} accessibilityRole="button" accessibilityLabel={t("ui.fermer")}>
        <Texte style={[styles.titre, { color: couleurs.t1 }]}>{t(titre)}</Texte>
        {lignes.map((l) => (
          <View key={l.cle} style={styles.ligne}>
            <View style={[styles.pastille, { backgroundColor: l.couleur }]} />
            <Texte style={[styles.nom, { color: couleurs.t2 }]}>{l.libelle}</Texte>
            <Texte style={[styles.facteur, { color: couleurs.t3 }]}>{l.facteur}</Texte>
          </View>
        ))}
        <View style={[styles.total, { borderTopColor: couleurs.line }]}>
          <Texte style={[styles.totalScore, { color: couleurs.t1 }]}>{texte(effort)}</Texte>
        </View>
        <Texte style={[styles.pied, { color: couleurs.t2 }]}>{source ? `${pied} ${source}` : pied}</Texte>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Musculaire et cardio d'une séance de muscu, avec la FC seulement (sinon rien) : une barre fine à deux teintes et sa légende
 * (pastille, libellé, part ; 12 dp), arrondies à 5 %. En lecture seule : aucun réglage.
 */
export function PartsEffort({ parts, style }: { parts: { musculaire: number; cardio: number } | null; style?: object }) {
  const { couleurs } = useTheme();
  if (!parts) return null;
  const m = Math.round(parts.musculaire * 20) * 5;
  const valeurs = { m, c: 100 - m };
  return (
    <View accessible accessibilityLabel={t("sportStats.parts.lu", valeurs)} style={[styles.parts, style]}>
      <View style={styles.partsBarre}>
        {m > 0 ? <View style={{ flex: m, backgroundColor: couleurs.partieEntrainement }} /> : null}
        {/* Le cardio en rouge (zone 5) : l'ambre de la zone 4 se confondait avec l'orange de jour (recette du 03/11). */}
        {m < 100 ? <View style={{ flex: 100 - m, backgroundColor: couleurs.zone5 }} /> : null}
      </View>
      <View style={styles.partsLegende}>
        <View style={styles.partsEntree}>
          <View style={[styles.pastille, { backgroundColor: couleurs.partieEntrainement }]} />
          <Texte numberOfLines={1} style={[styles.partsTexte, { color: couleurs.t2 }]}>{t("sportStats.parts.musculaire", valeurs)}</Texte>
        </View>
        <View style={styles.partsEntree}>
          <View style={[styles.pastille, { backgroundColor: couleurs.zone5 }]} />
          <Texte numberOfLines={1} style={[styles.partsTexte, { color: couleurs.t2 }]}>{t("sportStats.parts.cardio", valeurs)}</Texte>
        </View>
      </View>
    </View>
  );
}

/** Les parts d'un Effort déjà calculé (séance passée). */
export const partsEffort = (e: EffortDeSeance | null) => (e ? partsSeance(e) : null);

const styles = StyleSheet.create({
  grand: { minWidth: 72, minHeight: 64, paddingTop: 2, paddingHorizontal: 8, paddingBottom: 6, borderRadius: rayon.l, alignItems: "flex-end" },
  valeur: { fontFamily: police.semibold, fontSize: 34, lineHeight: 36, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  sous: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  sousTexte: { fontFamily: police.regular, fontSize: 12 },
  bulle: { position: "absolute", right: 8, width: 284, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 14, transformOrigin: "250px 0px", zIndex: 30, elevation: 12 },
  pointe: { position: "absolute", top: -6, right: 30, width: 12, height: 12, borderRadius: 2, transform: [{ rotate: "45deg" }], borderLeftWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },
  titre: { fontFamily: police.semibold, fontSize: 13.5, lineHeight: 18, marginBottom: 4 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
  pastille: { width: 8, height: 8, borderRadius: 4 },
  nom: { flex: 1, fontFamily: police.regular, fontSize: 13.5, lineHeight: 18 },
  facteur: { fontFamily: police.regular, fontSize: 13, fontVariant: ["tabular-nums"] },
  points: { minWidth: 32, textAlign: "right", fontFamily: police.semibold, fontSize: 13.5, fontVariant: ["tabular-nums"] },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 8 },
  totalPts: { fontFamily: police.regular, fontSize: 13.5, fontVariant: ["tabular-nums"] },
  totalScore: { fontFamily: police.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  pied: { fontFamily: police.regular, fontSize: 12, lineHeight: 17, marginTop: 6 },
  parts: { gap: 6, maxWidth: 280 },
  partsBarre: { flexDirection: "row", height: 3, borderRadius: 2, overflow: "hidden", gap: 2 },
  partsLegende: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 2 },
  partsEntree: { flexDirection: "row", alignItems: "center", gap: 6 },
  partsTexte: { fontFamily: police.regular, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
});
