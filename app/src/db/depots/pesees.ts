import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import type { Pesee } from "../types";
import { lireReglage } from "./reglages";
import { recalculerPoidsDuCorps } from "./recalcul";

/** Pesées, de la plus récente à la plus ancienne. */
export function listerPesees(db: Executeur): Promise<Pesee[]> {
  return db.getAllAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee ORDER BY date DESC", []);
}

/** Ancienneté au-delà de laquelle un calcul ne prend plus une pesée pour le poids du jour (lot 6 de la précision). */
export const JOURS_PESEE_CALCUL = 365;
/** Pour un jour d'avant la première pesée : celle-ci, si elle vient au plus tard 30 jours après. */
export const JOURS_PESEE_APRES = 30;

/**
 * Pesée en vigueur à la date `t` (la plus proche avant, à défaut la plus ancienne), ou null sans aucune pesée. `maxJours` (les
 * calculs : dépense, kcal par pas) : une pesée plus vieille que cela n'est pas prise (le poids manque, et le calcul le dit),
 * ni une pesée d'après plus lointaine que 30 jours ; sans `maxJours`, comme avant (charge des exercices au poids du corps).
 */
export async function peseeAvant(db: Executeur, t: number = Date.now(), maxJours?: number): Promise<Pesee | null> {
  const avant = await db.getFirstAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee WHERE date <= ? ORDER BY date DESC LIMIT 1", [t]);
  if (maxJours == null) return avant ?? (await db.getFirstAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee ORDER BY date LIMIT 1", []));
  if (avant) return t - avant.date <= maxJours * 86_400_000 ? avant : null;
  const apres = await db.getFirstAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee ORDER BY date LIMIT 1", []);
  return apres && apres.date - t <= JOURS_PESEE_APRES * 86_400_000 ? apres : null;
}

/**
 * `peseeAvant(db, t, maxJours)` sans base, pour plusieurs dates (bilan d'énergie de plusieurs jours) : `l` contient au moins
 * les pesées de [t − maxJours, t], par date croissante ; `premiere`, la plus ancienne de toutes.
 */
export function peseeAvantDans(l: readonly Pesee[], premiere: Pesee | null, t: number, maxJours: number): Pesee | null {
  let avant: Pesee | null = null;
  for (const p of l) {
    if (p.date > t) break;
    avant = p;
  }
  if (avant) return t - avant.date <= maxJours * 86_400_000 ? avant : null;
  // une pesée plus ancienne que la liste existe : trop vieille, comme pour peseeAvant
  if (premiere && premiere.date <= t) return null;
  return premiere && premiere.date - t <= JOURS_PESEE_APRES * 86_400_000 ? premiere : null;
}

/** Saisie manuelle d'une pesée ; recalcule la charge effective des séries concernées (D8, D9). */
export async function ajouterPesee(
  db: Executeur,
  kg: number,
  date: number = Date.now(),
  source: Pesee["source"] = "manuel",
  origine: string | null = null,
): Promise<string> {
  if (!(kg > 0) || kg > 500) throw new Error("Poids illisible");
  const id = nouvelId();
  await db.runAsync("INSERT INTO pesee (id, date, kg, source, origine) VALUES (?,?,?,?,?)", [id, date, kg, source, origine]);
  await recalculerPoidsDuCorps(db);
  return id;
}

/** Corrige une pesée manuelle (poids, date) ; une pesée importée ne se modifie pas : elle vient de la balance. */
export async function modifierPesee(db: Executeur, id: string, patch: { kg?: number; date?: number }): Promise<void> {
  const p = await db.getFirstAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee WHERE id = ?", [id]);
  if (!p) return;
  if (p.source !== "manuel") throw new Error("Pesée importée : on la supprime, on ne la modifie pas");
  const kg = patch.kg ?? p.kg;
  if (!(kg > 0) || kg > 500) throw new Error("Poids illisible");
  await db.runAsync("UPDATE pesee SET kg = ?, date = ? WHERE id = ?", [kg, patch.date ?? p.date, id]);
  await recalculerPoidsDuCorps(db);
}

export async function supprimerPesee(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM pesee WHERE id = ?", [id]);
  await recalculerPoidsDuCorps(db);
}

export interface SourceSante {
  disponible(): Promise<boolean>;
  dernierPoids(): Promise<{ kg: number; date: number; origine?: string | null } | null>;
}

/** Import du poids de Santé Connect : allumé par défaut dès que la lecture est autorisée (29/10), éteint seulement si
 * l'utilisateur a coupé l'interrupteur « sante_poids » (« 0 »). */
export const importPoidsActif = async (db: Executeur) => (await lireReglage(db, "sante_poids")) !== "0";

/**
 * Importe le dernier poids de Santé Connect si l'import est actif et que le module répond (D9).
 * Sans module (stub actuel) : ne fait rien. Renvoie true si une pesée a été ajoutée.
 */
export async function synchroniserPoidsSante(db: Executeur, sante: SourceSante): Promise<boolean> {
  if (!(await importPoidsActif(db)) || !(await sante.disponible())) return false;
  const p = await sante.dernierPoids();
  if (!p) return false;
  const deja = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pesee WHERE date = ? AND source = 'sante_connect'", [p.date]);
  if ((deja?.n ?? 0) > 0) return false;
  await ajouterPesee(db, p.kg, p.date, "sante_connect", p.origine ?? null);
  return true;
}

/** Une pesée de Santé Connect est un doublon si la même (date, source) existe, ou si une pesée de n'importe quelle source
 * (saisie, Whoop) a le même poids à moins de 12 h : la saisie de l'utilisateur prime, rien ne compte deux fois. */
const DOUBLON_PESEE_MS = 12 * 3_600_000;

/** Importe les pesées des `jours` derniers jours de Santé Connect (si l'import est actif). Renvoie le nombre ajouté. */
export async function importerPeseesSante(
  db: Executeur,
  sante: { pesees(jours: number): Promise<{ kg: number; date: number; origine?: string | null }[] | null> },
  jours = 30,
): Promise<number> {
  if (!(await importPoidsActif(db))) return 0;
  return ajouterPeseesSante(db, (await sante.pesees(jours).catch(() => null)) ?? []);
}

/** Range des pesées lues dans Santé Connect, sans doublon (voir DOUBLON_PESEE_MS) ; renvoie le nombre ajouté. Ne regarde pas
 * l'interrupteur « sante_poids » : à l'appelant de le faire (importerPeseesSante, reprise de l'historique). */
export async function ajouterPeseesSante(db: Executeur, l: readonly { kg: number; date: number; origine?: string | null }[]): Promise<number> {
  let n = 0;
  for (const p of l) {
    if (!(p.kg > 0) || p.kg > 500) continue;
    const deja = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM pesee WHERE (date = ? AND source = 'sante_connect') OR (ABS(date - ?) < ? AND ABS(kg - ?) <= 0.05)",
      [p.date, p.date, DOUBLON_PESEE_MS, p.kg],
    );
    if ((deja?.n ?? 0) > 0) continue;
    await db.runAsync("INSERT INTO pesee (id, date, kg, source, origine) VALUES (?,?,?,?,?)", [nouvelId(), p.date, p.kg, "sante_connect", p.origine ?? null]);
    n++;
  }
  if (n) await recalculerPoidsDuCorps(db);
  return n;
}
