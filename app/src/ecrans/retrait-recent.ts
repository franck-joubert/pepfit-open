import { useSyncExternalStore } from "react";

export interface RetraitRecent {
  retraitId: string;
  libelle: string;
  salleNom: string;
}

let courant: RetraitRecent | null = null;
const ecouteurs = new Set<() => void>();
const emettre = () => ecouteurs.forEach((f) => f());

/** Dernier retrait d'équipement annulable (le bandeau « X retiré de … · Annuler » le montre, quel que soit l'écran). */
export function poserRetraitRecent(r: RetraitRecent | null): void {
  courant = r;
  emettre();
}

export function useRetraitRecent(): RetraitRecent | null {
  return useSyncExternalStore(
    (f) => {
      ecouteurs.add(f);
      return () => void ecouteurs.delete(f);
    },
    () => courant,
  );
}
