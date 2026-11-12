// Âge pepfit (planche pas, NOTES § 1 quater et « Méthode de l'âge pepfit », D17 fixé le 29/10) : estimation de forme, pas
// un avis médical. Pur (sans React Native) : tests/mesures-age.test.ts.
//
// MÉTHODE
// 1. Neuf facteurs, chacun en moyenne sur 6 mois glissants (182 jours avant le lundi du calcul) ; la moyenne de 30 jours est
//    montrée pour voir le sens. Un facteur sans donnée n'apporte rien (« pas de donnée »), jamais estimé.
// 2. Chaque facteur a une courbe de risque de mortalité toutes causes tirée d'une méta-analyse ou d'une grande cohorte : des
//    points (valeur, ln RR) relevés dans l'étude, reliés par segments, plats au-delà des bornes (on n'extrapole pas).
// 3. Conversion en années par la loi de Gompertz : la mortalité adulte double environ tous les 8 ans, donc un risque
//    multiplié par RR équivaut à ln(RR) / ln(2) × 8 années d'âge (Fedichev 2018, d'après Gompertz 1825 ; Gavrilov et
//    Gavrilova). Impact d'un facteur = années(valeur) − années(valeur neutre), borné à ±3 ans.
// 4. Âge pepfit = âge réel + somme des impacts. Recalcul chaque lundi (0 h) : l'âge ne suit pas le bruit d'un jour.
// 5. Rythme de vieillissement = (âge pepfit − âge pepfit 26 semaines plus tôt) ÷ 0,5 an, soit 1 + variation de l'écart ÷ 0,5
//    (1x : l'âge pepfit avance avec le calendrier ; 0,5x : deux fois moins vite).
//
// RÉFÉRENCES (vérifiées le 29/10/2026)
// [pas]   Paluch AE et al. Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts. Lancet Public
//         Health 2022;7(3):e219-e228. doi:10.1016/S2468-2667(21)00302-9. Quartiles (médianes 3 553, 5 801, 7 842,
//         10 901 pas/j) : HR 1 ; 0,60 ; 0,55 ; 0,47.
// [vo2]   Kodama S et al. Cardiorespiratory fitness as a quantitative predictor of all-cause mortality and cardiovascular
//         events in healthy men and women: a meta-analysis. JAMA 2009;301(19):2024-2035. doi:10.1001/jama.2009.681,
//         PMID 19454641. RR 0,87 par MET (1 MET = 3,5 ml/kg/min).
// [fc]    Zhang D, Shen X, Qi X. Resting heart rate and all-cause and cardiovascular mortality in the general population: a
//         meta-analysis. CMAJ 2016;188(3):E53-E63. doi:10.1503/cmaj.150535, PMID 26598376. RR 1,09 par 10 bpm, relation
//         linéaire à partir de 45 bpm.
// [duree] Cappuccio FP, D'Elia L, Strazzullo P, Miller MA. Sleep duration and all-cause mortality: a systematic review and
//         meta-analysis of prospective studies. Sleep 2010;33(5):585-592. doi:10.1093/sleep/33.5.585. Court (souvent < 7 h,
//         jusqu'à < 5 h) RR 1,12 ; long (> 8-9 h) RR 1,30 ; référence 7-8 h.
// [regul] Windred DP et al. Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective
//         cohort study. Sleep 2024;47(1):zsad253. doi:10.1093/sleep/zsad253, PMID 37738616. Quintiles de l'indice de
//         régularité (médianes 65,1 ; 75,6 ; 81,0 ; 85,2 ; 89,8) : HR 1 ; 0,80 ; 0,75 ; 0,72 ; 0,70 (modèle complet).
//         La régularité Whoop (sleep_consistency) est une mesure voisine de cet indice, pas la même : approximation.
// [modere] Arem H et al. Leisure time physical activity and mortality: a detailed pooled analysis of the dose-response
//         relationship. JAMA Intern Med 2015;175(6):959-967. doi:10.1001/jamainternmed.2015.0533. Par rapport à aucune
//         activité : < 150 min/sem HR 0,80 ; 150-300 : 0,69 ; 300-450 : 0,63 ; 450-750 : 0,61.
// [intense] Lee DH et al. Long-term leisure-time physical activity intensity and all-cause and cause-specific mortality: a
//         prospective cohort of US adults. Circulation 2022;146(7):523-534. doi:10.1161/CIRCULATIONAHA.121.058162.
//         Intense 75-149 min/sem contre aucune : HR 0,81 (ajusté sur l'activité modérée) ; 2 à 4 fois plus : 2 à 4 % de mieux.
// [muscu] Momma H et al. Muscle-strengthening activities are associated with lower risk and mortality in major
//         non-communicable diseases: a systematic review and meta-analysis of cohort studies. Br J Sports Med
//         2022;56:755-763. doi:10.1136/bjsports-2021-105061. Baisse maximale de 10 à 20 % vers 30-60 min/sem (prise ici
//         à 15 %, RR 0,85), courbe en J au-delà : on la tient plate (pas de bonus ni de pénalité inventés).
// [maigre] Srikanthan P, Karlamangla AS. Muscle mass index as a predictor of longevity in older adults. Am J Med
//         2014;127(6):547-553. doi:10.1016/j.amjmed.2014.02.007, PMID 24561114. 4e quartile contre 1er : HR 0,80.
//         L'étude mesure un indice de masse musculaire (impédance), pas un % de masse maigre : le RR est porté sur la plage
//         usuelle du % de masse maigre (homme 70 → 86 %, femme 60 → 78 %) : approximation.
// [gompertz] Fedichev PO. Hacking aging: a strategy to use big data from medical studies to extend human life. Front Genet
//         2018;9:483. doi:10.3389/fgene.2018.00483 (doublement de la mortalité ~ tous les 8 ans, loi de Gompertz, 1825).
//
// VALEURS NEUTRES (impact nul) : régularité 81 (médiane UK Biobank, Windred) ; durée 7 h à 8 h (référence de Cappuccio) ;
// pas 8 000 (repère de la planche, entre les 3e et 4e quartiles) ; activité modérée 150 min/sem (repère OMS) ; intense et
// musculation 0 (la plupart des adultes n'en font pas : seul un bonus) ; VO₂ max 33 ml/kg/min (≈ 9,4 MET, milieu de la
// catégorie intermédiaire de Kodama) ; FC au repos 70 bpm (milieu de la plage usuelle 60-80) ; masse maigre : milieu de
// la plage (homme 78 %, femme 69 %).

export const ANS_PAR_LN = 8 / Math.LN2;
export const BORNE_ANS = 3;
export const FENETRE_JOURS = 182;
export const FENETRE_COURTE = 30;
export const SEMAINES = 30;
const JOUR = 86_400_000;

export type IdFacteur = "regularite" | "duree" | "pasJour" | "zones13" | "zones45" | "muscu" | "vo2" | "fcRepos" | "maigre";
export type GroupeAge = "sommeil" | "effort" | "forme";
export const GROUPES: readonly GroupeAge[] = ["sommeil", "effort", "forme"];
/** Ordre d'affichage (planche). */
export const FACTEURS: readonly IdFacteur[] = ["regularite", "duree", "pasJour", "zones13", "zones45", "muscu", "vo2", "fcRepos", "maigre"];
export type UniteFacteur = "pct" | "h" | "nbPas" | "minSem" | "vo2" | "bpm";

export interface DefFacteur {
  id: IdFacteur;
  groupe: GroupeAge;
  unite: UniteFacteur;
  /** (valeur, ln RR) croissants en valeur ; plat au-delà. */
  points: readonly (readonly [number, number])[];
  /** Valeur d'impact nul (ou plage [a, b] : nul entre les deux). */
  neutre: number;
  /** Rail : bornes affichées et zone claire favorable. */
  rail: { min: number; max: number; favorable: readonly [number, number] };
  /** Repère écrit dans « À travailler ». */
  repere: number;
  reference: string;
}

const ln = Math.log;

export function definitions(sexe: "h" | "f" | null): Record<IdFacteur, DefFacteur> {
  const maigre: [number, number] = sexe === "f" ? [60, 78] : [70, 86];
  const kVo2 = ln(0.87) / 3.5;
  return {
    regularite: {
      id: "regularite", groupe: "sommeil", unite: "pct",
      points: [[65.1, 0], [75.62, ln(0.8)], [80.99, ln(0.75)], [85.22, ln(0.72)], [89.8, ln(0.7)]],
      neutre: 81, rail: { min: 40, max: 100, favorable: [85, 100] }, repere: 85, reference: "regul",
    },
    duree: {
      id: "duree", groupe: "sommeil", unite: "h",
      points: [[5.5, ln(1.12)], [7, 0], [8, 0], [9.5, ln(1.3)]],
      neutre: 7.5, rail: { min: 5, max: 10, favorable: [7, 8] }, repere: 7.5, reference: "duree",
    },
    pasJour: {
      id: "pasJour", groupe: "effort", unite: "nbPas",
      points: [[3553, 0], [5801, ln(0.6)], [7842, ln(0.55)], [10901, ln(0.47)]],
      neutre: 8000, rail: { min: 2000, max: 14000, favorable: [8000, 14000] }, repere: 8000, reference: "steps",
    },
    zones13: {
      id: "zones13", groupe: "effort", unite: "minSem",
      points: [[0, 0], [75, ln(0.8)], [225, ln(0.69)], [375, ln(0.63)], [600, ln(0.61)]],
      neutre: 150, rail: { min: 0, max: 420, favorable: [150, 420] }, repere: 150, reference: "modere",
    },
    zones45: {
      id: "zones45", groupe: "effort", unite: "minSem",
      points: [[0, 0], [112, ln(0.81)], [225, ln(0.81 * 0.97)]],
      neutre: 0, rail: { min: 0, max: 120, favorable: [75, 120] }, repere: 75, reference: "intense",
    },
    muscu: {
      id: "muscu", groupe: "effort", unite: "minSem",
      points: [[0, 0], [45, ln(0.85)]],
      neutre: 0, rail: { min: 0, max: 240, favorable: [30, 240] }, repere: 60, reference: "muscu",
    },
    vo2: {
      id: "vo2", groupe: "forme", unite: "vo2",
      points: [[20, 20 * kVo2], [60, 60 * kVo2]],
      neutre: 33, rail: { min: 25, max: 60, favorable: [45, 60] }, repere: 45, reference: "vo2",
    },
    fcRepos: {
      id: "fcRepos", groupe: "forme", unite: "bpm",
      points: [[45, 0], [90, 4.5 * ln(1.09)]],
      neutre: 70, rail: { min: 40, max: 80, favorable: [40, 55] }, repere: 55, reference: "fc",
    },
    maigre: {
      id: "maigre", groupe: "forme", unite: "pct",
      points: [[maigre[0], 0], [maigre[1], ln(0.8)]],
      neutre: (maigre[0] + maigre[1]) / 2, rail: { min: maigre[0] - 5, max: maigre[1] + 4, favorable: [maigre[1] - 2, maigre[1] + 4] }, repere: maigre[1], reference: "maigre",
    },
  };
}

/** ln RR de la courbe du facteur à `x` (plat au-delà des points). */
export function lnRR(points: readonly (readonly [number, number])[], x: number): number {
  if (!points.length) return 0;
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1]![1];
}

/** Impact en années (négatif : plus jeune), borné à ±3. */
export function impactAns(def: DefFacteur, x: number | null): number {
  if (x == null || !Number.isFinite(x)) return 0;
  const a = (lnRR(def.points, x) - lnRR(def.points, def.neutre)) * ANS_PAR_LN;
  return Math.max(-BORNE_ANS, Math.min(BORNE_ANS, a));
}

/** Position (0 → 1) d'une valeur sur le rail du facteur. */
export function positionRail(def: DefFacteur, x: number): number {
  return Math.max(0, Math.min(1, (x - def.rail.min) / (def.rail.max - def.rail.min)));
}

// ---- Historique -------------------------------------------------------------------------------------------------------

export interface HistoriqueAge {
  /** Nuits (jour de réveil = minuit local), minutes de sommeil, régularité Whoop (%) si connue. */
  nuits: readonly { jour: number; minutes: number | null; regularite: number | null }[];
  /** Pas par jour (minuit local). */
  pas: readonly { jour: number; pas: number }[];
  /** Séances Whoop (minutes par zone 0 à 5). */
  seancesWhoop: readonly { debut: number; zones: readonly number[] | null }[];
  /** Premier jour où Whoop a des données (couverture des zones), null sans Whoop. */
  debutWhoop: number | null;
  /** Séances pepfit mesurées à la FC hors Whoop (capteur, Santé Connect) : minutes de Z1 à Z5 (seance_charge.zones). */
  seancesFc?: readonly { debut: number; zones: readonly number[] }[];
  /** Première d'entre elles (couverture des zones), null sans elles. */
  debutFc?: number | null;
  /** Séances pepfit terminées (minutes). */
  muscu: readonly { debut: number; minutes: number }[];
  debutMuscu: number | null;
  fcRepos: readonly { date: number; valeur: number }[];
  /** % de masse maigre. */
  maigre: readonly { date: number; valeur: number }[];
  vo2: readonly { date: number; valeur: number }[];
}

/** Moyennes d'un facteur sur [debut, fin). */
export type Valeurs = Record<IdFacteur, number | null>;

const MIN_JOURS = 7;
const MIN_COUVERTURE = 14;

function moyenneSi<T>(l: readonly T[], dedans: (x: T) => boolean, v: (x: T) => number | null, min: number): number | null {
  let s = 0, n = 0;
  for (const x of l) {
    if (!dedans(x)) continue;
    const y = v(x);
    if (y == null || !Number.isFinite(y)) continue;
    s += y;
    n++;
  }
  return n >= min ? s / n : null;
}

/** Total par semaine sur la part de [debut, fin) couverte par la source (depuis `premier`) ; null sous 14 jours. */
function parSemaine(total: number, debut: number, fin: number, premier: number | null): number | null {
  if (premier == null) return null;
  const jours = (fin - Math.max(debut, premier)) / JOUR;
  return jours >= MIN_COUVERTURE ? (total / jours) * 7 : null;
}

export function valeursEntre(h: HistoriqueAge, debut: number, fin: number): Valeurs {
  const dans = (t: number) => t >= debut && t < fin;
  const minDaily = Math.min(MIN_JOURS, Math.max(1, Math.round((fin - debut) / JOUR / 4)));
  // zones 1 à 5 : Whoop range 0 à 5 (la zone 0, sous 50 %, ne compte pas), seance_charge Z1 à Z5 (indices 0 à 4)
  const zones = (a: number, b: number) =>
    h.seancesWhoop.filter((s) => dans(s.debut) && s.zones).reduce((t, s) => t + s.zones!.slice(a, b + 1).reduce((x, y) => x + y, 0), 0) +
    (h.seancesFc ?? []).filter((s) => dans(s.debut)).reduce((t, s) => t + s.zones.slice(a - 1, b).reduce((x, y) => x + y, 0), 0);
  const debutZones = h.debutWhoop != null && h.debutFc != null ? Math.min(h.debutWhoop, h.debutFc) : (h.debutWhoop ?? h.debutFc ?? null);
  const muscu = h.muscu.filter((s) => dans(s.debut)).reduce((t, s) => t + s.minutes, 0);
  return {
    regularite: moyenneSi(h.nuits, (x) => dans(x.jour), (x) => x.regularite, minDaily),
    duree: moyenneSi(h.nuits, (x) => dans(x.jour), (x) => (x.minutes != null && x.minutes > 0 ? x.minutes / 60 : null), minDaily),
    pasJour: moyenneSi(h.pas, (x) => dans(x.jour), (x) => x.pas, minDaily),
    zones13: parSemaine(zones(1, 3), debut, fin, debutZones),
    zones45: parSemaine(zones(4, 5), debut, fin, debutZones),
    muscu: parSemaine(muscu, debut, fin, h.debutMuscu),
    vo2: moyenneSi(h.vo2, (x) => dans(x.date), (x) => x.valeur, 1),
    fcRepos: moyenneSi(h.fcRepos, (x) => dans(x.date), (x) => x.valeur, minDaily),
    maigre: moyenneSi(h.maigre, (x) => dans(x.date), (x) => x.valeur, 1),
  };
}

// ---- Calcul d'une semaine ---------------------------------------------------------------------------------------------

export interface FacteurCalcule {
  id: IdFacteur;
  groupe: GroupeAge;
  /** Moyenne 6 mois (celle qui compte) et 30 jours (le sens). */
  v6: number | null;
  v30: number | null;
  impact: number;
}

export interface SemaineAge {
  /** Lundi du calcul (minuit local). */
  lundi: number;
  ageReel: number;
  /** Âge pepfit, null si moins de 3 facteurs ont une donnée (pas de point). */
  age: number | null;
  ecart: number;
  facteurs: FacteurCalcule[];
  groupes: Record<GroupeAge, number>;
  nbDonnees: number;
}

export const MIN_FACTEURS = 3;

/** Âge réel (années décimales) à `t`, d'après la date de naissance. */
export function ageA(naissance: number, t: number): number {
  return (t - naissance) / (365.2425 * JOUR);
}

export function calculerSemaine(h: HistoriqueAge, lundi: number, naissance: number, sexe: "h" | "f" | null): SemaineAge {
  const defs = definitions(sexe);
  const v6 = valeursEntre(h, lundi - FENETRE_JOURS * JOUR, lundi);
  const v30 = valeursEntre(h, lundi - FENETRE_COURTE * JOUR, lundi);
  const facteurs = FACTEURS.map((id): FacteurCalcule => ({ id, groupe: defs[id].groupe, v6: v6[id], v30: v30[id], impact: impactAns(defs[id], v6[id]) }));
  const groupes = { sommeil: 0, effort: 0, forme: 0 } as Record<GroupeAge, number>;
  for (const f of facteurs) groupes[f.groupe] += f.impact;
  const ecart = facteurs.reduce((s, f) => s + f.impact, 0);
  const nbDonnees = facteurs.filter((f) => f.v6 != null).length;
  const ageReel = ageA(naissance, lundi);
  return { lundi, ageReel, age: nbDonnees >= MIN_FACTEURS ? ageReel + ecart : null, ecart, facteurs, groupes, nbDonnees };
}

// ---- Calendrier -------------------------------------------------------------------------------------------------------

/** Lundi 0 h de la semaine de `t` (heure locale). */
export function lundiDe(t: number): number {
  const d = new Date(t);
  const dec = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dec).getTime();
}

/** Le lundi `n` semaines avant celui de `t` (juste aux changements d'heure). */
export function lundiAvant(t: number, n: number): number {
  const d = new Date(lundiDe(t));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7 * n).getTime();
}

/** Prochain recalcul : le lundi qui suit, et le nombre de jours d'ici là (1 à 7). */
export function prochainCalcul(maintenant: number): { lundi: number; jours: number } {
  const lundi = lundiAvant(maintenant, -1);
  const d = new Date(maintenant);
  const auj = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { lundi, jours: Math.max(1, Math.round((lundi - auj) / JOUR)) };
}

/** Les 30 dernières semaines (la plus ancienne d'abord), chaque lundi recalculé avec l'historique d'alors. */
export function semaines(h: HistoriqueAge, maintenant: number, naissance: number, sexe: "h" | "f" | null, n = SEMAINES): SemaineAge[] {
  return Array.from({ length: n }, (_, i) => calculerSemaine(h, lundiAvant(maintenant, n - 1 - i), naissance, sexe));
}

/**
 * Semaines comparables (D1 des statistiques, décision du 29/10) : chaque semaine passée est recalculée sur les
 * MÊMES facteurs que ceux mesurés aujourd'hui (la dernière semaine) ; une semaine qui ne les a pas tous n'a pas de point.
 * Sans ça, une source qui arrive en cours de période (Whoop relié il y a 2 mois) fait sauter l'âge sans que la forme ait
 * bougé (−6,8 ans sur la démo). La dernière semaine ne change pas ; `facteurs` garde les valeurs brutes de chaque semaine.
 */
export function semainesComparables(l: readonly SemaineAge[]): SemaineAge[] {
  const derniere = l[l.length - 1];
  if (!derniere) return [];
  const actuels = new Set(derniere.facteurs.filter((f) => f.v6 != null).map((f) => f.id));
  return l.map((s) => {
    if (s === derniere) return s;
    const retenus = s.facteurs.filter((f) => actuels.has(f.id));
    const complete = retenus.length === actuels.size && retenus.every((f) => f.v6 != null);
    const groupes = { sommeil: 0, effort: 0, forme: 0 } as Record<GroupeAge, number>;
    for (const f of retenus) groupes[f.groupe] += f.impact;
    const ecart = retenus.reduce((t, f) => t + f.impact, 0);
    return { ...s, ecart, groupes, age: complete && actuels.size >= MIN_FACTEURS ? s.ageReel + ecart : null };
  });
}

/**
 * Rythme de vieillissement : 1 + (écart d'aujourd'hui − écart d'il y a 26 semaines) ÷ 0,5, sur les seuls facteurs mesurés
 * aux deux dates : un facteur qui n'a de donnée que d'un côté (Whoop relié depuis 4 mois) changerait l'écart sans que la
 * forme ait bougé. Null sans les deux points ou avec moins de 3 facteurs communs.
 */
export function rythme(l: readonly SemaineAge[], i = l.length - 1, recul = 26): number | null {
  const a = l[i], b = l[i - recul];
  if (!a || !b || a.age == null || b.age == null) return null;
  const avant = new Map(b.facteurs.filter((f) => f.v6 != null).map((f) => [f.id, f.impact]));
  const communs = a.facteurs.filter((f) => f.v6 != null && avant.has(f.id));
  if (communs.length < MIN_FACTEURS) return null;
  return 1 + communs.reduce((s, f) => s + f.impact - avant.get(f.id)!, 0) / 0.5;
}

/** Facteur qui rajeunit le plus, et celui à travailler (le plus défavorable), parmi ceux qui ont une donnée. */
export function extremes(f: readonly FacteurCalcule[]): { meilleur: FacteurCalcule | null; pire: FacteurCalcule | null } {
  const l = f.filter((x) => x.v6 != null);
  if (!l.length) return { meilleur: null, pire: null };
  const tri = [...l].sort((a, b) => a.impact - b.impact);
  const meilleur = tri[0]!.impact < 0 ? tri[0]! : null;
  const pire = tri[tri.length - 1]!.impact > 0 ? tri[tri.length - 1]! : null;
  return { meilleur, pire };
}
