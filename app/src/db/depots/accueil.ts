import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";

// Blocs de l'accueil modulable (migration 22) : locaux, hors synchro. La validation (ids, tailles) est dans ecrans/accueil-blocs.

export type LigneAccueil = { id: string; taille: string };

export function lireAccueil(db: Executeur): Promise<LigneAccueil[]> {
  return db.getAllAsync<LigneAccueil>("SELECT id, taille FROM accueil_blocs ORDER BY ordre", []);
}

/** Remplace l'accueil par `blocs`, dans cet ordre. */
export async function ecrireAccueil(db: Executeur, blocs: { id: string; taille: "pleine" | "demie" }[]): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM accueil_blocs", []);
    for (const [ordre, b] of blocs.entries()) {
      await db.runAsync("INSERT INTO accueil_blocs (id, ordre, taille) VALUES (?, ?, ?)", [b.id, ordre, b.taille]);
    }
  });
}
