// Règle des macros (docs/MACROS-SOURCES.md § 9, décisions D1 à D14 validée le 1/11) : de la dépense d'entretien
// aux protéines, lipides, glucides, fibres et sucres du jour, avec les garde-fous d'éligibilité. Pur (ni base, ni React Native) :
// l'appli et le serveur MCP l'appellent avec les mêmes entrées (tests/macros-regle.test.ts). Tout ce qui s'affiche passe par
// des clés de dictionnaire (macros.*, i18n/dico-fr/macros.ts) : cette règle ne rend jamais un texte. Pas d'écran ici.
import { densiteVariation, GRAS_DEFAUT } from "../ecrans/energie-precision";

export type SexeRegle = "h" | "f" | "x";
export type TypeJour = "entrainement" | "repos";
export type TypeObjectif = "maintien" | "prise" | "seche" | "recomposition";
export type NiveauEntrainement = "debutant" | "intermediaire" | "avance";
/** Activité hors sport (planche Objectifs). */
export type Activite = "assise" | "debout" | "physique";

/** D1 : sources de la dépense d'entretien, de la plus fiable à la moins fiable. */
export type SourceDepense = "mesuree" | "calculee" | "formule";
export type MethodeRepos = "mifflin" | "tenHaaf";
export type StatutNutrition = "ok" | "limite" | "non_calcule";

/** Facteurs d'activité hors sport (D1, § 2.2) : « assise » relevé de 1,2 à 1,35 (minimum durable de l'EFSA). */
export const ACTIVITE_HORS_SPORT = 1.4;
export const FACTEUR_ACTIVITE: Record<Activite, number> = { assise: 1.35, debout: ACTIVITE_HORS_SPORT, physique: 1.6 };
/** Dépense nette moyenne d'une séance (kcal), sans le repos de la même durée. */
export const DEPENSE_SEANCE_KCAL = 300;

/** Tous les paramètres de la règle, un seul endroit (§ 9.3). */
export const REGLE = {
  /** D1 : fenêtre de la dépense mesurée et jours d'apports qu'il lui faut. */
  fenetreJours: 28,
  minJoursApports: 14,
  /** Perte récente (en 12 semaines) à partir de laquelle la formule est réduite, et la réduction. */
  perteRecentePct: 5,
  reductionPerteRecente: 0.05,
  /** Incertitude annoncée (%) : mesure lissée, formule. */
  incertitudePct: { mesuree: 5, calculee: 10, formule: 10 },
  /** Ten Haaf à la place de Mifflin : au moins 3 séances par semaine depuis 8 semaines. */
  seancesTenHaaf: 3,
  /** D4 : taux de perte (% du poids par semaine) et plafonds du déficit. */
  tauxSeche: { maigre: 0.5, normal: 0.5, surpoids: 0.75, obese: 1.0 },
  grasMaigrePct: { h: 15, f: 25, x: 20 },
  deficitMaxPct: 0.2,
  deficitMaxPctObese: 0.25,
  deficitMaxKcal: 750,
  /** D6 : excédent de la prise (part de la dépense), au plus 500 kcal par jour ; recomposition. */
  excedentPct: { debutant: 0.15, intermediaire: 0.1, avance: 0.05 },
  excedentMaxKcal: 500,
  recompositionPct: 0.05,
  recompositionPctDebutantOuSurpoids: 0.1,
  /** Planchers d'énergie : par sexe, et 30 kcal par kg de maigre (+ la séance du jour). */
  plancherKcal: { h: 1500, f: 1200, x: 1350 },
  plancherParKgMaigre: 30,
  /** D7 : protéines en g par kg de poids de référence. */
  proteines: {
    maintien: 1.8,
    prise: 1.8,
    recomposition: 2.0,
    seche: 2.0,
    secheForte: 2.2,
    seuilSecheForte: 0.15,
    bonusMaigre: 0.2,
    bonus50: 0.2,
    age65: 1.4,
    age65Deficit: 1.6,
    age65Max: 1.6,
    min: 1.2,
    max: 2.4,
    partMaxKcal: 0.35,
    limiteSante: { min: 1.2, max: 1.6 },
    allaitementG: 19,
  },
  /** D8 : lipides, part de l'énergie moyenne de la semaine, plancher par sexe (g/kg), plancher et plafond en % des calories du jour. */
  lipides: { part: 0.25, plancherParKg: { h: 0.6, f: 0.8, x: 0.8 }, plancherPart: 0.2, plafondPart: 0.35 },
  /** D9 : bandes de glucides (g/kg), plancher absolu (g/j). */
  glucidesParKg: {
    repos: [3, 5],
    force: [4, 7],
    modere: [5, 7],
    long: [6, 10],
    tresLong: [8, 12],
  } as Record<"repos" | "force" | "modere" | "long" | "tresLong", [number, number]>,
  glucidesPlancherG: 130,
  /** D10, D11 : repères (jamais un plafond imposé pour les fibres ; jamais un objectif pour les sucres). */
  fibres: { minG: 25, parMilleKcal: 14 },
  sucres: { maxG: 100, partKcal: 0.2 },
  /** D5 : gain de maigre au plus, en % du poids par mois, selon le niveau ; réduit avec l'âge. */
  gainMaigreMoisPct: { debutant: 1.0, intermediaire: 0.5, avance: 0.25 },
  /** Au-delà d'une année pour gagner le maigre visé, la cible est jugée irréaliste. */
  moisMaxCible: 12,
  /** Grossesse et âge. */
  ageMajorite: 18,
  ageSenior: 65,
  allaitementKcal: 500,
} as const;

export const SEMAINES_PAR_MOIS = 52 / 12;

export interface Declarations {
  grossesse?: boolean;
  allaitement?: boolean;
  troubleAlimentaire?: boolean;
  diabeteOuRein?: boolean;
  traitementObesite?: boolean;
  chirurgieBariatrique?: boolean;
}

export interface ProfilRegle {
  sexe: SexeRegle;
  age: number;
  tailleCm: number;
  poidsKg: number;
  /** % de gras mesuré (null : valeur de population quand il en faut une). */
  grasPct: number | null;
  niveau: NiveauEntrainement;
  activite: Activite;
  declarations: Declarations;
}

export interface ObjectifRegle {
  type: TypeObjectif;
  /** Rythme voulu en % du poids par semaine (positif) ; null : le plafond de la règle. */
  rythmeSouhaitePctSemaine: number | null;
  poidsCibleKg: number | null;
  grasCiblePct: number | null;
}

export interface ChargeRegle {
  seancesParSemaine: number;
  depenseNetteSeanceKcal: number;
  jour: TypeJour;
  /** Effort du jour d'entraînement : musculation (défaut) ou endurance, et sa durée. */
  effort?: "force" | "endurance";
  dureeEffortMin?: number | null;
  /** Au moins 3 séances par semaine depuis 8 semaines (Ten Haaf). */
  regulier8Semaines?: boolean;
}

export interface HistoriqueRegle {
  /** Dépense mesurée par pepfit (recalée sur le poids), moyenne de 28 jours, et jours d'apports tenus. */
  depenseMesuree28j: { kcal: number; joursAvecApports: number } | null;
  depenseCalculee28j: number | null;
  /** Perte de poids des 12 dernières semaines (% du plus haut poids), null si inconnue. */
  perteRecentePct12Sem: number | null;
  /** Jours de la fenêtre dont les apports viennent du journal (même quand il en manque pour mesurer la dépense). */
  joursAvecApports28j?: number;
}

export const HISTORIQUE_VIDE: HistoriqueRegle = { depenseMesuree28j: null, depenseCalculee28j: null, perteRecentePct12Sem: null };

export interface OptionsRegle {
  /** D9 : l'alerte « glucides bas » est facultative (vrai par défaut). */
  alerteGlucides?: boolean;
}

/** Évaluation d'une cible de composition (D5) : le gain de maigre visé, ce que les repères permettent, et une fourchette. */
export interface EvaluationCible {
  /** Masse maigre à gagner (kg ; négatif : à perdre) pour atteindre le poids et le % cibles. */
  gainMaigreKg: number;
  /** Repère : gain de maigre au plus par mois, et fourchette réaliste (moitié du plafond au plafond). */
  plafondMoisKg: number;
  fourchetteMoisKg: [number, number];
  /** Mois qu'il faudrait au plafond pour gagner ce maigre ; null s'il n'y en a pas à gagner. */
  moisPourCible: number | null;
  /** Mois que laisse le rythme de poids choisi ; null sans rythme. */
  moisSelonRythme: number | null;
  realiste: boolean;
  /** Maigre gagnable sur la durée du rythme (ou du plafond), de la moitié du plafond au plafond. */
  fourchetteMaigreKg: [number, number] | null;
  /** D16 : cible irréaliste → étape à 6 mois au même % de gras (« Viser 79 kg à 12,2 % ») ; null si la cible tient ou sans étape utile. */
  etape: EtapeCible | null;
}

/** D16 : étape réaliste à 6 mois : le plafond de gain de maigre du niveau sur 6 mois, au % de gras de la cible. */
export interface EtapeCible {
  mois: number;
  /** Poids de l'étape arrondi au demi-kilo (la valeur proposée à la personne et écrite comme cible) et sans arrondi. */
  poidsKg: number;
  poidsExactKg: number;
  grasPct: number;
  gainMaigreKg: number;
}

/** D18 : une valeur en kcal arrondie à la dizaine, avec sa fourchette (la marge est l'incertitude de la source de dépense). */
export interface Affichage {
  valeur: number;
  bas: number;
  haut: number;
}

export interface ResultatNutrition {
  statut: StatutNutrition;
  /** Clés de raisons (macros.raison.*) : pourquoi le statut n'est pas « ok ». */
  raisons: string[];
  /** Clés de renvoi (macros.renvoi.*) vers un professionnel ; vide si statut « ok ». */
  renvois: string[];
  /** Mode sans chiffres : ni calories ni macros à afficher. */
  sansChiffres: boolean;
  /** Valeurs du jour demandé ; null si non calculé ou sans chiffres. */
  kcal: number | null;
  proteinesG: number | null;
  lipidesG: number | null;
  glucidesG: number | null;
  fibresMinG: number | null;
  sucresRepereG: number | null;
  /** Énergie moyenne de la semaine (dépense d'entretien + écart). */
  kcalMoyenneSemaine: number | null;
  depenseEntretienKcal: number | null;
  source: SourceDepense | null;
  methodeRepos: MethodeRepos | null;
  ecartKcal: number | null;
  rythmeEffectifPctSemaine: number | null;
  planchersAppliques: string[];
  /** Clés d'alertes (macros.alerte.*). */
  alertes: string[];
  /** Ajustements appliqués à la dépense (perteRecente, allaitement). */
  ajustements: string[];
  incertitudePct: number | null;
  /** Source 1 absente : « estimation à affiner après deux semaines de journal et de pesées ». */
  estimationAAffiner: boolean;
  cible: EvaluationCible | null;
  /** Clés d'information (macros.info.*), par exemple le message facultatif du cycle (D13). */
  infos: string[];
  /** D14 : clé de la mention « repères généraux ». */
  mention: string;
  /** D18 : kcal du jour, dépense d'entretien et écart arrondis à la dizaine ; la fourchette = valeur ± incertitude de la source. */
  kcalAffichees: Affichage | null;
  depenseAffichee: Affichage | null;
  ecartAfficheKcal: number | null;
  /** D15 : excédent de la prise en part de la dépense (0,10 pour 10 %) ; null hors prise. */
  excedentPctDepense: number | null;
  /** D17 : l'activité hors sport ne sert qu'à la formule : visible seulement quand la dépense vient de la formule. */
  activiteVisible: boolean;
  /** Jours de journal tenus sur les 14 qu'il faut pour mesurer la dépense (null quand elle est mesurée). */
  joursJournal: { tenus: number; requis: number; restants: number } | null;
  /** D9 : glucides du jour en g par kg de poids de référence, et la bande de repère du jour. */
  glucidesParKg: number | null;
  bandeGlucidesParKg: [number, number] | null;
  /** D4 : plafond du rythme de sèche (% du poids et kg par semaine) ; null hors sèche. */
  rythmeMax: { pctSemaine: number; kgSemaine: number } | null;
}

/** D14 : la mention (texte : macros.mention dans les dictionnaires fr et en). */
export const CLE_MENTION = "macros.mention";

// ---- Corps ---------------------------------------------------------------------------------------------------------------

export const imc = (kg: number, cm: number) => kg / (cm / 100) ** 2;
/** Poids de l'IMC 30 : le poids réel est plafonné à lui pour les protéines et les lipides (Weijs 2025). */
export const poidsImc30 = (cm: number) => 30 * (cm / 100) ** 2;
export const poidsReference = (kg: number, cm: number) => Math.min(kg, poidsImc30(cm));

const grasDefaut = (s: SexeRegle) => GRAS_DEFAUT[s === "h" ? "h" : s === "f" ? "f" : "inconnu"];
const grasPctDe = (p: Pick<ProfilRegle, "sexe" | "grasPct">) => (p.grasPct != null && p.grasPct > 2 && p.grasPct < 70 ? p.grasPct : grasDefaut(p.sexe));
const grasKgDe = (p: Pick<ProfilRegle, "sexe" | "grasPct" | "poidsKg">) => (p.poidsKg * grasPctDe(p)) / 100;

// ---- D3 : formules de repos (Cunningham et « Katch-McArdle » retirées) ----------------------------------------------------

/** Mifflin-St Jeor, poids réel (Frankenfield 2013) ; sexe « x » : la moyenne des deux constantes (−78). */
export function metabolismeMifflin(p: { sexe: SexeRegle; tailleCm: number; poidsKg: number; age: number }): number {
  return 10 * p.poidsKg + 6.25 * p.tailleCm - 5 * p.age + (p.sexe === "h" ? 5 : p.sexe === "f" ? -161 : -78);
}

/** Ten Haaf et Weijs 2014, à base de poids (sportifs récréatifs de 18 à 35 ans ; extrapolée au-delà). Sexe « x » : moitié du terme. */
export function metabolismeTenHaaf(p: { sexe: SexeRegle; tailleCm: number; poidsKg: number; age: number }): number {
  const terme = p.sexe === "h" ? 191.027 : p.sexe === "f" ? 0 : 191.027 / 2;
  return 11.936 * p.poidsKg + 587.728 * (p.tailleCm / 100) - 8.129 * p.age + terme + 29.279;
}

export function reposFormule(p: { sexe: SexeRegle; tailleCm: number; poidsKg: number; age: number }, regulier: boolean): { kcal: number; methode: MethodeRepos } {
  return regulier ? { kcal: metabolismeTenHaaf(p), methode: "tenHaaf" } : { kcal: metabolismeMifflin(p), methode: "mifflin" };
}

// ---- D5 : gain de maigre -------------------------------------------------------------------------------------------------

/** Âge : × 0,75 dès 50 ans, × 0,5 dès 65 ans (choix prudent, preuve faible). */
export const facteurAgeMaigre = (age: number) => (age >= 65 ? 0.5 : age >= 50 ? 0.75 : 1);

/** Gain de masse maigre au plus par mois (kg) : 1,0 / 0,5 / 0,25 % du poids selon le niveau. Un repère, pas une promesse. */
export const plafondMaigreMoisKg = (poidsKg: number, niveau: NiveauEntrainement, age: number) =>
  ((poidsKg * REGLE.gainMaigreMoisPct[niveau]) / 100) * facteurAgeMaigre(age);

/** Niveau d'entraînement d'après l'ancienneté de pratique : moins d'un an débutant, un à trois ans intermédiaire, au-delà avancé. */
export const niveauDepuisAnnees = (annees: number): NiveauEntrainement => (annees < 1 ? "debutant" : annees <= 3 ? "intermediaire" : "avance");

/** Mois de l'étape proposée quand la cible est irréaliste (D16). */
export const MOIS_ETAPE = 6;

/** D16 : le poids qu'on atteint en MOIS_ETAPE mois au plafond de gain de maigre du niveau, au même % de gras que la cible. */
function etapeCible(a: { poidsKg: number; grasPct: number; cibleKg: number | null; grasCiblePct: number }, plafondMoisKg: number): EtapeCible | null {
  const gainMaigreKg = plafondMoisKg * MOIS_ETAPE;
  const maigreEtape = a.poidsKg * (1 - a.grasPct / 100) + gainMaigreKg;
  const poidsExactKg = maigreEtape / (1 - a.grasCiblePct / 100);
  const poidsKg = Math.round(poidsExactKg * 2) / 2;
  // pas d'étape qui ne ferait pas prendre de poids, ni qui dépasserait la cible
  if (!(poidsKg > a.poidsKg) || (a.cibleKg != null && poidsKg >= a.cibleKg)) return null;
  return { mois: MOIS_ETAPE, poidsKg, poidsExactKg, grasPct: a.grasCiblePct, gainMaigreKg };
}

/**
 * La cible (poids, % de gras) demande-t-elle plus de maigre que les repères ne le permettent ? Le maigre à gagner est comparé
 * au plafond mensuel du niveau, sur le temps du rythme de poids choisi et sur une année au plus. Sinon une fourchette.
 */
export function evaluerCible(a: {
  poidsKg: number;
  grasPct: number;
  cibleKg: number | null;
  grasCiblePct: number;
  niveau: NiveauEntrainement;
  age: number;
  /** kg par semaine, signe indifférent ; 0 ou null sans rythme. */
  rythmeKgSemaine?: number | null;
}): EvaluationCible {
  const p1 = a.cibleKg ?? a.poidsKg;
  const gainMaigreKg = p1 * (1 - a.grasCiblePct / 100) - a.poidsKg * (1 - a.grasPct / 100);
  const plafondMoisKg = plafondMaigreMoisKg(a.poidsKg, a.niveau, a.age);
  const fourchetteMoisKg: [number, number] = [plafondMoisKg / 2, plafondMoisKg];
  const moisPourCible = gainMaigreKg > 0 ? gainMaigreKg / plafondMoisKg : null;
  const r = Math.abs(a.rythmeKgSemaine ?? 0);
  const ecartPoids = Math.abs(p1 - a.poidsKg);
  const moisSelonRythme = r > 0 && ecartPoids >= 1 ? ecartPoids / r / SEMAINES_PAR_MOIS : null;
  const realiste = gainMaigreKg <= 0 || (moisPourCible! <= REGLE.moisMaxCible && (moisSelonRythme == null || gainMaigreKg <= plafondMoisKg * moisSelonRythme));
  // sans rythme (la prise suit le niveau, D15) : sur le temps qu'il faut, une année au plus
  const duree = moisSelonRythme ?? (moisPourCible != null ? Math.min(moisPourCible, REGLE.moisMaxCible) : null);
  const fourchetteMaigreKg: [number, number] | null = gainMaigreKg > 0 && duree != null ? [fourchetteMoisKg[0] * duree, fourchetteMoisKg[1] * duree] : null;
  return { gainMaigreKg, plafondMoisKg, fourchetteMoisKg, moisPourCible, moisSelonRythme, realiste, fourchetteMaigreKg, etape: realiste ? null : etapeCible(a, plafondMoisKg) };
}

// ---- D4, D6 : écart d'énergie ---------------------------------------------------------------------------------------------

/** Taux de perte plafond (% du poids par semaine) : 0,5 si maigre ou IMC < 25, 0,75 de 25 à 29,9, 1,0 dès 30. */
export function tauxSecheMax(p: Pick<ProfilRegle, "sexe" | "grasPct" | "poidsKg" | "tailleCm">): number {
  const i = imc(p.poidsKg, p.tailleCm);
  const maigre = p.grasPct != null && p.grasPct <= REGLE.grasMaigrePct[p.sexe];
  if (maigre || i < 25) return REGLE.tauxSeche.maigre;
  return i < 30 ? REGLE.tauxSeche.surpoids : REGLE.tauxSeche.obese;
}

interface EcartCalcule {
  kcal: number;
  /** Écart refusé ou ramené par une règle (pour l'alerte). */
  ramene: boolean;
  refuse: boolean;
}

/** Écart d'énergie par jour (négatif : déficit), avant planchers et garde-fous de statut. */
function ecartEnergie(p: ProfilRegle, o: ObjectifRegle, dee: number): EcartCalcule {
  const i = imc(p.poidsKg, p.tailleCm);
  const densite = densiteVariation(grasKgDe(p));
  const kcalParPct = (p.poidsKg * densite) / 100 / 7; // kcal par jour pour 1 % du poids par semaine
  if (o.type === "maintien") return { kcal: 0, ramene: false, refuse: false };
  if (o.type === "seche") {
    const taux = tauxSecheMax(p);
    const pct = o.rythmeSouhaitePctSemaine != null ? Math.min(o.rythmeSouhaitePctSemaine, taux) : taux;
    const parTaux = pct * kcalParPct;
    const plafond = (i >= 30 ? REGLE.deficitMaxPctObese : REGLE.deficitMaxPct) * dee;
    const deficit = Math.min(parTaux, plafond, REGLE.deficitMaxKcal);
    const voulu = o.rythmeSouhaitePctSemaine;
    return { kcal: -deficit, ramene: voulu != null && deficit < voulu * kcalParPct - 1, refuse: false };
  }
  if (o.type === "prise") {
    // D15 : l'excédent suit le niveau d'entraînement (15 / 10 / 5 % de la dépense, 500 kcal au plus), plus un rythme en kg par semaine
    return { kcal: Math.min(REGLE.excedentPct[p.niveau] * dee, REGLE.excedentMaxKcal), ramene: false, refuse: false };
  }
  const pct = p.niveau === "debutant" || i >= 25 ? REGLE.recompositionPctDebutantOuSurpoids : REGLE.recompositionPct;
  return { kcal: -pct * dee, ramene: false, refuse: false };
}

/** Rythme réel en % du poids par semaine pour un écart quotidien (signe indifférent). */
const rythmePct = (p: ProfilRegle, ecartKcal: number) => (Math.abs(ecartKcal) * 7) / (p.poidsKg * densiteVariation(grasKgDe(p))) * 100;

// ---- D9 : bande de glucides du jour -----------------------------------------------------------------------------------------

export function bandeGlucides(c: Pick<ChargeRegle, "jour" | "effort" | "dureeEffortMin">): [number, number] {
  if (c.jour === "repos") return REGLE.glucidesParKg.repos;
  if (c.effort !== "endurance") return REGLE.glucidesParKg.force;
  const d = c.dureeEffortMin ?? 60;
  if (d < 30) return REGLE.glucidesParKg.repos;
  if (d <= 90) return REGLE.glucidesParKg.modere;
  return d <= 240 ? REGLE.glucidesParKg.long : REGLE.glucidesParKg.tresLong;
}

// ---- Garde-fous (D12) ---------------------------------------------------------------------------------------------------------

const RENVOI = {
  mineur: "mineur",
  grossesse: "grossesse",
  allaitement: "allaitement",
  troubleAlimentaire: "professionnel",
  imcBas: "professionnel",
  perteImcBas: "professionnel",
  diabeteOuRein: "medecinOuDiet",
  traitementObesite: "medecinOuDiet",
  chirurgieBariatrique: "medecinOuDiet",
  age65: "medecin",
} as const;

const nul = (statut: StatutNutrition, raisons: string[], sansChiffres: boolean): ResultatNutrition => ({
  statut,
  raisons,
  renvois: [...new Set(raisons.map((r) => RENVOI[r as keyof typeof RENVOI]).filter(Boolean))],
  sansChiffres,
  kcal: null,
  proteinesG: null,
  lipidesG: null,
  glucidesG: null,
  fibresMinG: null,
  sucresRepereG: null,
  kcalMoyenneSemaine: null,
  depenseEntretienKcal: null,
  source: null,
  methodeRepos: null,
  ecartKcal: null,
  rythmeEffectifPctSemaine: null,
  planchersAppliques: [],
  alertes: [],
  ajustements: [],
  incertitudePct: null,
  estimationAAffiner: false,
  cible: null,
  infos: [],
  mention: CLE_MENTION,
  kcalAffichees: null,
  depenseAffichee: null,
  ecartAfficheKcal: null,
  excedentPctDepense: null,
  activiteVisible: false,
  joursJournal: null,
  glucidesParKg: null,
  bandeGlucidesParKg: null,
  rythmeMax: null,
});

/** Étape 0 : statut et raisons. `sansChiffres` : pas de calories ni de macros affichés (trouble déclaré, IMC bas). */
export function gardeFous(p: ProfilRegle, o: ObjectifRegle): { statut: StatutNutrition; raisons: string[]; sansChiffres: boolean } {
  const d = p.declarations;
  const dur: string[] = [];
  if (p.age < REGLE.ageMajorite) dur.push("mineur");
  if (d.grossesse) dur.push("grossesse");
  if (dur.length) return { statut: "non_calcule", raisons: dur, sansChiffres: true };
  const raisons: string[] = [];
  let sansChiffres = false;
  if (d.allaitement) raisons.push("allaitement");
  if (d.troubleAlimentaire) (raisons.push("troubleAlimentaire"), (sansChiffres = true));
  if (imc(p.poidsKg, p.tailleCm) < 18.5) (raisons.push("imcBas"), (sansChiffres = true));
  if (o.poidsCibleKg != null && o.poidsCibleKg < p.poidsKg && imc(o.poidsCibleKg, p.tailleCm) < 20) (raisons.push("perteImcBas"), (sansChiffres = true));
  if (d.diabeteOuRein) raisons.push("diabeteOuRein");
  if (d.traitementObesite) raisons.push("traitementObesite");
  if (d.chirurgieBariatrique) raisons.push("chirurgieBariatrique");
  if (p.age >= REGLE.ageSenior) raisons.push("age65");
  return { statut: raisons.length ? "limite" : "ok", raisons, sansChiffres };
}

// ---- La règle -----------------------------------------------------------------------------------------------------------------

const arr = Math.round;
/** D18 : arrondi à la dizaine, et fourchette ± `marge` kcal. */
const dizaine = (x: number) => Math.round(x / 10) * 10;
const affichage = (valeur: number, marge: number): Affichage => ({ valeur: dizaine(valeur), bas: dizaine(valeur - marge), haut: dizaine(valeur + marge) });
const borner = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Objectifs d'un jour (§ 9.2). Appelée une fois pour un jour de repos et une fois pour un jour d'entraînement avec les mêmes
 * profil, objectif et historique : la moyenne de la semaine redonne exactement dépense d'entretien + écart.
 */
export function objectifNutrition(
  profil: ProfilRegle,
  objectif: ObjectifRegle,
  charge: ChargeRegle,
  historique: HistoriqueRegle = HISTORIQUE_VIDE,
  options: OptionsRegle = {},
): ResultatNutrition {
  const p = profil;
  const g = gardeFous(p, objectif);
  if (g.statut === "non_calcule" || g.sansChiffres) return nul(g.statut, g.raisons, g.sansChiffres);
  const decl = p.declarations;
  const alertes: string[] = [];
  const ajustements: string[] = [];
  const planchersAppliques: string[] = [];
  const infos: string[] = [];
  const n = Math.max(0, charge.seancesParSemaine);
  const S = charge.depenseNetteSeanceKcal;
  const parSeance = (n / 7) * S;
  const refKg = poidsReference(p.poidsKg, p.tailleCm);
  const maigreKg = p.poidsKg - grasKgDe(p);

  // Étape 1 : dépense d'entretien (D1). Source 1 mesurée, sinon calculée, sinon formule × facteur hors sport + séances.
  let dee: number;
  let source: SourceDepense;
  let methodeRepos: MethodeRepos | null = null;
  const m = historique.depenseMesuree28j;
  if (m && m.joursAvecApports >= REGLE.minJoursApports && m.kcal > 0) {
    dee = m.kcal;
    source = "mesuree";
  } else if (historique.depenseCalculee28j != null && historique.depenseCalculee28j > 0) {
    dee = historique.depenseCalculee28j;
    source = "calculee";
  } else {
    const repos = reposFormule(p, charge.regulier8Semaines ?? false);
    methodeRepos = repos.methode;
    dee = repos.kcal * FACTEUR_ACTIVITE[p.activite] + parSeance;
    source = "formule";
  }
  if (source !== "mesuree" && historique.perteRecentePct12Sem != null && historique.perteRecentePct12Sem >= REGLE.perteRecentePct) {
    dee *= 1 - REGLE.reductionPerteRecente;
    ajustements.push("perteRecente");
  }
  if (decl.allaitement && source !== "mesuree") {
    dee += REGLE.allaitementKcal;
    ajustements.push("allaitement");
  }
  const incertitudePct = REGLE.incertitudePct[source];

  // Étape 2 : écart d'énergie (D4, D6), puis garde-fous de statut sur l'écart (D12).
  const e = ecartEnergie(p, objectif, dee);
  let ecart = e.kcal;
  if (decl.allaitement) ecart = 0;
  if (decl.diabeteOuRein || decl.traitementObesite || decl.chirurgieBariatrique) ecart = Math.max(0, ecart);
  let deficitAutorise = ecart < 0;
  if (p.age >= REGLE.ageSenior && ecart < 0) {
    // 65 ans et plus : déficit refusé sauf IMC ≥ 30, alors au plus 10 % de la dépense
    if (imc(p.poidsKg, p.tailleCm) >= 30) ecart = -Math.min(-ecart, 0.1 * dee);
    else ecart = 0;
    deficitAutorise = ecart < 0;
  }
  if (objectif.type !== "maintien" && objectif.type !== "prise" && ecart === 0 && (g.statut === "limite" || e.refuse)) alertes.push("deficitRefuse");
  if (e.ramene && ecart !== 0) alertes.push("rythmeRamene");

  // Étapes 3 et 4 : énergie moyenne de la semaine, plancher (sexe, 30 kcal par kg de maigre et séances à la semaine).
  let moyenne = dee + ecart;
  const plancherSexe = REGLE.plancherKcal[p.sexe];
  const plancherMoyen = Math.max(plancherSexe, REGLE.plancherParKgMaigre * maigreKg + parSeance);
  if (moyenne < plancherMoyen) {
    moyenne = plancherMoyen;
    ecart = moyenne - dee;
    planchersAppliques.push("energie");
    alertes.push("plancherEnergie");
  }

  // Étape 5 : cohérence hebdomadaire, plancher jour par jour.
  const kcalRepos = moyenne - parSeance;
  const kcalEntrainement = kcalRepos + S;
  const plancherRepos = Math.max(plancherSexe, REGLE.plancherParKgMaigre * maigreKg);
  const plancherEntrainement = Math.max(plancherSexe, REGLE.plancherParKgMaigre * maigreKg + S);
  const entrainement = charge.jour === "entrainement";
  let kcal = entrainement ? kcalEntrainement : kcalRepos;
  const plancherJour = entrainement ? plancherEntrainement : plancherRepos;
  if (kcal < plancherJour) {
    kcal = plancherJour;
    if (!planchersAppliques.includes("energie")) planchersAppliques.push("energieJour");
  }

  // Étape 6 : protéines (D7), g par kg de poids de référence.
  const P = REGLE.proteines;
  // sans déficit (refusé par un garde-fou), les protéines sont celles du maintien
  const typeEffectif: TypeObjectif = (objectif.type === "seche" || objectif.type === "recomposition") && ecart >= 0 ? "maintien" : objectif.type;
  const secheOuRecompo = typeEffectif === "seche" || typeEffectif === "recomposition";
  const deficitPct = ecart < 0 ? -ecart / dee : 0;
  let gKg: number;
  if (p.age >= REGLE.ageSenior) gKg = deficitAutorise ? P.age65Deficit : P.age65;
  else {
    gKg = typeEffectif === "seche" ? (deficitPct > P.seuilSecheForte ? P.secheForte : P.seche) : P[typeEffectif];
    const maigreProfil = p.grasPct != null && p.grasPct <= REGLE.grasMaigrePct[p.sexe];
    if (secheOuRecompo && ecart < 0 && maigreProfil) gKg += P.bonusMaigre;
    if (p.age >= 50) gKg += P.bonus50;
  }
  gKg = p.age >= REGLE.ageSenior ? Math.min(gKg, P.age65Max) : gKg;
  gKg = borner(gKg, P.min, P.max);
  if (decl.diabeteOuRein || decl.traitementObesite || decl.chirurgieBariatrique) gKg = borner(gKg, P.limiteSante.min, P.limiteSante.max);
  let proteinesG = Math.min(gKg * refKg, (P.partMaxKcal * kcal) / 4);
  if (decl.allaitement) proteinesG += P.allaitementG;
  proteinesG = arr(proteinesG);

  // Étape 7 : lipides (D8), 25 % de l'énergie moyenne en grammes constants, plancher par sexe et en % du jour, plafond 35 %.
  const L = REGLE.lipides;
  const plancherLipides = Math.max(L.plancherParKg[p.sexe] * refKg, (L.plancherPart * kcal) / 9);
  const plafondLipides = (L.plafondPart * kcal) / 9;
  let lipidesG = borner((L.part * moyenne) / 9, plancherLipides, Math.max(plafondLipides, plancherLipides));

  // Étape 8 : glucides (D9) = le reste ; sous la bande du jour, les lipides baissent jusqu'à leur plancher, puis une alerte.
  const bande = bandeGlucides(charge);
  const minBande = bande[0] * refKg;
  let glucidesG = (kcal - 4 * proteinesG - 9 * arr(lipidesG)) / 4;
  if (glucidesG < minBande) {
    const liberes = ((minBande - glucidesG) * 4) / 9;
    lipidesG = Math.max(plancherLipides, lipidesG - liberes);
    glucidesG = (kcal - 4 * proteinesG - 9 * arr(lipidesG)) / 4;
  }
  lipidesG = arr(lipidesG);
  glucidesG = Math.max(0, arr((kcal - 4 * proteinesG - 9 * lipidesG) / 4));
  if (glucidesG < minBande && options.alerteGlucides !== false) alertes.push("glucidesBas");
  if (glucidesG < REGLE.glucidesPlancherG) alertes.push("glucidesSousPlancher");

  // Étape 9 : repères (D10, D11).
  const fibresMinG = arr(Math.max(REGLE.fibres.minG, (REGLE.fibres.parMilleKcal * kcal) / 1000));
  const sucresRepereG = arr(Math.min(REGLE.sucres.maxG, (REGLE.sucres.partKcal * kcal) / 4));

  // Cible de composition (D5) et mentions.
  let cible: EvaluationCible | null = null;
  if (p.grasPct != null && objectif.grasCiblePct != null) {
    cible = evaluerCible({ poidsKg: p.poidsKg, grasPct: p.grasPct, cibleKg: objectif.poidsCibleKg, grasCiblePct: objectif.grasCiblePct, niveau: p.niveau, age: p.age, rythmeKgSemaine: objectif.type !== "prise" && objectif.rythmeSouhaitePctSemaine != null ? (objectif.rythmeSouhaitePctSemaine * p.poidsKg) / 100 : null });
    if (!cible.realiste) alertes.push("cibleMaigreIrrealiste");
  }
  if (source !== "mesuree") alertes.push("estimationAAffiner");
  const marge = (incertitudePct / 100) * dee;
  const tenus = historique.joursAvecApports28j ?? historique.depenseMesuree28j?.joursAvecApports ?? 0;
  // D4 : plafond du rythme de sèche (taux, puis 20 ou 25 % de la dépense et 750 kcal par jour, en % du poids par semaine)
  let rythmeMax: ResultatNutrition["rythmeMax"] = null;
  if (objectif.type === "seche") {
    const densite = densiteVariation(grasKgDe(p));
    const kcalParPct = (p.poidsKg * densite) / 100 / 7;
    const plafondKcal = Math.min((imc(p.poidsKg, p.tailleCm) >= 30 ? REGLE.deficitMaxPctObese : REGLE.deficitMaxPct) * dee, REGLE.deficitMaxKcal);
    const pct = Math.min(tauxSecheMax(p), plafondKcal / kcalParPct);
    rythmeMax = { pctSemaine: Math.round(pct * 100) / 100, kgSemaine: Math.round(((pct * p.poidsKg) / 100) * 100) / 100 };
  }
  if (p.sexe === "f") infos.push("cycle"); // D13 : un message facultatif, jamais un ajustement

  return {
    statut: g.statut,
    raisons: g.raisons,
    renvois: [...new Set(g.raisons.map((r) => RENVOI[r as keyof typeof RENVOI]).filter(Boolean))],
    sansChiffres: false,
    kcal: arr(kcal),
    proteinesG,
    lipidesG,
    glucidesG,
    fibresMinG,
    sucresRepereG,
    kcalMoyenneSemaine: arr(moyenne),
    depenseEntretienKcal: arr(dee),
    source,
    methodeRepos,
    ecartKcal: arr(ecart),
    rythmeEffectifPctSemaine: ecart === 0 ? 0 : Math.round(rythmePct(p, ecart) * 100) / 100,
    planchersAppliques,
    alertes,
    ajustements,
    incertitudePct,
    estimationAAffiner: source !== "mesuree",
    cible,
    infos,
    mention: CLE_MENTION,
    kcalAffichees: affichage(kcal, marge),
    depenseAffichee: affichage(dee, marge),
    ecartAfficheKcal: dizaine(ecart),
    excedentPctDepense: objectif.type === "prise" && ecart > 0 ? Math.round((ecart / dee) * 1000) / 1000 : null,
    activiteVisible: source === "formule",
    joursJournal: source === "mesuree" ? null : { tenus, requis: REGLE.minJoursApports, restants: Math.max(0, REGLE.minJoursApports - tenus) },
    glucidesParKg: Math.round((glucidesG / refKg) * 10) / 10,
    bandeGlucidesParKg: bande,
    rythmeMax,
  };
}
