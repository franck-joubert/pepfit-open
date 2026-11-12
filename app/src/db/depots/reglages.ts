import type { Executeur } from "../executeur";

/** Calculs gardés sur ce téléphone (âge pepfit) : refaits au besoin, donc ni synchronisés, ni sauvegardés, ni exportés
 * (sauvegarde/archive.ts, sync/export.ts) ; une restauration les efface. */
export const PREFIXE_CACHE = "cache_";

export async function lireReglage(db: Executeur, cle: string): Promise<string | null> {
  const l = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [cle]);
  return l?.valeur ?? null;
}

export async function ecrireReglage(db: Executeur, cle: string, valeur: string): Promise<void> {
  await db.runAsync(
    "INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
    [cle, valeur],
  );
}
