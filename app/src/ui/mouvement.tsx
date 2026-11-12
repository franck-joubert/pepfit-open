import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { courbe, duree, echelle, glissement, ressort } from "../theme/mouvement";
import { useReduit } from "./reduit";

// Couche de mouvement (Reanimated, fil UI) : appui, pop, entrées et sorties de liste. Tout part des jetons de
// src/theme/mouvement.ts. « Supprimer les animations » d'Android : Reanimated saute les animations (ReduceMotion.System,
// réglage par défaut) ; l'appui et le pop sont en plus coupés à la main pour ne pas changer d'échelle du tout.

const bezier = (c: readonly [number, number, number, number]) => Easing.bezier(c[0], c[1], c[2], c[3]);
export const courbes = { sortie: bezier(courbe.sortie), deplacement: bezier(courbe.deplacement), feuille: bezier(courbe.feuille), fermeture: bezier(courbe.fermeture) };

/** Lignes et exercices : fondu à l'entrée et à la sortie, les voisins glissent à leur place. */
export const liste = {
  entree: FadeIn.duration(duree.entree).easing(courbes.sortie),
  sortie: FadeOut.duration(duree.sortie).easing(courbes.sortie),
  place: LinearTransition.duration(duree.entree).easing(courbes.deplacement),
};

/** Barre de repos : monte du bas en fondu, redescend par le même chemin. */
export const barre = {
  entree: FadeInDown.duration(duree.barre).easing(courbes.sortie).withInitialValues({ transform: [{ translateY: glissement.barre }] }),
  sortie: FadeOutDown.duration(duree.sortie).easing(courbes.sortie),
};

/** Bloc des records, à la fin de la séance : se pose un temps après l'écran (le seul moment fort). */
export const record = {
  entree: FadeInDown.delay(150).duration(duree.record).easing(courbes.sortie).withInitialValues({ transform: [{ translateY: glissement.record }] }),
};

type EtatAppui = { pressed: boolean; hovered?: boolean };
type PropsAppui = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle> | ((e: EtatAppui) => StyleProp<ViewStyle>);
  children?: ReactNode | ((e: EtatAppui) => ReactNode);
  /** Échelle enfoncée (jetons `echelle`). */
  echelle?: number;
};

const PressableAnime = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable qui s'enfonce : 0,97 en 100 ms, retour en 160 ms (courbe de sortie). Le retour repart de la valeur
 * courante : un appui bref ou répété ne saute jamais. `style` et `children` peuvent lire `pressed`, comme Pressable.
 */
export function Appui({ style, children, echelle: e = echelle.appui, onPressIn, onPressOut, ...props }: PropsAppui) {
  const [presse, setPresse] = useState(false);
  const reduit = useReduit();
  const s = useSharedValue(1);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const etat = { pressed: presse };
  return (
    <PressableAnime
      {...props}
      onPressIn={(ev: GestureResponderEvent) => {
        setPresse(true);
        if (!reduit) s.value = withTiming(e, { duration: duree.appui, easing: courbes.sortie });
        onPressIn?.(ev);
      }}
      onPressOut={(ev: GestureResponderEvent) => {
        setPresse(false);
        s.value = withTiming(1, { duration: duree.relache, easing: courbes.sortie });
        onPressOut?.(ev);
      }}
      style={[typeof style === "function" ? style(etat) : style, anime]}
    >
      {typeof children === "function" ? children(etat) : children}
    </PressableAnime>
  );
}

/**
 * Pop : quand `actif` passe à vrai (pas au premier rendu), le contenu part de 0,6 et se pose à 1 sur un ressort
 * à peine rebondi (≈ 220 ms). Sert à la coche de série.
 */
export function Pop({
  actif,
  depart = echelle.cocheDepart,
  config = ressort.coche,
  montage = false,
  children,
}: {
  actif: boolean;
  depart?: number;
  config?: { damping: number; stiffness: number; mass: number };
  /** Pop aussi au premier rendu si `actif` (médaille des records). */
  montage?: boolean;
  children: ReactNode;
}) {
  const reduit = useReduit();
  const s = useSharedValue(1);
  const avant = useRef(montage ? false : actif);
  useEffect(() => {
    if (actif && !avant.current && !reduit) {
      s.value = withSequence(withTiming(depart, { duration: 0 }), withSpring(1, config));
    }
    avant.current = actif;
  }, [actif, reduit, depart, config, s]);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={anime}>{children}</Animated.View>;
}
