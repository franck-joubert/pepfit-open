// Lectures Withings pour les écrans : sommeil et pas des montres et bracelets Withings. Priorité commune des sources :
// Whoop, puis Withings (lu directement chez eux), puis Santé Connect. Même forme que Santé Connect (SommeilNuit), origine
// « withings » : nomSource() en fait « Withings ».
import type { Executeur } from "../db/executeur";
import type { SommeilNuit } from "../natif/sante/types";
import { lireReglage } from "../db/depots/reglages";
import { ORIGINE_WITHINGS, REGLAGE } from "./constantes";

export const withingsConnecte = async (db: Executeur): Promise<boolean> => (await lireReglage(db, REGLAGE.connecte).catch(() => null)) === "1";

/** Nuits Withings terminées entre `debut` et `fin` (ms), de la plus ancienne à la plus récente. */
export async function nuitsWithings(db: Executeur, debut: number, fin: number): Promise<SommeilNuit[]> {
  const l = await db
    .getAllAsync<{ sommeil_debut: number; sommeil_fin: number; sommeil_min: number; leger_min: number | null; profond_min: number | null; paradoxal_min: number | null; eveil_min: number | null }>(
      "SELECT sommeil_debut, sommeil_fin, sommeil_min, leger_min, profond_min, paradoxal_min, eveil_min FROM withings_jour WHERE sommeil_fin IS NOT NULL AND sommeil_min > 0 AND sommeil_fin >= ? AND sommeil_fin <= ? ORDER BY sommeil_fin",
      [debut, fin],
    )
    .catch(() => []);
  return l.map((j) => ({
    debut: j.sommeil_debut,
    fin: j.sommeil_fin,
    minutes: j.sommeil_min,
    phases: j.leger_min != null ? { leger: j.leger_min, profond: j.profond_min ?? 0, paradoxal: j.paradoxal_min ?? 0, eveil: j.eveil_min ?? 0 } : null,
    origine: ORIGINE_WITHINGS,
  }));
}

/** Les nuits Withings remplacent celles de Santé Connect du même jour de réveil (l'appli Withings y dépose les mêmes : pas de doublon). */
export function fusionnerNuitsWithings(sante: readonly SommeilNuit[], withings: readonly SommeilNuit[]): SommeilNuit[] {
  const jour = (n: SommeilNuit) => new Date(n.fin).toDateString();
  const prises = new Set(withings.map(jour));
  return [...sante.filter((n) => !prises.has(jour(n))), ...withings].sort((a, b) => a.fin - b.fin);
}

/** Pas Withings gardés pour ces jours (minuits), par jour ; les jours sans valeur sont absents. */
export async function pasWithingsJours(db: Executeur, jours: readonly number[]): Promise<Map<number, number>> {
  if (!jours.length) return new Map();
  const l = await db
    .getAllAsync<{ jour: number; pas: number }>(`SELECT jour, pas FROM withings_jour WHERE pas IS NOT NULL AND jour IN (${jours.map(() => "?").join(", ")})`, [...jours])
    .catch(() => []);
  return new Map(l.map((x) => [x.jour, x.pas]));
}
