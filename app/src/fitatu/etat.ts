// Import Fitatu en cours, vu de partout (écran Fitatu et ligne de Connexions), comme etat-synchro.ts de Whoop. Pur.
import type { Progression } from "./historique";

let courante: Progression | null = null;
const abonnes = new Set<() => void>();

/** Progression de l'import en cours ; null s'il n'y en a pas. */
export const progressionFitatu = () => courante;

/** Pour useSyncExternalStore : renvoie de quoi se désabonner. */
export function abonnerFitatu(f: () => void): () => void {
  abonnes.add(f);
  return () => void abonnes.delete(f);
}

export function signalerProgression(p: Progression | null): void {
  courante = p;
  abonnes.forEach((f) => f());
}

/** Part faite, de 0 à 1. */
export const part = (p: Progression) => (p.total > 0 ? Math.min(1, p.jours / p.total) : 0);
