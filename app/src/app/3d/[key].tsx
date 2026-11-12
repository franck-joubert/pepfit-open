import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { minuscule, t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../../ecrans/contexte";
import { useTheme } from "../../theme";
import { personnageDuLien } from "../../theme/lien";
import { espace, rayon } from "../../theme/typo";
import { CORPS } from "../../ui/3d/scene";
import { libelleVue3D, listeMuscles } from "../../ui/3d/muscles";
import { Bouton } from "../../ui/Bouton";
import { BarreHaut } from "../../ui/Cadre";
import { Texte } from "../../ui/Texte";

// three.js et expo-gl ne sont chargés qu'à l'ouverture de cet écran (D19 : l'image reste l'affichage par défaut)
const Vue3D = lazy(() => import("../../ui/3d/Vue3D"));

/** « Voir en 3D » : le personnage commun joue le clip de l'exercice, muscles principaux et secondaires allumés. */
export default function EcranVue3D() {
  const { key: cle, nom, personnage: impose } = useLocalSearchParams<{ key: string; nom?: string; personnage?: string }>();
  useLangue();
  const { couleurs } = useTheme();
  const { reglages } = useApp();
  const exercice = nom || t("exercices.vue3d.exercice");
  const [muscles, setMuscles] = useState<{ principaux: string[]; secondaires: string[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState(true);
  const [reduit, setReduit] = useState(false);
  const [dos, setDos] = useState(0);

  // Mouvement réduit : l'animation part en pause (on peut la relancer) et le lancer n'a plus d'élan
  useEffect(() => {
    let vivant = true;
    const appliquer = (oui: boolean) => {
      if (!vivant) return;
      setReduit(oui);
      if (oui) setLecture(false);
    };
    AccessibilityInfo.isReduceMotionEnabled().then(appliquer).catch(() => {});
    const abonnement = AccessibilityInfo.addEventListener("reduceMotionChanged", appliquer);
    return () => {
      vivant = false;
      abonnement.remove();
    };
  }, []);

  const couleurs3D = useMemo(
    () => ({ fond: couleurs.s2, corps: CORPS, principal: couleurs.muscle, secondaire: couleurs.muscle2 }),
    [couleurs],
  );
  const libelle = libelleVue3D(exercice, muscles?.principaux ?? [], muscles?.secondaires ?? []);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={exercice} sousTitre={t("exercices.vue3d.sousTitre")} />
      <View style={[styles.scene, { backgroundColor: couleurs.s2 }]}>
        {erreur ? (
          <Texte variante="corps" couleur="t3" style={styles.etat}>
            {t("exercices.vue3d.indisponible", { erreur })}
          </Texte>
        ) : (
          <>
            <Suspense fallback={null}>
              <Vue3D
                cle={cle}
                couleurs={couleurs3D}
                lecture={lecture}
                dos={dos}
                elan={!reduit}
                libelle={libelle}
                onPret={setMuscles}
                onErreur={setErreur}
                personnage={personnageDuLien(impose) ?? reglages.personnage}
              />
            </Suspense>
            {!muscles ? (
              <Texte variante="corps" couleur="t3" style={styles.etat} pointerEvents="none">
                {t("exercices.vue3d.chargement")}
              </Texte>
            ) : null}
          </>
        )}
      </View>
      <View style={styles.bas}>
        {muscles ? (
          <View style={{ gap: espace.s }}>
            <Legende couleur={couleurs.muscle} titre={t("exercices.vue3d.titrePrincipaux")} muscles={muscles.principaux} />
            <Legende couleur={couleurs.muscle2} titre={t("exercices.vue3d.titreSecondaires")} muscles={muscles.secondaires} />
          </View>
        ) : null}
        <Texte variante="meta" couleur="t3">
          {t("exercices.vue3d.geste")}
        </Texte>
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Bouton large libelle={t(lecture ? "exercices.vue3d.pause" : "exercices.vue3d.lecture")} onPress={() => setLecture((l) => !l)} />
          </View>
          <View style={{ flex: 1 }}>
            <Bouton large libelle={t("exercices.vue3d.dos")} onPress={() => setDos((n) => n + 1)} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Legende({ couleur, titre, muscles }: { couleur: string; titre: string; muscles: string[] }) {
  if (!muscles.length) return null;
  return (
    <View style={styles.legende} accessible accessibilityLabel={t("exercices.vue3d.legende", { titre, liste: minuscule(listeMuscles(muscles)) })}>
      <View style={[styles.point, { backgroundColor: couleur }]} />
      <Texte variante="corps" couleur="t3" style={{ width: 84 }}>
        {titre}
      </Texte>
      <Texte variante="corps" style={{ flex: 1 }}>
        {listeMuscles(muscles)}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, marginHorizontal: espace.l, borderRadius: rayon.xl, overflow: "hidden" },
  etat: { position: "absolute", left: 0, right: 0, top: "50%", textAlign: "center" },
  bas: { paddingHorizontal: espace.xl, paddingTop: espace.l, paddingBottom: espace.l, gap: espace.l },
  legende: { flexDirection: "row", alignItems: "center", gap: espace.s },
  point: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: "row", gap: espace.s },
});
