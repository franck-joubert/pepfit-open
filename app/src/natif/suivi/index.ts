import type { Suivi } from "./types";

export type * from "./types";

const absent = () => Promise.reject(new Error("suivi indisponible"));

// Web : pas de suivi GPS natif (iPhone : index.ios.ts, Android : index.android.ts).
export const suivi: Suivi = {
  disponible: false,
  capteurs: async () => null,
  autoriser: async () => false,
  appareils: async () => false,
  demanderAppareils: async () => "refuse",
  demarrer: absent,
  pause: absent,
  reprendre: absent,
  tour: async () => null,
  terminer: absent,
  etat: async () => null,
  ecouter: () => () => {},
  points: async () => [],
  frequences: async () => [],
  tampons: async () => [],
  effacer: async () => {},
  oublier: async () => {},
  chercherFc: async () => [],
  batterie: async () => null,
  ouvrirReglagesBatterie: async () => null,
  journal: async () => [],
  ouvrirAppli: async () => false,
};
