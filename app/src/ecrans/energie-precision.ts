// Énergie adaptative (NOTES-ENERGIE.md) : une valeur toujours affichée, plus ou moins précise selon les données. Métabolisme
// sans profil (valeurs de population), incertitude de chaque terme de la dépense, niveau de précision, conseil pour gagner
// en précision, apports estimés par les habitudes du journal, dépense recalée sur l'évolution du poids. Pur, sans base
// ni React Native (tests/energie-precision.test.ts).

const JOUR = 86_400_000;

/** Minuit local `n` jours plus loin (changement d'heure compris). */
export function decaler(jour: number, n: number): number {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

// ---- Précision ------------------------------------------------------------------------------------------------------

export type Precision = "faible" | "moyenne" | "bonne" | "elevee";
export const PRECISIONS: readonly Precision[] = ["faible", "moyenne", "bonne", "elevee"];

/** Écart type relatif (σ ÷ valeur) → niveau : < 6 % élevée, < 10 % bonne, < 14 % moyenne, au-delà faible. */
export const SEUILS_PRECISION = { elevee: 0.06, bonne: 0.1, moyenne: 0.14 } as const;

export function precisionDe(sigma: number, valeur: number): Precision {
  const r = valeur > 0 ? sigma / valeur : 1;
  if (r < SEUILS_PRECISION.elevee) return "elevee";
  if (r < SEUILS_PRECISION.bonne) return "bonne";
  if (r < SEUILS_PRECISION.moyenne) return "moyenne";
  return "faible";
}

/** Somme d'incertitudes indépendantes. */
export const quadratique = (...l: number[]) => Math.sqrt(l.reduce((a, x) => a + x * x, 0));

// ---- Métabolisme sans profil complet -------------------------------------------------------------------------------

export type ManqueProfil = "poids" | "taille" | "age" | "sexe";

export interface ProfilPartiel {
  sexe: "h" | "f" | null;
  kg: number | null;
  cm: number | null;
  age: number | null;
}

/** Adulte de référence (France, Esteban 2014-2016 : médianes de poids ; tailles moyennes) quand une donnée manque. */
export const DEFAUTS_PROFIL = {
  kg: { h: 78, f: 64, inconnu: 71 },
  cm: { h: 176, f: 163, inconnu: 170 },
  age: 40,
} as const;

/** Dispersion de la population adulte (écart type) : poids 15 kg, taille 9 cm, âge 15 ans. */
export const ECARTS_POPULATION = { kg: 15, cm: 9, age: 15 } as const;

/** Erreur propre de chaque méthode pour un individu (relative, NOTES-ENERGIE § 1). */
export const ERREUR_METHODE = { balance: 0.07, katch: 0.07, cunningham: 0.08, mifflin: 0.08, harris: 0.09, defaut: 0.08 } as const;

/**
 * Mifflin-St Jeor avec ce qu'on a : chaque donnée absente prend la valeur de l'adulte de référence et ajoute son
 * incertitude (coefficient × écart de la population) ; sexe inconnu : la moyenne des deux constantes (±83).
 */
export function mifflinPartiel(p: ProfilPartiel): { kcal: number; sigma: number; manques: ManqueProfil[] } {
  const cle = p.sexe ?? "inconnu";
  const kg = p.kg ?? DEFAUTS_PROFIL.kg[cle];
  const cm = p.cm ?? DEFAUTS_PROFIL.cm[cle];
  const age = p.age ?? DEFAUTS_PROFIL.age;
  const constante = p.sexe === "h" ? 5 : p.sexe === "f" ? -161 : -78;
  const kcal = 10 * kg + 6.25 * cm - 5 * age + constante;
  const absents = { poids: p.kg == null, taille: p.cm == null, age: p.age == null, sexe: p.sexe == null };
  const manques = (["poids", "taille", "age", "sexe"] as const).filter((m) => absents[m]);
  return { kcal, sigma: quadratique(ERREUR_METHODE.defaut * kcal, ...manques.map((m) => GAIN_PROFIL[m])), manques };
}

/** Incertitude qu'ajoute chaque donnée absente du profil, donc ce qu'on gagne à la donner (kcal). */
export const GAIN_PROFIL: Record<ManqueProfil, number> = {
  poids: 10 * ECARTS_POPULATION.kg,
  taille: 6.25 * ECARTS_POPULATION.cm,
  age: 5 * ECARTS_POPULATION.age,
  sexe: 83,
};

// ---- Incertitude des termes de la dépense ------------------------------------------------------------------------

/** Pas d'une journée sans capteur : 5 000 (seuil du mode de vie sédentaire, Tudor-Locke 2013). */
export const PAS_DEFAUT = 5000;
/** NEAT : pas mesurés → ±25 % des kcal des pas, plus 5 % du métabolisme (activité hors pas) ; pas inconnus → ±12 % du métabolisme. */
export const ERREUR_NEAT = { pas: 0.25, horsPas: 0.05, inconnu: 0.12 } as const;
/** Sport : calculé à la FC (Keytel 2005, r² ≈ 0,73 sans VO2max) ±25 %, comme une montre (Shcherbina 2017 : ≥ 20 % pour tous
 * les bracelets) ; estimé aux MET ±40 %. */
export const ERREUR_SPORT = { fc: 0.25, met: 0.4 } as const;
/** Digestion : 10 % des apports, 8 à 15 % selon le repas → ±25 % du terme. */
export const ERREUR_DIGESTION = 0.25;

// ---- Conseil ------------------------------------------------------------------------------------------------------

// Ce qui ferait gagner le plus en précision : une étape de la précision pepfit (precision/modele.ts, conseilDepense), la
// meilleure qui fait monter la dépense ; une seule source pour la page Énergie et la page Précision (PRECISION.md § 2.6).

// ---- Apports estimés par les habitudes ------------------------------------------------------------------------

export interface ApportJour {
  /** Minuit local. */
  jour: number;
  kcal: number;
}

/** Fenêtre des habitudes (le dernier mois de journal), seuil des moyennes par jour de semaine, recul maximal. */
export const FENETRE_HABITUDES = 28;
export const SEUIL_JOUR_SEMAINE = 14;
export const RECUL_HABITUDES = 90;
/** Un jour d'apports varie d'environ 25 % autour de la moyenne quand on ne peut pas le mesurer. */
const VARIATION_APPORTS = 0.25;

export interface ApportsEstimes {
  kcal: number;
  /** « moyenne » : tous les jours renseignés (moins de 14) ; « jourSemaine » : les mêmes jours de semaine (14 et plus). */
  methode: "moyenne" | "jourSemaine";
  /** Jours qui font la moyenne. */
  n: number;
  /** Jours renseignés de la fenêtre. */
  jours: number;
  sigma: number;
  precision: Precision;
}

/**
 * Apports d'un jour sans journal : le dernier mois renseigné avant ce jour (28 jours finissant au dernier jour tenu, pas plus
 * de 90 jours en arrière). Moins de 14 jours tenus → moyenne des jours tenus ; 14 et plus → moyenne des mêmes jours de
 * semaine (le lundi, les lundis), ou de tous s'il n'y en a aucun. null sans aucun jour tenu.
 */
export function apportsHabitudes(journal: readonly ApportJour[], jour: number): ApportsEstimes | null {
  const recul = decaler(jour, -RECUL_HABITUDES);
  const avant = journal.filter((a) => a.jour < jour && a.jour >= recul && a.kcal > 0);
  if (!avant.length) return null;
  const dernier = Math.max(...avant.map((a) => a.jour));
  const debut = decaler(dernier, -(FENETRE_HABITUDES - 1));
  const fenetre = avant.filter((a) => a.jour >= debut);
  const memes = fenetre.filter((a) => new Date(a.jour).getDay() === new Date(jour).getDay());
  const parSemaine = fenetre.length >= SEUIL_JOUR_SEMAINE && memes.length > 0;
  const l = (parSemaine ? memes : fenetre).map((a) => a.kcal);
  const m = moyenne(l);
  const sd = l.length > 1 ? ecartType(l) : VARIATION_APPORTS * m;
  const sigma = sd * Math.sqrt(1 + 1 / l.length);
  return { kcal: m, methode: parSemaine ? "jourSemaine" : "moyenne", n: l.length, jours: fenetre.length, sigma, precision: precisionDe(sigma, m) };
}

const moyenne = (l: readonly number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
function ecartType(l: readonly number[]): number {
  const m = moyenne(l);
  return Math.sqrt(l.reduce((a, x) => a + (x - m) ** 2, 0) / (l.length - 1));
}

// ---- Dépense recalée sur le poids ----------------------------------------------------------------------------

/** Fenêtre du recalage et ce qu'il lui faut : 14 jours de journal, 4 pesées sur au moins 14 jours. */
export const FENETRE_RECALAGE = 28;
export const MIN_JOURS_APPORTS = 14;
export const MIN_PESEES = 4;
export const MIN_ETENDUE_PESEES = 14;
/** Densités d'énergie (Chow et Hall 2008) : graisse 39,5 MJ/kg, tissu maigre 7,6 MJ/kg ; constante de Forbes 10,4 kg. */
export const KCAL_KG_GRAS = 9440;
export const KCAL_KG_MAIGRE = 1816;
export const FORBES_KG = 10.4;
/** Masse grasse supposée sans mesure (adulte moyen) ; erreur de densité sans mesure et avec. */
export const GRAS_DEFAUT = { h: 20, f: 30, inconnu: 25 } as const;
/** Erreur systématique d'un journal tenu (portions, oublis) sur la moyenne des apports : 10 % (D2 ; Lichtman 1992, Subar 2015, Freedman 2014 : le journal sous-déclare). */
export const ERREUR_JOURNAL = 0.1;
/** Le facteur reste plausible : la formule n'est jamais corrigée de plus de −25 % / +35 %. */
export const BORNES_FACTEUR = { min: 0.75, max: 1.35 } as const;

/** kcal stockées par kg de poids pris ou perdu : part de graisse F ÷ (F + 10,4) selon Forbes (Hall 2008). */
export function densiteVariation(masseGrasseKg: number): number {
  const f = Math.max(1, masseGrasseKg);
  const partGras = f / (f + FORBES_KG);
  return partGras * KCAL_KG_GRAS + (1 - partGras) * KCAL_KG_MAIGRE;
}

/** Pente (kg par jour) des pesées par moindres carrés et son erreur type ; null sous 3 pesées ou sur un seul jour. */
export function penteRegression(pesees: readonly { date: number; kg: number }[]): { pente: number; erreur: number } | null {
  const n = pesees.length;
  if (n < 3) return null;
  const x = pesees.map((p) => p.date / JOUR);
  const y = pesees.map((p) => p.kg);
  const mx = moyenne(x);
  const my = moyenne(y);
  const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  if (sxx < 1) return null;
  const pente = x.reduce((a, v, i) => a + (v - mx) * (y[i]! - my), 0) / sxx;
  const res = y.reduce((a, v, i) => a + (v - (my + pente * (x[i]! - mx))) ** 2, 0);
  return { pente, erreur: Math.sqrt(res / (n - 2) / sxx) };
}

export interface EntreeRecalage {
  /** Jours tenus de la fenêtre. */
  apports: readonly ApportJour[];
  pesees: readonly { date: number; kg: number }[];
  /** Dépense de la formule, chaque jour de la fenêtre, avec son incertitude. */
  formule: readonly { kcal: number; sigma: number }[];
  /** % de masse grasse mesuré (null : valeur de population), et sexe pour cette valeur. */
  grasPct: number | null;
  sexe: "h" | "f" | null;
}

export interface Recalage {
  /** Dépense de la formule × facteur. */
  facteur: number;
  /** Incertitude relative du facteur après recalage. */
  sigmaRel: number;
  /** Dépense moyenne observée (apports − variation des réserves) et son incertitude. */
  observee: number;
  sigmaObservee: number;
  /** Variation du poids (kg par semaine), densité retenue (kcal/kg), jours tenus et pesées. */
  kgSemaine: number;
  densite: number;
  joursApports: number;
  pesees: number;
}

/** Ce qui manque encore au recalage (pour le conseil) : jours tenus, pesées, étendue des pesées. */
export function etatRecalage(apports: readonly ApportJour[], pesees: readonly { date: number }[]) {
  const d = pesees.map((p) => p.date);
  return { joursApports: apports.length, pesees: pesees.length, etendueJours: d.length ? (Math.max(...d) - Math.min(...d)) / JOUR : 0 };
}

/**
 * Bilan à l'envers (Hall ; principe de MacroFactor) : dépense observée = apports moyens − pente du poids × densité. Elle
 * recale la formule par moyenne pondérée (inverse des variances) entre le facteur 1 (formule seule, son incertitude) et le
 * facteur observé ; null tant qu'il manque 14 jours de journal ou 4 pesées sur 14 jours.
 */
export function recaler(e: EntreeRecalage): Recalage | null {
  const etat = etatRecalage(e.apports, e.pesees);
  if (etat.joursApports < MIN_JOURS_APPORTS || etat.pesees < MIN_PESEES || etat.etendueJours < MIN_ETENDUE_PESEES || !e.formule.length) return null;
  const reg = penteRegression(e.pesees);
  if (!reg) return null;
  const kg = moyenne(e.pesees.map((p) => p.kg));
  const pct = e.grasPct != null && e.grasPct > 2 && e.grasPct < 70 ? e.grasPct : GRAS_DEFAUT[e.sexe ?? "inconnu"];
  const densite = densiteVariation((kg * pct) / 100);
  const erreurDensite = (e.grasPct != null ? 0.1 : 0.2) * densite;
  const kcal = e.apports.map((a) => a.kcal);
  const mApports = moyenne(kcal);
  const sigmaApports = quadratique(ecartType(kcal) / Math.sqrt(kcal.length), ERREUR_JOURNAL * mApports);
  const observee = mApports - reg.pente * densite;
  const sigmaObservee = quadratique(sigmaApports, reg.erreur * densite, reg.pente * erreurDensite);
  const mFormule = moyenne(e.formule.map((f) => f.kcal));
  const sigmaPrior = moyenne(e.formule.map((f) => f.sigma / f.kcal));
  const kObs = observee / mFormule;
  const sObs = sigmaObservee / mFormule;
  const wObs = 1 / sObs ** 2;
  const wPrior = 1 / sigmaPrior ** 2;
  const k = (kObs * wObs + wPrior) / (wObs + wPrior);
  return {
    facteur: Math.min(BORNES_FACTEUR.max, Math.max(BORNES_FACTEUR.min, k)),
    sigmaRel: 1 / Math.sqrt(wObs + wPrior),
    observee,
    sigmaObservee,
    kgSemaine: reg.pente * 7,
    densite,
    joursApports: etat.joursApports,
    pesees: etat.pesees,
  };
}
