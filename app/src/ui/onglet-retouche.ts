import { useEffect, useRef } from "react";

// Onglet re-touché : toucher dans le menu flottant l'onglet de la page où l'on est déjà (Entraînements sur Entraînements)
// ramène la page à aujourd'hui et en haut. Le menu est le nôtre (la barre d'onglets d'expo-router n'est pas dessinée) :
// pas de « tabPress », il prévient lui-même les pages abonnées.
//
//   useOngletRetouche("/train", () => { setSel(aujourdhui); defilement.current?.scrollTo({ y: 0, animated: true }); });

type Ecouteur = () => void;
const ecouteurs = new Map<string, Set<Ecouteur>>();

/** Appelé par le menu quand l'onglet actif est touché. */
export function retoucher(chemin: string): void {
  for (const f of ecouteurs.get(chemin) ?? []) f();
}

export function abonnerRetouche(chemin: string, f: Ecouteur): () => void {
  const s = ecouteurs.get(chemin) ?? new Set<Ecouteur>();
  s.add(f);
  ecouteurs.set(chemin, s);
  return () => void s.delete(f);
}

/** Abonne la page à son onglet re-touché ; `f` peut changer à chaque rendu. */
export function useOngletRetouche(chemin: string, f: Ecouteur): void {
  const courant = useRef(f);
  courant.current = f;
  useEffect(() => abonnerRetouche(chemin, () => courant.current()), [chemin]);
}
