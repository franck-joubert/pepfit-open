// Bande des paliers (D14) : posée au-dessus du clavier tant qu'un champ de charge a le focus.
import { useSyncExternalStore } from "react";
import type { Unite } from "./format";

export interface EtatBande {
  /** Champ propriétaire ; seul lui peut fermer la bande. */
  cle: string;
  /** Charges du lieu dans l'unité affichée, ou null : + et − par 2,5 kg (5 lbs). */
  paliers: number[] | null;
  unite: Unite;
  /** Valeur en cours de saisie, dans l'unité affichée. */
  valeur: number | null;
  /** Écrit la valeur (unité affichée) dans le champ et l'enregistre. */
  appliquer: (v: number) => void;
}

let etat: EtatBande | null = null;
const abonnes = new Set<() => void>();
const emettre = () => abonnes.forEach((f) => f());

export const bande = {
  ouvrir(e: EtatBande) {
    etat = e;
    emettre();
  },
  maj(cle: string, valeur: number | null) {
    if (etat?.cle === cle && etat.valeur !== valeur) {
      etat = { ...etat, valeur };
      emettre();
    }
  },
  fermer(cle: string) {
    if (etat?.cle === cle) {
      etat = null;
      emettre();
    }
  },
};

export function useBande(): EtatBande | null {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}
