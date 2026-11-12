import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { useHautEntete } from "../BarreSurPhoto";

// Les formes d'attente de la page d'un circuit (planche Circuits, « chargement ») : aux places de la page, rien ne saute à l'arrivée du
// circuit. Le cadre de la couverture (2:1, 240 au plus sous la barre), le titre, la carte, les trois chiffres et le profil. Lente
// pulsation, fixe sous « réduire les animations ». Seule la couverture est neutre : la photo ou le tracé n'existent pas encore.

export function AttenteCircuit() {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const { width } = useWindowDimensions();
  const haut = useHautEntete();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduit) return;
    const aller = () => {
      o.value = withTiming(o.value > 0.8 ? 0.55 : 1, { duration: 1400, easing: courbes.deplacement });
    };
    aller();
    const id = setInterval(aller, 1400);
    return () => clearInterval(id);
  }, [reduit, o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  const bloc = (w: number | `${number}%`, h: number, m = 0, r: number = rayon.s) => <View style={{ width: w, height: h, marginTop: m, borderRadius: r, backgroundColor: couleurs.s2 }} />;

  return (
    <Animated.View style={[styles.page, pulse]} accessible accessibilityRole="progressbar" accessibilityLabel={t("circuit.chargement")}>
      <View style={{ height: haut + Math.min(width / 2, 240), backgroundColor: couleurs.s1 }} />
      <View style={styles.corps}>
        {bloc("72%", 26, espace.l)}
        {bloc("44%", 14, espace.m)}
        {bloc(92, 28, espace.m, rayon.xl)}
        {bloc("100%", 188, espace.l, rayon.xl)}
        <View style={styles.chiffres}>
          {[0, 1, 2].map((i) => (
            <View key={i}>
              {bloc(64, 26)}
              {bloc(48, 12, espace.s)}
            </View>
          ))}
        </View>
        {bloc("100%", 96, espace.xxl, rayon.l)}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  corps: { paddingHorizontal: espace.l },
  chiffres: { flexDirection: "row", gap: espace.xxl + espace.s, marginTop: espace.xl },
});
