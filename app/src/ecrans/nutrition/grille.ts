// Grille des valeurs de la Nutrition (kcal, puis P · G · L · Suc.) : largeur des colonnes selon la place et la police du
// système (31/10 : « 4 985 k… » sur l'écran extérieur du Fold alors qu'il restait de la place). Les colonnes gardent
// 59 (58 pour Suc.) tant que les kcal tiennent ; sinon elles se resserrent jusqu'à la largeur de « 1 020 », pour que la
// première cellule garde de quoi écrire « 99 999 kcal ». Pur : tests/nutrition-grille.test.ts.

/** Colonnes P · G · L (59) et Suc. (58), gouttière 11 (solution 2 du +, D7) : les mêmes partout, les valeurs s'alignent. */
export const COL = 59;
export const COL_SUC = 58;
export const GOUTTIERE = 11;
/** « 99 999 kcal » : cinq chiffres en Medium 14 et « kcal » en 12, à la taille de police normale. */
export const KCAL_MIN = 76;
/** « 1 020 » en Medium 14, serré : une colonne ne se resserre pas en deçà. */
export const COL_MIN = 38;

/**
 * Largeur des colonnes P · G · L et Suc. pour une rangée de `largeur` (dp) et une police système à `echelle` (bornée par
 * l'appli). Sans largeur connue (premier rendu) : 59 et 58.
 */
export function colonnesGrille(largeur: number, echelle: number): { col: number; suc: number } {
  if (!(largeur > 0)) return { col: COL, suc: COL_SUC };
  const e = Math.max(1, echelle);
  const place = (largeur - KCAL_MIN * e - 4 * GOUTTIERE) / 4;
  const col = Math.floor(Math.min(COL, Math.max(COL_MIN * e, place)));
  return { col, suc: Math.min(COL_SUC, col) };
}
