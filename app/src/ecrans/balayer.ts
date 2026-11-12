// Glisser une série vers la gauche pour la supprimer : quand le geste démarre, et s'il supprime au lâcher.

/** Seuil de suppression : part de la largeur de la ligne. */
export const SEUIL_BALAYER = 0.4;
/** Lancer rapide vers la gauche (px/ms) : supprime même en deçà du seuil. */
export const LANCER_BALAYER = 0.6;

/** Le geste ne prend la main que sur un mouvement nettement horizontal, vers la gauche. */
export function demarreBalayer(dx: number, dy: number): boolean {
  return dx < -12 && Math.abs(dx) > 1.5 * Math.abs(dy);
}

/** La ligne suit le doigt vers la gauche seulement. */
export function decalageBalayer(dx: number): number {
  return Math.min(0, dx);
}

export function auDelaDuSeuil(dx: number, largeur: number): boolean {
  return largeur > 0 && -dx >= SEUIL_BALAYER * largeur;
}

/** Au lâcher : au-delà du seuil, ou lancée vite vers la gauche. */
export function supprimeAuLacher(dx: number, vx: number, largeur: number): boolean {
  return auDelaDuSeuil(dx, largeur) || (dx < 0 && vx <= -LANCER_BALAYER);
}

/** Fin de course au lâcher : part de la largeur parcourue vers la gauche avant la désintégration (1 : hors de la ligne). */
export const COURSE_BALAYER = 0.85;
/** Durée de la fin de course (ms), bornée : rapide, sans saut. */
export const COURSE_MS: readonly [number, number] = [150, 200];

/**
 * Fin de course au-delà du seuil : de `x` (≤ 0) jusqu'à `vers`, en gardant l'élan. Courbe « out » quadratique : sa vitesse
 * de départ vaut 2 · distance / durée, d'où durée = 2 · distance / |vx| (vx en px/ms), bornée à COURSE_MS.
 */
export function courseLancer(x: number, vx: number, largeur: number): { vers: number; duree: number } {
  const vers = -COURSE_BALAYER * largeur;
  const distance = Math.max(0, x - vers);
  const v = Math.abs(Math.min(0, vx));
  const brute = v > 0 ? (2 * distance) / v : COURSE_MS[1];
  return { vers: Math.min(x, vers), duree: Math.round(Math.min(COURSE_MS[1], Math.max(COURSE_MS[0], brute))) };
}

/** Avancement du fond de suppression : 0 au départ, 1 quand la ligne est entièrement sortie (toute la largeur). */
export function progresseFond(dx: number, largeur: number): number {
  if (largeur <= 0 || dx >= 0) return 0;
  return Math.min(1, -dx / largeur);
}

/** Part de la course où le dégradé orange est entièrement là ; ensuite la teinte la plus claire le recouvre jusqu'à la sortie. */
export const DEGRADE_PLEIN = 0.6;

/** Opacité des deux couches posées sur le rouge à l'avancement `p` : le dégradé orange, puis la teinte claire par-dessus. */
export function couchesFond(p: number): { degrade: number; claire: number } {
  const c = Math.min(1, Math.max(0, p));
  return { degrade: Math.min(1, c / DEGRADE_PLEIN), claire: c <= DEGRADE_PLEIN ? 0 : (c - DEGRADE_PLEIN) / (1 - DEGRADE_PLEIN) };
}

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

/** La teinte la plus claire d'un dégradé (arrêts « #rrggbb ») : couleur finale du fond de suppression. */
export function teinteClaire(arrets: readonly { couleur: string }[]): string {
  return arrets.reduce((m, a) => (luminance(a.couleur) > luminance(m.couleur) ? a : m)).couleur;
}
