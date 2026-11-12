// Un onglet monté en préchargement n'a pas le focus : ses lectures (useFocusEffect) ne partent qu'à son ouverture, et l'écran
// s'ouvre vide le temps qu'elles reviennent. Pendant son échauffement (monté, jamais ouvert, pas encore gelé : app/(tabs)/_layout),
// l'effet part tout de suite, comme s'il avait le focus ; il est annulé à la fin de l'échauffement (nettoyage de l'effet) et le
// vrai focus le relance, comme avant. À utiliser à la place de useFocusEffect d'expo-router pour les lectures d'un onglet.
import { useFocusEffect as useFocusEffetNavigation } from "expo-router";
import { createContext, useContext, useEffect } from "react";

/** Vrai pendant l'échauffement d'une partie préchargée, jamais ouverte. */
export const Echauffement = createContext(false);

export function useFocusEffect(effet: () => void | (() => void)): void {
  useFocusEffetNavigation(effet);
  const echauffe = useContext(Echauffement);
  useEffect(() => (echauffe ? effet() : undefined), [echauffe, effet]);
}
