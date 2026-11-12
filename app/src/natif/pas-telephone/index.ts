import type { PasTelephone } from "./types";

export type * from "./types";

// Web, iOS et tests : pas de compteur (Apple Santé compte déjà les pas de l'iPhone). Android : index.android.ts.
export const pasTelephone: PasTelephone = {
  disponible: async () => false,
  autorise: async () => false,
  demander: async () => false,
  compteur: async () => null,
};
