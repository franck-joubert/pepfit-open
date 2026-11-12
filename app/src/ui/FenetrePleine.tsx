// Fenêtre plein écran maison (audit global, constat 19) : à la place du Modal natif et de son glissé système, elle monte du
// bas comme les feuilles (`montee`, mêmes durée et courbe) ou paraît en fondu (`fondu` : photo en grand). Le retour Android
// la ferme ; sautée sous « réduire les animations ».
// Focus : à la fermeture, Android rend le focus à un champ de la page et son clavier sortait une demi-seconde (photo de la fin
// de séance, retour du 29/10) : le champ qui avait le focus le perd à l'ouverture, et celui qui le reprend juste
// après la fermeture le reperd aussitôt.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, Modal, StyleSheet, TextInput, useWindowDimensions } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duree } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

/** Durée de la garde après la fermeture : le focus rendu par Android arrive dans les premières images. */
const GARDE_FOCUS_MS = 600;

function lacherFocus() {
  const champ = TextInput.State.currentlyFocusedInput();
  if (!champ) return;
  TextInput.State.blurTextInput(champ);
  Keyboard.dismiss();
}

export function FenetrePleine({
  visible,
  onRetour,
  entree = "montee",
  children,
}: {
  visible: boolean;
  /** Retour Android. */
  onRetour: () => void;
  entree?: "montee" | "fondu";
  children: ReactNode;
}) {
  const reduit = useReduit();
  const { height } = useWindowDimensions();
  const [monte, setMonte] = useState(visible);
  // 0 : fermée, 1 : ouverte.
  const p = useSharedValue(0);
  const ouverte = useRef(false);
  useEffect(() => {
    if (monte) {
      ouverte.current = true;
      return lacherFocus();
    }
    if (!ouverte.current) return;
    ouverte.current = false;
    const fin = Date.now() + GARDE_FOCUS_MS;
    const id = setInterval(() => {
      lacherFocus();
      if (Date.now() > fin) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [monte]);
  useEffect(() => {
    if (visible) {
      setMonte(true);
      p.value = withTiming(1, { duration: reduit ? 0 : duree.feuille, easing: courbes.feuille });
    } else {
      p.value = withTiming(0, { duration: reduit ? 0 : duree.feuilleSortie, easing: courbes.feuille }, (fini) => {
        if (fini) runOnJS(setMonte)(false);
      });
    }
  }, [visible, reduit, p]);
  const style = useAnimatedStyle(() =>
    entree === "fondu" ? { opacity: p.value } : { transform: [{ translateY: (1 - p.value) * height }] },
  );
  return (
    <Modal visible={monte} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onRetour}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
    </Modal>
  );
}
