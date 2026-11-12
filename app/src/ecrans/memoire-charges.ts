// Mémoire des lectures d'écran (useCharge, M12 : docs/PERF-A.md) : une page remontée s'affiche avec sa dernière valeur, puis
// la relit en fond ; revenue moins de 30 s après sa lecture, sans écriture dans la base depuis, elle ne relit rien. Pur (sans
// React Native) : testé par tests/perf-a.test.ts.
import { compteurEcritures } from "../db/exclusif";

/** Une valeur lue il y a moins de 30 s, sans écriture dans la base depuis, n'est pas relue au retour sur l'écran (M12). */
export const FRAICHEUR_CHARGE_MS = 30_000;

/** Dernières valeurs des écrans qui ont une mémoire (M12, docs/PERF-A.md), par clé : nom, langue et unités, dépendances. */
const memoireCharges = new Map<string, { v: unknown; lu: number; ecritures: number }>();
const MAX_MEMOIRE_CHARGES = 60;

/** Clé de mémoire : le nom donné par l'écran et les dépendances simples (texte, nombre…) ; l'objet `db` est ignoré, tout
 * autre objet coupe la mémoire (on ne saurait pas dire si c'est la même lecture). */
export function cleCharge(nom: string | undefined, deps: readonly unknown[], db: unknown): string | null {
  if (nom == null) return null;
  const parts: string[] = [nom];
  for (const d of deps) {
    if (d === db) continue;
    if (d != null && typeof d === "object") return null;
    if (typeof d === "function") return null;
    parts.push(String(d));
  }
  return parts.join("|");
}

/** Lecture par clé (tests, pages préchargées). */
export const dansMemoireCharges = <T>(cle: string): T | undefined => memoireCharges.get(cle)?.v as T | undefined;
/** Vide la mémoire des écrans (tests). */
export const oublierCharges = (): void => memoireCharges.clear();

/** La valeur gardée de `cle`, et si elle est encore fraîche (moins de 30 s, aucune écriture depuis sa lecture). */
export function memoireCharge<T>(cle: string | null, maintenant = Date.now(), ecritures = compteurEcritures()): { v: T; frais: boolean } | null {
  const m = cle != null ? memoireCharges.get(cle) : undefined;
  return m ? { v: m.v as T, frais: maintenant - m.lu < FRAICHEUR_CHARGE_MS && m.ecritures === ecritures } : null;
}

/** Garde une valeur lue ; `ecritures` : le compteur relevé au début de la lecture (une écriture pendant la lecture la rend
 * déjà vieille). */
export function retenirCharge(cle: string | null, v: unknown, ecritures: number, maintenant = Date.now()): void {
  if (cle == null) return;
  memoireCharges.delete(cle);
  memoireCharges.set(cle, { v, lu: maintenant, ecritures });
  while (memoireCharges.size > MAX_MEMOIRE_CHARGES) memoireCharges.delete(memoireCharges.keys().next().value!);
}
