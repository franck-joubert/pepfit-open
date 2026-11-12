import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { halo } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

// Halo de repérage (page du mois, bouton « Aujourd'hui ») : deux anneaux partent de la pastille, s'élargissent et
// s'effacent. Rejoué à chaque nouvelle `cle` ; rien quand « réduire les animations » est actif.

function Anneau({ cle, couleur, retard, rayon, fin }: { cle: number; couleur: string; retard: number; rayon: number; fin: number }) {
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = 0;
    v.value = withDelay(retard, withTiming(1, { duration: halo.duree, easing: courbes.sortie }));
  }, [cle, retard, v]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - v.value),
    transform: [{ scale: 1 + (fin - 1) * v.value }],
  }));
  return <Animated.View pointerEvents="none" collapsable={false} style={[styles.anneau, { borderColor: couleur, borderRadius: rayon }, style]} />;
}

/** À poser dans la pastille (position absolue, mêmes dimensions) ; `rayon` : celui de la pastille (rond par défaut),
 *  `fin` : échelle d'arrivée de l'anneau (une case haute s'élargit moins qu'une pastille). */
export function Halo({ cle, couleur, rayon = 999, fin = halo.fin }: { cle: number; couleur: string; rayon?: number; fin?: number }) {
  const reduit = useReduit();
  if (reduit || !cle) return null;
  return (
    <>
      <Anneau cle={cle} couleur={couleur} retard={0} rayon={rayon} fin={fin} />
      <Anneau cle={cle} couleur={couleur} retard={halo.decalage} rayon={rayon} fin={fin} />
    </>
  );
}

const styles = StyleSheet.create({
  anneau: { ...StyleSheet.absoluteFill, borderWidth: 2 },
});
