// Mesures « état » : poids, masse grasse, VFC, FC au repos (planche pas, NOTES § 1 et § 5, donnees-mesures.js) : un relevé
// est bruité, on lit la moyenne lissée (exponentielle, 10 % par relevé ; un jour sans relevé garde la dernière valeur), sa
// tendance (pente sur 28 jours, par semaine) et les dates estimées de l'objectif. Périodes 30 j, 90 j, 1 an, Tout : l'axe du
// temps garde toute la période même sans relevé (retour du 29/10). Pur (sans React Native) :
// tests/mesures-corps.test.ts.
import { decaler, minuit } from "./periodes";

export const LISSAGE = 0.1;
export const JOURS_TENDANCE = 28;

export interface Releve {
  id: string;
  date: number;
  valeur: number;
  /** Saisi à la main dans pepfit (sinon importé : balance, Whoop). */
  manuel: boolean;
  /** Paquet de l'appli d'origine (Withings…), null pour une saisie. */
  origine: string | null;
}

/** Un jour de la série : le relevé du jour (le plus récent s'il y en a plusieurs), la moyenne lissée ce soir-là. */
export interface PointEtat {
  jour: number;
  v: number | null;
  l: number | null;
  releve: Releve | null;
}

/**
 * Ajustement de la moyenne lissée au cycle (planche cycle, § 3.5 ; cycle/poids.ts) : pour un jour de la fenêtre des règles,
 * l'écart appris à retirer du relevé, ou null avant l'apprentissage (le relevé compte alors `reduit` fois moins) ; null hors
 * de la fenêtre.
 */
export type AjustementLisse = (jour: number) => { ecart: number | null; reduit: number } | null;

/** Série jour par jour de `debut` à `fin` (minuits compris), lissée depuis le premier relevé (même ceux d'avant `debut`) ;
 * `ajustement` : la moyenne lissée ajustée au cycle (le poids). */
export function serieJours(releves: readonly Releve[], debut: number, fin: number, ajustement?: AjustementLisse | null): PointEtat[] {
  const tri = [...releves].sort((a, b) => a.date - b.date);
  const parJour = new Map<number, Releve>();
  for (const r of tri) parJour.set(minuit(r.date), r);
  const premier = tri.length ? minuit(tri[0]!.date) : debut;
  const out: PointEtat[] = [];
  let e: number | null = null;
  for (let j = Math.min(premier, minuit(debut)); j <= minuit(fin); j = decaler(j, 1)) {
    const r = parJour.get(j) ?? null;
    if (r) {
      const a: ReturnType<AjustementLisse> = e == null ? null : (ajustement?.(j) ?? null);
      e = e == null ? r.valeur : !a ? e + LISSAGE * (r.valeur - e) : a.ecart != null ? e + LISSAGE * (r.valeur - a.ecart - e) : e + LISSAGE * a.reduit * (r.valeur - e);
    }
    if (j >= minuit(debut)) out.push({ jour: j, v: r?.valeur ?? null, l: e, releve: r });
  }
  return out;
}

/**
 * Série « de mesure en mesure » (tours, planche mensurations M6) : un tour se prend toutes les deux ou trois semaines, une
 * moyenne lissée n'y a pas de sens. `l` relie les mesures de la période (droite d'une mesure à la suivante), rien avant la
 * première ni après la dernière ; `v` : la mesure du jour (la plus récente).
 */
export function serieMesures(releves: readonly Releve[], debut: number, fin: number): PointEtat[] {
  const parJour = new Map<number, Releve>();
  for (const r of [...releves].sort((a, b) => a.date - b.date)) parJour.set(minuit(r.date), r);
  const jours = [...parJour.keys()].filter((j) => j >= minuit(debut) && j <= minuit(fin)).sort((a, b) => a - b);
  const out: PointEtat[] = [];
  let k = 0;
  for (let j = minuit(debut); j <= minuit(fin); j = decaler(j, 1)) {
    const r = parJour.get(j) ?? null;
    while (k + 1 < jours.length && jours[k + 1]! <= j) k++;
    let l: number | null = null;
    if (jours.length && j >= jours[0]! && j <= jours[jours.length - 1]!) {
      const a = jours[k]!, b = jours[Math.min(k + 1, jours.length - 1)]!;
      const va = parJour.get(a)!.valeur, vb = parJour.get(b)!.valeur;
      l = b === a ? va : va + ((vb - va) * (j - a)) / (b - a);
    }
    out.push({ jour: j, v: r?.valeur ?? null, l, releve: r });
  }
  return out;
}

/** Pente de la moyenne lissée sur les `n` derniers jours de la série (régression linéaire), par semaine ; null sans 2 points. */
export function pente(serie: readonly PointEtat[], n = JOURS_TENDANCE): number | null {
  const pts = serie.slice(-n).map((p, i) => [i, p.l] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (!den) return null;
  return (pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / den) * 7;
}

/** Date où la moyenne lissée atteint la cible au rythme donné (par semaine) ; null si le rythme ne va pas vers elle. */
export function dateDans(actuel: number, cible: number, parSemaine: number | null, maintenant: number): number | null {
  if (parSemaine == null || !parSemaine || Math.sign(cible - actuel) !== Math.sign(parSemaine)) return null;
  return maintenant + (Math.abs(cible - actuel) / Math.abs(parSemaine)) * 7 * 86_400_000;
}

/** Part du chemin faite de `depart` vers `cible` (0 à 1). */
export function chemin(depart: number, actuel: number, cible: number): number {
  if (depart === cible) return 1;
  return Math.max(0, Math.min(1, (depart - actuel) / (depart - cible)));
}

export type PhraseBouge = "gras-seul" | "gras-et-maigre" | "prise" | "rien";

/**
 * Ce qui a bougé (masse grasse) : masse grasse = poids lissé × % lissé, masse maigre = le reste ; écarts entre il y a
 * `jours` jours et aujourd'hui. La phrase est choisie par règle (seuil 0,2 kg).
 */
export function bouge(
  kgAvant: number,
  kgApres: number,
  grasAvant: number,
  grasApres: number,
): { gras: number; maigre: number; phrase: PhraseBouge } {
  const g = (kg: number, p: number) => (kg * p) / 100;
  const dg = g(kgApres, grasApres) - g(kgAvant, grasAvant);
  const dm = kgApres - g(kgApres, grasApres) - (kgAvant - g(kgAvant, grasAvant));
  const phrase: PhraseBouge = dg < -0.2 ? (dm > -0.2 ? "gras-seul" : "gras-et-maigre") : dg > 0.2 ? "prise" : "rien";
  return { gras: dg, maigre: dm, phrase };
}

// ---- Périodes des mesures « état » : 30 j, 90 j, 1 an, Tout --------------------------------------------------------------

export type TypeEtat = "mois" | "trim" | "annee" | "tout";
export const TYPES_ETAT: readonly TypeEtat[] = ["mois", "trim", "annee", "tout"];
export const LONGUEUR_ETAT: Record<Exclude<TypeEtat, "tout">, number> = { mois: 30, trim: 90, annee: 365 };

export interface PeriodeEtat {
  type: TypeEtat;
  k: number;
  debut: number;
  fin: number;
  pts: PointEtat[];
}

/**
 * Période `k` (0 = celle qui finit aujourd'hui) : TOUS ses jours, même ceux d'avant le premier relevé (sans valeur ni moyenne :
 * la partie vide du graphique reste vide, on voit que l'historique commence plus tard) ; « tout » part du premier relevé.
 */
/** `serie` : la moyenne lissée (poids, gras…) ou les mesures reliées (tours, serieMesures). */
export function periodeEtat(releves: readonly Releve[], type: TypeEtat, k: number, maintenant: number, serie = serieJours): PeriodeEtat {
  const auj = minuit(maintenant);
  let debut: number, fin: number;
  if (type === "tout") {
    const premier = releves.length ? Math.min(...releves.map((r) => r.date)) : auj;
    debut = Math.min(minuit(premier), decaler(auj, -1));
    fin = auj;
  } else {
    const L = LONGUEUR_ETAT[type];
    fin = decaler(auj, -L * k);
    debut = decaler(fin, -(L - 1));
  }
  return { type, k, debut, fin, pts: serie(releves, debut, fin) };
}

/** La période `k` a-t-elle au moins un relevé ? (« tout » n'a pas de période d'avant.) */
export function periodeEtatExiste(releves: readonly Releve[], type: TypeEtat, k: number, maintenant: number): boolean {
  if (k === 0) return true;
  if (type === "tout") return false;
  const p = periodeEtat(releves, type, k, maintenant);
  return releves.some((r) => minuit(r.date) >= p.debut && minuit(r.date) <= p.fin);
}

export interface StatsEtat {
  /** Relevés de la période. */
  n: number;
  jours: number;
  /** Variation de la moyenne lissée, du premier au dernier jour ; null sans moyenne. */
  variation: number | null;
  parSemaine: number | null;
  min: PointEtat | null;
  max: PointEtat | null;
}

export function statsEtat(p: PeriodeEtat): StatsEtat {
  const v = p.pts.filter((x) => x.v != null);
  const ls = p.pts.filter((x) => x.l != null);
  const variation = ls.length >= 2 ? ls[ls.length - 1]!.l! - ls[0]!.l! : null;
  let min: PointEtat | null = null, max: PointEtat | null = null;
  for (const x of v) {
    if (!min || x.v! < min.v!) min = x;
    if (!max || x.v! > max.v!) max = x;
  }
  return {
    n: v.length,
    jours: p.pts.length,
    variation,
    parSemaine: variation == null ? null : (variation / Math.max(1, p.pts.length - 1)) * 7,
    min,
    max,
  };
}

/** Indices des dates écrites sous la courbe : début de la période, milieu, fin (« tout » : début et fin). */
export function indicesEtiquettes(type: TypeEtat, n: number): number[] {
  if (n <= 1) return [0];
  if (type === "tout") return [0, n - 1];
  return [0, Math.floor((n - 1) / 2), n - 1];
}

const PAS_AXE = [0.5, 1, 2, 5, 10, 20, 50, 100] as const;

/**
 * Repères de l'axe : bornes élargies de 12 % (0,3 au moins) ; pas lisible (0,5, 1, 2, 5, 10…) pour 8 intervalles au plus
 * (0,5 sous 4 kg d'écart, 1 au-delà ; une VFC de 40 à 90 ms : 10 ms).
 */
export function axeEtat(valeurs: readonly number[]): { lo: number; hi: number; pas: number; reperes: number[] } {
  let lo = Infinity, hi = -Infinity;
  for (const v of valeurs) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const marge = Math.max(0.3, (hi - lo) * 0.12);
  lo -= marge;
  hi += marge;
  const pas = PAS_AXE.find((p) => (hi - lo) / p <= 8) ?? 200;
  const reperes: number[] = [];
  for (let v = Math.ceil(lo / pas) * pas; v <= hi + 1e-9; v += pas) reperes.push(Math.round(v * 10) / 10);
  return { lo, hi, pas, reperes };
}

/** Moyenne lissée à un jour donné (minuit), null avant le premier relevé. */
export function lisseAu(releves: readonly Releve[], jour: number, ajustement?: AjustementLisse | null): number | null {
  const s = serieJours(releves, jour, jour, ajustement);
  return s[0]?.l ?? null;
}

/** Largeur de l'axe de droite des graphiques (graphes.tsx, GRAPHE.axe). */
export const AXE = 28;

/** Colonnes de la piste pour `n` jours : la largeur de l'axe en colonnes de plus, pour que la colonne touchée soit le jour visé. */
export function colonnesPiste(n: number, largeur: number, axe = AXE): number {
  const W = largeur - axe;
  return W > 0 ? Math.max(n, Math.round((n * largeur) / W)) : n;
}

/**
 * Abscisse du centre d'un jour placé `o` jours avant le dernier de la période, sur une échelle de `duree` jours ancrée à
 * droite (largeur `W`). L'animation d'un changement de période fait passer `duree` de l'ancienne à la nouvelle longueur :
 * les jours au-delà de `duree` sont à gauche du bord (x < 0), ils entrent ou sortent par la gauche.
 */
export function xDepuisFin(o: number, duree: number, W: number): number {
  "worklet";
  return W - (o + 0.5) * (W / Math.max(1, duree));
}

/** Ce que l'en-tête montre d'un jour : son relevé (le plus récent du jour), la moyenne lissée ce soir-là, la tendance sur 28 jours, le relevé d'avant. */
export function jourEtat(
  releves: readonly Releve[],
  jour: number,
  ajustement?: AjustementLisse | null,
): { releve: Releve | null; l: number | null; tendance: number | null; precedent: Releve | null } {
  const j = minuit(jour);
  const s = serieJours(releves, decaler(j, -(JOURS_TENDANCE - 1)), j, ajustement);
  const p = s[s.length - 1];
  let precedent: Releve | null = null;
  for (const r of releves) if (minuit(r.date) < j && (!precedent || r.date > precedent.date)) precedent = r;
  return { releve: p?.releve ?? null, l: p?.l ?? null, tendance: pente(s), precedent };
}

/** Jours (minuits) qui ont au moins un relevé : la pastille du semainier. */
export function joursReleves(releves: readonly Releve[]): Set<number> {
  return new Set(releves.map((r) => minuit(r.date)));
}

/** Relevés entre `debut` (compris) et `fin` (exclu), du plus ancien au plus récent (la page agenda). */
export function relevesEntre(releves: readonly Releve[], debut: number, fin: number): Releve[] {
  return releves.filter((r) => r.date >= debut && r.date < fin).sort((a, b) => a.date - b.date);
}
