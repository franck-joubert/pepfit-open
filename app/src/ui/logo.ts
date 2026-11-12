// Logo pepfit (charte du kit) : le logo entier dès 80 px de large, en dessous le symbole « p. » seul. Pur : testé par
// tests/retours-28-10.test.ts.

/** Largeur en deçà de laquelle le logo entier n'est plus lisible : on passe au symbole. */
export const LARGEUR_MIN_LOGO = 80;
/** Proportions des viewBox du kit (largeur / hauteur). */
export const RATIO_LOGO = 333.9 / 109.7;
export const RATIO_SYMBOLE = 164.1 / 162.5;

/** Forme et taille à dessiner pour une largeur disponible. */
export function formeLogo(largeur: number): { forme: "logo" | "symbole"; largeur: number; hauteur: number } {
  if (largeur >= LARGEUR_MIN_LOGO) return { forme: "logo", largeur, hauteur: Math.round(largeur / RATIO_LOGO) };
  return { forme: "symbole", largeur, hauteur: Math.round(largeur / RATIO_SYMBOLE) };
}
