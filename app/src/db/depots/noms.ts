import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { langueProbable } from "../noms";
import { normaliser } from "../normaliser";

/**
 * Complète les noms bilingues des exercices existants (idempotent) : `nom_en_norm` pour tout `nom_en` renseigné, et `nom_en` = `nom`
 * pour les exercices perso dont le nom est visiblement anglais (import Hevy en anglais, saisie en anglais). Renvoie le nombre de lignes touchées.
 */
export async function completerNoms(db: Executeur): Promise<number> {
  const aNormaliser = await db.getAllAsync<{ id: string; nom_en: string }>(
    "SELECT id, nom_en FROM exercices WHERE nom_en IS NOT NULL AND TRIM(nom_en) <> '' AND nom_en_norm IS NULL",
    [],
  );
  const persos = (
    await db.getAllAsync<{ id: string; nom: string }>("SELECT id, nom FROM exercices WHERE perso = 1 AND (nom_en IS NULL OR TRIM(nom_en) = '')", [])
  ).filter((p) => langueProbable(p.nom) === "en");
  if (aNormaliser.length === 0 && persos.length === 0) return 0;
  const t = Date.now();
  await transaction(db, async (db) => {
    await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
    try {
      for (const e of aNormaliser) await db.runAsync("UPDATE exercices SET nom_en_norm = ? WHERE id = ?", [normaliser(e.nom_en), e.id]);
    } finally {
      await db.runAsync("DELETE FROM sync_silence", []);
    }
    for (const p of persos) {
      await db.runAsync("UPDATE exercices SET nom_en = ?, nom_en_norm = ?, maj_le = ? WHERE id = ?", [p.nom, normaliser(p.nom), t, p.id]);
    }
  });
  return aNormaliser.length + persos.length;
}
