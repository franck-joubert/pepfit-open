// Calibration personnelle des kcal à la FC (demande d'Alex du 31/10 : « affiner les algorithmes pepfit au fur et à mesure
// qu'on a des données » ; docs/KCAL-CALIBRATION.md § 2). Sur le téléphone seulement : pour chaque séance comparable (calculée
// à la FC, au moins 15 min, avec les kcal d'un appareil qui mesure : Whoop pendant les 4 semaines où elles sont gardées,
// demain une autre montre), le rapport entre la mesure et notre calcul, au net au-dessus du repos. Par famille de sport, la
// médiane des 20 dernières devient un facteur personnel, actif dès 5 séances, rapproché de 1 tant qu'il y en a moins de 10,
// borné entre 0,7 et 1,3 (CALCUL_KCAL.calibration). Il s'applique au calcul à la FC (kcal-seance.ts).
//
// Les rapports gardés (réglage « kcal_calibration », synchronisé et chiffré comme les autres réglages, migration 57) sont
// pris face au calcul SANS le coefficient de la famille : changer un coefficient (nouvelle version de CALCUL_KCAL) ne rend
// pas les rapports faux, le facteur se refait. Pur (sans React Native ni base) : tests/kcal-calibration.test.ts.
//
// facteurPersonnel est générique : la même mécanique vaudrait pour l'Effort et la Récupération (§ 2.5 de la note).
import { CALCUL_KCAL, FAMILLES_KCAL, type FacteursKcal, type FamilleKcal } from "./kcal-seance";

/** Réglage synchronisé des rapports appris. */
export const CLE_CALIBRATION_KCAL = "kcal_calibration";
const VERSION = 1;

export type SourceMesure = "whoop" | "montre";

/** Une séance comparable : son rapport mesure ÷ Keytel (net, sans coefficient ni facteur). */
export interface PointCalibration {
  /** Séance (une seule fois par séance). */
  s: string;
  f: FamilleKcal;
  /** Début de la séance (ms) : garder les plus récentes. */
  t: number;
  /** mesure nette ÷ notre net à la FC sans coefficient de famille, arrondi au millième. */
  r: number;
  src: SourceMesure;
}

export interface Calibration {
  /** Facteur appliqué (null : inactif, moins de `seances` séances). */
  facteur: number | null;
  /** Séances comparables gardées. */
  n: number;
  /** Médiane brute des rapports (avant prorata et bornes) ; null sans séance. */
  mediane: number | null;
}

type Params = { seances: number; pleine: number; fenetre: number; min: number; max: number };

export function mediane(l: readonly number[]): number | null {
  if (!l.length) return null;
  const x = [...l].sort((a, b) => a - b);
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m]! : (x[m - 1]! + x[m]!) / 2;
}

/**
 * Facteur personnel lissé d'une liste de rapports (les plus récents d'abord) : médiane des `fenetre` premiers, inactif sous
 * `seances`, rapproché de 1 au prorata jusqu'à `pleine`, borné à [min, max]. Générique (kcal, Effort, Récupération).
 */
export function facteurPersonnel(rapports: readonly number[], p: Params = CALCUL_KCAL.calibration): Calibration {
  const l = rapports.filter((r) => Number.isFinite(r) && r > 0).slice(0, p.fenetre);
  const med = mediane(l);
  if (med == null || l.length < p.seances) return { facteur: null, n: l.length, mediane: med };
  const poids = Math.min(1, l.length / p.pleine);
  const f = 1 + (med - 1) * poids;
  return { facteur: Math.min(p.max, Math.max(p.min, f)), n: l.length, mediane: med };
}

/** Les rapports gardés ; [] : rien, illisible ou autre version. */
export function lirePoints(valeur: string | null | undefined): PointCalibration[] {
  if (!valeur) return [];
  try {
    const v = JSON.parse(valeur) as { v: number; p: PointCalibration[] };
    if (v.v !== VERSION || !Array.isArray(v.p)) return [];
    return v.p.filter((x) => x && typeof x.s === "string" && FAMILLES_KCAL.includes(x.f) && Number.isFinite(x.t) && Number.isFinite(x.r) && x.r > 0);
  } catch {
    return [];
  }
}

export const ecrirePoints = (p: readonly PointCalibration[]) => JSON.stringify({ v: VERSION, p });

/**
 * Ajoute (ou remplace, même séance) des points, puis ne garde que les `fenetre` plus récents de chaque famille. Rend la liste
 * triée (plus récents d'abord).
 */
export function fusionnerPoints(anciens: readonly PointCalibration[], nouveaux: readonly PointCalibration[], fenetre = CALCUL_KCAL.calibration.fenetre): PointCalibration[] {
  const parSeance = new Map(anciens.map((x) => [x.s, x]));
  for (const x of nouveaux) parSeance.set(x.s, x);
  const tries = [...parSeance.values()].sort((a, b) => b.t - a.t || (a.s < b.s ? -1 : 1));
  const compte = new Map<FamilleKcal, number>();
  return tries.filter((x) => {
    const n = compte.get(x.f) ?? 0;
    compte.set(x.f, n + 1);
    return n < fenetre;
  });
}

/** Calibration de chaque famille : le rapport face au calcul AVEC le coefficient actuel (r ÷ coefficient). */
export function calibrationsKcal(points: readonly PointCalibration[]): Map<FamilleKcal, Calibration> {
  const out = new Map<FamilleKcal, Calibration>();
  for (const f of FAMILLES_KCAL) {
    const l = points.filter((x) => x.f === f).sort((a, b) => b.t - a.t);
    if (l.length) out.set(f, facteurPersonnel(l.map((x) => x.r / CALCUL_KCAL.coefFc[f])));
  }
  return out;
}

/** Les facteurs actifs, pour kcalSeance (CorpsKcal.calibration). */
export function facteursKcal(points: readonly PointCalibration[]): FacteursKcal {
  const out: FacteursKcal = {};
  for (const [f, c] of calibrationsKcal(points)) if (c.facteur != null) out[f] = c.facteur;
  return out;
}

/** Facteurs actifs depuis la valeur du réglage (null : aucun). */
export function facteursDepuisReglage(valeur: string | null | undefined): FacteursKcal | null {
  const f = facteursKcal(lirePoints(valeur));
  return Object.keys(f).length ? f : null;
}

/**
 * Le point d'une séance comparable, ou null : calculée à la FC, assez longue, mesure et calcul positifs, rapport plausible
 * (une mesure rattachée à la mauvaise séance donne un rapport absurde : écartée avant la médiane).
 * `netSansCoef` : notre net à la FC sans coefficient ni facteur ; `mesureNette` : la mesure moins le repos de la durée.
 */
export function pointSeance(
  x: { seanceId: string; debut: number; minutes: number; methode: "fc" | "met"; famille: FamilleKcal; netSansCoef: number; mesureNette: number; src: SourceMesure },
): PointCalibration | null {
  const c = CALCUL_KCAL.calibration;
  if (x.methode !== "fc" || x.minutes < c.minutesMin || !(x.netSansCoef > 0) || !(x.mesureNette > 0)) return null;
  const r = x.mesureNette / x.netSansCoef;
  const face = r / CALCUL_KCAL.coefFc[x.famille];
  if (face < c.plausible[0] || face > c.plausible[1]) return null;
  return { s: x.seanceId, f: x.famille, t: x.debut, r: Math.round(r * 1000) / 1000, src: x.src };
}
