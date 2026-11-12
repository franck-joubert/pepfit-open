// Activités détectées (planche activite-detectee) : un effort vu par un capteur, sans sport identifié, devient une ligne
// « Activité détectée » de la journée ; l'utilisateur lui choisit un sport (elle devient une séance) ou l'ignore. Trois
// sources : Whoop (activité non nommée), Santé Connect (séance « autre » d'une autre appli), pepfit lui-même sans Whoop
// (effort net d'après la FC et les pas de la montre). Pur (sans React Native ni base) : tests/activite-detectee.test.ts.
import { CHARGE_MARCHE_MIN, SPORTS_JOKERS } from "../whoop/sports";

export type SourceDetection = "whoop" | "sante" | "pepfit";

export interface Plage {
  debut: number;
  fin: number;
}

/** Pourquoi une détection n'est pas devenue une ligne « Activité détectée » (journal de diagnostic, db/depots/diagnostic-activites.ts). */
export type RaisonEcart = "rattachee" | "trop-courte" | "sport-nomme" | "marche" | "seance-couvrante" | "ignoree" | "paquet-propre" | "type-sante";

export interface Ecartee extends Plage {
  cle: string;
  source: SourceDetection;
  raison: RaisonEcart;
  /** Un repère sans donnée de santé : le sport Whoop, le type Santé Connect, la cadence arrondie. */
  detail: string | null;
}

export interface ActiviteDetectee extends Plage {
  /** « whoop:<id> », « sante:<appli>:<début> », « pepfit:<début> » : stable d'une lecture à l'autre. */
  cle: string;
  source: SourceDetection;
  fcMoy: number | null;
  fcMax: number | null;
  pas: number | null;
  /** kcal actives mesurées par le capteur (Whoop, montre) ; null sans mesure. */
  kcal: number | null;
  /** Ce que le capteur en disait (« whoop:-1 », « sante:0 ») : un indice pour la reconnaissance. */
  sportBrut: string | null;
}

/**
 * Seuils de la détection côté pepfit (sans Whoop). But : aucune marche ordinaire, aucun escalier, aucun pic de stress.
 *
 * - DUREE_MIN : 15 min d'effort tenu. C'est le seuil de détection automatique de Whoop (ses activités durent au moins
 *   15 min) ; Samsung Health en prend 10, trop court ici (une montée d'escalier et un quai de métro s'enchaînent vite).
 * - RESERVE_MIN : 40 % de la FC de réserve (Karvonen), la borne basse de l'intensité « modérée » de l'ACSM (Garber et al.
 *   2011, position stand) : en dessous, ce n'est pas une séance.
 * - PAUSE_MAX : 3 min sous le seuil sans couper l'effort (changement de côté au padel, feu rouge à vélo, récupération
 *   d'un fractionné).
 * - TROU_MAX : au moins une mesure de FC toutes les 5 min. Une montre qui mesure toutes les 10 min au repos ne prouve rien :
 *   pas de détection plutôt qu'une détection inventée.
 * - Marche : à 60 pas/min ou plus de moyenne, l'effort est surtout de la marche (marche ordinaire ≈ 100 pas/min, le seuil
 *   d'intensité modérée de Tudor-Locke et al. 2018). Elle ne devient une activité qu'à partir de 50 % de la réserve
 *   (marche rapide en côte, randonnée) ; en dessous, ses pas sont déjà comptés dans la dépense (NEAT).
 * - Capteurs (Whoop, Santé Connect) : on garde leur détection, au moins 10 min ; une activité Whoop non nommée faite en
 *   marchant et sous CHARGE_MARCHE_MIN (charge de l'Effort pepfit) est une marche de tous les jours, comme les marches nommées
 *   (whoop/sports.ts).
 */
export const SEUILS = {
  DUREE_MIN: 15 * 60_000,
  RESERVE_MIN: 0.4,
  PAUSE_MAX: 3 * 60_000,
  TROU_MAX: 5 * 60_000,
  CADENCE_MARCHE: 60,
  RESERVE_MARCHE: 0.5,
  DUREE_MIN_CAPTEUR: 10 * 60_000,
} as const;

/** Une détection à moins de 10 min d'une séance est cette séance (échauffement, retour au calme) : comme Whoop (depot.ts). */
export const TOLERANCE_SEANCE = 10 * 60_000;

/** Type ExerciseSessionRecord « autre entraînement » (EXERCISE_TYPE_OTHER_WORKOUT) : une séance sans sport. */
export const TYPES_SANS_SPORT: ReadonlySet<number> = new Set([0]);

/** Applis dont les séances sont les nôtres (natif/sante/logique.ts) : jamais une activité détectée. */
const PAQUETS_PROPRES = new Set(["fit.pep.open", "fit.pep", "us.lug.fonte"]);

const minutes = (p: Plage) => (p.fin - p.debut) / 60_000;

/** Part de la plus courte des deux plages couverte par l'autre (0 à 1). */
export function chevauchement(a: Plage, b: Plage): number {
  const commun = Math.min(a.fin, b.fin) - Math.max(a.debut, b.debut);
  const court = Math.min(a.fin - a.debut, b.fin - b.debut);
  return commun > 0 && court > 0 ? commun / court : 0;
}

const proche = (a: Plage, b: Plage, marge: number) => a.debut < b.fin + marge && b.debut < a.fin + marge;

/** Pas d'une plage, d'après des intervalles de pas (Santé Connect), au prorata de ce qui la recouvre. */
export function pasSur(p: Plage, pas: readonly (Plage & { n: number })[]): number | null {
  if (!pas.length) return null;
  let n = 0;
  for (const x of pas) {
    const commun = Math.min(p.fin, x.fin) - Math.max(p.debut, x.debut);
    if (commun > 0) n += x.fin > x.debut ? (x.n * commun) / (x.fin - x.debut) : x.n;
  }
  return Math.round(n);
}

/** Part de la FC de réserve (Karvonen) : 0 au repos, 1 à la FC max. */
export const partReserve = (bpm: number, fcRepos: number, fcMax: number) => (bpm - fcRepos) / Math.max(1, fcMax - fcRepos);

/** Marche de tous les jours : surtout des pas, sous 50 % de la réserve. */
export function estMarcheOrdinaire(cadence: number | null, reserve: number): boolean {
  return cadence != null && cadence >= SEUILS.CADENCE_MARCHE && reserve < SEUILS.RESERVE_MARCHE;
}

export interface Effort extends Plage {
  fcMoy: number;
  fcMax: number;
  pas: number | null;
}

/**
 * Efforts nets d'une journée côté pepfit, d'après la FC (échantillons de la montre, Santé Connect) et les pas : au moins
 * 15 min au-dessus de 40 % de la réserve (pauses de 3 min au plus), FC mesurée au moins toutes les 5 min, pas une marche
 * ordinaire, loin des séances et du sommeil (`exclusions`, à 10 min près).
 */
export function detecterEfforts(
  fc: readonly { t: number; bpm: number }[],
  pas: readonly (Plage & { n: number })[],
  profil: { fcRepos: number; fcMax: number },
  exclusions: readonly Plage[] = [],
): Effort[] {
  const seuil = profil.fcRepos + SEUILS.RESERVE_MIN * (profil.fcMax - profil.fcRepos);
  const l = [...fc].filter((e) => e.bpm > 0).sort((a, b) => a.t - b.t);
  const segments: { debut: number; dernier: number }[] = [];
  let cur: (typeof segments)[number] | null = null;
  let avant: number | null = null;
  for (const e of l) {
    // un trou de mesure coupe l'effort : on ne sait pas ce qui s'y est passé
    if (cur && avant != null && e.t - avant > SEUILS.TROU_MAX) cur = null;
    if (e.bpm >= seuil) {
      if (!cur) segments.push((cur = { debut: e.t, dernier: e.t }));
      cur.dernier = e.t;
    } else if (cur && e.t - cur.dernier > SEUILS.PAUSE_MAX) cur = null; // la pause dure trop : l'effort est fini
    avant = e.t;
  }
  const out: Effort[] = [];
  for (const s of segments) {
    const p = { debut: s.debut, fin: s.dernier };
    if (p.fin - p.debut < SEUILS.DUREE_MIN) continue;
    if (exclusions.some((x) => proche(p, x, TOLERANCE_SEANCE))) continue;
    // la moyenne s'arrête au dernier point haut : la pause qui suit l'effort n'en fait pas partie
    const dans = l.filter((e) => e.t >= p.debut && e.t <= p.fin).map((e) => e.bpm);
    const fcMoy = Math.round(dans.reduce((a, b) => a + b, 0) / dans.length);
    const n = pasSur(p, pas);
    const cadence = n != null ? n / minutes(p) : null;
    if (estMarcheOrdinaire(cadence, partReserve(fcMoy, profil.fcRepos, profil.fcMax))) continue;
    out.push({ ...p, fcMoy, fcMax: Math.max(...dans), pas: n });
  }
  return out;
}

export interface WhoopBrut extends Plage {
  id: string;
  sportId: number | null;
  /** Charge de l'Effort pepfit de l'activité (chargeWhoop : sa FC par zones, sinon sa durée) ; jamais le score de Whoop. */
  charge: number | null;
  fcMoy: number | null;
  fcMax: number | null;
  /** kcal actives (kJ de Whoop moins le métabolisme : kcalActivesWhoop). */
  kcal: number | null;
  /** Séance pepfit rattachée : alors ce n'est plus une activité à associer. */
  seanceId: string | null;
}

export interface SanteBrut extends Plage {
  type: number;
  origine: string | null;
  kcal: number | null;
  pas: number | null;
}

export interface EntreeJour {
  whoop: readonly WhoopBrut[];
  sante: readonly SanteBrut[];
  /** Efforts détectés par pepfit (detecterEfforts). */
  pepfit: readonly Effort[];
  /** Séances de la journée (pepfit, Hevy, Whoop nommées) : une détection qui les touche est cette séance. */
  seances: readonly Plage[];
  /** Activités que l'utilisateur a ignorées. */
  ignorees: readonly Plage[];
  /** Intervalles de pas de la journée (Santé Connect), pour reconnaître une marche. */
  pasJour?: readonly (Plage & { n: number })[];
  profil?: { fcRepos: number; fcMax: number } | null;
}

/**
 * Activités à associer d'une journée, sans doublon : Whoop d'abord, puis Santé Connect, puis pepfit ; deux détections de
 * la même activité n'en font qu'une (la première garde sa place, les autres comblent ce qui lui manque : pas, FC, kcal).
 * Écartées : celles qui touchent une séance (à 10 min près), celles que l'utilisateur a ignorées (la moitié au moins de
 * l'activité), les marches de tous les jours. `ecartees` dit pourquoi, une ligne par détection (le journal de diagnostic).
 */
export function diagnostiquerJour(e: EntreeJour): { gardees: ActiviteDetectee[]; ecartees: Ecartee[] } {
  const pasJour = e.pasJour ?? [];
  const ecartees: Ecartee[] = [];
  const candidats: ActiviteDetectee[] = [];
  const ecarter = (cle: string, source: SourceDetection, p: Plage, raison: RaisonEcart, detail: string | null = null) =>
    void ecartees.push({ cle, source, debut: p.debut, fin: p.fin, raison, detail });
  for (const w of e.whoop) {
    const cle = `whoop:${w.id}`;
    if (w.seanceId != null) {
      ecarter(cle, "whoop", w, "rattachee");
      continue;
    }
    if (!(w.fin > w.debut) || w.fin - w.debut < SEUILS.DUREE_MIN_CAPTEUR) {
      ecarter(cle, "whoop", w, "trop-courte", `${Math.round(minutes(w))} min`);
      continue;
    }
    if (w.sportId != null && !SPORTS_JOKERS.has(w.sportId)) {
      ecarter(cle, "whoop", w, "sport-nomme", `whoop:${w.sportId}`);
      continue;
    }
    const pas = pasSur(w, pasJour);
    const cadence = pas != null ? pas / minutes(w) : null;
    // Marche de tous les jours : des pas, peu de charge, et un cœur qui ne dépasse pas 50 % de la réserve (la règle de la détection
    // pepfit). Une activité sans zones Whoop (charge de repli : sa durée) mais au cœur haut est un sport, le padel a beaucoup de pas.
    const reserve = w.fcMoy != null && e.profil ? partReserve(w.fcMoy, e.profil.fcRepos, e.profil.fcMax) : null;
    if (cadence != null && cadence >= SEUILS.CADENCE_MARCHE && (w.charge ?? 0) < CHARGE_MARCHE_MIN && !(reserve != null && reserve >= SEUILS.RESERVE_MARCHE)) {
      ecarter(cle, "whoop", w, "marche", `${Math.round(cadence)} pas/min`);
      continue;
    }
    candidats.push({ cle, source: "whoop", debut: w.debut, fin: w.fin, fcMoy: w.fcMoy, fcMax: w.fcMax, pas, kcal: w.kcal, sportBrut: `whoop:${w.sportId ?? -1}` });
  }
  for (const s of e.sante) {
    const cle = `sante:${s.origine ?? "?"}:${s.debut}`;
    if (!TYPES_SANS_SPORT.has(s.type)) {
      ecarter(cle, "sante", s, "type-sante", `sante:${s.type}`);
      continue;
    }
    if (s.origine != null && PAQUETS_PROPRES.has(s.origine)) {
      ecarter(cle, "sante", s, "paquet-propre", s.origine);
      continue;
    }
    if (!(s.fin > s.debut) || s.fin - s.debut < SEUILS.DUREE_MIN_CAPTEUR) {
      ecarter(cle, "sante", s, "trop-courte", `${Math.round(minutes(s))} min`);
      continue;
    }
    candidats.push({
      cle, source: "sante", debut: s.debut, fin: s.fin, fcMoy: null, fcMax: null,
      pas: s.pas ?? pasSur(s, pasJour), kcal: s.kcal, sportBrut: `sante:${s.type}`,
    });
  }
  for (const p of e.pepfit) {
    candidats.push({ cle: `pepfit:${p.debut}`, source: "pepfit", debut: p.debut, fin: p.fin, fcMoy: p.fcMoy, fcMax: p.fcMax, pas: p.pas, kcal: null, sportBrut: null });
  }
  const gardees: ActiviteDetectee[] = [];
  for (const c of candidats) {
    if (e.seances.some((s) => proche(c, s, TOLERANCE_SEANCE))) {
      ecarter(c.cle, c.source, c, "seance-couvrante");
      continue;
    }
    if (e.ignorees.some((i) => chevauchement(c, i) >= 0.5)) {
      ecarter(c.cle, c.source, c, "ignoree");
      continue;
    }
    const meme = gardees.find((g) => chevauchement(g, c) > 0);
    if (meme) {
      meme.pas ??= c.pas;
      meme.fcMoy ??= c.fcMoy;
      meme.fcMax ??= c.fcMax;
      meme.kcal ??= c.kcal;
      continue;
    }
    gardees.push({ ...c });
  }
  return { gardees: gardees.sort((a, b) => a.debut - b.debut), ecartees };
}

export const activitesDuJour = (e: EntreeJour): ActiviteDetectee[] => diagnostiquerJour(e).gardees;

/**
 * kcal brutes (métabolisme compris) d'après la FC moyenne (Keytel et al. 2005, sans VO2max) ; sexe inconnu : la moyenne des
 * deux équations. Sert quand ni Whoop ni la montre ne donnent de kcal (effort détecté par pepfit). null sans poids ni âge.
 */
export function kcalBrutesSelonFc(fcMoy: number, min: number, p: { kg: number | null; age: number | null; sexe: "h" | "f" | null }): number | null {
  if (!p.kg || !p.age || !(min > 0)) return null;
  const h = -55.0969 + 0.6309 * fcMoy + 0.1988 * p.kg + 0.2017 * p.age;
  const f = -20.4022 + 0.4472 * fcMoy - 0.1263 * p.kg + 0.074 * p.age;
  const kjMin = p.sexe === "h" ? h : p.sexe === "f" ? f : (h + f) / 2;
  return Math.max(0, (kjMin / 4.184) * min);
}

/** kcal actives d'après la FC : les brutes moins le métabolisme de la durée. */
export function kcalSelonFc(fcMoy: number, min: number, p: { kg: number | null; age: number | null; sexe: "h" | "f" | null }, bmrKcal: number): number | null {
  const brutes = kcalBrutesSelonFc(fcMoy, min, p);
  return brutes == null ? null : Math.max(0, Math.round(brutes - (bmrKcal / 1440) * min));
}

/** kcal actives à partir de kcal brutes (Whoop : kJ ÷ 4,184 ; Keytel) : le métabolisme de la durée retiré. */
export const activesDepuisBrutes = (brutes: number, min: number, bmrKcal: number) => Math.max(0, brutes - (bmrKcal / 1440) * min);

/**
 * Ce qu'une activité ignorée ajoute aux pas du quotidien (NEAT) : ses pas y sont déjà ; seules ses kcal au-delà de ces pas
 * s'ajoutent. Ses calories restent dans la journée, comptées une fois.
 */
export function kcalQuotidienIgnorees(l: readonly { kcal: number | null; pas: number | null }[], kcalParPas: number): number {
  return l.reduce((a, x) => a + Math.max(0, (x.kcal ?? 0) - (x.pas ?? 0) * kcalParPas), 0);
}
