import type { ExerciceDeSeance, SeanceDetail, SerieDetail } from "../db";

// « Ajouter une série » en séance : la ligne s'affiche tout de suite (copie de la dernière), la base écrit derrière.

/** La série qu'on ajoute à la suite de `e`, reprise de sa dernière (comme la base). `id` est celui qui sera écrit. */
export function serieAjoutee(seanceId: string, e: ExerciceDeSeance, id: string): SerieDetail {
  const der = e.series[e.series.length - 1];
  const position = e.series.reduce((m, x) => Math.max(m, x.position), -1) + 1;
  return {
    id, seance_id: seanceId, exercice_id: e.exercice.id, position, groupe_superset: e.groupeSuperset, type: "normale",
    kg: der?.kg ?? null, reps: der?.reps ?? null, duree_s: der?.duree_s ?? null, distance_m: der?.distance_m ?? null,
    faite: 0, fait_le: null, volume: 0, e1rm: null,
    precedent_kg: null, precedent_reps: null, precedent_duree_s: null, precedent_distance_m: null,
    rpe: null, charge_eff: null, plage_min: null, plage_max: null, records: [],
  };
}

/** La séance affichée avec les séries ajoutées en attente d'écriture ; une série déjà relue de la base n'est pas doublée. */
export function avecAjouts(s: SeanceDetail, ajouts: readonly SerieDetail[]): SeanceDetail {
  if (ajouts.length === 0) return s;
  const ajouter = (e: ExerciceDeSeance): ExerciceDeSeance => {
    const ids = new Set(e.series.map((x) => x.id));
    const en = ajouts.filter((a) => a.exercice_id === e.exercice.id && !ids.has(a.id));
    return en.length ? { ...e, series: [...e.series, ...en] } : e;
  };
  return { ...s, exercices: s.exercices.map(ajouter), blocs: s.blocs.map((b) => ({ ...b, exercices: b.exercices.map(ajouter) })) };
}
