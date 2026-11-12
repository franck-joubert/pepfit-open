import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Rect } from "react-native-svg";
import { or } from "../theme/effets";
import { boucleMedaille, reflet } from "../theme/mouvement";
import { arretsSvg, useIdSvg } from "./Degrade";
import { useReduit } from "./reduit";

// Médaille de record (refonte du 26/10) : disque en dégradé or, rubans or, étoile claire. Un reflet la traverse
// toutes les 6 s tant qu'elle est montée ; rien sous « réduire les animations ». Dessin de la planche (viewBox 24).

/** Disque dans le viewBox 24 : centre (12, 15), rayon 6,6. */
const DISQUE = { cx: 12, cy: 15, r: 6.6 };
const courbe = Easing.bezier(...reflet.courbeMedaille);

export function Medaille({ taille = 24, libelle }: { taille?: number; libelle?: string }) {
  const id = useIdSvg("med");
  const reduit = useReduit();
  const k = taille / 24;
  const d = 2 * DISQUE.r * k;
  return (
    <View
      accessible={!!libelle}
      accessibilityRole={libelle ? "image" : undefined}
      accessibilityLabel={libelle}
      style={{ width: taille, height: taille }}
    >
      <Svg width={taille} height={taille} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id={`${id}or`} x1="0" y1="0" x2="1" y2="1">
            {arretsSvg(or.disque)}
          </LinearGradient>
          <LinearGradient id={`${id}ruban`} x1="0" y1="0" x2="0" y2="1">
            {arretsSvg(or.ruban)}
          </LinearGradient>
        </Defs>
        <Path d="M7.5 2.5l3 6.2M16.5 2.5l-3 6.2" stroke={`url(#${id}ruban)`} strokeWidth={2.4} fill="none" />
        <Circle {...DISQUE} fill={`url(#${id}or)`} />
        <Circle cx={DISQUE.cx} cy={DISQUE.cy} r={5.3} fill="none" stroke={or.lisere} strokeOpacity={0.55} strokeWidth={0.7} />
        <Path d="M12 11.6l1.1 2.2 2.4.35-1.75 1.7.4 2.4L12 17.1l-2.15 1.15.4-2.4-1.75-1.7 2.4-.35z" fill={or.etoile} />
      </Svg>
      {reduit ? null : (
        <View
          pointerEvents="none"
          style={[styles.disque, { left: (DISQUE.cx - DISQUE.r) * k, top: (DISQUE.cy - DISQUE.r) * k, width: d, height: d, borderRadius: d / 2 }]}
        >
          <RefletMedaille diametre={d} />
        </View>
      )}
    </View>
  );
}

function RefletMedaille({ diametre }: { diametre: number }) {
  const id = useIdSvg("medref");
  const p = useSharedValue(0);
  // Un passage par minuterie : entre deux passages, aucune image n'est demandée (une pause en `withTiming` réécrivait la
  // même valeur à chaque image pendant 5 s) ; rien quand l'écran est recouvert ou que l'onglet est quitté.
  const vu = useIsFocused();
  useEffect(() => {
    if (!vu) return;
    const b = boucleMedaille();
    let m: ReturnType<typeof setTimeout>;
    const passer = () => {
      p.value = 0;
      p.value = withTiming(1, { duration: b.passage, easing: courbe });
      m = setTimeout(passer, b.passage + b.pause);
    };
    m = setTimeout(passer, b.delai);
    return () => {
      clearTimeout(m);
      cancelAnimation(p);
      p.value = 0;
    };
  }, [p, vu]);
  const c = reflet.courseMedaille;
  const anime = useAnimatedStyle(() => ({ transform: [{ translateX: (-c + 2 * c * p.value) * diametre }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, anime]}>
      <Svg width={diametre} height={diametre}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0.35">
            {arretsSvg(or.reflet)}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={diametre} height={diametre} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disque: { position: "absolute", overflow: "hidden" },
});
