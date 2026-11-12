// Ouverture de la séance : pendant que l'écran monte, seuls les premiers blocs sont rendus (une coquille légère, le
// mouvement part tout de suite) ; le reste se monte une fois l'écran posé, sous le bas de l'écran, sans saut.

/** Lignes d'un écran du Fold (≈ 48 px chacune, sous la barre du haut), avec de la marge. */
export const LIGNES_COQUILLE = 18;

/** En-tête, colonnes et « Ajouter une série » d'un exercice, en lignes. */
const LIGNES_EXERCICE = 3;

/** Nombre de blocs à rendre pour remplir l'écran : au moins un, jusqu'à dépasser `lignes`. */
export function blocsCoquille(blocs: readonly { exercices: readonly { series: readonly unknown[] }[] }[], lignes = LIGNES_COQUILLE): number {
  let cumul = 0;
  let n = 0;
  for (const b of blocs) {
    if (n > 0 && cumul >= lignes) break;
    for (const e of b.exercices) cumul += LIGNES_EXERCICE + e.series.length;
    n++;
  }
  return n;
}
