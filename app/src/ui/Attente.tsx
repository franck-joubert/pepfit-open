// Attente maison (audit global, constat 19) : trois points qui s'allument l'un après l'autre, à la place du rond Material
// d'ActivityIndicator. Couleur t2 sur une ligne, `sur` du dégradé dans un bouton plein ; immobiles si on réduit les animations.
import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { useDegrade } from "./ContextePartie";
import { useReduit } from "./reduit";

/** Un tour complet : chaque point s'allume puis s'éteint sur un tiers (vitesse constante : la boucle ne marque pas d'arrêt). */
const TOUR = 1200;
const POINTS = [0, 1, 2] as const;

function Point({ i, phase, couleur, reduit }: { i: number; phase: SharedValue<number>; couleur: string; reduit: boolean }) {
  const style = useAnimatedStyle(() => {
    if (reduit) return { opacity: 0.7, transform: [{ scale: 1 }] };
    // Distance (circulaire) entre la phase et le point : 0 = allumé, ≥ 1 = au repos.
    const d = Math.abs(((phase.value - i + 4.5) % 3) - 1.5);
    const a = Math.max(0, 1 - d);
    return { opacity: 0.3 + 0.7 * a, transform: [{ scale: 0.8 + 0.2 * a }] };
  });
  return <Animated.View style={[styles.point, { backgroundColor: couleur }, style]} />;
}

export function Attente({ sur = false, couleur, style }: { sur?: boolean; couleur?: string; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const d = useDegrade();
  const reduit = useReduit();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduit) return;
    phase.value = 0;
    phase.value = withRepeat(withTiming(3, { duration: TOUR, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(phase);
  }, [phase, reduit]);
  const c = couleur ?? (sur ? d.sur : couleurs.t2);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t("ui.chargement")} style={[styles.rangee, style]}>
      {POINTS.map((i) => (
        <Point key={i} i={i} phase={phase} couleur={c} reduit={reduit} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 20 },
  point: { width: 7, height: 7, borderRadius: 3.5 },
});
