import type { AlarmeRecup } from "./types";

export type { AlarmeRecup, DiagAlarme } from "./types";

// iOS et web : pas d'alarme programmée ; l'écran de la sieste vibre seul à la fin, appli ouverte.
export const alarmeRecup: AlarmeRecup = {
  natif: false,
  arreter: async () => {},
  diagnostic: async () => null,
  ouvrirPleinEcran: async () => {},
  demanderHeureExacte: async () => {},
  programmer: async () => false,
  fermetureLibre: async () => {},
  rappel: async () => {},
};
