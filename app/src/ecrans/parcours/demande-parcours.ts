// Ouverture du parcours de séance (planche ajout-seance-v2) : une seule feuille, posée à la racine de l'appli, que toutes les
// portes appellent. « sport » : la feuille du sport (titre = le jour visé) ; « demarrer » mène au récap « Maintenant »,
// « ajouter » passe par les réglages ; « modifier » : les réglages d'une séance prévue (clé « programmation|jour d'origine »).
import { useSyncExternalStore } from "react";

export type DemandeParcours = { genre: "sport"; jour: string; mode: "demarrer" | "ajouter" } | { genre: "modifier"; seance: string };

let demande: DemandeParcours | null = null;
const abonnes = new Set<() => void>();
const poser = (d: DemandeParcours | null) => {
  demande = d;
  abonnes.forEach((f) => f());
};

export const ouvrirParcours = (d: DemandeParcours): void => poser(d);
export const fermerParcours = (): void => poser(null);

export const useDemandeParcours = (): DemandeParcours | null =>
  useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => void abonnes.delete(f);
    },
    () => demande,
  );
