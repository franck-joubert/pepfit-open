// Sous-ligne d'une séance faite de la journée du Sport (revue finale du 30/10, n° 3 ; planche familles-sports : chaque
// famille ses chiffres). « 1 série » sous une course ou un padel était du vocabulaire de muscu. Pur, sauf la lecture en base :
// testé par tests/meta-seance.test.ts.
import type { Executeur } from "../db/executeur";
import { INFO_NATURE, type Nature } from "../db/natures";
import { distanceSeance, dureeCourte, pluriel } from "./format";

/** Ce que comptent les séries faites d'une séance : des séries de force, une distance. */
export interface ChiffresSeance {
  force: boolean;
  distanceM: number;
}

/** Chiffres des séances `ids`, d'après la nature de leurs exercices (échauffements exclus). */
export async function chiffresSeances(db: Executeur, ids: readonly string[]): Promise<Map<string, ChiffresSeance>> {
  const m = new Map<string, ChiffresSeance>();
  if (!ids.length) return m;
  const l = await db.getAllAsync<{ seance_id: string; nature: Nature; distance_m: number | null }>(
    `SELECT s.seance_id, e.nature, s.distance_m FROM series s JOIN exercices e ON e.id = s.exercice_id
     WHERE s.faite = 1 AND s.type != 'echauffement' AND s.seance_id IN (${ids.map(() => "?").join(",")})`,
    [...ids],
  );
  for (const id of ids) m.set(id, { force: false, distanceM: 0 });
  for (const x of l) {
    const c = m.get(x.seance_id)!;
    if (INFO_NATURE[x.nature].famille !== "temps") c.force = true;
    c.distanceM += x.distance_m ?? 0;
  }
  return m;
}

/**
 * Force : « 52 min · 4 séries ». Endurance : « 32 min · 5,2 km » (la durée seule sans distance). Sports et cours,
 * récupération, activité associée : la durée seule. Chiffres pas encore lus : la durée seule.
 */
export function metaSeance(dureeMin: number, nbSeries: number, c: ChiffresSeance | undefined): string {
  const duree = dureeCourte(dureeMin * 60);
  if (c?.force) return `${duree}, ${pluriel(nbSeries, "communs.serie")}`;
  if (c && c.distanceM > 0) return `${duree}, ${distanceSeance(c.distanceM)}`;
  return duree;
}
