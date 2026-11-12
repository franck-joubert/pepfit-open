// Arbitrage des glissés horizontaux (option A d'Alex, 28/10) : un glissé qui part SUR une ligne supprimable (aliment, séance,
// mesure…) agit sur la ligne ; parti AILLEURS (en-tête, titres, vides, cartes non supprimables), il change de jour. Le semainier
// garde son propre glissé (défilement libre des jours, sans changer le jour affiché : ui/semainier.ts, 29/10).
// Décidé au départ du doigt : la zone du jour (GlisserJour) efface la marque, la ligne touchée la pose (phase de capture, du
// parent à l'enfant) ; au premier mouvement horizontal, un seul des deux prend le geste, jamais les deux.
// Pur (sans React Native) : testé par tests/arbitrage-gestes.test.ts.

export const GESTE = {
  /** Distance (px) avant de prendre un glissé : en deçà, c'est un appui ou un défilement. */
  declenche: 14,
  /** Horizontal : |dx| au moins 1,5 fois |dy| ; sinon c'est le défilement vertical qui garde la main. */
  rapport: 1.5,
} as const;

/** Mouvement nettement horizontal, au-delà du déclenchement. */
export function horizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > GESTE.declenche && Math.abs(dx) > Math.abs(dy) * GESTE.rapport;
}

/** Qui prend le geste : la ligne s'il est parti d'elle, sinon le jour ; personne tant qu'il n'est pas nettement horizontal. */
export function quiPrend(surLigne: boolean, dx: number, dy: number): "ligne" | "jour" | null {
  if (!horizontal(dx, dy)) return null;
  return surLigne ? "ligne" : "jour";
}

let surLigne = false;
/** Marque du départ du doigt, partagée entre la zone du jour et les lignes. */
export const departGeste = {
  /** Tout toucher dans la zone du jour (phase de capture, avant les lignes). */
  toucher: () => void (surLigne = false),
  /** Le doigt est parti d'une ligne supprimable active. */
  ligne: () => void (surLigne = true),
  surLigne: () => surLigne,
};

// Ligne supprimable : le glissé ne supprime plus jamais directement. Il révèle à droite le bouton « Supprimer », qu'il faut
// toucher ; ensuite « Annuler » quelques secondes (bandeau de l'écran).

/** Largeur (px) du bouton révélé : la ligne s'arrête là, ouverte. */
export const BOUTON_SUPPRIMER = 96;
/**
 * « Supprimer » touché : la ligne finit de sortir en ce temps (ms), courbe « out », puis se désintègre. 200 ms jusqu'au 29/10
 * au soir (Alex : glissé de suppression trop lent).
 */
export const SORTIE_LIGNE_MS = 120;
/** Au-delà du bouton, la ligne suit encore le doigt, freinée (élastique), sans rien déclencher. */
export const ELASTIQUE = 0.3;
/** Lâcher vif (px/ms) : ouvre ou ferme selon le sens, quelle que soit la distance. */
export const VIF_LIGNE = 0.3;

/** Décalage de la ligne (≤ 0) pour une position brute (départ + dx) : bornée à droite, élastique au-delà du bouton. */
export function decalageLigne(brut: number, bouton = BOUTON_SUPPRIMER): number {
  if (brut >= 0) return 0;
  if (brut >= -bouton) return brut;
  return -bouton + (brut + bouton) * ELASTIQUE;
}

/** Au lâcher : ouverte (bouton visible) ou refermée. Vif vers la gauche : ouvre ; vers la droite : ferme ; sinon, la moitié. */
export function ouvreAuLacher(x: number, vx: number, bouton = BOUTON_SUPPRIMER): boolean {
  if (vx <= -VIF_LIGNE) return x < 0;
  if (vx >= VIF_LIGNE) return false;
  return -x >= bouton / 2;
}
