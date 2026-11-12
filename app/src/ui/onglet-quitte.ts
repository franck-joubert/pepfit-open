import { useEffect, useRef } from "react";

// Onglet quitté pour un autre onglet (retours du 28/10) : Entraînements et Nutrition reviennent à aujourd'hui. Un écran poussé
// par-dessus (page du mois, fiche d'un aliment, séance) n'est pas un départ : on y revient au jour qu'on avait. Le menu signale
// chaque chemin (ui/MenuFlottant) ; la remise à aujourd'hui attend la fin de la transition d'onglet (la page qui s'efface
// ne change pas sous les yeux), ou se fait tout de suite si l'on revient avant.
//
//   useOngletQuitte("/food", () => setDate(aujourdhui()));

const ATTENTE_MS = 350;
type Ecouteur = () => void;
const ecouteurs = new Map<string, Set<Ecouteur>>();
/** Arrivée sur un onglet venant d'un autre onglet (ui/haut-arrivee.ts : la page repart d'en haut). */
const arrivees = new Map<string, Set<Ecouteur>>();
const attentes = new Map<string, ReturnType<typeof setTimeout>>();
let dernierOnglet: string | null = null;

const prevenir = (chemin: string) => {
  attentes.delete(chemin);
  for (const f of ecouteurs.get(chemin) ?? []) f();
};

/** Appelé à chaque changement de chemin ; `onglet` : le chemin est-il un onglet ? */
export function signalerChemin(chemin: string, onglet: boolean): void {
  if (!onglet) return;
  const avant = dernierOnglet;
  dernierOnglet = chemin;
  const enAttente = attentes.get(chemin);
  if (enAttente) {
    clearTimeout(enAttente);
    prevenir(chemin);
  }
  if (avant && avant !== chemin) {
    attentes.set(avant, setTimeout(() => prevenir(avant), ATTENTE_MS));
    for (const f of arrivees.get(chemin) ?? []) f();
  }
}

/** Abonne `f` à l'arrivée sur l'onglet `chemin` depuis un autre onglet (pas au retour d'un écran poussé par-dessus). */
export function abonnerArrivee(chemin: string, f: Ecouteur): () => void {
  const s = arrivees.get(chemin) ?? new Set<Ecouteur>();
  s.add(f);
  arrivees.set(chemin, s);
  return () => void s.delete(f);
}

export function abonnerQuitte(chemin: string, f: Ecouteur): () => void {
  const s = ecouteurs.get(chemin) ?? new Set<Ecouteur>();
  s.add(f);
  ecouteurs.set(chemin, s);
  return () => void s.delete(f);
}

/** Abonne la page au départ de son onglet ; `f` peut changer à chaque rendu. */
export function useOngletQuitte(chemin: string, f: Ecouteur): void {
  const courant = useRef(f);
  courant.current = f;
  useEffect(() => abonnerQuitte(chemin, () => courant.current()), [chemin]);
}
