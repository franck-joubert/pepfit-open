import type { Nature } from "./natures";

export function arrondir2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 1RM estimé (formule d'Epley) ; null sans charge ou sans répétitions. */
export function e1rmEpley(kg: number | null, reps: number | null): number | null {
  if (!kg || !reps || kg <= 0 || reps <= 0) return null;
  return reps === 1 ? arrondir2(kg) : arrondir2(kg * (1 + reps / 30));
}

/** Volume d'une série : kg × répétitions (0 si l'un manque). */
export function volumeSerie(kg: number | null, reps: number | null): number {
  return arrondir2((kg ?? 0) * (reps ?? 0));
}

export interface PointPesee {
  date: number;
  kg: number;
}

/** Poids du corps à la date `t` : la pesée la plus proche avant, à défaut la plus ancienne ; null sans aucune pesée. `pesees` triées par date. */
export function poidsAvant(pesees: readonly PointPesee[], t: number): number | null {
  if (pesees.length === 0) return null;
  let kg = pesees[0]!.kg;
  for (const p of pesees) {
    if (p.date > t) break;
    kg = p.kg;
  }
  return kg;
}

/** Charge effective (D8) : réps seules = poids du corps, lesté = + lest, assisté = − aide. Null sans pesée ou pour les autres natures. */
export function chargeEffective(nature: Nature, kg: number | null, poidsCorps: number | null): number | null {
  if (poidsCorps === null) return null;
  if (nature === "reps") return arrondir2(poidsCorps);
  if (nature === "leste") return arrondir2(poidsCorps + (kg ?? 0));
  if (nature === "assiste") return arrondir2(poidsCorps - (kg ?? 0));
  return null;
}
