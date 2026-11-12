import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { courbe, duree } from "../theme/mouvement";
import { rayon as rayons } from "../theme/typo";
import { useReduit } from "./reduit";

// Surlignage d'une ligne qui vient de changer (ligne ajoutée au journal, activité associée ou ignorée : planche
// activite-detectee, ECARTS n° 7 ; revue finale du 30/10, n° 50). Sorti du journal de la Nutrition pour que le Sport et
// Énergie disent la même chose de la même façon.

/** Durée totale du surlignage : entrée, tenue, sortie. */
export const SURLIGNE_MS = 1800;
/** Sortie du voile. */
const SORTIE_MS = 600;
/** Opacité du voile au plus fort. */
const OPACITE = 0.16;
const sortie = Easing.bezier(...courbe.sortie);

/**
 * Voile de la couleur de la partie posé sur la ligne (en `absoluteFill` : la ligne est son parent) : paraît en 200 ms,
 * tient, puis s'efface en 600 ms, 1,8 s en tout. Sous « réduire les animations », voile fixe pendant 1,8 s. Le parent le
 * retire après `SURLIGNE_MS` pour pouvoir le rejouer.
 */
export function Surligne({ couleur, rayon = rayons.l }: { couleur: string; rayon?: number }) {
  const reduit = useReduit();
  const v = useRef(new Animated.Value(reduit ? 1 : 0)).current;
  useEffect(() => {
    if (reduit) {
      v.setValue(1);
      const m = setTimeout(() => v.setValue(0), SURLIGNE_MS);
      return () => clearTimeout(m);
    }
    const a = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: duree.entree, easing: sortie, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, delay: SURLIGNE_MS - duree.entree - SORTIE_MS, duration: SORTIE_MS, easing: sortie, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [reduit, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: rayon, backgroundColor: couleur, opacity: Animated.multiply(v, OPACITE) }]}
    />
  );
}
