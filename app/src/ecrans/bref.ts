// Le message bref (le bandeau du bas : l'appli n'a pas de toast) : un seul à la fois, 3 s.
import { useSyncExternalStore } from "react";

let bref: { id: number; texte: string; coche: boolean; onAnnuler?: () => void } | null = null;
const abonnes = new Set<() => void>();
let compteur = 0;

/** `onAnnuler` : un bouton « Annuler » qui défait le geste ; le message tombe au toucher. */
export function montrerBref(texte: string, coche = false, onAnnuler?: () => void): void {
  const id = ++compteur;
  bref = { id, texte, coche, ...(onAnnuler ? { onAnnuler } : {}) };
  abonnes.forEach((f) => f());
  setTimeout(() => {
    if (bref?.id !== id) return;
    bref = null;
    abonnes.forEach((f) => f());
  }, 3000);
}

/** Le message bref s'en va tout de suite (le toucher sur « Annuler »). */
export function effacerBref(): void {
  if (!bref) return;
  bref = null;
  abonnes.forEach((f) => f());
}

const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
};

export function useBref() {
  return useSyncExternalStore(abonner, () => bref);
}
