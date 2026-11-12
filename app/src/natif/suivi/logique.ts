// Suivi GPS et FC : calculs purs (tracé, allure, dénivelé, km, tours, zones), sans React ni module natif.
// Le module Kotlin pepfit-suivi tient sa propre distance pour la notification ; ces calculs-ci font foi à la fin.
import type { Point } from "./types";

const R_TERRE_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance à vol d'oiseau entre deux positions, en mètres (haversine). */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Seuils du filtre : précision au-delà de laquelle un point ne compte pas, vitesse impossible (saut du GPS). */
export const PRECISION_MAX_M = 30;
export const VITESSE_MAX_MS = 15;
/** Sauts d'affilée après lesquels la nouvelle position devient l'origine (premier fix périmé, vrai saut), sans compter. */
export const SAUTS_REANCRAGE = 3;
/** Écart entre horloge murale `t` et temps de séance `s` au-delà duquel deux points encadrent une pause (ms). */
export const PAUSE_MS = 1000;

/** Distance cumulée à chaque point (même ordre), en mètres. Un point imprécis ou un saut impossible n'ajoute rien
 *  et n'est pas pris comme origine du pas suivant ; après SAUTS_REANCRAGE sauts d'affilée, le dernier devient l'origine
 *  sans que le saut compte. Pas de pont par-dessus une pause : le natif n'enregistre rien en pause et `s` exclut les
 *  pauses, mais `t` avance ; le premier point après la pause repart de zéro (même règle que Suivi.kt). */
export function distancesCumulees(points: readonly Point[]): number[] {
  const res: number[] = [];
  let total = 0;
  let dernier: Point | null = null;
  let sauts = 0;
  for (const p of points) {
    const pause = dernier != null && p.t - p.s - (dernier.t - dernier.s) > PAUSE_MS;
    const d = dernier && !pause ? haversineM(dernier, p) : 0;
    const dt = dernier && !pause ? (p.s - dernier.s) / 1000 : 0;
    const saut = dt > 0 && d / dt > VITESSE_MAX_MS;
    if (p.precision <= PRECISION_MAX_M) {
      if (!saut) {
        if (dt > 0) total += d;
        dernier = p;
        sauts = 0;
      } else if (++sauts >= SAUTS_REANCRAGE) {
        dernier = p;
        sauts = 0;
      }
    }
    res.push(total);
  }
  return res;
}

/** Moyenne glissante centrée sur `fenetre` valeurs (impair conseillé) ; les null sont ignorés et restent null. */
export function lisser(valeurs: readonly (number | null)[], fenetre: number): (number | null)[] {
  const demi = Math.floor(Math.max(1, fenetre) / 2);
  return valeurs.map((v, i) => {
    if (v == null) return null;
    let somme = 0;
    let n = 0;
    for (let j = Math.max(0, i - demi); j <= Math.min(valeurs.length - 1, i + demi); j++) {
      const w = valeurs[j];
      if (w != null) {
        somme += w;
        n++;
      }
    }
    return somme / n;
  });
}

/** Allure en secondes par km ; null sans distance utile (moins de 10 m). */
export function allureSParKm(distanceM: number, dureeS: number): number | null {
  if (distanceM < 10 || dureeS <= 0) return null;
  return (dureeS * 1000) / distanceM;
}

/** « 5'12" » ; « — » sans allure. */
export function allureTexte(sParKm: number | null): string {
  if (sParKm == null || !Number.isFinite(sParKm)) return "—";
  const s = Math.round(sParKm);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}"`;
}

/** Vitesse en km/h (vélo) ; null sans durée. */
export function vitesseKmH(distanceM: number, dureeS: number): number | null {
  return dureeS > 0 ? (distanceM / dureeS) * 3.6 : null;
}

/** Altitude barométrique (formule internationale) ; p0 s'annule pour un dénivelé. */
export function altitudeBaroM(pressionHPa: number, p0HPa = 1013.25): number {
  return 44330 * (1 - Math.pow(pressionHPa / p0HPa, 1 / 5.255));
}

/** Dénivelé positif et négatif avec hystérésis : une montée ne compte qu'une fois `seuilM` franchi depuis le dernier
 *  point bas (et inversement), ce qui écrase le bruit du capteur. Les null sont sautés. */
export function denivele(altitudes: readonly (number | null)[], seuilM = 3): { plus: number; moins: number } {
  let plus = 0;
  let moins = 0;
  let ref: number | null = null;
  for (const a of altitudes) {
    if (a == null) continue;
    if (ref == null) {
      ref = a;
      continue;
    }
    if (a - ref >= seuilM) {
      plus += a - ref;
      ref = a;
    } else if (ref - a >= seuilM) {
      moins += ref - a;
      ref = a;
    }
  }
  return { plus, moins };
}

export interface Morceau {
  /** 1, 2, 3… */
  n: number;
  debutS: number;
  finS: number;
  dureeS: number;
  distanceM: number;
  /** Allure ramenée au km (le dernier morceau partiel aussi). */
  allure: number | null;
  /** Dernier morceau, plus court que le pas. */
  partiel: boolean;
}

/** Découpe une course en morceaux de `pasM` (1000 par défaut) ; le temps de passage est interpolé entre deux points. */
/** Vitesse sous laquelle on est à l'arrêt (m/s), mesurée sur une fenêtre de quelques secondes autour de chaque segment. */
export const ARRET_MS = 0.5;
const FENETRE_ARRET_S = 10;

/**
 * Temps en mouvement cumulé (s) à chaque point : les segments où l'on avance (plus de 0,5 m/s sur une fenêtre de 10 s, le
 * bruit du GPS à l'arrêt ne compte pas). L'attente du premier point GPS et les arrêts (feu rouge, lacet) n'y entrent pas :
 * c'est le temps de l'allure (« Par km » et allure du résumé, retour du 29/10 : 8'50" par km pour 12'15" au total).
 */
export function tempsMouvementCumule(points: readonly Pick<Point, "s">[], cumul: readonly number[]): number[] {
  const r = points.length ? [0] : [];
  for (let i = 1; i < points.length; i++) {
    let a = i - 1;
    let b = i;
    while (a > 0 && points[i]!.s - points[a]!.s < (FENETRE_ARRET_S * 1000) / 2) a--;
    while (b < points.length - 1 && points[b]!.s - points[i - 1]!.s < (FENETRE_ARRET_S * 1000) / 2) b++;
    const dt = (points[b]!.s - points[a]!.s) / 1000;
    const bouge = dt > 0 && (cumul[b]! - cumul[a]!) / dt >= ARRET_MS;
    r.push(r[i - 1]! + (bouge ? (points[i]!.s - points[i - 1]!.s) / 1000 : 0));
  }
  return r;
}

/**
 * Découpage par km (ou par mile). Les bornes restent en temps de séance (la FC de chaque km s'y lit) ; la durée et l'allure
 * de chaque morceau comptent le temps en mouvement.
 */
export function parKm(points: readonly Point[], pasM = 1000): Morceau[] {
  if (points.length === 0) return [];
  const cumul = distancesCumulees(points);
  const mvt = tempsMouvementCumule(points, cumul);
  const total = cumul[cumul.length - 1]!;
  const res: Morceau[] = [];
  let debutS = points[0]!.s / 1000;
  let debutM = 0;
  let borne = pasM;
  for (let i = 1; i < points.length && borne <= total; i++) {
    const d0 = cumul[i - 1]!;
    const d1 = cumul[i]!;
    const s0 = points[i - 1]!.s / 1000;
    const s1 = points[i]!.s / 1000;
    while (borne <= d1 && borne <= total) {
      const k = d1 > d0 ? (borne - d0) / (d1 - d0) : 1;
      const finS = s0 + k * (s1 - s0);
      const finM = mvt[i - 1]! + k * (mvt[i]! - mvt[i - 1]!);
      res.push(morceau(res.length + 1, debutS, finS, pasM, false, finM - debutM));
      debutS = finS;
      debutM = finM;
      borne += pasM;
    }
  }
  const reste = total - (borne - pasM);
  const finS = points[points.length - 1]!.s / 1000;
  if (reste >= 1) res.push(morceau(res.length + 1, debutS, finS, reste, true, mvt[mvt.length - 1]! - debutM));
  return res;
}

function morceau(n: number, debutS: number, finS: number, distanceM: number, partiel: boolean, mouvementS: number): Morceau {
  return { n, debutS, finS, dureeS: mouvementS, distanceM, allure: allureSParKm(distanceM, mouvementS), partiel };
}

/**
 * Lissage de l'altitude : moyenne glissante de 15 points avec le baromètre (bruit de quelques décimètres), de 31 points avec
 * le GPS seul (bruit de 10 à 20 m) ; le dénivelé garde son seuil de 3 m (denivele).
 */
export function lisserAltitude(altitudes: readonly (number | null)[], barometre: boolean): (number | null)[] {
  return lisser(altitudes, barometre ? 15 : 31);
}

/** Borne de tour : temps de séance (ms, hors pauses) et distance cumulée (m) au moment du toucher. */
export interface BorneTour {
  s: number;
  d: number;
}

export interface Tour {
  n: number;
  debutS: number;
  finS: number;
  dureeS: number;
  distanceM: number;
  allure: number | null;
  /** Tour en cours (après la dernière borne). */
  enCours: boolean;
}

/** Tours à partir des bornes : avant le premier toucher, « Tour 1 » couvre toute la course ; le dernier tour court
 *  jusqu'à `fin` (maintenant en direct, la fin de course ensuite). */
export function tours(bornes: readonly BorneTour[], fin: BorneTour): Tour[] {
  const tries = [...bornes].sort((a, b) => a.s - b.s);
  const res: Tour[] = [];
  let prec: BorneTour = { s: 0, d: 0 };
  for (const b of [...tries, fin]) {
    const dureeS = (b.s - prec.s) / 1000;
    const distanceM = b.d - prec.d;
    res.push({ n: res.length + 1, debutS: prec.s / 1000, finS: b.s / 1000, dureeS, distanceM, allure: allureSParKm(distanceM, dureeS), enCours: b === fin });
    prec = b;
  }
  return res;
}

/** « Fusionner avec le précédent » (D16) : retire la borne qui ouvre le tour `n` (n ≥ 2). */
export function fusionnerTour(bornes: readonly BorneTour[], n: number): BorneTour[] {
  if (n < 2) return [...bornes];
  const tries = [...bornes].sort((a, b) => a.s - b.s);
  return tries.filter((_, i) => i !== n - 2);
}

/** Zone de FC 1 à 5 par tranches de 10 % de la FC max (50-60 % = Z1… 90 % et plus = Z5) ; 0 sous 50 %. */
export function zoneFc(bpm: number, fcMax: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const r = bpm / fcMax;
  if (r >= 0.9) return 5;
  if (r >= 0.8) return 4;
  if (r >= 0.7) return 3;
  if (r >= 0.6) return 2;
  if (r >= 0.5) return 1;
  return 0;
}

/** Lecture de la caractéristique 0x2A37 (Heart Rate Measurement), même règle que le module natif. */
export function lireFrequence(octets: readonly number[]): { bpm: number; contact: boolean | null; rr: number[] } | null {
  if (octets.length < 2) return null;
  const o = (k: number) => octets[k] ?? 0;
  const f = o(0);
  let i = 1;
  let bpm: number;
  if (f & 0x01) {
    if (octets.length < 3) return null;
    bpm = o(1) | (o(2) << 8);
    i = 3;
  } else {
    bpm = o(1);
    i = 2;
  }
  const contact = f & 0x04 ? Boolean(f & 0x02) : null;
  if (f & 0x08) i += 2;
  const rr: number[] = [];
  if (f & 0x10) for (; i + 1 < octets.length; i += 2) rr.push(((o(i) | (o(i + 1) << 8)) / 1024) * 1000);
  return { bpm, contact, rr };
}
