import { useMemo, useRef } from "react";
import { Image, PanResponder, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duree } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { pincement, type Pt } from "./pincement";
import { useReduit } from "./reduit";

// Photo en grand qu'on zoome à deux doigts (retour du 29/10) : elle grossit sous les doigts et, au relâcher,
// reprend sa taille (250 ms, courbe sortie ; d'un coup sous « réduire les animations »). Un doigt seul ne la prend pas :
// le toucher (fermer) et l'appui long (menu) restent au parent.

const deux = (e: GestureResponderEvent): [Pt, Pt] | null => {
  const t = e.nativeEvent.touches;
  return t.length >= 2 ? [{ x: t[0]!.pageX, y: t[0]!.pageY }, { x: t[1]!.pageX, y: t[1]!.pageY }] : null;
};

export function PhotoZoom({ uri }: { uri: string }) {
  const reduit = useReduit();
  const echelle = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const taille = useRef({ l: 0, h: 0 });
  const debut = useRef<[Pt, Pt] | null>(null);

  const geste = useMemo(() => {
    const relacher = () => {
      debut.current = null;
      const o = { duration: reduit ? 0 : duree.saut, easing: courbes.sortie };
      echelle.value = withTiming(1, o);
      x.value = withTiming(0, o);
      y.value = withTiming(0, o);
    };
    const prendre = (e: GestureResponderEvent) => deux(e) != null;
    return PanResponder.create({
      // Le second doigt posé : le pincement prend la main au toucher du parent (qui ne ferme pas la photo).
      onStartShouldSetPanResponderCapture: prendre,
      onMoveShouldSetPanResponderCapture: prendre,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (e) => {
        const d = deux(e);
        if (!d) return relacher();
        if (!debut.current) debut.current = d;
        const p = pincement(debut.current, d, { x: taille.current.l / 2, y: taille.current.h / 2 });
        echelle.value = p.echelle;
        x.value = p.x;
        y.value = p.y;
      },
      onPanResponderRelease: relacher,
      onPanResponderTerminate: relacher,
    });
  }, [reduit, echelle, x, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: echelle.value }] }));
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => (taille.current = { l: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...geste.panHandlers}
    >
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});
