import type { LigneJour } from "./planif-donnees";

// Pur (sans base ni React Native) : testé par tests/suppression-retouche.test.ts.

/** Clé d'une ligne (balayage, glisser, désintégration) : la séance faite, ou la programmation et le jour d'origine ; une
 *  activité détectée (planche activite-detectee) : sa clé ; une récupération (planche Effort) : son identifiant. */
export const cleLigne = (l: LigneJour | { cle: string } | { recupId: string }) =>
  "cle" in l ? `activite:${l.cle}` : "recupId" in l ? `recup:${l.recupId}` : l.genre === "faite" ? l.seance.id : `${l.occ.programmationId}|${l.occ.origine}`;
