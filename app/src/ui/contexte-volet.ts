import { createContext, useContext } from "react";
import type { Href } from "expo-router";

/** Volet du profil : l'ouvrir, le fermer, ou le quitter vers un écran poussé (le retour le rouvre). */
export type Volet = { ouvrir: () => void; fermer: () => void; aller: (href: Href) => void };

export const ContexteVolet = createContext<Volet>({ ouvrir: () => {}, fermer: () => {}, aller: () => {} });

export function useVolet() {
  return useContext(ContexteVolet);
}
