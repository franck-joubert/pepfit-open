import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import type { SQLiteDatabase } from "expo-sqlite";
import { supprimerSeance } from "../db";
import { menagePhotos } from "../photos";
import { useTheme } from "../theme";
import { voile } from "../theme/effets";
import { duree } from "../theme/mouvement";
import { espace, rayon } from "../theme/typo";
import { courbes } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { seanceChangee } from "./bulle-evenement";
import { passerRepos } from "./repos";
import { finirFcMuscu } from "./fc-muscu";

/** Supprime la séance, ses photos orphelines, coupe le repos et la FC en direct (rien n'est gardé). La navigation reste à l'appelant. */
export async function abandonnerSeance(db: SQLiteDatabase, seanceId: string) {
  await supprimerSeance(db, seanceId);
  await menagePhotos(db);
  await passerRepos(db);
  await finirFcMuscu(db).catch(console.error);
  seanceChangee();
}

/** Alerte : fondu et passage de 95 % à 100 % (200 ms) ; le voile suit le fondu de la fenêtre. */
const entreeDialogue: EntryExitAnimationFunction = () => {
  "worklet";
  const o = { duration: duree.entree, easing: courbes.sortie };
  return { initialValues: { opacity: 0, transform: [{ scale: 0.95 }] }, animations: { opacity: withTiming(1, o), transform: [{ scale: withTiming(1, o) }] } };
};

function BoutonTexte({ libelle, couleur, onPress }: { libelle: string; couleur: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.btxt, pressed && { backgroundColor: couleurs.s3 }]}>
      <Texte variante="saisie" style={{ fontSize: 15, color: couleur }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/** « Abandonner la séance ? » : même alerte depuis la fin de séance et depuis la barre flottante. */
export function DialogueAbandon({
  visible,
  seriesFaites,
  onAnnuler,
  onConfirmer,
}: {
  visible: boolean;
  seriesFaites: number;
  onAnnuler: () => void;
  onConfirmer: () => void;
}) {
  const { couleurs, mode } = useTheme();
  useLangue();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onAnnuler}>
      <Pressable accessibilityLabel={t("seance.abandon.annuler")} onPress={onAnnuler} style={[StyleSheet.absoluteFill, { backgroundColor: voile[mode] }]} />
      <View style={styles.centre} pointerEvents="box-none">
        <Animated.View
          entering={entreeDialogue}
          accessibilityRole="alert"
          style={[styles.dialogue, mode === "jour" ? { backgroundColor: couleurs.bg, boxShadow: "0px 12px 40px 0px rgba(17,20,24,0.18)" } : { backgroundColor: couleurs.s2 }]}
        >
          <Texte variante="titre">{t("seance.abandon.titre")}</Texte>
          {seriesFaites ? (
            <Texte variante="libelle" couleur="t2" style={{ marginTop: espace.m, fontVariant: ["tabular-nums"] }}>
              {t("seance.abandon.perdues", { series: tp("communs.serie", seriesFaites) })}
            </Texte>
          ) : null}
          <View style={styles.actions}>
            <BoutonTexte libelle={t("seance.abandon.annuler")} couleur={couleurs.t1} onPress={onAnnuler} />
            <BoutonTexte libelle={t("seance.abandon.abandonner")} couleur={couleurs.rate} onPress={onConfirmer} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, justifyContent: "center", paddingHorizontal: espace.xxl },
  dialogue: { borderRadius: rayon.feuille, paddingTop: espace.xxl, paddingBottom: espace.m, paddingLeft: espace.xxl, paddingRight: espace.l },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: espace.xs, marginTop: espace.xl },
  btxt: { minHeight: 48, paddingHorizontal: 14, borderRadius: rayon.l, justifyContent: "center" },
});
