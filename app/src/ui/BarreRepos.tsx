import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cibleBarre } from "../ecrans/repos-barre";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace, rayon } from "../theme/typo";
import { FondDegrade } from "./Degrade";
import { Appui, courbes } from "./mouvement";
import { Texte } from "./Texte";
import { useLangue } from "../i18n/useLangue";

interface Props {
  restantS: number;
  totalS: number;
  onAjuster: (deltaS: number) => void;
  onPasser: () => void;
  /** Pas de −/+ (15 s ; 5 s pour le temps entre deux exercices d'un superset). */
  pas?: number;
  /** Ligne sous le décompte : « Machine suivante · Leg curl ». */
  sousTitre?: string | null;
  /** Plein écran d'une série en durée : le décompte est dans le grand affichage, la barre garde −15, +15 et Passer. */
  sansChiffre?: boolean;
  /** Posée sur la bande du bas de la séance (FC, Pause) : même fond s1, un filet entre les deux, la bande garde la zone système. */
  surBande?: boolean;
  /** Posée sur le clavier de séance (planche clavier-seance) : pas de marge du bas, le fond du clavier. */
  surClavier?: boolean;
}

export function formaterDuree(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function Touche({ libelle, aria, onPress, largeur }: { libelle: string; aria: string; onPress: () => void; largeur: number }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={aria}
      onPress={onPress}
      style={[styles.touche, { minWidth: largeur, backgroundColor: couleurs.btnTonalFond }]}
    >
      <Texte variante="exercice" style={{ fontSize: 14, color: couleurs.btnTonalTexte }}>
        {libelle}
      </Texte>
    </Appui>
  );
}

// Barre de repos (base v2.2.4) : trait de 3 px au dégradé du geste principal (27/10), −15 / minuteur seul / +15 / Passer, tous tonals.
export function BarreRepos({ restantS, totalS, onAjuster, onPasser, pas = 15, sousTitre = null, sansChiffre = false, surBande = false, surClavier = false }: Props) {
  const { t } = useLangue();
  const { couleurs, mode } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  // Le trait se vide en continu (échelle horizontale, fil UI) au lieu de sauter à chaque seconde.
  const part = useSharedValue(totalS > 0 ? Math.min(1, restantS / totalS) : 0);
  // ±15 s : le chiffre roule d'un cran (vers le haut en ajoutant, vers le bas en retirant), le trait saute.
  // Le sens de sortie de l'ancien chiffre n'est connu qu'au saut : il passe par une valeur partagée, lue à la sortie.
  const [roule, setRoule] = useState({ cle: 0, sens: 1 });
  const sensSortie = useSharedValue(1);
  const avant = useRef(restantS);
  useEffect(() => {
    const d = restantS - avant.current;
    avant.current = restantS;
    if (Math.abs(d) > 1) {
      sensSortie.value = d > 0 ? 1 : -1;
      setRoule((r) => ({ cle: r.cle + 1, sens: d > 0 ? 1 : -1 }));
    }
  }, [restantS, sensSortie]);
  const sortieChiffre = useRef<EntryExitAnimationFunction>(() => {
    "worklet";
    const config = { duration: duree.saut, easing: courbes.sortie };
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: { opacity: withTiming(0, config), transform: [{ translateY: withTiming(-sensSortie.value * ROULE, config) }] },
    };
  }).current;
  useEffect(() => {
    const c = cibleBarre(restantS, totalS, part.value);
    part.value = withTiming(
      c.part,
      c.saut ? { duration: duree.saut, easing: courbes.sortie } : { duration: 1000, easing: Easing.linear },
    );
  }, [restantS, totalS, part]);
  const trait = useAnimatedStyle(() => ({ transform: [{ scaleX: part.value }] }));
  return (
    <View
      style={
        surClavier
          ? { backgroundColor: mode === "jour" ? couleurs.s2 : couleurs.reposFond }
          : surBande
            ? { backgroundColor: couleurs.s1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: couleurs.line2 }
            : { backgroundColor: couleurs.reposFond, paddingBottom: bas }
      }
    >
      <View style={{ height: 3, backgroundColor: couleurs.reposPiste }}>
        <Animated.View style={[styles.trait, trait]}>
          <FondDegrade />
        </Animated.View>
      </View>
      <View style={styles.contenu}>
        <Touche libelle={`−${pas}`} aria={t("seance.repos.retirer", { n: pas })} onPress={() => onAjuster(-pas)} largeur={56} />
        <View style={[styles.cadran, sousTitre ? styles.cadranDouble : null, sansChiffre && { opacity: 0 }]} importantForAccessibility={sansChiffre ? "no-hide-descendants" : "auto"}>
          <Animated.View
            key={roule.cle}
            entering={roule.cle ? (roule.sens > 0 ? rouleEntreHaut : rouleEntreBas) : undefined}
            exiting={sortieChiffre}
            style={[styles.chiffre, sousTitre ? { top: 0 } : null]}
          >
            <Texte variante="minuteur" accessibilityRole="timer" accessibilityLabel={t("seance.repos.libelle", { s: restantS })} style={styles.temps}>
              {formaterDuree(restantS)}
            </Texte>
          </Animated.View>
          {sousTitre ? (
            <Texte variante="corps" couleur="t2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.sousTitre}>
              {sousTitre}
            </Texte>
          ) : null}
        </View>
        <Touche libelle={`+${pas}`} aria={t("seance.repos.ajouter", { n: pas })} onPress={() => onAjuster(pas)} largeur={56} />
        {/* Avec « Machine suivante, … » : « Passer » à sa largeur (planche), la ligne a besoin de la place. */}
        <Touche libelle={t("seance.repos.passer")} aria={t("seance.repos.passerLibelle")} onPress={onPasser} largeur={sousTitre ? 56 : 84} />
      </View>
    </View>
  );
}

// Planche : l'ancien chiffre part de 14 px en fondu, le nouveau arrive de l'autre côté (250 ms, sortie).
const ROULE = 14;
const rouleEntreHaut = FadeInUp.duration(duree.saut).easing(courbes.sortie).withInitialValues({ opacity: 0, transform: [{ translateY: ROULE }] });
const rouleEntreBas = FadeInDown.duration(duree.saut).easing(courbes.sortie).withInitialValues({ opacity: 0, transform: [{ translateY: -ROULE }] });

const styles = StyleSheet.create({
  // Hauteurs minimales : à font_scale 1,3 la barre grandit au lieu de couper le minuteur ou « Passer ».
  contenu: { minHeight: 89, paddingVertical: espace.s, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l },
  touche: { minHeight: 48, borderRadius: rayon.l, paddingHorizontal: espace.l, alignItems: "center", justifyContent: "center" },
  cadran: { flex: 1, minHeight: 48, overflow: "hidden", justifyContent: "center" },
  chiffre: { position: "absolute", left: 0, right: 0 },
  // Avec « Machine suivante » : le décompte en haut, la ligne dessous (planche idee-plein-ecran, superset).
  cadranDouble: { minHeight: 60, justifyContent: "flex-end" },
  sousTitre: { fontSize: 13, textAlign: "center" },
  temps: { textAlign: "center", fontSize: 28 },
  trait: { height: 3, transformOrigin: "left" },
});
