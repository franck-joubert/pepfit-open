// Calculs de Nutrition, sans React Native (testés sous Node) : nutriments pour 100, quantités, totaux, objectifs.
import {
  DEPENSE_SEANCE_KCAL,
  FACTEUR_ACTIVITE,
  SEMAINES_PAR_MOIS,
  evaluerCible,
  metabolismeMifflin,
  objectifNutrition,
  plafondMaigreMoisKg,
  type Activite,
  type Declarations,
  type EvaluationCible,
  type HistoriqueRegle,
  type NiveauEntrainement,
  type ResultatNutrition,
  type StatutNutrition,
  type TypeJour,
  type TypeObjectif,
} from "./regle";

// La règle des macros vit dans regle.ts (docs/CODE-MACROS.md) ; ces noms restent ceux que les écrans importent.
export { ACTIVITE_HORS_SPORT, DEPENSE_SEANCE_KCAL, FACTEUR_ACTIVITE } from "./regle";
export type { Activite, EvaluationCible, NiveauEntrainement, ResultatNutrition, StatutNutrition, TypeJour, TypeObjectif } from "./regle";

export interface Nutriments {
  energie_kcal?: number;
  energie_kj?: number;
  lipides?: number;
  satures?: number;
  glucides?: number;
  sucres?: number;
  fibres?: number;
  proteines?: number;
  sel?: number;
  /** Vitamines et minéraux pour 100 (clé → valeur, unité fixée par la clé : voir MICROS de Créer). */
  micros?: Record<string, number>;
}

/** Une valeur nutritive simple (hors vitamines et minéraux). */
export type CleNutriment = Exclude<keyof Nutriments, "micros">;

export type TypePortion = "portion" | "piece" | "paquet";
export interface Portion {
  type: TypePortion;
  libelle: string;
  grammes: number;
  /** Poids saisi sur la fiche locale par la personne : un rafraîchissement depuis Open Food Facts ne le remplace pas. */
  perso?: boolean;
}
/** Unité d'une quantité : le gramme (ou le millilitre, selon la base du produit) ou une portion du produit. */
export type Unite = "g" | TypePortion;

export interface Macros {
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
  sucres: number;
  /** Vrai si la valeur est une estimation (énergie recalculée depuis les macros, poids d'unité inconnu). */
  approx: boolean;
}

export const MACROS_VIDES: Macros = { kcal: 0, proteines: 0, glucides: 0, lipides: 0, sucres: 0, approx: false };

const arrondi = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** kcal depuis les macros : 4 par g de protéines et de glucides digestibles, 9 par g de lipides, 2 par g de fibres. */
export function kcalDepuisMacros(m: { proteines?: number; glucides?: number; lipides?: number; fibres?: number }): number {
  const fibres = Math.min(m.fibres ?? 0, m.glucides ?? 0);
  return 4 * (m.proteines ?? 0) + 4 * ((m.glucides ?? 0) - fibres) + 9 * (m.lipides ?? 0) + 2 * fibres;
}

/** kJ → kcal (1 kcal = 4,184 kJ). */
export const kjVersKcal = (kj: number) => kj / 4.184;

/** Énergie pour 100 : celle de l'étiquette, sinon les kJ, sinon recalculée des macros (alors approximative). */
export function energiePour100(n: Nutriments): { kcal: number; approx: boolean } {
  if (n.energie_kcal != null) return { kcal: n.energie_kcal, approx: false };
  if (n.energie_kj != null) return { kcal: kjVersKcal(n.energie_kj), approx: false };
  return { kcal: kcalDepuisMacros(n), approx: true };
}

/** Macros d'une quantité `grammes` d'un produit dont les nutriments sont donnés pour 100. */
export function macrosPourQuantite(n: Nutriments, grammes: number, poidsIncertain = false): Macros {
  const f = grammes / 100;
  const e = energiePour100(n);
  return {
    kcal: e.kcal * f,
    proteines: (n.proteines ?? 0) * f,
    glucides: (n.glucides ?? 0) * f,
    lipides: (n.lipides ?? 0) * f,
    sucres: (n.sucres ?? 0) * f,
    approx: e.approx || poidsIncertain,
  };
}

export function additionner(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    proteines: a.proteines + b.proteines,
    glucides: a.glucides + b.glucides,
    lipides: a.lipides + b.lipides,
    sucres: a.sucres + b.sucres,
    approx: a.approx || b.approx,
  };
}

export const totaux = (lignes: readonly Macros[]): Macros => lignes.reduce(additionner, MACROS_VIDES);

/** Unités proposées pour un produit : toujours le gramme, puis chaque portion dont le poids est connu (pas de paquet sans poids). */
export function unitesDisponibles(portions: readonly Portion[]): Unite[] {
  const vues = new Set<Unite>(["g"]);
  for (const p of portions) if (p.grammes > 0) vues.add(p.type);
  return [...vues];
}

/** Portion de ce type (la première dont le poids est connu), ou null. */
export function portionDe(portions: readonly Portion[], type: TypePortion): Portion | null {
  return portions.find((p) => p.type === type && p.grammes > 0) ?? null;
}

/** Grammes de `nb` unités ; null si l'unité n'existe pas pour ce produit. */
export function grammesDepuisUnite(unite: Unite, nb: number, portions: readonly Portion[]): number | null {
  if (unite === "g") return nb;
  const p = portionDe(portions, unite);
  return p ? nb * p.grammes : null;
}

/** Nombre d'unités pour une masse en grammes (inverse de grammesDepuisUnite). */
export function uniteDepuisGrammes(unite: Unite, grammes: number, portions: readonly Portion[]): number | null {
  if (unite === "g") return grammes;
  const p = portionDe(portions, unite);
  return p ? grammes / p.grammes : null;
}

/** Valeurs de la roue des grammes : 5 en 5 jusqu'à 100, 10 en 10 jusqu'à 500, 25 en 25 jusqu'à 1000. */
export function valeursGrammes(): number[] {
  const v: number[] = [];
  for (let g = 5; g <= 100; g += 5) v.push(g);
  for (let g = 110; g <= 500; g += 10) v.push(g);
  for (let g = 525; g <= 1000; g += 25) v.push(g);
  return v;
}

/** Valeurs de la roue des unités : par quarts de 0,25 à 20. */
export function valeursUnites(): number[] {
  const v: number[] = [];
  for (let i = 1; i <= 80; i++) v.push(i / 4);
  return v;
}

// ---- Objectifs --------------------------------------------------------------------------------------------------

export interface Objectif {
  proteines: number;
  glucides: number;
  lipides: number;
  sucres: number;
}

/** kcal d'un objectif : toujours recalculées depuis les macros (jamais saisies). */
export const kcalObjectif = (o: Objectif) => kcalDepuisMacros(o);

/** Repère des sucres par défaut (D10) : le plus bas de 100 g et de 20 % des kcal (OMS : 10 % de sucres libres, ici tous les sucres). */
export const sucresParDefaut = (kcal: number) => Math.round(Math.min(100, (0.2 * kcal) / 4));

export const OBJECTIF_DEFAUT: Record<TypeJour, Objectif> = {
  entrainement: { proteines: 150, glucides: 300, lipides: 80, sucres: 70 },
  repos: { proteines: 150, glucides: 220, lipides: 75, sucres: 60 },
};

export interface ProfilCalcul {
  /** x : non binaire ou sans réponse (parcours de première utilisation), moyenne des deux constantes. */
  sexe: "h" | "f" | "x";
  tailleCm: number;
  poidsKg: number;
  age: number;
}

/** Métabolisme de base, Mifflin-St Jeor (D3 ; la « Katch-McArdle » est retirée, c'était la formule de Cunningham 1991). */
export const metabolismeBase = (p: ProfilCalcul) => metabolismeMifflin(p);

// ---- % de gras (docs/OBJECTIF-GRAS.md) : masse maigre, objectif de composition ----------------------------------------

/** Sous 1 kg d'écart de poids, un % cible plus bas est une recomposition (poids stable). */
const SEUIL_RECOMPOSITION_KG = 1;

/** Couple poids cible / % cible qui ne tient pas ensemble : masse maigre à perdre, ou poids sous la masse maigre. */
export type Incoherence = { cas: "perteMaigre"; perteKg: number; grasGardePct: number } | { cas: "sousMaigre"; maigreKg: number };

export interface PlanComposition {
  type: TypeObjectif;
  /** Masses visées et écarts (kg). */
  grasKg: number;
  maigreKg: number;
  ecartGrasKg: number;
  ecartMaigreKg: number;
  /** Durée estimée en semaines ; null sans rythme (maintien) ou sans écart. */
  semaines: number | null;
  incoherence: Incoherence | null;
  /** D5 : le maigre à gagner est-il réaliste ? Fourchette de gain mensuel et sur la durée (null sans maigre à gagner). */
  realisme: EvaluationCible;
}

/** Niveau et âge : ils fixent le gain de maigre réaliste (D5) ; sans eux, intermédiaire et moins de 50 ans. */
export interface OptionsPlan {
  niveau?: NiveauEntrainement;
  age?: number;
}

/**
 * Objectif de composition : du poids et du % de gras actuels vers le poids cible (sinon le poids actuel) et le % cible. La
 * durée est celle du rythme choisi (kg par semaine), allongée si la masse maigre à gagner dépasse le gain réaliste du niveau
 * (D5 : 1,0 / 0,5 / 0,25 % du poids par mois) ; une recomposition ne suit que la masse maigre. `realisme` dit si la cible tient
 * dans ces repères et donne la fourchette.
 */
export function planComposition(poidsKg: number, grasPct: number, cibleKg: number | null, grasCiblePct: number, rythmeKgSemaine: number, options: OptionsPlan = {}): PlanComposition {
  const niveau = options.niveau ?? "intermediaire";
  const age = options.age ?? 30;
  const p1 = cibleKg ?? poidsKg;
  const gras0 = (poidsKg * grasPct) / 100;
  const maigre0 = poidsKg - gras0;
  const gras1 = (p1 * grasCiblePct) / 100;
  const maigre1 = p1 - gras1;
  const dG = gras1 - gras0;
  const dM = maigre1 - maigre0;
  const dP = p1 - poidsKg;
  const type: TypeObjectif = Math.abs(dP) < SEUIL_RECOMPOSITION_KG ? (dG < 0 && dM >= 0 ? "recomposition" : "maintien") : dP > 0 ? "prise" : "seche";
  // D15 : en prise, le niveau fixe l'excédent et le rythme de poids ne compte plus (durée = le maigre à gagner au plafond du niveau)
  const r = type === "prise" ? 0 : Math.abs(rythmeKgSemaine);
  const parPoids = type === "maintien" ? Infinity : r > 0 ? Math.abs(dP) / r : type === "recomposition" || type === "prise" ? 0 : Infinity;
  const plafondSemaine = plafondMaigreMoisKg(poidsKg, niveau, age) / SEMAINES_PAR_MOIS;
  const s = Math.max(parPoids, dM > 0 ? dM / plafondSemaine : 0);
  const semaines = s > 0 && Number.isFinite(s) ? s : null;
  const grasGardePct = (1 - maigre0 / p1) * 100;
  const incoherence: Incoherence | null =
    dM >= -1 ? null : grasGardePct < 3 ? { cas: "sousMaigre", maigreKg: maigre0 } : { cas: "perteMaigre", perteKg: -dM, grasGardePct };
  const realisme = evaluerCible({ poidsKg, grasPct, cibleKg, grasCiblePct, niveau, age, rythmeKgSemaine: r });
  return { type, grasKg: gras1, maigreKg: maigre1, ecartGrasKg: dG, ecartMaigreKg: dM, semaines, incoherence, realisme };
}

/**
 * Cibles de l'écran Objectifs (31/10) : une ligne cible ne s'affiche qu'avec sa valeur de base (poids, % de gras),
 * et une cible sans base reste en mémoire sans compter (null ici).
 */
export function ciblesVisibles(base: { poids: boolean; gras: boolean }, cible: { kg: number | null; gras: number | null }) {
  return { lignePoids: base.poids, ligneGras: base.gras, cibleKg: base.poids ? cible.kg : null, grasCible: base.gras ? cible.gras : null };
}

/** Ce que le % de gras apporte au calcul : l'actuel, et la cible (poids, %) s'il y en a une. */
export interface CompositionCalcul {
  grasPct: number;
  cibleKg?: number | null;
  grasCiblePct?: number | null;
}

/** Ce que la règle sait en plus du profil : niveau, séances, déclarations, historique de dépense (tout est facultatif). */
export interface ContexteCalcul {
  niveau?: NiveauEntrainement;
  /** Séances par semaine (défaut : 3, l'intermédiaire) et dépense nette d'une séance. */
  seancesParSemaine?: number;
  depenseSeanceKcal?: number;
  /** Au moins 3 séances par semaine depuis 8 semaines : Ten Haaf à la place de Mifflin. */
  regulier8Semaines?: boolean;
  declarations?: Declarations;
  historique?: HistoriqueRegle;
  effort?: "force" | "endurance";
  dureeEffortMin?: number | null;
  /** D9 : l'alerte « glucides bas » est facultative. */
  alerteGlucides?: boolean;
}

export const SEANCES_PAR_DEFAUT = 3;

/** Résultat complet de la règle (statut, méthode, fourchette, alertes, mention) plus le type d'objectif retenu. */
export interface ObjectifDetail extends ResultatNutrition {
  type: TypeObjectif;
  plan: PlanComposition | null;
}

/**
 * Objectifs calculés, avec tout ce que la règle dit (§ 9 de docs/MACROS-SOURCES.md) : dépense d'entretien (mesurée, calculée
 * ou formule), écart d'énergie selon le type d'objectif, puis protéines, lipides, glucides, fibres et sucres. Le rythme voulu
 * est en kg par semaine (négatif pour perdre) ; avec un % cible, le type vient de planComposition.
 */
export function objectifDetail(p: ProfilCalcul, jour: TypeJour, rythmeKgSemaine = 0, activite: Activite = "debout", compo?: CompositionCalcul, contexte: ContexteCalcul = {}): ObjectifDetail {
  const niveau = contexte.niveau ?? "intermediaire";
  const plan = compo?.grasCiblePct != null ? planComposition(p.poidsKg, compo.grasPct, compo.cibleKg ?? null, compo.grasCiblePct, rythmeKgSemaine, { niveau, age: p.age }) : null;
  const typeVoulu: TypeObjectif = plan?.type ?? (rythmeKgSemaine < 0 ? "seche" : rythmeKgSemaine > 0 ? "prise" : "maintien");
  // sans rythme, une sèche reste au maintien (le segmenté « Maintien »), mais une prise suit le niveau (D15)
  const type: TypeObjectif = rythmeKgSemaine === 0 && typeVoulu === "seche" ? "maintien" : typeVoulu;
  const resultat = objectifNutrition(
    { sexe: p.sexe, age: p.age, tailleCm: p.tailleCm, poidsKg: p.poidsKg, grasPct: compo?.grasPct ?? null, niveau, activite, declarations: contexte.declarations ?? {} },
    {
      type,
      rythmeSouhaitePctSemaine: rythmeKgSemaine !== 0 && type !== "prise" ? (Math.abs(rythmeKgSemaine) / p.poidsKg) * 100 : null,
      poidsCibleKg: compo?.cibleKg ?? null,
      grasCiblePct: compo?.grasCiblePct ?? null,
    },
    {
      seancesParSemaine: contexte.seancesParSemaine ?? SEANCES_PAR_DEFAUT,
      depenseNetteSeanceKcal: contexte.depenseSeanceKcal ?? DEPENSE_SEANCE_KCAL,
      jour,
      effort: contexte.effort,
      dureeEffortMin: contexte.dureeEffortMin,
      regulier8Semaines: contexte.regulier8Semaines,
    },
    contexte.historique,
    { alerteGlucides: contexte.alerteGlucides },
  );
  return { ...resultat, type, plan };
}

/**
 * Objectifs d'un jour pour l'affichage : les grammes de protéines, glucides, lipides et sucres de la règle. Sans chiffres
 * (mineur, grossesse, trouble déclaré, IMC bas), la valeur par défaut du jour : l'appelant lit `objectifDetail` pour le statut.
 */
export function objectifAuto(p: ProfilCalcul, jour: TypeJour, rythmeKgSemaine = 0, activite: Activite = "debout", compo?: CompositionCalcul, contexte?: ContexteCalcul): Objectif {
  return versObjectif(objectifDetail(p, jour, rythmeKgSemaine, activite, compo, contexte), jour);
}

/** Les quatre valeurs de l'objectif, ou celles par défaut quand la règle ne donne pas de chiffres. */
export function versObjectif(d: ResultatNutrition, jour: TypeJour): Objectif {
  if (d.proteinesG == null || d.glucidesG == null || d.lipidesG == null || d.sucresRepereG == null) return OBJECTIF_DEFAUT[jour];
  return { proteines: d.proteinesG, glucides: d.glucidesG, lipides: d.lipidesG, sucres: d.sucresRepereG };
}

/** Part atteinte d'un objectif, entre 0 et 1 (la jauge est pleine au-delà). */
export const progression = (valeur: number, objectif: number) => (objectif > 0 ? Math.min(1, Math.max(0, valeur / objectif)) : 0);

/** Date estimée pour atteindre un poids cible au rythme voulu (kg par semaine, signe indifférent) ; null si impossible. */
export function dateEstimee(poidsKg: number, cibleKg: number, rythmeKgSemaine: number, depart: Date): Date | null {
  const r = Math.abs(rythmeKgSemaine);
  const ecart = cibleKg - poidsKg;
  if (!(r > 0) || ecart === 0) return null;
  if (Math.sign(ecart) !== Math.sign(rythmeKgSemaine)) return null;
  return new Date(depart.getTime() + (Math.abs(ecart) / r) * 7 * 86_400_000);
}

export { arrondi };

// ---- Gamme des macros (NOTES.md : une couleur par valeur) ----------------------------------------------------------

export type CleMacro = "kcal" | "proteines" | "glucides" | "lipides" | "sucres";
export const COULEURS_MACROS: Record<"nuit" | "jour", Record<CleMacro, string>> = {
  nuit: { kcal: "#1bd8bb", proteines: "#37c2ef", glucides: "#9f89fe", lipides: "#fa86b6", sucres: "#fec84b" },
  jour: { kcal: "#007974", proteines: "#006c97", glucides: "#6530b9", lipides: "#b5236e", sucres: "#9c6900" },
};

/** Dégradé de la jauge de chaque valeur (planche) : clair, la couleur de la valeur, foncé ; en jour, plus foncé pour la piste claire. */
export const DEGRADES_MACROS: Record<"nuit" | "jour", Record<CleMacro, readonly [string, string, string]>> = {
  nuit: {
    kcal: ["#1bd8bb", "#0ca291", "#007c82"],
    proteines: ["#47e0fd", "#37c2ef", "#058ac3"],
    glucides: ["#a6b0fe", "#9f89fe", "#824fbf"],
    lipides: ["#ffadde", "#fa86b6", "#c75371"],
    sucres: ["#fff09a", "#fec84b", "#b89d02"],
  },
  jour: {
    kcal: ["#0ca291", "#007974", "#006065"],
    proteines: ["#0181a1", "#006c97", "#015085"],
    glucides: ["#5f4dd5", "#6530b9", "#5e0290"],
    lipides: ["#c13f97", "#b5236e", "#9a0142"],
    sucres: ["#b8742d", "#9c6900", "#755900"],
  },
};
/** Position de la couleur du milieu dans le dégradé : 48 % en nuit, 60 % en jour. */
export const MILIEU_DEGRADE = { nuit: 0.48, jour: 0.6 } as const;

/**
 * Fibres et eau (planche Fibres et eau, D4) : deux jauges de plus sous le résumé du Journal, hors des macros (elles n'ont ni
 * kcal ni carte de repas). Tilleul pour les fibres, bleu franc pour l'eau ; le vert reste au validé. À plat : theme/jetons.ts
 * (`fibres`, `eau`) ; dégradé de la jauge en trois arrêts, comme les macros.
 */
export type CleSuivi = "fibres" | "eau";
export const COULEURS_SUIVIS: Record<"nuit" | "jour", Record<CleSuivi, string>> = {
  nuit: { fibres: "#b5e04f", eau: "#68a2f3" },
  jour: { fibres: "#527a00", eau: "#2457c9" },
};
export const DEGRADES_SUIVIS: Record<"nuit" | "jour", Record<CleSuivi, readonly [string, string, string]>> = {
  nuit: { fibres: ["#d2ec7c", "#b5e04f", "#86b82c"], eau: ["#8ec0ff", "#68a2f3", "#3f78d0"] },
  jour: { fibres: ["#6f9a14", "#527a00", "#3d5c00"], eau: ["#3f74dc", "#2457c9", "#18408f"] },
};

// ---- Dates ----------------------------------------------------------------------------------------------------------

/** Clé de jour « AAAA-MM-JJ » (date locale). */
export function cleJour(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function decalerJour(cle: string, jours: number): string {
  const [a, m, j] = cle.split("-").map(Number) as [number, number, number];
  return cleJour(new Date(a, m - 1, j + jours));
}
