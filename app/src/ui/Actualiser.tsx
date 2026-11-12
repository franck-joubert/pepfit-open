// Tirer pour actualiser (07/11) : la page tout en haut, un tirage vers le bas lance une actualisation (serveur, Santé
// Connect, Whoop, Withings, Polar, puis la relecture de la page : actualiser/sources.ts). Un seul composant pour toutes les
// pages ; liste testée dans tests/actualiser-pages.test.ts.
// Il enveloppe l'EN-TÊTE et le contenu de la page : tout descend ensemble avec le doigt (retour du 08/11 : l'en-tête
// restait en haut). La page suit le doigt avec une résistance, se tient à REPOS_TIRAGE dp pendant l'actualisation, puis remonte
// au ressort du design (`ressort.retour`, le même que le glissé de feuille). L'indicateur vit dans le vide ainsi révélé ; l'aura
// derrière les écrans ne bouge pas et le remplit. Mouvement réduit : la page reste en place, l'indicateur paraît en fondu.
// L'indicateur (ui/IndicateurActualiser, choix de 08/11) : un filet à la couleur de la partie, rempli par le tirage, puis
// traversé par le reflet du bouton principal ; rien ne tourne.
// Le geste est un Pan de react-native-gesture-handler, pas un PanResponder : sur Android, le ScrollView natif prend la main après
// ~8 dp de glissé et le JS reçoit alors un « touchCancel » ; le Pan natif s'active à 6 dp, avant lui, et seulement quand la page
// est tout en haut (`defilement` ≤ 1). Un glissé horizontal (semainier, pagination) ou vers le haut le laisse échouer.
// Le ScrollView de la page prend `sansEtirement` : l'étirement natif d'Android 12 (le contenu qui s'allonge sans l'en-tête) est
// coupé, la page ne bouge que par ce composant.
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { HAUT_FILET, IndicateurActualiser, LARGEUR_INDICATEUR, TAILLE_INDICATEUR } from "./IndicateurActualiser";
import { actualiserMaintenant } from "../actualiser/sources";
import { decalageTirage, progressionTirage, REPOS_TIRAGE, SEUIL_TIRAGE, seuilFranchi, ZONE_MORTE } from "../actualiser/noyau";
import { useApp } from "../ecrans/contexte";
import { duree, ressort } from "../theme/mouvement";
import { useFondPartie } from "./ContextePartie";
import { haptique } from "./haptique";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

/** Un passage du reflet sur le filet quand ça actualise (ms) : vitesse constante, la boucle ne marque pas d'arrêt. */
const PASSAGE_MS = 900;
/** Le cran se réarme quand le doigt remonte sous cette part du seuil : un doigt qui tremble au seuil ne vibre pas deux fois. */
const REARME = 0.8;

const tic = () => haptique.cran();

/** Le ScrollView d'une page tirée : pas d'étirement natif (voir plus haut). À étaler sur son ScrollView. */
export const sansEtirement = { overScrollMode: "never" } as const;

export type PropsActualiser = {
  /** Défilement vertical de la page (dp), sur le thread UI : le tirage ne compte que quand il est à 0. */
  defilement: SharedValue<number>;
  /** Le recalcul propre à la page, attendu avant la fin (page qui relit le serveur : profil, cercle, lieu, fil). */
  recalculer?: () => Promise<unknown>;
  /** Faux : pas de tirage (mode Modifier de l'Accueil, glisser-déposer en cours). */
  actif?: boolean;
  /** La zone commence sous la barre d'état (page à fond perdu) : la page descend d'autant, l'indicateur se pose dessous. */
  souBarre?: boolean;
  style?: StyleProp<ViewStyle>;
  /** L'en-tête de la page, puis son contenu. */
  children: ReactNode;
};

export function Actualiser({ defilement, recalculer, actif = true, souBarre = false, style, children }: PropsActualiser) {
  const { db } = useApp();
  const reduit = useReduit();
  const fond = useFondPartie();
  const barre = useSafeAreaInsets().top;
  const marge = souBarre ? barre : 0;
  const repos = REPOS_TIRAGE + marge;

  const decalage = useSharedValue(0); // dp dont la page est descendue
  const progression = useSharedValue(0); // course de l'indicateur, 0 à 1
  const apparition = useSharedValue(0); // opacité de l'indicateur
  const passage = useSharedValue(0); // passage du reflet, 0 à 1 en boucle pendant l'actualisation
  const pop = useSharedValue(1); // léger gonflement de l'indicateur au franchissement du seuil
  const enCours = useSharedValue(false);
  const franchi = useSharedValue(false);
  const actifSV = useSharedValue(actif);
  const reduitSV = useSharedValue(reduit);
  const reposSV = useSharedValue(repos);
  const margeSV = useSharedValue(marge);
  useEffect(() => void (actifSV.value = actif), [actif, actifSV]);
  useEffect(() => void (reduitSV.value = reduit), [reduit, reduitSV]);
  useEffect(() => {
    reposSV.value = repos;
    margeSV.value = marge;
  }, [repos, marge, reposSV, margeSV]);

  const recalcul = useRef(recalculer);
  recalcul.current = recalculer;

  /** Tout est à jour : l'indicateur s'efface pendant que la page remonte ; le geste redevient possible une fois en haut. */
  const finir = useCallback(() => {
    apparition.value = withTiming(0, { duration: duree.sortie, easing: courbes.sortie });
    decalage.value = withSpring(0, ressort.retour, (fini) => {
      if (!fini) return;
      cancelAnimation(passage);
      passage.value = 0;
      progression.value = 0;
      enCours.value = false;
    });
  }, [apparition, decalage, passage, progression, enCours]);

  const lancer = useCallback(() => {
    actualiserMaintenant(db, () => recalcul.current?.() ?? Promise.resolve())
      .catch(() => "fait" as const)
      .then(finir);
  }, [db, finir]);

  const enHaut = useDerivedValue(() => actifSV.value && !enCours.value && defilement.value <= 1);
  const pan = usePanGesture({
    enabled: enHaut,
    activeOffsetY: [-10_000, ZONE_MORTE],
    failOffsetY: [-8, 10_000],
    failOffsetX: [-12, 12],
    onActivate: () => {
      "worklet";
      franchi.value = false;
    },
    onUpdate: (e) => {
      "worklet";
      const dy = e.translationY;
      const p = progressionTirage(dy);
      progression.value = reduitSV.value ? 1 : p;
      apparition.value = Math.min(1, p * 2);
      decalage.value = reduitSV.value ? 0 : decalageTirage(dy) + margeSV.value * p;
      if (!franchi.value && seuilFranchi(dy)) {
        franchi.value = true;
        if (!reduitSV.value) pop.value = withSequence(withTiming(1.2, { duration: 90, easing: courbes.sortie }), withTiming(1, { duration: duree.relache, easing: courbes.sortie }));
        scheduleOnRN(tic);
      } else if (franchi.value && dy < SEUIL_TIRAGE * REARME) franchi.value = false;
    },
    onDeactivate: (e) => {
      "worklet";
      if (!e.canceled && seuilFranchi(e.translationY)) {
        // Lâché au-delà du seuil : la page se pose à sa place de repos, le reflet traverse le filet tant que ça actualise.
        enCours.value = true;
        apparition.value = withTiming(1, { duration: duree.relache, easing: courbes.sortie });
        progression.value = withTiming(1, { duration: duree.relache, easing: courbes.sortie });
        if (!reduitSV.value) {
          decalage.value = withSpring(reposSV.value, ressort.retour);
          passage.value = 0;
          passage.value = withRepeat(withTiming(1, { duration: PASSAGE_MS, easing: Easing.linear }), -1, false);
        }
        scheduleOnRN(lancer);
      } else {
        apparition.value = withTiming(0, { duration: duree.relache, easing: courbes.sortie });
        progression.value = withTiming(0, { duration: duree.relache, easing: courbes.sortie });
        decalage.value = withSpring(0, ressort.retour);
      }
    },
  });

  const page = useAnimatedStyle(() => ({ transform: [{ translateY: decalage.value }] }));
  const pose = useAnimatedStyle(() => ({ opacity: apparition.value, transform: [{ scale: pop.value }] }));

  // L'indicateur est posé au milieu du vide que la page laisse en descendant. Mouvement réduit : la page ne descend pas, le filet
  // se pose au bord haut de la zone, dans l'air au-dessus des boutons de l'en-tête ; sur une page à photo (`souBarre`), une
  // pastille pleine du fond de la partie derrière lui, jamais translucide.
  const top = marge + (reduit ? 2 - HAUT_FILET : (REPOS_TIRAGE - TAILLE_INDICATEUR) / 2);
  return (
    <GestureHandlerRootView style={[styles.zone, style]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicateur, { top }, reduit && { zIndex: 20 }, pose]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <IndicateurActualiser progression={progression} passage={passage} pastille={reduit && souBarre ? fond : undefined} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.zone, page]} collapsable={false}>
          {children}
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  zone: { flex: 1 },
  indicateur: {
    position: "absolute",
    alignSelf: "center",
    width: LARGEUR_INDICATEUR,
    height: TAILLE_INDICATEUR,
  },
});
