import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import { useIsFocused, usePreventRemove } from "expo-router";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { noterEtape, noterPremierMouvement } from "./mesure-transition";

// Écran qui monte du bas et y redescend, sur le fil UI. La pile native d'Android fige sa glissade à 400 ms
// (config_mediumAnimTime), sans réglage : l'écran est posé sans animation (modale transparente, _layout) et glisse ici.
// Toute sortie de l'écran affiché (retour Android, flèche, replace) attend la fin de la descente.

export function Montee({ onPose, children }: { onPose: () => void; children: ReactNode }) {
  const { couleurs } = useTheme();
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const depart = useRef(height).current;

  useEffect(() => {
    const debut = Date.now();
    const pose = () => {
      noterEtape("open", debut);
      onPose();
    };
    y.value = withTiming(0, { duration: duree.seance, easing: courbes.feuille }, (fini) => {
      if (fini) scheduleOnRN(pose);
    });
  }, []); // Ouverture : une fois.

  useAnimatedReaction(
    () => y.value,
    (v, avant) => {
      if (avant === depart && v < avant) scheduleOnRN(noterPremierMouvement, Date.now());
    },
  );

  // Écran recouvert (fin de séance) : il part sans se montrer.
  const [libre, setLibre] = useState(false);
  const garde = useIsFocused() && !libre;
  const reprendre = useRef<{ repeat: () => void; debut: number } | null>(null);
  const partir = () => {
    if (!reprendre.current) return;
    noterEtape("close", reprendre.current.debut);
    setLibre(true);
    reprendre.current.repeat();
  };
  usePreventRemove(garde, ({ repeat }) => {
    if (reprendre.current) return;
    reprendre.current = { repeat, debut: Date.now() };
    y.value = withTiming(height, { duration: duree.seanceSortie, easing: courbes.fermeture }, () => scheduleOnRN(partir));
  });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ flex: 1, backgroundColor: couleurs.bg }, style]}>{children}</Animated.View>;
}
