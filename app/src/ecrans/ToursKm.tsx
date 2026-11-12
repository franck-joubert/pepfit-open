// Tableau des tours et découpage « Par km » (planche suivi-gps, fin de course, lot 3), aussi sous le bloc d'effort de la
// séance passée. Appui long sur un tour (à partir du 2e) : « Fusionner avec le précédent » (D16, seul moyen de corriger
// un tour de trop). Course guidée : ses tours sont ses étapes, le tableau dit « Étapes » comme le direct (revue finale n° 22).
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { espace, police, POLICE_MAX } from "../theme/typo";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Texte } from "../ui/Texte";
import type { LigneKm, LigneTour } from "./effort-vue";
import { altitudeEnUnite, libelleDistance, uniteActive } from "./unites";
import { allureTexte, chronoTexte, distanceTexte, mesureDe, vitesseTexte } from "./suivi-direct-vue";

/** Allure (course, rando) ou vitesse (vélo) d'un morceau. */
function rythme(exerciceId: string, allure: number | null): string {
  if (mesureDe(exerciceId) === "vitesse") return vitesseTexte(allure ? 3600 / allure : null);
  return allureTexte(allure);
}

export function TableauTours({ tours, exerciceId, onFusionner, etapes = false }: { tours: readonly LigneTour[]; exerciceId: string; onFusionner?: (n: number) => void; etapes?: boolean }) {
  const { couleurs } = useTheme();
  const [choisi, setChoisi] = useState<number | null>(null);
  if (!tours.length) return null;
  return (
    <View style={styles.bloc}>
      <Texte variante="entete" couleur="t3" accessibilityRole="header" style={styles.entete}>
        {t(etapes ? "gps.guide.etapes" : "effort.tours")}
      </Texte>
      <View style={styles.tete} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[t(etapes ? "gps.guide.etape" : "effort.tour"), t("effort.temps"), t(mesureDe(exerciceId) === "vitesse" ? "effort.vitesse" : "effort.allure"), t("effort.fc"), t("effort.zoneCol"), t("effort.dPlus")].map((x, i) => (
          <Texte key={i} variante="entete" couleur="t3" numberOfLines={1} style={[COLONNES[i], i > 0 && styles.droite]}>
            {x}
          </Texte>
        ))}
      </View>
      {tours.map((l) => (
        <Pressable
          key={l.n}
          accessibilityRole={onFusionner && l.n > 1 ? "button" : undefined}
          accessibilityLabel={t("effort.tourLu", { n: l.n, distance: `${distanceTexte(l.distanceM)} ${libelleDistance()}`, temps: chronoTexte(l.dureeS * 1000), allure: rythme(exerciceId, l.allure) })}
          accessibilityHint={onFusionner && l.n > 1 ? t("effort.fusionner") : undefined}
          accessibilityActions={onFusionner && l.n > 1 ? [{ name: "longpress", label: t("effort.fusionner") }] : undefined}
          onAccessibilityAction={() => setChoisi(l.n)}
          onLongPress={onFusionner && l.n > 1 ? () => setChoisi(l.n) : undefined}
          style={({ pressed }) => [styles.ligne, { borderTopColor: couleurs.line }, pressed && onFusionner && l.n > 1 && { backgroundColor: couleurs.s1 }]}
        >
          <View style={COLONNES[0]}>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.num, { color: couleurs.t1 }]}>{l.n}</Text>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.numKm, { color: couleurs.t3 }]}>{`${distanceTexte(l.distanceM)} ${libelleDistance()}`}</Text>
          </View>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.val, COLONNES[1], styles.droite, { color: couleurs.t1 }]}>{chronoTexte(l.dureeS * 1000)}</Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.val, COLONNES[2], styles.droite, { color: couleurs.t1 }]}>{rythme(exerciceId, l.allure)}</Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.val, COLONNES[3], styles.droite, { color: couleurs.t1 }]}>{l.fcMoy ?? "—"}</Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.zone, COLONNES[4], styles.droite, { color: l.zone ? couleurs[`zone${l.zone}` as keyof Jetons] : couleurs.t3 }]}>
            {l.zone ? t("effort.zone", { n: l.zone }) : "—"}
          </Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.dp, COLONNES[5], styles.droite, { color: couleurs.t2 }]}>{l.dPlus == null ? "—" : `+${altitudeEnUnite(l.dPlus)}`}</Text>
        </Pressable>
      ))}
      <Feuille visible={choisi != null} onFermer={() => setChoisi(null)} titre={choisi != null ? t(etapes ? "gps.guide.etapeN" : "gps.tourN", { n: choisi }) : ""}>
        <Groupe>
          <Option
            premier
            icone="link"
            libelle={t("effort.fusionner")}
            onPress={() => {
              const n = choisi;
              setChoisi(null);
              if (n != null) onFusionner?.(n);
            }}
          />
        </Groupe>
      </Feuille>
    </View>
  );
}

export function ParKm({ km, exerciceId }: { km: readonly LigneKm[]; exerciceId: string }) {
  const { couleurs } = useTheme();
  if (!km.length) return null;
  return (
    <View style={styles.bloc}>
      <Texte variante="entete" couleur="t3" accessibilityRole="header" style={styles.entete}>
        {t(uniteActive() === "mi" ? "effort.parMiTitre" : "effort.parKmTitre")}
        <Texte variante="entete" couleur="t3" style={{ textTransform: "none", letterSpacing: 0 }}>
          {`, ${t("effort.enMouvement")}`}
        </Texte>
      </Texte>
      {km.map((k) => {
        const gris = k.partiel || !k.zone;
        return (
          <View key={k.n} accessible accessibilityLabel={t(uniteActive() === "mi" ? "effort.miLu" : "effort.kmLu", { n: k.partiel ? distanceTexte(k.distanceM) : k.n, allure: rythme(exerciceId, k.allure) })} style={styles.kl}>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.kn, { color: couleurs.t3 }]}>{k.partiel ? distanceTexte(k.distanceM) : k.n}</Text>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.ka, { color: k.partiel ? couleurs.t3 : couleurs.t1 }]}>{rythme(exerciceId, k.allure)}</Text>
            <View style={[styles.kb, { backgroundColor: couleurs.s2 }]}>
              <View style={[styles.kbi, { width: `${k.vitesse * 100}%`, backgroundColor: gris ? couleurs.t3 : couleurs[`zone${k.zone}` as keyof Jetons] }]} />
            </View>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.kf, { color: couleurs.t2 }]}>{k.fcMoy ?? "—"}</Text>
          </View>
        );
      })}
    </View>
  );
}

const COLONNES = [{ width: 64 }, { flex: 1 }, { flex: 1 }, { width: 40 }, { width: 36 }, { width: 44 }] as const;

const styles = StyleSheet.create({
  bloc: { paddingHorizontal: espace.l },
  entete: { paddingTop: espace.xl, paddingBottom: 6 },
  tete: { height: 28, flexDirection: "row", alignItems: "center", gap: 6 },
  droite: { textAlign: "right" },
  ligne: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  num: { fontFamily: police.medium, fontSize: 15, lineHeight: 19, fontVariant: ["tabular-nums"] },
  numKm: { fontFamily: police.regular, fontSize: 12, lineHeight: 15, fontVariant: ["tabular-nums"] },
  val: { fontFamily: police.regular, fontSize: 15, fontVariant: ["tabular-nums"] },
  zone: { fontFamily: police.semibold, fontSize: 13 },
  dp: { fontFamily: police.regular, fontSize: 14, fontVariant: ["tabular-nums"] },
  kl: { height: 40, flexDirection: "row", alignItems: "center", gap: 10 },
  kn: { width: 40, fontFamily: police.regular, fontSize: 13, fontVariant: ["tabular-nums"] },
  ka: { width: 58, fontFamily: police.regular, fontSize: 15, fontVariant: ["tabular-nums"] },
  kb: { flex: 1, height: 8, borderRadius: 2, overflow: "hidden" },
  kbi: { height: "100%", borderRadius: 2 },
  kf: { width: 40, textAlign: "right", fontFamily: police.regular, fontSize: 14, fontVariant: ["tabular-nums"] },
});
