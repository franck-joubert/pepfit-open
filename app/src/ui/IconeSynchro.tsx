// Icône « actualiser » à droite du nom d'un service qui se synchronise au toucher (retours du 29/10) : immobile au repos,
// elle tourne pendant la synchro ; animations réduites : elle reste immobile, la sous-ligne dit « Synchronisation… ».
import { useEffect } from "react";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { Icone, type NomIcone } from "./Icone";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

const TOUR_MS = 1000;

/** `nom`, `taille`, `couleur` et `marge` : la même rotation pour une autre icône (l'arc de « Synchro en cours » de la ligne Sommeil). */
export function IconeSynchro({ enCours, nom = "sync", taille = 16, couleur, marge = 6 }: { enCours: boolean; nom?: NomIcone; taille?: number; couleur?: string; marge?: number }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const angle = useSharedValue(0);
  useEffect(() => {
    if (!enCours || reduit) {
      cancelAnimation(angle);
      angle.value = withTiming(0, { duration: duree.sortie, easing: courbes.sortie });
      return;
    }
    angle.value = 0;
    angle.value = withRepeat(withTiming(360, { duration: TOUR_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(angle);
  }, [enCours, reduit, angle]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return (
    <Animated.View style={[{ marginLeft: marge }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icone nom={nom} couleur={couleur ?? (enCours ? couleurs.t1 : couleurs.t3)} taille={taille} />
    </Animated.View>
  );
}
