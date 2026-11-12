// Page Pas (planche pas, NOTES § 5) : calculs purs, sans React Native (tests/mesures-pas.test.ts).
// Rythme habituel : pour chaque heure, la moyenne des pas de cette heure sur 30 jours ; avance = pas du jour − habituel à
// cette minute ; projection = pas du jour + reste habituel de la journée. Objectif « d'après tes pas » : moyenne 90 jours
// + 10 %, arrondie à 500, entre 6 000 et 12 000, dès 30 jours d'historique. Distance : pas × foulée (taille × 0,415).

import { statsJours, type StatsJours } from "./periodes";

export const OBJECTIF_PAS_DEFAUT = 8000;
export const PAS_OBJECTIF = 500;
export const OBJECTIF_MIN = 6000;
export const OBJECTIF_MAX = 12000;
/** Jours d'historique (avec donnée) qu'il faut pour proposer l'objectif « d'après tes pas ». */
export const JOURS_POUR_PROFIL = 30;
export const FOULEE_PAR_CM = 0.415;

/** Cumul : c[i] = somme des valeurs 0..i (les heures sans donnée comptent pour 0). */
export function cumul(l: readonly (number | null)[]): number[] {
  const c: number[] = [];
  let s = 0;
  for (const v of l) c.push((s += v ?? 0));
  return c;
}

/** Moyenne de chaque heure sur les jours qui ont au moins une donnée (`jours` : 24 valeurs par jour, null = rien). */
export function rythmeHabituel(jours: readonly (readonly (number | null)[])[]): number[] | null {
  const pleins = jours.filter((h) => h.some((v) => v != null && v > 0));
  if (!pleins.length) return null;
  return Array.from({ length: 24 }, (_, h) => pleins.reduce((a, j) => a + (j[h] ?? 0), 0) / pleins.length);
}

/** Pas habituels depuis minuit jusqu'à `heure` (fraction d'heure comprise : 16,7 = 16 h 42). */
export function habituelA(habituel: readonly number[], heure: number): number {
  const h = Math.max(0, Math.min(24, heure));
  const entiere = Math.floor(h);
  let s = 0;
  for (let i = 0; i < entiere && i < 24; i++) s += habituel[i] ?? 0;
  if (entiere < 24) s += (habituel[entiere] ?? 0) * (h - entiere);
  return s;
}

/** Pas d'aujourd'hui projetés à minuit : le total plus ce qui reste habituellement de la journée. */
export function projection(total: number, habituel: readonly number[], heure: number): number {
  const fin = habituel.reduce((a, b) => a + b, 0);
  return total + Math.max(0, fin - habituelA(habituel, heure));
}

/** Objectif proposé d'après les 90 derniers jours (aujourd'hui exclu) ; null avant 30 jours avec donnée. */
export function objectifProfil(valeurs: readonly (number | null)[]): { moyenne: number; objectif: number } | null {
  const v = valeurs.filter((x): x is number => x != null);
  if (v.length < JOURS_POUR_PROFIL) return null;
  const moyenne = v.reduce((a, b) => a + b, 0) / v.length;
  const objectif = Math.min(OBJECTIF_MAX, Math.max(OBJECTIF_MIN, Math.round((moyenne * 1.1) / PAS_OBJECTIF) * PAS_OBJECTIF));
  return { moyenne, objectif };
}

/** Objectif lu dans les réglages (texte), sinon le défaut. */
export function lireObjectif(brut: string | null): number {
  const n = Number(brut);
  return Number.isFinite(n) && n >= 1000 && n <= 50000 ? Math.round(n) : OBJECTIF_PAS_DEFAUT;
}

export interface Series {
  /** Jours d'affilée à l'objectif ; aujourd'hui compte dès qu'il est atteint, sinon la série court jusqu'à hier. */
  enCours: number;
  record: number;
  /** Dernier jour réussi, null si aucun. */
  dernier: number | null;
}

/**
 * Séries de jours à l'objectif. `jours` : du plus récent (aujourd'hui) au plus ancien, avec leur minuit ; un jour sans donnée
 * casse la série (on ne sait pas).
 */
export function series(jours: readonly { jour: number; v: number | null }[], objectif: number): Series {
  const ok = (x: { v: number | null } | undefined) => x != null && x.v != null && x.v >= objectif;
  let i = ok(jours[0]) ? 0 : 1;
  let enCours = 0;
  while (ok(jours[i])) {
    enCours++;
    i++;
  }
  let record = 0;
  let run = 0;
  for (const x of jours) {
    run = ok(x) ? run + 1 : 0;
    record = Math.max(record, run);
  }
  return { enCours, record, dernier: jours.find(ok)?.jour ?? null };
}

/** Le calcul est celui de toutes les pages de mesure à objectif (periodes.ts) : la page Fibres s'en sert aussi. */
export type StatsPas = StatsJours;
export const statsPas = statsJours;

/** Kilomètres pour `pas` à la foulée de la taille ; null sans taille (rien d'inventé). */
export function distanceKm(pas: number, tailleCm: number | null): number | null {
  return tailleCm && tailleCm > 50 ? (pas * tailleCm * FOULEE_PAR_CM) / 100_000 : null;
}

/** Choix de l'objectif dans la feuille : lequel des trois est l'objectif courant. */
export function choixObjectif(objectif: number, profil: number | null): "defaut" | "profil" | "perso" {
  if (objectif === OBJECTIF_PAS_DEFAUT) return "defaut";
  if (profil != null && objectif === profil) return "profil";
  return "perso";
}
