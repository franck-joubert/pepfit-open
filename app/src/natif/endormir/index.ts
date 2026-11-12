import type { Endormir } from "./types";

export type { Endormir } from "./types";

// Web : ni luminosité de la fenêtre ni son généré (Android et iPhone ont leur index.<plateforme>.ts).
export const endormir: Endormir = {
  disponible: false,
  luminosite: async () => {},
  tonalite: async () => {},
  silence: async () => {},
};
