// VMA, allures d'entraînement et VO2max (NOTES-VMA.md, validée le 29/10). Pur (sans React Native) :
// tests/vma.test.ts.
//
// VMA PAR LE TEST (routine « Test VMA », demi-Cooper) : 6 min à fond après 15 min d'échauffement et deux accélérations de
// 15 s ; VMA (km/h) = distance (m) ÷ 100, c'est la vitesse moyenne des 6 min [run-motion] ; 6 min, parce qu'on tient sa
// VMA environ 6 min en moyenne, à 25 % près d'un coureur à l'autre [Billat 1996] (4 à 7 min selon run-motion).
// VMA SANS TEST : la meilleure portion de 5 à 15 min des courses GPS des 90 derniers jours, corrigée de sa durée par le
// modèle de Péronnet et Thibault : part de la VMA tenue = 1 + IE × ln(t ÷ 6 min), indice d'endurance IE = −6,4 % (moyenne
// des marathoniens, de −4,1 à −10) [Péronnet 1987, 1989] ; ancré à 6 min comme le test. Une portion où la FC moyenne reste
// sous 85 % de la FC max n'a pas été courue à fond : elle ne compte pas (sans FC, elle compte). Une course qui n'est pas
// à fond donne une VMA plus basse : l'estimée est un minimum, marquée « estimée », et monte à chaque course plus rapide.
// VO2MAX : 3,5 × VMA, le coût de la course sur piste de 8 à 25 km/h [Léger 1984] ; sans VMA, Uth : 15,3 × FC max ÷ FC
// repos (homme), 14,5 (femme) [Uth 2004, 2005], 14,9 sans sexe connu (choix : la moyenne des deux).
// CATÉGORIE : percentiles FRIEND pour l'âge et le sexe, VO2max mesurée sur tapis, 7 783 adultes sans souci
// cardiaque connu [Kaminsky 2015, tableau 3] (le Cooper Institute, au même tableau, donne des VO2max prédites).
//
// [run-motion]  run-motion.com/calcul-vma-test (demi-Cooper) et /comment-calculer-son-vo2max (VO2max = 3,5 × VMA).
// [Billat 1996] Billat VL, Koralsztein JP. Significance of the velocity at VO2max and time to exhaustion at this velocity.
//               Sports Med 1996;22(2):90-108. doi:10.2165/00007256-199622020-00004
// [Péronnet]    Péronnet F, Thibault G, Rhodes EC, McKenzie DC. Correlation between ventilatory threshold and endurance
//               capability in marathon runners. Med Sci Sports Exerc 1987;19(6):610-615 ; Péronnet F, Thibault G.
//               Mathematical analysis of running performance and world running records. J Appl Physiol 1989;67:453-465.
// [Léger 1984]  Léger L, Mercier D. Gross energy cost of horizontal treadmill and track running. Sports Med 1984;1:270-277.
//               doi:10.2165/00007256-198401040-00003
// [Uth]         Uth N, Sørensen H, Overgaard K, Pedersen PK. Estimation of VO2max from the ratio between HRmax and HRrest,
//               the Heart Rate Ratio Method. Eur J Appl Physiol 2004;91(1):111-115. doi:10.1007/s00421-003-0988-y ;
//               Uth N, Int J Sports Med 2005 (facteur des femmes), doi:10.1055/s-2005-837443.
// [Kaminsky 2015] Kaminsky LA, Arena R, Myers J. Reference standards for cardiorespiratory fitness measured with
//               cardiopulmonary exercise testing: data from FRIEND. Mayo Clin Proc 2015;90(11):1515-1523.
//               doi:10.1016/j.mayocp.2015.07.026
import { distancesCumulees } from "../../natif/suivi/logique";

const JOUR = 86_400_000;

// ---- Test VMA ------------------------------------------------------------------------------------------------------

export const DUREE_TEST_S = 360;
/** Hors de cette plage, une VMA est une erreur de mesure (débutant ≈ 10 km/h, Kipchoge 24,3 km/h). */
export const VMA_MIN = 6;
export const VMA_MAX = 26;

const plausible = (v: number): boolean => Number.isFinite(v) && v >= VMA_MIN && v <= VMA_MAX;

/** Demi-Cooper : VMA (km/h) = distance des 6 min (m) ÷ 100 ; null hors de 6 à 26 km/h. */
export function vmaDemiCooper(distanceM: number): number | null {
  const v = distanceM / 100;
  return plausible(v) ? v : null;
}

/** Pendant le test : la VMA si tu gardes ta vitesse moyenne jusqu'au bout (null avant 30 s, trop tôt pour la lire). */
export function vmaEnCours(distanceM: number, tempsS: number): number | null {
  if (tempsS < 30) return null;
  const v = (distanceM / tempsS) * 3.6;
  return plausible(v) ? v : null;
}

// ---- Allures ---------------------------------------------------------------------------------------------------------

/** Allure (s/km) à une part de la VMA (95 % de 15 km/h = 14,25 km/h → 252,6 s, 4'13"). */
export const allureA = (vmaKmH: number, part: number): number => 3600 / (vmaKmH * part);

export type IdAllure = "footing" | "marathon" | "seuil" | "long" | "court";

/**
 * Tes allures, en part de la VMA (repères des clubs français : footing 60-70 %, marathon 80 %, seuil 85-90 %, fractionné
 * long 90-95 %, fractionné court 100-105 %) ; chaque routine de course de la boutique vise l'une d'elles.
 */
export const ALLURES: readonly { id: IdAllure; de: number; a: number }[] = [
  { id: "footing", de: 0.6, a: 0.7 },
  { id: "marathon", de: 0.8, a: 0.8 },
  { id: "seuil", de: 0.85, a: 0.9 },
  { id: "long", de: 0.9, a: 0.95 },
  { id: "court", de: 1, a: 1.05 },
];

/** Les allures de la VMA : lente (s/km) à la part basse, rapide à la part haute. */
export function allures(vmaKmH: number): { id: IdAllure; de: number; a: number; lente: number; rapide: number }[] {
  return ALLURES.map((x) => ({ ...x, lente: allureA(vmaKmH, x.de), rapide: allureA(vmaKmH, x.a) }));
}

// ---- VMA estimée des courses ---------------------------------------------------------------------------------------

/** Durées des portions lues (5 à 15 min). */
export const DUREES_PORTION_S = [300, 360, 420, 480, 600, 720, 900] as const;
export const INDICE_ENDURANCE = -0.064;
export const JOURS_ESTIMATION = 90;
/** Part de la FC max sous laquelle une portion n'a pas été courue à fond. */
export const PART_FC_DURE = 0.85;
/** Trou du GPS toléré au bout d'une portion (s). */
const TROU_S = 15;

/** Part de la VMA qu'on tient pendant `dureeS` (Péronnet-Thibault, ancré à 6 min) : 5 min 101 %, 10 min 97 %, 15 min 94 %. */
export const partTenue = (dureeS: number, indice = INDICE_ENDURANCE): number => 1 + indice * Math.log(dureeS / DUREE_TEST_S);

type PointGps = Parameters<typeof distancesCumulees>[0][number];

export interface Portion {
  dureeS: number;
  vitesseKmH: number;
  /** Début de la portion, temps de séance (s). */
  debutS: number;
  fcMoy: number | null;
}

/**
 * Meilleure portion d'une durée donnée : vitesse moyenne la plus haute sur `dureeS` d'horloge (une pause compte comme
 * arrêt, elle ne peut que ralentir). La FC moyenne des échantillons de la portion est jointe.
 */
export function meilleurePortion(points: readonly PointGps[], fc: readonly { t: number; bpm: number }[], dureeS: number): Portion | null {
  if (points.length < 2) return null;
  const d = distancesCumulees(points);
  const ms = dureeS * 1000;
  let meilleur: { i: number; j: number; v: number } | null = null;
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    if (j < i) j = i;
    while (j < points.length && points[j]!.t - points[i]!.t < ms) j++;
    if (j >= points.length) break;
    const dt = points[j]!.t - points[i]!.t;
    if (dt > ms + TROU_S * 1000) continue;
    const v = ((d[j]! - d[i]!) / dt) * 3600;
    if (!meilleur || v > meilleur.v) meilleur = { i, j, v };
  }
  if (!meilleur) return null;
  const de = points[meilleur.i]!.t;
  const a = points[meilleur.j]!.t;
  const dans = fc.filter((f) => f.t >= de && f.t <= a);
  return {
    dureeS,
    vitesseKmH: meilleur.v,
    debutS: points[meilleur.i]!.s / 1000,
    fcMoy: dans.length ? dans.reduce((s, f) => s + f.bpm, 0) / dans.length : null,
  };
}

export interface CourseGps {
  id: string;
  date: number;
  points: readonly PointGps[];
  fc: readonly { t: number; bpm: number }[];
}

export interface VmaEstimee {
  vma: number;
  courseId: string;
  date: number;
  portion: Portion;
  /** Courses lues (des 90 derniers jours). */
  courses: number;
}

/** VMA estimée : la meilleure des portions corrigées de leur durée, sur les courses des 90 derniers jours. */
export function estimerVma(courses: readonly CourseGps[], fcMax: number, maintenant: number): VmaEstimee | null {
  const recentes = courses.filter((c) => c.date <= maintenant && maintenant - c.date <= JOURS_ESTIMATION * JOUR);
  let meilleur: VmaEstimee | null = null;
  for (const c of recentes) {
    for (const duree of DUREES_PORTION_S) {
      const p = meilleurePortion(c.points, c.fc, duree);
      if (!p || (p.fcMoy != null && p.fcMoy < PART_FC_DURE * fcMax)) continue;
      const vma = p.vitesseKmH / partTenue(duree);
      if (plausible(vma) && (!meilleur || vma > meilleur.vma)) meilleur = { vma, courseId: c.id, date: c.date, portion: p, courses: 0 };
    }
  }
  return meilleur && { ...meilleur, courses: recentes.length };
}

// ---- VMA retenue -----------------------------------------------------------------------------------------------------

/** Un test garde sa valeur 6 mois ; au-delà, l'estimée (si elle existe) le remplace. */
export const JOURS_TEST = 182;
/** Une estimée qui dépasse le test de plus de 3 % : tes courses disent que tu as progressé, refais le test. */
export const ECART_REFAIRE = 0.03;

export interface TestVma {
  date: number;
  distanceM: number;
}

export interface VmaRetenue {
  vma: number;
  source: "test" | "estimee";
  date: number;
  /** L'estimée dépasse nettement le test : proposer de le refaire. */
  refaire: boolean;
}

export function vmaRetenue(tests: readonly TestVma[], estimee: Pick<VmaEstimee, "vma" | "date"> | null, maintenant: number): VmaRetenue | null {
  const dernier = [...tests].filter((t) => t.date <= maintenant).sort((a, b) => b.date - a.date)[0];
  const vTest = dernier ? vmaDemiCooper(dernier.distanceM) : null;
  if (dernier && vTest != null && maintenant - dernier.date <= JOURS_TEST * JOUR) {
    return { vma: vTest, source: "test", date: dernier.date, refaire: estimee != null && estimee.vma > vTest * (1 + ECART_REFAIRE) };
  }
  if (estimee) return { vma: estimee.vma, source: "estimee", date: estimee.date, refaire: false };
  if (dernier && vTest != null) return { vma: vTest, source: "test", date: dernier.date, refaire: true };
  return null;
}

// ---- VO2max ----------------------------------------------------------------------------------------------------------

export type Sexe = "h" | "f";

export const vo2maxDeVma = (vmaKmH: number): number => 3.5 * vmaKmH;

/** Facteur d'Uth : 15,3 (homme), 14,5 (femme), 14,9 sans sexe connu. */
export const facteurUth = (sexe: Sexe | null): number => (sexe === "h" ? 15.3 : sexe === "f" ? 14.5 : 14.9);
export const vo2maxUth = (fcMax: number, fcRepos: number, sexe: Sexe | null): number => (facteurUth(sexe) * fcMax) / fcRepos;

export interface Vo2maxRetenue {
  valeur: number;
  methode: "vma-test" | "vma-estimee" | "uth";
}

/** VO2max : 3,5 × VMA quand la VMA existe, sinon Uth (FC max et FC au repos), sinon rien. */
export function vo2maxRetenue(vma: VmaRetenue | null, fcMax: number | null, fcRepos: number | null, sexe: Sexe | null): Vo2maxRetenue | null {
  if (vma) return { valeur: vo2maxDeVma(vma.vma), methode: vma.source === "test" ? "vma-test" : "vma-estimee" };
  if (fcMax != null && fcRepos != null && fcRepos > 0) return { valeur: vo2maxUth(fcMax, fcRepos, sexe), methode: "uth" };
  return null;
}

// ---- Catégorie pour l'âge et le sexe (FRIEND 2015) -------------------------------------------------------------------

export const PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const;

/** Kaminsky 2015, tableau 3 : VO2max (ml/kg/min) aux percentiles 5 à 95, par décennie de 20-29 à 70-79 ans. */
export const FRIEND_2015: Readonly<Record<Sexe, readonly (readonly number[])[]>> = {
  h: [
    [29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3],
    [27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8],
    [24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6],
    [20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7],
    [17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0],
    [16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7],
  ],
  f: [
    [21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0],
    [19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8],
    [17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7],
    [16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9],
    [13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4],
    [13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1],
  ],
};

/** Âge de référence sans âge connu (comme l'adulte de référence de l'énergie). */
export const AGE_REFERENCE = 40;

/** La ligne du tableau : la décennie (sous 20 ans, celle des 20-29 ; au-delà de 79, celle des 70-79) ; sans sexe, la
 *  moyenne des deux lignes. */
export function ligneNormes(age: number | null, sexe: Sexe | null): number[] {
  const i = Math.min(5, Math.max(0, Math.floor(((age ?? AGE_REFERENCE) - 20) / 10)));
  if (sexe) return [...FRIEND_2015[sexe][i]!];
  return FRIEND_2015.h[i]!.map((v, k) => (v + FRIEND_2015.f[i]![k]!) / 2);
}

/** Percentile de la VO2max pour l'âge et le sexe, interpolé entre les colonnes ; sous le 5e : 5, au-delà du 95e : 95. */
export function percentileVo2(vo2: number, age: number | null, sexe: Sexe | null): number {
  const l = ligneNormes(age, sexe);
  if (vo2 <= l[0]!) return PERCENTILES[0];
  for (let k = 1; k < l.length; k++) {
    if (vo2 <= l[k]!) return PERCENTILES[k - 1]! + ((vo2 - l[k - 1]!) / (l[k]! - l[k - 1]!)) * (PERCENTILES[k]! - PERCENTILES[k - 1]!);
  }
  return PERCENTILES[PERCENTILES.length - 1]!;
}

export type Categorie = "faible" | "moyenne" | "bonne" | "tresBonne" | "excellente";
/** Bornes des catégories, en percentiles (les colonnes du tableau FRIEND) : < 25, 25-50, 50-75, 75-90, ≥ 90. */
export const CATEGORIES: readonly { id: Categorie; des: number }[] = [
  { id: "faible", des: 0 },
  { id: "moyenne", des: 25 },
  { id: "bonne", des: 50 },
  { id: "tresBonne", des: 75 },
  { id: "excellente", des: 90 },
];

export function categorieVo2(vo2: number, age: number | null, sexe: Sexe | null): Categorie {
  const p = percentileVo2(vo2, age, sexe);
  let c: Categorie = "faible";
  for (const x of CATEGORIES) if (p >= x.des) c = x.id;
  return c;
}

/** Valeurs de VO2max des bornes des catégories pour la jauge de la page (25e, 50e, 75e, 90e percentiles). */
export function bornesCategories(age: number | null, sexe: Sexe | null): { p25: number; p50: number; p75: number; p90: number } {
  const l = ligneNormes(age, sexe);
  return { p25: l[2]!, p50: l[3]!, p75: l[4]!, p90: l[5]! };
}

/** Rampe des catégories (planche) : cinq segments de même largeur ; bornes = 5e, 25e, 50e, 75e, 90e et 95e percentiles. */
export function bornesRampe(age: number | null, sexe: Sexe | null): number[] {
  const l = ligneNormes(age, sexe);
  return [l[0]!, l[2]!, l[3]!, l[4]!, l[5]!, l[6]!];
}

/** Position du repère sur la rampe (0 à 1), interpolée dans le segment de sa catégorie. */
export function positionRampe(vo2: number, age: number | null, sexe: Sexe | null): number {
  const b = bornesRampe(age, sexe);
  for (let i = 0; i < 5; i++) {
    if (vo2 < b[i + 1]! || i === 4) return Math.min(1, Math.max(0, (i + Math.min(1, Math.max(0, (vo2 - b[i]!) / (b[i + 1]! - b[i]!)))) / 5));
  }
  return 1;
}
