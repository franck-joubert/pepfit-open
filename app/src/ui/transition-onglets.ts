// Transition entre les quatre parties, sans React Native (testée dans tests/transition-onglets.test.ts).
// Le navigateur d'onglets donne à chaque écran une progression : 0 = écran affiché, +1 = écran à droite de l'affiché
// (sa place dans l'ordre des onglets est après), −1 = à sa gauche. Le sens du glissé vient donc de l'ordre des onglets.
// Par défaut, aucune transition : le changement de partie est atomique (l'écran quitté disparaît dans la même image que celui
// qui arrive), sans attendre la fin d'une animation ni un fil JS libre. Un fondu enchaîné à mi-course laissait deux écrans à
// moitié transparents (presque rien de lisible), et l'écran quitté restait visible tant que le fil JS était pris (docs/CODE-FLUIDITE-ONGLETS.md).

import { duree } from "../theme/mouvement";

export type VarianteTransition = "fondu" | "glisse" | "aucune";

/**
 * Réglage de dev (pas d'écran de réglage) : a) « fondu » enchaîné 180 ms ; b) « glisse » latéral court 24 px + fondu, 220 ms,
 * courbe sortie ; c) « aucune » (retenue : le changement de partie est instantané, 5/11). Les deux premières n'enchaînent plus
 * deux demi-écrans : l'écran qui arrive est plein dès la mi-course, pendant que celui qui part est dessous.
 */
export const TRANSITION_ONGLETS: VarianteTransition = "aucune";

export const TRANSITIONS = {
  fondu: { dureeMs: duree.ongletFondu, decalage: 0 },
  glisse: { dureeMs: duree.onglet, decalage: 24 },
  aucune: { dureeMs: 0, decalage: 0 },
} as const satisfies Record<VarianteTransition, { dureeMs: number; decalage: number }>;

/**
 * Délai avant de geler un onglet quitté (app/(tabs)/_layout) : le temps que la transition finisse de se dessiner. Sans transition
 * (par défaut), l'écran quitté a déjà disparu dans la même image que celui qui arrive : le geler tout de suite arrête son travail
 * JS (le corps 3D de Moi, ses minuteurs) qui, sinon, retarde le rendu de l'écran qui arrive (à l'émulateur, Moi bloque le fil
 * JS près de la moitié du temps tant qu'il n'est pas gelé).
 */
export function delaiGel(v: VarianteTransition): number {
  return v === "aucune" ? 60 : TRANSITIONS[v].dureeMs + 100;
}

/** « Réduire les animations » : aucune transition, quelle que soit la variante choisie. */
export function varianteEffective(v: VarianteTransition, reduit: boolean): VarianteTransition {
  return reduit ? "aucune" : v;
}

/**
 * Opacité et décalage horizontal (px) d'un écran pour une progression `p` comprise entre −1 et +1. L'opacité est pleine dès
 * |p| = 0,5 : l'écran qui arrive (au-dessus) devient plein à mi-course et celui qui part (dessous) ne s'efface qu'ensuite, donc
 * jamais deux écrans à moitié transparents en même temps.
 */
export function etatEcran(v: VarianteTransition, p: number): { opacite: number; decalageX: number } {
  if (v === "aucune") return { opacite: p === 0 ? 1 : 0, decalageX: 0 };
  const q = Math.max(-1, Math.min(1, p));
  return { opacite: Math.min(1, 2 * (1 - Math.abs(q))), decalageX: q * TRANSITIONS[v].decalage };
}
