import React from "react";
import { abonnement, hote, neutre, vide } from "./aide.mjs";

/** Les enfants et le style d'un Pressable peuvent être des fonctions de l'état « appuyé ». */
const Pressable = React.forwardRef((p, ref) => {
  const etat = { pressed: false, hovered: false, focused: false };
  const { children, style, ...reste } = p;
  return React.createElement("Pressable", { ...reste, ref, style: typeof style === "function" ? style(etat) : style }, typeof children === "function" ? children(etat) : children);
});
export { Pressable };

export const View = hote("View");
export const Text = hote("Text");
export const Image = hote("Image");
export const Modal = (p) => (p.visible === false ? null : React.createElement("Modal", p));
export const TextInput = hote("TextInput");
export const ScrollView = hote("ScrollView");
export const FlatList = hote("FlatList");
export const ActivityIndicator = hote("ActivityIndicator");
export const SafeAreaView = hote("SafeAreaView");
export const KeyboardAvoidingView = hote("KeyboardAvoidingView");

export const StyleSheet = {
  create: (x) => x,
  flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.flat(9).filter(Boolean)) : (s ?? {})),
  hairlineWidth: 1,
  absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
};
export const Platform = { OS: "android", Version: 34, select: (o) => o.android ?? o.native ?? o.default, isTV: false };
const ecranParDefaut = { width: 390, height: 844, scale: 2, fontScale: 1 };
// Un test peut poser une autre taille d'écran (le pliable déplié : 1306 dp) : globalThis.__rendu = { ecran: { width: 1306 } }.
const ecran = () => ({ ...ecranParDefaut, ...globalThis.__rendu?.ecran });
export const Dimensions = { get: ecran, addEventListener: abonnement };
export const PixelRatio = { get: () => 2, getFontScale: () => 1, roundToNearestPixel: (x) => x };
export const useWindowDimensions = ecran;
export const useColorScheme = () => globalThis.__rendu?.mode === "jour" ? "light" : "dark";
export const Linking = { openURL: vide, canOpenURL: async () => true, getInitialURL: async () => null, addEventListener: abonnement };
export const Share = { share: vide };
export const Keyboard = { addListener: abonnement, dismiss() {}, isVisible: () => false };
export const AppState = { currentState: "active", addEventListener: abonnement };
// « Supprimer les animations » : un test peut le changer en direct (`reduireMouvement`), comme le réglage d'Android.
const ecouteursMouvement = new Set();
export const reduireMouvement = (v) => ecouteursMouvement.forEach((f) => f(v));
export const AccessibilityInfo = {
  isReduceMotionEnabled: async () => false,
  isScreenReaderEnabled: async () => false,
  addEventListener: (nom, f) => {
    if (nom !== "reduceMotionChanged") return { remove() {} };
    ecouteursMouvement.add(f);
    return { remove: () => void ecouteursMouvement.delete(f) };
  },
  announceForAccessibility() {},
  setAccessibilityFocus() {},
};
// La config du geste est posée sur `panHandlers` (prop `__config`) : un test peut appeler onMoveShouldSetPanResponder et onPanResponderRelease.
export const PanResponder = { create: (config) => ({ panHandlers: { __config: config } }) };
export const Alert = { alert() {} };
export const I18nManager = { isRTL: false };
export const Vibration = { vibrate() {}, cancel() {} };
export const PermissionsAndroid = { PERMISSIONS: {}, RESULTS: { GRANTED: "granted" }, check: async () => false, request: async () => "denied" };
export const SectionList = hote("SectionList");
export const BackHandler = { addEventListener: abonnement };
export const InteractionManager = { runAfterInteractions: (f) => { f?.(); return { cancel() {} }; } };
export const findNodeHandle = () => null;
export const UIManager = neutre();
export const NativeModules = {};
export const Easing = new Proxy({}, { get: () => () => (x) => x });

class Valeur {
  constructor(v) { this.v = v; }
  setValue(v) { this.v = v; }
  setOffset() {}
  stopAnimation(f) { f?.(this.v); }
  addListener() { return "id"; }
  removeListener() {}
  removeAllListeners() {}
  interpolate() { return this; }
  extractOffset() {}
  flattenOffset() {}
}
const anim = { start: (f) => f?.({ finished: true }), stop() {}, reset() {} };
const composant = (nom) => hote(nom);
export const Animated = {
  Value: Valeur,
  ValueXY: class { constructor() { this.x = new Valeur(0); this.y = new Valeur(0); } },
  View: composant("Animated.View"),
  Text: composant("Animated.Text"),
  Image: composant("Animated.Image"),
  ScrollView: composant("Animated.ScrollView"),
  createAnimatedComponent: (C) => C,
  timing: () => anim,
  spring: () => anim,
  decay: () => anim,
  parallel: () => anim,
  sequence: () => anim,
  stagger: () => anim,
  loop: () => anim,
  delay: () => anim,
  event: () => () => {},
  add: (a) => a,
  subtract: (a) => a,
  multiply: (a) => a,
  divide: (a) => a,
  diffClamp: (a) => a,
};
export default { View, Text, Image, StyleSheet, Platform };
