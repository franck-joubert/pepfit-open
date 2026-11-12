// Historique des exercices d'une séance, pour les repères (record, valeur inhabituelle) : séances terminées d'avant.
import type { Executeur } from "../db";
import { meilleursDe, type Meilleurs, type ValeursSerie } from "./seance-reperes";

/** Meilleures valeurs de chaque exercice dans les séances terminées commencées avant `avant` (séries validées, hors échauffement). */
export async function meilleursAvant(db: Executeur, exerciceIds: string[], seanceId: string, avant: number): Promise<Record<string, Meilleurs>> {
  const out: Record<string, Meilleurs> = {};
  for (const id of exerciceIds) {
    const l = await db.getAllAsync<ValeursSerie>(
      `SELECT s.kg, s.reps, s.duree_s FROM series s JOIN seances se ON se.id = s.seance_id
       WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement' AND se.fin IS NOT NULL AND se.id != ? AND se.debut < ?`,
      [id, seanceId, avant],
    );
    out[id] = meilleursDe(l);
  }
  return out;
}
