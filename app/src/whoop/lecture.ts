// Lectures Whoop pour les écrans : Whoop prime sur Santé Connect (sommeil), sans doublon. Pas : ecrans/pas-source.ts.
import type { Executeur } from "../db/executeur";
import type { SommeilNuit } from "../natif/sante/types";
import { ORIGINE_WHOOP } from "./depot";

interface LigneJour {
  jour: number; recup: number | null; vfc: number | null; fc_repos: number | null; spo2: number | null; temp_peau: number | null;
  sommeil_debut: number | null; sommeil_fin: number | null; sommeil_min: number | null; sommeil_perf: number | null; sommeil_dette_min: number | null;
  leger_min: number | null; profond_min: number | null; paradoxal_min: number | null; eveil_min: number | null;
  strain: number | null; kj: number | null; fc_moy: number | null; fc_max: number | null; pas: number | null;
  respiration: number | null; sommeil_efficacite: number | null; sommeil_regularite: number | null; sommeil_reveils: number | null;
  sommeil_cycles: number | null; au_lit_min: number | null; besoin_base_min: number | null; besoin_effort_min: number | null;
  besoin_sieste_min: number | null; maj_le: number;
}

export type JourWhoopLu = LigneJour;

/** Dernier jour avec au moins une donnée Whoop (hors pas seuls), ou null. */
export function dernierJourWhoop(db: Executeur): Promise<LigneJour | null> {
  return db.getFirstAsync<LigneJour>("SELECT * FROM whoop_jour WHERE recup IS NOT NULL OR strain IS NOT NULL OR sommeil_min IS NOT NULL ORDER BY jour DESC LIMIT 1", []);
}

/** Le journal garde-t-il des jours mesurés par Whoop (nuit, récupération ou effort) ? Vrai aussi une fois Whoop déconnecté. */
export async function journalWhoopGarde(db: Executeur): Promise<boolean> {
  return (await db.getFirstAsync("SELECT 1 AS x FROM whoop_jour WHERE recup IS NOT NULL OR strain IS NOT NULL OR sommeil_min IS NOT NULL LIMIT 1", [])) != null;
}

/** Nuits Whoop terminées entre `debut` et `fin`, de la plus ancienne à la plus récente (même forme que Santé Connect). */
export async function nuitsWhoop(db: Executeur, debut: number, fin: number): Promise<SommeilNuit[]> {
  const l = await db.getAllAsync<LigneJour>("SELECT * FROM whoop_jour WHERE sommeil_fin IS NOT NULL AND sommeil_fin >= ? AND sommeil_fin <= ? ORDER BY sommeil_fin", [debut, fin]);
  return l.map((j) => ({
    debut: j.sommeil_debut ?? j.sommeil_fin! - (j.sommeil_min ?? 0) * 60_000,
    fin: j.sommeil_fin!,
    minutes: j.sommeil_min ?? 0,
    phases: j.leger_min != null ? { leger: j.leger_min, profond: j.profond_min ?? 0, paradoxal: j.paradoxal_min ?? 0, eveil: j.eveil_min ?? 0 } : null,
    origine: ORIGINE_WHOOP,
  }));
}

/** Les nuits Whoop remplacent celles de Santé Connect qui se terminent le même jour de réveil (même nuit, pas de doublon). */
export function fusionnerNuits(sante: readonly SommeilNuit[], whoop: readonly SommeilNuit[]): SommeilNuit[] {
  const jour = (n: SommeilNuit) => new Date(n.fin).toDateString();
  const prises = new Set(whoop.map(jour));
  return [...sante.filter((n) => !prises.has(jour(n))), ...whoop].sort((a, b) => a.fin - b.fin);
}

/** Pas Whoop gardés pour ces jours (minuits), par jour ; les jours sans valeur sont absents. */
export async function pasWhoopJours(db: Executeur, jours: readonly number[]): Promise<Map<number, number>> {
  if (!jours.length) return new Map();
  const l = await db.getAllAsync<{ jour: number; pas: number }>(
    `SELECT jour, pas FROM whoop_jour WHERE pas IS NOT NULL AND jour IN (${jours.map(() => "?").join(", ")})`,
    [...jours],
  );
  return new Map(l.map((x) => [x.jour, x.pas]));
}

export interface ResumeSeanceWhoop {
  fcMoy: number | null;
  fcMax: number | null;
  kj: number | null;
  sport: string | null;
}

/**
 * Données Whoop de chaque séance pepfit enrichie ; plusieurs séances Whoop sur une même séance : la plus longue. Jamais son
 * score d'effort (gardé en base pour le labo de comparaison seulement).
 */
export async function resumesSeancesWhoop(db: Executeur): Promise<Map<string, ResumeSeanceWhoop>> {
  const l = await db.getAllAsync<{ seance_id: string; fc_moy: number | null; fc_max: number | null; kj: number | null; sport: string | null }>(
    "SELECT seance_id, fc_moy, fc_max, kj, sport FROM whoop_seance WHERE seance_id IS NOT NULL ORDER BY fin - debut",
    [],
  );
  return new Map(l.map((x) => [x.seance_id, { fcMoy: x.fc_moy, fcMax: x.fc_max, kj: x.kj, sport: x.sport }]));
}

/** Jours Whoop entre `debut` et `fin` (minuits compris), par jour. */
export async function joursWhoop(db: Executeur, debut: number, fin: number): Promise<Map<number, LigneJour>> {
  const l = await db.getAllAsync<LigneJour>("SELECT * FROM whoop_jour WHERE jour >= ? AND jour <= ? ORDER BY jour", [debut, fin]);
  return new Map(l.map((j) => [j.jour, j]));
}

export interface SeanceWhoopLue {
  id: string;
  debut: number;
  fin: number;
  sport: string | null;
  kj: number | null;
  /** Minutes par zone de FC (0 à 5), null si Whoop ne les a pas notées. */
  zones: number[] | null;
}

/** Séances Whoop commencées entre `debut` et `fin`, de la plus ancienne à la plus récente (sans leur score d'effort). */
export async function seancesWhoopEntre(db: Executeur, debut: number, fin: number): Promise<SeanceWhoopLue[]> {
  const l = await db.getAllAsync<{ id: string; debut: number; fin: number; sport: string | null; kj: number | null; zones: string | null }>(
    "SELECT id, debut, fin, sport, kj, zones FROM whoop_seance WHERE debut >= ? AND debut < ? ORDER BY debut",
    [debut, fin],
  );
  return l.map((x) => {
    let zones: number[] | null = null;
    try {
      const z = x.zones ? (JSON.parse(x.zones) as unknown) : null;
      zones = Array.isArray(z) ? z.map((v) => Number(v) || 0) : null;
    } catch {
      zones = null;
    }
    return { id: x.id, debut: x.debut, fin: x.fin, sport: x.sport, kj: x.kj, zones };
  });
}
