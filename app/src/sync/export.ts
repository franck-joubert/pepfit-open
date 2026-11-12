import type { Executeur } from "../db/executeur";
import { nomSql } from "../db/noms";
import { TABLES_SYNC } from "./schema";
import { PREFIXE_CACHE } from "../db/depots/reglages";

// Export (E7, NOTES § 6.8) : tout en JSON, séances en CSV. La base du téléphone est en clair : notes et poids sortent lisibles.

/** Valeurs du champ « application » d'un export JSON : « Fonte » (avant le renommage) reste lisible. */
export const APPLICATIONS_RECONNUES: readonly string[] = ["pepfit", "Fonte"];

/** Un export JSON (ou sa lecture) vient-il de cette appli, sous l'un de ses noms ? */
export const exportReconnu = (j: unknown): boolean =>
  typeof j === "object" && j !== null && APPLICATIONS_RECONNUES.includes((j as { application?: unknown }).application as string);

/** Toutes les tables synchronisées, plus records et réglages, telles qu'en base. */
export async function exporterJson(db: Executeur, maintenant = Date.now()): Promise<string> {
  const tables: Record<string, unknown[]> = {};
  // Les réglages sont synchronisés en partie (migration 49) : exportés une fois, en entier.
  for (const t of new Set([...TABLES_SYNC.map((x) => x.nom), "records", "reglages"])) {
    // les calculs gardés sur le téléphone (PREFIXE_CACHE) ne sont pas des données : pas dans l'export
    tables[t] = await db.getAllAsync(`SELECT * FROM ${t}${t === "reglages" ? " WHERE cle NOT LIKE ?" : ""}`, t === "reglages" ? [`${PREFIXE_CACHE}%`] : []);
  }
  return JSON.stringify({ application: "pepfit", format: 1, exporte_le: new Date(maintenant).toISOString(), tables }, null, 2);
}

const champ = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const date = (ms: number | null) => (ms == null ? "" : new Date(ms).toISOString());

/** Une ligne par série, à la manière de Hevy : séance, exercice, série. */
export async function exporterCsv(db: Executeur): Promise<string> {
  const l = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT s.titre, s.debut, s.fin, sa.nom AS salle, ${nomSql("e")} AS exercice, se.position, se.type, se.kg, se.reps, se.duree_s,
            se.distance_m, se.rpe, se.faite, s.note
       FROM series se
       JOIN seances s ON s.id = se.seance_id
       JOIN exercices e ON e.id = se.exercice_id
       LEFT JOIN salle sa ON sa.id = s.salle_id
      WHERE s.fin IS NOT NULL
      ORDER BY s.debut, se.position`,
    [],
  );
  const entete = ["titre", "debut", "fin", "salle", "exercice", "serie", "type", "kg", "reps", "duree_s", "distance_m", "rpe", "faite", "note"];
  const lignes = l.map((x) =>
    [x.titre, date(x.debut as number), date(x.fin as number | null), x.salle, x.exercice, Number(x.position) + 1, x.type, x.kg, x.reps, x.duree_s, x.distance_m, x.rpe, x.faite, x.note]
      .map(champ)
      .join(","),
  );
  return [entete.join(","), ...lignes].join("\n") + "\n";
}
