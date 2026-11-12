import type { SeanceDetail } from "../db";

// Supprimer la dernière série d'un exercice retire l'exercice de la séance (retirerExerciceVide) : l'écran l'anime comme
// la sortie de toute sa carte, et « Annuler » la ramène, série comprise, tant que la base n'a pas été touchée.

/** L'exercice que la suppression de la série `serieId` emporte (c'était sa dernière série), sinon null. */
export function exerciceEmporte(s: SeanceDetail, serieId: string): string | null {
  const e = s.exercices.find((x) => x.series.some((y) => y.id === serieId));
  return e && e.series.length === 1 ? e.exercice.id : null;
}

/** La séance affichée sans l'exercice `id` (en attente de suppression) ; un bloc vidé disparaît. */
export function sansExercice(s: SeanceDetail, id: string): SeanceDetail {
  const garder = <T extends { exercice: { id: string } }>(l: T[]) => l.filter((e) => e.exercice.id !== id);
  return {
    ...s,
    exercices: garder(s.exercices),
    blocs: s.blocs.map((b) => ({ ...b, exercices: garder(b.exercices) })).filter((b) => b.exercices.length > 0),
  };
}

/** La séance affichée sans la série `serieId` (en attente de suppression, « Annuler » la ramène). */
export function sansSerie(s: SeanceDetail, serieId: string): SeanceDetail {
  const ote = <T extends { series: { id: string }[] }>(e: T): T => ({ ...e, series: e.series.filter((x) => x.id !== serieId) });
  return { ...s, exercices: s.exercices.map(ote), blocs: s.blocs.map((b) => ({ ...b, exercices: b.exercices.map(ote) })) };
}
