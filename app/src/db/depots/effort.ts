// Effort visé des séances d'un programme (planche programmes-charges) : la cible de chaque ligne de routine (répétitions et
// réserve, migration 41), ce qu'on sait de l'exercice avant la séance (jamais fait : la première séance cherche le poids) et
// ses séries de la dernière fois (poids proposé). Les décisions sont dans boutique/poids.ts (pur, testé).
import { materielDe, poidsSuivant, rirDeRpe, type PoidsSuivant, type SerieFaite } from "../../boutique/poids";
import type { Executeur } from "../executeur";
import type { Exercice } from "../types";

/** Cible d'une ligne de routine créée par un programme : répétitions (bas de la plage), haut de la plage, réserve visée. */
export interface CibleEffort {
  reps: number;
  repsMax: number | null;
  rir: number;
}

/** Cibles des lignes d'une routine qui portent un effort visé, par exercice (la première ligne de l'exercice). */
export async function ciblesDeRoutine(db: Executeur, routineId: string | null): Promise<Map<string, CibleEffort>> {
  const out = new Map<string, CibleEffort>();
  if (!routineId) return out;
  const l = await db.getAllAsync<{ exercice_id: string; rir: number; reps: number | null; reps_max: number | null }>(
    `SELECT re.exercice_id, re.rir, rs.reps, rs.reps_max FROM routine_exercices re
     LEFT JOIN routine_series rs ON rs.ligne_id = re.id AND rs.rang = 0
     WHERE re.routine_id = ? AND re.rir IS NOT NULL ORDER BY re.position`,
    [routineId],
  );
  for (const x of l) if (x.reps != null && !out.has(x.exercice_id)) out.set(x.exercice_id, { reps: x.reps, repsMax: x.reps_max, rir: x.rir });
  return out;
}

/** Ressenti visé changé pendant la séance : « Aucun » pour elle seule (seance_exercices.rir, migration 70). */
export const SANS_RIR_SEANCE = -1;

/** Ressenti visé d'un exercice en séance : celui de la séance, sinon celui de la ligne de routine ; null = aucun. */
export function rirVise(seance: number | null | undefined, routine: number | null | undefined): number | null {
  return seance == null ? (routine ?? null) : seance === SANS_RIR_SEANCE ? null : seance;
}

/**
 * Valeur à écrire dans seance_exercices.rir pour viser `choisi` (null = « Aucun ») pendant la séance : null quand c'est
 * celui de la routine (la séance le suit), -1 pour « Aucun » quand la routine en a un.
 */
export function rirPourSeance(choisi: number | null, routine: number | null | undefined): number | null {
  if (choisi === (routine ?? null)) return null;
  return choisi ?? SANS_RIR_SEANCE;
}

/** L'exercice a-t-il des séries de travail faites avec un poids, avant `avant` (début de la séance) ? */
export async function dejaFaitAvecPoids(db: Executeur, exerciceId: string, avant: number): Promise<boolean> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM series s JOIN seances se ON se.id = s.seance_id
     WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement' AND s.kg > 0 AND se.debut < ?`,
    [exerciceId, avant],
  );
  return (r?.n ?? 0) > 0;
}

/** Séries de travail faites de l'exercice à sa dernière séance avant `avant`, avec la réserve dite (colonne rpe). */
export async function seriesDeLaDerniereFois(db: Executeur, exerciceId: string, avant: number): Promise<SerieFaite[]> {
  const l = await db.getAllAsync<{ kg: number; reps: number; rpe: number | null }>(
    `SELECT s.kg, s.reps, s.rpe FROM series s JOIN seances se ON se.id = s.seance_id
     WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement' AND s.kg > 0 AND s.reps IS NOT NULL
       AND se.id = (SELECT se2.id FROM series s2 JOIN seances se2 ON se2.id = s2.seance_id
                    WHERE s2.exercice_id = ? AND s2.faite = 1 AND s2.type != 'echauffement' AND s2.kg > 0 AND se2.debut < ?
                    ORDER BY se2.debut DESC LIMIT 1)
     ORDER BY s.position`,
    [exerciceId, exerciceId, avant],
  );
  return l.map((x) => ({ kg: x.kg, reps: x.reps, rir: rirDeRpe(x.rpe) }));
}

/** Effort d'un exercice d'une séance de programme : sa cible, s'il est à découvrir, et le poids proposé (sinon null). */
export interface EffortExercice {
  cible: CibleEffort;
  decouverte: boolean;
  proposition: PoidsSuivant | null;
}

/** L'effort de chaque exercice à cible d'une séance commencée à `debut` (exercices de la routine du programme). */
export async function effortsDeSeance(
  db: Executeur,
  routineId: string | null,
  debut: number,
  exercices: readonly Pick<Exercice, "id" | "equipement" | "nature">[],
  paliers: (exerciceId: string) => Promise<readonly number[] | null> = async () => null,
): Promise<Map<string, EffortExercice>> {
  const cibles = await ciblesDeRoutine(db, routineId);
  const out = new Map<string, EffortExercice>();
  for (const e of exercices) {
    const cible = cibles.get(e.id);
    if (!cible) continue;
    // Poids du corps (tractions) : la cible d'effort vaut, mais ni poids à chercher ni poids proposé.
    const avecPoids = e.nature === "poids_reps";
    const decouverte = avecPoids && !(await dejaFaitAvecPoids(db, e.id, debut));
    const proposition = !avecPoids || decouverte ? null : poidsSuivant(await seriesDeLaDerniereFois(db, e.id, debut), cible, materielDe(e.equipement), await paliers(e.id));
    out.set(e.id, { cible, decouverte, proposition });
  }
  return out;
}
