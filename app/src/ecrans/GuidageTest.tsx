import { StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { allureTexte } from "../natif/suivi/logique";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { approx, nombre } from "./format";
import { allureA, vmaEnCours } from "./mesures/vma-calc";
import { chronoTexte } from "./suivi-direct-vue";

// Test VMA dans la course guidée (planche vma-vo2max, écrans 7 à 9 ; D3, D5) : la course guidée de la séance (GuidageDirect)
// montre l'étape, ce qui reste en grand, la FC et sa zone ; pendant les 6 min, on y ajoute la distance du test et la VMA si
// tu gardes ta moyenne ; juste avant, trois consignes ; une pause arrête le test.

/** Pendant les 6 min : la distance du test (m), la VMA si tu tiens, et la dernière minute. */
export function MesuresTest({ distanceM, tempsS, resteS }: { distanceM: number; tempsS: number; resteS: number }) {
  const vma = vmaEnCours(distanceM, tempsS);
  return (
    <View style={styles.bloc} accessibilityLiveRegion="polite">
      <View style={styles.deux}>
        <Mesure valeur={nombre(Math.max(0, distanceM), 0)} unite="m" libelle={t("vmaTest.distance")} />
        <Mesure valeur={vma != null ? nombre(vma, 1) : "—"} unite={t("vo2.kmh")} libelle={t("vmaTest.siTuTiens")} />
      </View>
      <Texte couleur="t2" style={styles.consigne}>
        {resteS > 60 ? t("vmaTest.derniereDans", { d: chronoTexte((resteS - 60) * 1000) }) : t("vmaTest.derniere")}
      </Texte>
    </View>
  );
}

function Mesure({ valeur, unite, libelle }: { valeur: string; unite: string; libelle: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={styles.ligneV}>
        <Texte numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.v}>
          {valeur}
        </Texte>
        <Texte couleur="t2" style={styles.u}>
          {unite}
        </Texte>
      </View>
      <Texte couleur="t3" style={styles.l}>
        {libelle}
      </Texte>
    </View>
  );
}

/** Juste avant le test : trois consignes ; l'allure à viser vient de ta VMA connue (test ou estimée), sinon rien. */
export function ConsignesTest({ vma }: { vma: { vma: number; estimee: boolean } | null }) {
  const { couleurs } = useTheme();
  const lignes = [
    t("vmaTest.consigne1"),
    vma ? t("vmaTest.consigne2Allure", { allure: allureTexte(allureA(vma.vma, 1)) }) : t("vmaTest.consigne2"),
    t("vmaTest.consigne3"),
  ];
  return (
    <View style={[styles.carte, { backgroundColor: couleurs.s1, borderColor: couleurs.verreFilet }]}>
      <Texte style={styles.titre}>{t("vmaTest.ensuite")}</Texte>
      {lignes.map((l, i) => (
        <View key={i} style={styles.consigneL}>
          <View style={[styles.num, { backgroundColor: couleurs.s2 }]}>
            <Texte style={styles.numT}>{String(i + 1)}</Texte>
          </View>
          <Texte style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>{l}</Texte>
        </View>
      ))}
      {vma ? (
        <Texte couleur="t3" style={styles.note}>
          {t(vma.estimee ? "vmaTest.vmaEstimee" : "vmaTest.vmaTest", { v: approx(nombre(vma.vma, 1), vma.estimee) })}
        </Texte>
      ) : null}
    </View>
  );
}

/** En pause pendant le test (D3) : le test est arrêté ; Reprendre relance 3 min de récupération, puis les 6 min. */
export function TestArrete() {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.arrete, { backgroundColor: couleurs.s2 }]} accessibilityLiveRegion="polite">
      <Icone nom="pause" taille={18} couleur={couleurs.t1} />
      <Texte style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>
        {t("vmaTest.arrete")}
        <Texte couleur="t2" style={{ fontSize: 14 }}>{` ${t("vmaTest.arreteSuite")}`}</Texte>
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { marginTop: 12 },
  deux: { flexDirection: "row", gap: espace.l },
  ligneV: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  v: { flexShrink: 1, fontFamily: police.light, fontSize: 44, lineHeight: 48, letterSpacing: -0.9, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  u: { fontFamily: police.regular, fontSize: 16 },
  l: { fontSize: 12, marginTop: 2 },
  consigne: { fontSize: 13, marginTop: 8 },
  carte: { marginTop: 12, padding: 14, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  titre: { fontFamily: police.semibold, fontSize: 15 },
  consigneL: { flexDirection: "row", alignItems: "center", gap: 10 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  numT: { fontFamily: police.semibold, fontSize: 13 },
  note: { fontSize: 12 },
  arrete: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12, padding: 12, borderRadius: rayon.l },
});
