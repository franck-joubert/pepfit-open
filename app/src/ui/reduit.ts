// « Supprimer les animations » d'Android : une seule lecture pour toute l'appli (constat 8 de l'audit du mouvement).
// Valeur de départ : celle que Reanimated lit de façon synchrone au lancement (aucune image animée avant la réponse
// d'AccessibilityInfo) ; ensuite, le réglage est suivi en direct, y compris dans les onglets gardés montés.
import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

let reduit = !!(globalThis as { _REANIMATED_IS_REDUCED_MOTION?: boolean })._REANIMATED_IS_REDUCED_MOTION;
const abonnes = new Set<() => void>();

function changer(v: boolean) {
  if (v === reduit) return;
  reduit = v;
  abonnes.forEach((f) => f());
}

AccessibilityInfo.isReduceMotionEnabled().then(changer).catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", changer);

/** Lecture au moment du geste (gestionnaires, Animated) : toujours la valeur courante. */
export function reduitMouvement(): boolean {
  return reduit;
}

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Crochet des composants : se re-rend quand le réglage change. Remplace `useReducedMotion` de Reanimated (lu une fois). */
export function useReduit(): boolean {
  return useSyncExternalStore(abonner, reduitMouvement);
}
