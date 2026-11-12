// Repères de la séance (pure : testée sous Node) : nouveau record d'une série, valeur inhabituelle à la coche.
import { e1rmEpley } from "../db/calculs";
import { t, tp } from "../i18n/index";
import { nombre, tempsTexte } from "./format";

/** Valeurs d'une série, telles que saisies. */
export interface ValeursSerie {
  kg: number | null;
  reps: number | null;
  duree_s: number | null;
}

/** Meilleures valeurs d'un exercice avant cette séance (séries validées, hors échauffement). */
export interface Meilleurs {
  /** Nombre de séries de l'historique : 0 = jamais fait. */
  n: number;
  kg: number;
  reps: number;
  duree_s: number;
  /** kg × réps. */
  volume: number;
  /** 1RM estimé (Epley). */
  e1rm: number;
}

export const AUCUN: Meilleurs = { n: 0, kg: 0, reps: 0, duree_s: 0, volume: 0, e1rm: 0 };

const positif = (v: number | null | undefined): v is number => v != null && v > 0;

/** Meilleures valeurs d'une liste de séries. */
export function meilleursDe(series: readonly ValeursSerie[]): Meilleurs {
  const m = { ...AUCUN };
  for (const s of series) {
    m.n++;
    if (positif(s.kg)) m.kg = Math.max(m.kg, s.kg);
    if (positif(s.reps)) m.reps = Math.max(m.reps, s.reps);
    if (positif(s.duree_s)) m.duree_s = Math.max(m.duree_s, s.duree_s);
    if (positif(s.kg) && positif(s.reps)) m.volume = Math.max(m.volume, s.kg * s.reps);
    m.e1rm = Math.max(m.e1rm, e1rmEpley(s.kg, s.reps) ?? 0);
  }
  return m;
}

/**
 * Nouveau record : la série bat le meilleur kg × réps ou le 1RM estimé de l'exercice. Sans charge : les réps, sinon la durée.
 * Jamais sans historique (la première fois, chaque série serait un record).
 */
export function estRecord(s: ValeursSerie, avant: Meilleurs): boolean {
  if (avant.n === 0) return false;
  if (positif(s.kg) && positif(s.reps)) {
    if (avant.volume > 0 && s.kg * s.reps > avant.volume) return true;
    const e = e1rmEpley(s.kg, s.reps) ?? 0;
    return avant.e1rm > 0 && e > avant.e1rm;
  }
  if (positif(s.reps)) return avant.reps > 0 && s.reps > avant.reps && avant.kg === 0;
  if (positif(s.duree_s)) return avant.duree_s > 0 && s.duree_s > avant.duree_s;
  return false;
}

/** Série d'une séance, dans l'ordre d'exécution. */
export interface SerieRepere extends ValeursSerie {
  id: string;
  exercice_id: string;
  faite: boolean | number;
  echauffement: boolean;
}

/**
 * Séries validées qui battent un record, dans l'ordre de la séance : chacune se compare à l'historique et aux séries
 * validées avant elle (deux fois 85 × 8 : seule la première a la médaille).
 */
export function recordsDeSeance(series: readonly SerieRepere[], historique: Record<string, Meilleurs>): Set<string> {
  const out = new Set<string>();
  const courants = new Map<string, Meilleurs>();
  for (const s of series) {
    if (!s.faite || s.echauffement) continue;
    const avant = courants.get(s.exercice_id) ?? historique[s.exercice_id] ?? AUCUN;
    if (estRecord(s, avant)) out.add(s.id);
    if (avant.n > 0) courants.set(s.exercice_id, fusionner(avant, meilleursDe([s])));
  }
  return out;
}

function fusionner(a: Meilleurs, b: Meilleurs): Meilleurs {
  return { n: a.n + b.n, kg: Math.max(a.kg, b.kg), reps: Math.max(a.reps, b.reps), duree_s: Math.max(a.duree_s, b.duree_s), volume: Math.max(a.volume, b.volume), e1rm: Math.max(a.e1rm, b.e1rm) };
}

export type ChampInhabituel = "kg" | "reps" | "duree_s";

/** Sans historique : au-delà, la valeur est inhabituelle. */
export const PLAFONDS = { kg: 300, reps: 100, duree_s: 60 * 60 } as const;
/** Avec historique : au-delà de ce multiple du record. Une valeur basse n'alerte jamais (26/10). */
export const FACTEURS = { kg: 1.5, reps: 2, duree_s: 2 } as const;

/**
 * Valeur inhabituelle : plus de 1,5 × le record de l'exercice en kg, plus de 2 × en réps ou en durée.
 * Sans historique : au-delà de 300 kg, 100 réps ou 60 min. Rend le premier champ fautif, ou null.
 */
export function valeurInhabituelle(s: ValeursSerie, avant: Meilleurs): ChampInhabituel | null {
  for (const champ of ["kg", "reps", "duree_s"] as const) {
    const v = s[champ];
    if (!positif(v)) continue;
    const record = avant[champ];
    if (avant.n === 0 || record <= 0) {
      if (v > PLAFONDS[champ]) return champ;
      continue;
    }
    if (v > record * FACTEURS[champ]) return champ;
  }
  return null;
}

/** Feuille d'avertissement : titre et question, la valeur à part pour la mettre en gras. */
export function texteInhabituel(champ: ChampInhabituel, s: ValeursSerie, unite: string): { titre: string; avant: string; valeur: string; apres: string } {
  switch (champ) {
    case "reps":
      return { titre: t("seance.reperes.repsTitre"), avant: t("seance.reperes.repsAvant"), valeur: nombre(s.reps ?? 0, 0), apres: tp("seance.reperes.repsApres", (s.reps ?? 0) > 1 ? 2 : 1) };
    case "kg":
      return { titre: t("seance.reperes.chargeTitre"), avant: t("seance.reperes.chargeAvant"), valeur: `${nombre(s.kg ?? 0, 1)} ${unite}`, apres: t("seance.reperes.fin") };
    case "duree_s":
      return { titre: t("seance.reperes.dureeTitre"), avant: t("seance.reperes.dureeAvant"), valeur: tempsTexte(s.duree_s), apres: t("seance.reperes.fin") };
  }
}
