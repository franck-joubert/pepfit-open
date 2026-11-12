import type { SeanceDetail, SerieDetail, TypeSerie } from "../db";
import { grouperBlocsSeance } from "../db/depots/seances";
import type { LigneDispo } from "./glisser";

/** Séries à lettre : elles ne prennent pas de numéro. */
export const LETTRE: Partial<Record<TypeSerie, string>> = { echauffement: "W", rate: "F", degressive: "D" };

/** Numéros affichés, dans l'ordre des séries : une lettre (W, F, D), sinon le rang parmi les séries sans lettre. */
export function numerosSeries(types: readonly TypeSerie[]): string[] {
  let n = 0;
  return types.map((t) => LETTRE[t] ?? String(++n));
}

/** Ordre d'exécution : exercice par exercice, et tour par tour dans un superset. */
export function ordreExecution(s: SeanceDetail): SerieDetail[] {
  const out: SerieDetail[] = [];
  for (const b of s.blocs) {
    if (b.exercices.length === 1) out.push(...b.exercices[0]!.series);
    else {
      const tours = Math.max(...b.exercices.map((e) => e.series.length));
      for (let t = 0; t < tours; t++) for (const e of b.exercices) if (e.series[t]) out.push(e.series[t]!);
    }
  }
  return out;
}

/** Plein écran : la série affichée est la première à faire (la dernière si tout est fait), décalée par « précédente » / « suivante ». */
export function serieAffichee<T extends { faite: number | boolean }>(ordre: T[], decalage: number): T | null {
  if (!ordre.length) return null;
  const active = ordre.findIndex((x) => !x.faite);
  const base = active < 0 ? ordre.length - 1 : active;
  return ordre[Math.max(0, Math.min(ordre.length - 1, base + decalage))] ?? null;
}

/**
 * La séance telle qu'elle s'affiche dès le lâcher d'un exercice (avant la relecture de la base, comme `disposerSeance`) :
 * ordre, superset et repos de `lignes` ; qui entre dans un superset prend son temps entre exercices.
 */
export function avecDisposition(s: SeanceDetail, lignes: readonly LigneDispo[]): SeanceDetail {
  const parId = new Map(s.exercices.map((e) => [e.exercice.id, e]));
  const transition = new Map<number, number>();
  for (const e of s.exercices) if (e.groupeSuperset != null) transition.set(e.groupeSuperset, Math.max(transition.get(e.groupeSuperset) ?? 0, e.reposTransitionS));
  const exercices = lignes.flatMap((l) => {
    const e = parId.get(l.id);
    if (!e) return [];
    const reposTransitionS = l.groupe == null ? 0 : (transition.get(l.groupe) ?? e.reposTransitionS);
    return [{ ...e, groupeSuperset: l.groupe, reposS: l.repos, reposTransitionS, series: e.series.map((x) => ({ ...x, groupe_superset: l.groupe })) }];
  });
  return { ...s, exercices, blocs: grouperBlocsSeance(exercices) };
}

/** La séance dès le lâcher d'une série (comme `ordonnerSeriesSeance`) : les séries de l'exercice dans l'ordre `ids`, mêmes places. */
export function avecOrdreSeries(s: SeanceDetail, exerciceId: string, ids: readonly string[]): SeanceDetail {
  const exercices = s.exercices.map((e) => {
    if (e.exercice.id !== exerciceId || e.series.length !== ids.length) return e;
    const parId = new Map(e.series.map((x) => [x.id, x]));
    const places = e.series.map((x) => x.position);
    const series = ids.flatMap((id, i) => {
      const x = parId.get(id);
      return x ? [{ ...x, position: places[i]! }] : [];
    });
    return series.length === e.series.length ? { ...e, series } : e;
  });
  return { ...s, exercices, blocs: grouperBlocsSeance(exercices) };
}
