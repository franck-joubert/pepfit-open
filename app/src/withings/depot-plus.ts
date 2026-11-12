// Écritures de l'activité et du sommeil Withings (table withings_jour, migration 160). Un jour est mis à jour champ par champ :
// ce que la lecture n'a pas (le sommeil quand on relit l'activité) reste. Rejouable sans doublon.
import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import type { JourWithings } from "./types";

const CHAMPS: [keyof JourWithings, string][] = [
  ["pas", "pas"], ["distanceM", "distance_m"], ["kcalActives", "kcal_actives"], ["kcalTotales", "kcal_totales"],
  ["fcMoy", "fc_moy"], ["fcMin", "fc_min"], ["fcMax", "fc_max"],
  ["sommeilDebut", "sommeil_debut"], ["sommeilFin", "sommeil_fin"], ["sommeilMin", "sommeil_min"], ["auLitMin", "au_lit_min"],
  ["legerMin", "leger_min"], ["profondMin", "profond_min"], ["paradoxalMin", "paradoxal_min"], ["eveilMin", "eveil_min"], ["reveils", "reveils"],
  ["scoreSommeil", "score_sommeil"], ["fcNuitMoy", "fc_nuit_moy"], ["fcNuitMin", "fc_nuit_min"], ["respiration", "respiration"],
];

/** Range des jours ; renvoie le nombre de jours écrits (un jour identique à celui déjà là n'est pas compté). */
export async function enregistrerJoursWithings(db: Executeur, jours: readonly JourWithings[], maintenant: number = Date.now()): Promise<number> {
  let n = 0;
  await transaction(db, async (db) => {
    for (const j of jours) {
      const cols = CHAMPS.map(([, c]) => c);
      const vals = CHAMPS.map(([k]) => j[k] ?? null);
      const avant = await db.getFirstAsync<Record<string, number | null>>(`SELECT ${cols.join(", ")} FROM withings_jour WHERE jour = ?`, [j.jour]);
      const change = !avant || CHAMPS.some(([k, c], i) => vals[i] != null && avant[c] !== vals[i]);
      if (!change) continue;
      await db.runAsync(
        `INSERT INTO withings_jour (jour, ${cols.join(", ")}, maj_le) VALUES (?, ${cols.map(() => "?").join(", ")}, ?)
         ON CONFLICT(jour) DO UPDATE SET
           fc_repos = CASE WHEN excluded.sommeil_fin IS NOT NULL AND excluded.sommeil_fin IS NOT sommeil_fin THEN NULL ELSE fc_repos END,
           ${cols.map((c) => `${c} = COALESCE(excluded.${c}, ${c})`).join(", ")}, maj_le = excluded.maj_le`,
        [j.jour, ...vals, maintenant],
      );
      n++;
    }
  });
  return n;
}
