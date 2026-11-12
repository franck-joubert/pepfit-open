import type { Sons } from "./types";

export type { SonTelephone, Sons } from "./types";

// iOS et web : pas de sélecteur de sons.
export const sons: Sons = {
  disponible: false,
  choisir: async () => null,
  canal: async () => false,
};
