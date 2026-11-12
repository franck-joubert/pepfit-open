import type { LigneJour } from "./planif-donnees";

// Retirer une ligne du planning : le glissé vers la gauche (« Supprimer ») et le menu ⋯ suivent la même règle.
// Pur (sans base ni React Native) : testé par tests/retrait-ligne.test.ts.

/** Ce que devient une ligne retirée : une séance passée (faite ou manquée) quitte l'historique ou le planning, une séance à
 *  venir passe par `retirer` (la règle, ou le choix « Cette séance / Toute la série »). */
export const retraitDe = (l: LigneJour): "passee" | "avenir" => (l.genre === "faite" || l.manquee ? "passee" : "avenir");

/** Une séance à venir d'une série : on demande « Cette séance » ou « Toute la série » avant de retirer quoi que ce soit
 *  (la ligne glissée reste alors en place, refermée, le temps du choix). */
export const demandeChoix = (l: LigneJour): boolean => retraitDe(l) === "avenir" && l.genre === "prevue" && l.occ.repetee;
