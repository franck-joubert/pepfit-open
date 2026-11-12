// Glissé entre les jours (retour du 28/10, puis du 28/10 au soir) : Entraînements et Nutrition. Un carrousel de
// pages : le jour courant et ses deux voisins sont rendus côte à côte, placés d'après une position continue exprimée en jours
// (`indexJour`) ; le doigt la déplace, les pages et le fond de la pastille du semainier la suivent sans re-rendu React. Lâchée
// assez loin (ou d'un geste vif), la position s'accroche au jour voisin ; sinon elle revient en ressort. Le semainier ne passe à
// la semaine voisine qu'une fois le jour changé.
// Pur (sans React Native) : testé par tests/retours-28-10.test.ts et tests/glisse-jours.test.ts. Le même sens sert au menu du
// bas (onglet voisin).

import { geste } from "../theme/mouvement";
import { horizontal } from "./arbitrage-gestes";

export const GLISSER_JOUR = {
  /** Au lâcher : changé au-delà du quart de la largeur, ou d'un geste vif (px/ms) d'au moins `minVif` px. */
  seuil: 0.25,
  vitesse: geste.vitesse,
  minVif: 32,
  /** Départ et arrivée en ease-out fort (courbe « sortie ») : le départ prolonge l’élan du doigt, rien ne freine au lâcher. */
  departMs: 160,
  arriveeMs: 220,
} as const;

/** Prendre le geste : horizontal, au-delà du déclenchement (même seuil que les lignes supprimables : arbitrage-gestes.ts). */
export function prendGlisse(dx: number, dy: number): boolean {
  return horizontal(dx, dy);
}

/** Au lâcher : +1 (doigt vers la gauche : jour suivant), −1 (vers la droite : jour précédent), 0 (retour en place). */
export function sensGlisse(dx: number, vx: number, largeur: number): 1 | -1 | 0 {
  const loin = Math.abs(dx) >= largeur * GLISSER_JOUR.seuil;
  const vif = Math.abs(vx) >= GLISSER_JOUR.vitesse && Math.abs(dx) >= GLISSER_JOUR.minVif && Math.sign(vx) === Math.sign(dx);
  if (!loin && !vif) return 0;
  return dx < 0 ? 1 : -1;
}

/** Onglet voisin d'un glissé sur le menu (même sens que la page) ; reste sur place aux bords. */
export function ongletVoisin<T>(onglets: readonly T[], actif: T, sens: 1 | -1 | 0): T {
  const i = onglets.indexOf(actif);
  if (i < 0 || sens === 0) return actif;
  return onglets[Math.max(0, Math.min(onglets.length - 1, i + sens))]!;
}

const JOUR_MS = 86_400_000;

/** Rang d'un jour AAAA-MM-JJ (jours depuis le 1970-01-01, en UTC : pas d'heure d'été). */
export function indexJour(j: string): number {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(a, m - 1, d) / JOUR_MS);
}

/** Jour AAAA-MM-JJ d'un rang. */
export function jourDeIndex(i: number): string {
  return new Date(i * JOUR_MS).toISOString().slice(0, 10);
}

/** Position (en jours) sous le doigt : départ moins le déplacement, bornée aux voisins rendus (base ± 1). */
export function suivreDoigt(depart: number, dx: number, largeur: number, base: number): number {
  const p = depart - dx / Math.max(1, largeur);
  return Math.min(base + 1, Math.max(base - 1, p));
}

/** Au lâcher : jour visé (base, base + 1 ou base − 1) d'après la distance parcourue et la vitesse du doigt (px/ms).
 *  `dxDoigt` : déplacement total du doigt, quand le geste est parti d'une page au repos. Il prime sur la position : un geste
 *  vif peut n'être pris qu'au dernier mouvement (la page n'a alors presque pas bougé), il compte quand même. */
export function accrocheJour(base: number, pos: number, vx: number, largeur: number, dxDoigt?: number): number {
  return base + sensGlisse(dxDoigt ?? (base - pos) * largeur, vx, largeur);
}

/** Durée de l'accroche : proportionnelle au chemin qui reste (une page entière : `arriveeMs`), jamais sous 120 ms. */
export function dureeAccroche(reste: number): number {
  return Math.max(120, Math.round(GLISSER_JOUR.arriveeMs * Math.min(1, Math.abs(reste))));
}

/** Fond de la pastille du jour actif, en cases depuis le lundi affiché (0 à 6) : il suit la position, borné à la semaine. */
export function casePastille(pos: number, lundi: number): number {
  "worklet";
  return Math.min(6, Math.max(0, pos - lundi));
}

/** Semaine voisine après un changement de lundi : +1 (suivante), −1 (précédente), 0 (même semaine ou saut plus long). */
export function semaineVoisineDe(lundiAvant: string, lundiApres: string): 1 | -1 | 0 {
  const d = indexJour(lundiApres) - indexJour(lundiAvant);
  return d === 7 ? 1 : d === -7 ? -1 : 0;
}

/** Jours rendus par le carrousel : la veille, le jour, le lendemain. */
export function joursRendus(j: string): [string, string, string] {
  const i = indexJour(j);
  return [jourDeIndex(i - 1), j, jourDeIndex(i + 1)];
}
