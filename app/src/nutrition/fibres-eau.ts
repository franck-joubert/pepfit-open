// Fibres et eau du Journal (planche Fibres et eau, docs/CODE-FIBRES-EAU.md). Pur : ni base, ni React Native, testé sous Node.
// Les fibres se déduisent des repas du jour (rien n'est stocké) ; l'eau est une liste d'ajouts (table eau_ajout).

import { normaliser } from "../db/normaliser";
import type { Nutriments } from "./calculs";

/** Objectif de fibres (D1) : un seul chiffre, celui que la personne règle ; 30 g par défaut, de 10 à 60 g. */
export const FIBRES = { defautG: 30, minG: 10, maxG: 60, departsG: [20, 25, 30] as const, palierG: 5 } as const;

/** Objectif d'eau (D6) : 2 L par défaut, de 0,5 à 5 L, par pas de 0,1 L. Les ajouts : de 50 à 2 000 ml par pas de 50 (D5). */
export const EAU = { defautMl: 2000, minMl: 500, maxMl: 5000, pasObjectifMl: 100, ajoutMinMl: 50, ajoutMaxMl: 2000, pasAjoutMl: 50, ajoutDefautMl: 250 } as const;

export type CleVerre = "verre" | "tasse" | "bouteille" | "gourde";
/** Les quatre préréglages du tiroir (D5) : ils règlent la roue ; la roue reste libre. */
export const VERRES: readonly { cle: CleVerre; ml: number }[] = [
  { cle: "verre", ml: 200 },
  { cle: "tasse", ml: 250 },
  { cle: "bouteille", ml: 500 },
  { cle: "gourde", ml: 750 },
];

export const estVerre = (x: unknown): x is CleVerre => VERRES.some((v) => v.cle === x);

/** Bornes d'un ajout d'eau en base (les trois colonnes de la table : la roue, plus large, n'en sort pas). */
export const ajoutEauValide = (ml: number) => Number.isInteger(ml) && ml >= 10 && ml <= 5000;

// ------------------------------------------------------------------ Fibres du jour

/** Ce qu'il faut d'une ligne du journal pour compter ses fibres (une `Consommation` convient). */
export interface LigneFibres {
  quantite_g: number;
  produit: { nom?: string; nutriments: Nutriments };
}

export interface FibresDuJour {
  /** Grammes de fibres du jour (une décimale). */
  g: number;
  /** Vrai si un aliment du jour n'a pas de fibres connues : la valeur est précédée d'un « ~ ». */
  partiel: boolean;
}

const arrondi1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Fibres d'une ligne : la valeur pour 100 g du produit (celle de la composition pour un plat) × la quantité. Valeur absente :
 * connue comme nulle pour un aliment sans glucides (viande, huile, eau), inconnue sinon (donnée partielle, le « ~ »).
 */
export function fibresDeLigne(l: LigneFibres): { g: number; inconnu: boolean } {
  const n = l.produit.nutriments;
  if (n.fibres != null) return { g: (n.fibres * l.quantite_g) / 100, inconnu: false };
  return { g: 0, inconnu: (n.glucides ?? 0) >= 1 };
}

export function fibresDuJour(lignes: readonly LigneFibres[]): FibresDuJour {
  let g = 0;
  let partiel = false;
  for (const l of lignes) {
    const f = fibresDeLigne(l);
    g += f.g;
    if (f.inconnu) partiel = true;
  }
  return { g: arrondi1(g), partiel };
}

/**
 * Moyenne des fibres des jours remplis parmi `jours` (jamais un jour sans aliment : il tirerait la moyenne vers zéro), ou null
 * sans aucun jour rempli. La feuille d'activation en part (D2).
 */
export function moyenneFibres(jours: readonly (FibresDuJour | null)[]): number | null {
  const l = jours.filter((j): j is FibresDuJour => j != null);
  if (!l.length) return null;
  return l.reduce((a, j) => a + j.g, 0) / l.length;
}

/**
 * Objectif de départ proposé à l'activation (D2) : la moyenne des 14 derniers jours plus 5 g, bornée à 15 et 30 g, puis ramenée
 * au choix le plus proche parmi 20, 25 et 30 g. Sans historique : 20 g, le plus doux.
 */
export function departFibres(moyenneG: number | null): 20 | 25 | 30 {
  if (moyenneG == null) return 20;
  const cible = Math.min(30, Math.max(15, moyenneG + FIBRES.palierG));
  let meilleur: 20 | 25 | 30 = 20;
  for (const d of FIBRES.departsG) if (Math.abs(d - cible) < Math.abs(meilleur - cible)) meilleur = d;
  return meilleur;
}

// ------------------------------------------------------------------ Palier de +5 g

/** Jours que dure « deux semaines tenues », et nombre minimum de ces jours à l'objectif (un oubli ou deux ne cassent pas la série). */
export const PALIER = { jours: 14, tenusMin: 12, reportJours: 7 } as const;

export interface EntreePalier {
  objectifG: number;
  /** Fibres des 14 jours qui précèdent le jour affiché (null : jour sans aliment). */
  jours: readonly (FibresDuJour | null)[];
  /** Jour affiché et jour jusqu'auquel « Plus tard » repousse la proposition (AAAA-MM-JJ). */
  aujourdhui: string;
  reporteJusqua: string | null;
}

/**
 * Le palier suivant (D2) : +5 g, jamais au-delà du repère de 30 g, proposé quand l'objectif a été atteint au moins 12 des
 * 14 derniers jours (même avec les chiffres connus à moitié) ; « Plus tard » repousse d'une semaine. Rien ne change sans geste.
 */
export function palierFibres(e: EntreePalier): number | null {
  if (e.objectifG >= FIBRES.defautG) return null;
  if (e.reporteJusqua && e.aujourdhui < e.reporteJusqua) return null;
  if (e.jours.length < PALIER.jours) return null;
  const tenus = e.jours.filter((j) => j != null && j.g >= e.objectifG).length;
  if (tenus < PALIER.tenusMin) return null;
  return Math.min(FIBRES.defautG, e.objectifG + FIBRES.palierG);
}

// ------------------------------------------------------------------ Carte d'astuce

export type CleEchange = "riz" | "pates" | "pain" | "pomme" | "coque" | "legumineuses" | "legumes" | "orange";

interface RegleEchange {
  cle: CleEchange;
  /** Le nom normalisé du produit mangé (sans accents, en minuscules) correspond. */
  reconnait: RegExp;
  exclut?: RegExp;
  /** Fibres pour 100 g de l'aliment de départ (si le produit n'en donne pas) et de celui qui le remplace. */
  depart100?: number;
  arrivee100?: number;
  /** Gain fixe, en g (un échange sans quantité de départ : une poignée, une portion). */
  gainFixeG?: number;
}

const COMPLET = /\b(complet|complete|integral|integrale|semi complet|semi complete|seigle|sarrasin|avoine|quinoa|sauvage)\b/;

/**
 * Les échanges proposés (D10), dans l'ordre où on les cherche : une petite liste fixe, pour un aliment mangé aujourd'hui. Valeurs
 * pour 100 g cuits ou prêts à manger, ordres de grandeur de la table Ciqual (riz blanc 1,0 et complet 2,0 ; pâtes 1,8 et 3,5 ;
 * pain blanc 3,0 et complet 6,5) : l'appli n'a pas de table de référence, ses produits viennent d'Open Food Facts et de la
 * personne. Le gain se calcule sur la quantité réellement mangée.
 */
const ECHANGES: readonly RegleEchange[] = [
  { cle: "riz", reconnait: /\briz\b/, exclut: COMPLET, depart100: 1, arrivee100: 2 },
  { cle: "pates", reconnait: /\b(pates|spaghetti|tagliatelles|penne|fusilli|macaroni|coquillettes|torsades)\b/, exclut: COMPLET, depart100: 1.8, arrivee100: 3.5 },
  { cle: "pain", reconnait: /\b(pain|baguette|toast|brioche)\b/, exclut: COMPLET, depart100: 3, arrivee100: 6.5 },
  { cle: "pomme", reconnait: /\bjus\b/, gainFixeG: 3 },
  { cle: "coque", reconnait: /\b(yaourt|yogourt|banane)\b/, gainFixeG: 2 },
];
/** Légumineuses : si aucune n'a été mangée dans la semaine, des lentilles ou des pois chiches (environ 5 g par portion, D10). */
const LEGUMINEUSES = /\b(lentille|lentilles|pois chiches?|pois casses?|haricots?|flageolets?|feves?|soja|edamame)\b/;
const GAIN_LEGUMINEUSES_G = 5;
/** Fruits à coque : pas de poignée à qui en a déjà mangé aujourd'hui. */
const COQUE = /\b(amandes?|noix|noisettes?|cajous?|pistaches?|pecans?|macadamias?)\b/;

export interface Echange {
  cle: CleEchange;
  /** Gain approximatif, en g de fibres, arrondi à l'entier (au moins 1). */
  gainG: number;
  /** Id du repas où l'aliment a été mangé (null pour l'échange de la semaine). */
  repasId: string | null;
  /** Conseil qui vise un repas sans s'appuyer sur un aliment mangé : la clé de ce repas (« diner »). */
  repasCle?: string;
}

export interface LigneAstuce extends LigneFibres {
  repas_id: string;
  produit: { nom: string; nutriments: Nutriments };
}

/**
 * L'échange à proposer d'après les repas du jour, ou null (aucun repas, ou rien qui s'y prête) ; `semaine` : les lignes des
 * sept derniers jours, jour affiché compris, pour savoir si des légumineuses ont été mangées.
 */
export function echangeDuJour(jour: readonly LigneAstuce[], semaine: readonly LigneAstuce[]): Echange | null {
  if (!jour.length) return null;
  for (const e of ECHANGES) {
    for (const l of jour) {
      const nom = normaliser(l.produit.nom);
      if (!e.reconnait.test(nom) || e.exclut?.test(nom)) continue;
      let gain: number;
      if (e.gainFixeG != null) gain = e.gainFixeG;
      else {
        const depart = l.produit.nutriments.fibres ?? e.depart100!;
        gain = (Math.max(0, e.arrivee100! - depart) * l.quantite_g) / 100;
      }
      if (gain >= 0.5) return { cle: e.cle, gainG: Math.max(1, Math.round(gain)), repasId: l.repas_id };
    }
  }
  if (!semaine.some((l) => LEGUMINEUSES.test(normaliser(l.produit.nom)))) return { cle: "legumineuses", gainG: GAIN_LEGUMINEUSES_G, repasId: null };
  return null;
}

// ------------------------------------------------------------------ Conseils (page de suivi des fibres, D7)

/**
 * Le jeu de conseils généraux de la carte, dans l'ordre où ils tournent. Les grammes sont des ordres de grandeur de la table
 * Ciqual, pour une portion courante (l'appli n'a pas de table de référence : ses produits viennent d'Open Food Facts et de la
 * personne) : riz complet 2,0 contre 1,0 g pour 100 g sur 180 g cuits (environ 2 g) ; légumes cuits 2,5 à 3 g pour 100 g sur
 * 150 g (environ 4 g) ; lentilles ou pois chiches cuits 4 à 5 g pour 100 g sur 100 à 120 g (environ 5 g) ; amandes 12 g pour
 * 100 g sur une poignée de 10 à 15 g (environ 2 g) ; une orange de 130 g, 2,1 g pour 100 g, contre 0,2 g pour 100 g de jus
 * (environ 2 g de plus). Toujours écrits « environ », au conditionnel.
 */
export const CONSEILS: readonly Echange[] = [
  { cle: "riz", gainG: 2, repasId: null, repasCle: "dejeuner" },
  { cle: "legumes", gainG: 4, repasId: null, repasCle: "diner" },
  { cle: "legumineuses", gainG: GAIN_LEGUMINEUSES_G, repasId: null },
  { cle: "coque", gainG: 2, repasId: null },
  { cle: "orange", gainG: 2, repasId: null },
];

/** Les conseils que la page montre d'un coup ; le Journal montre le premier. */
export const CONSEILS_PAGE = 3;

/** Jours depuis le 1er janvier 1970 d'un jour « AAAA-MM-JJ » : la fenêtre des conseils avance d'un cran par jour. */
const numeroDuJour = (jour: string) => {
  const [a, m, j] = jour.split("-").map(Number);
  return Math.floor(Date.UTC(a!, m! - 1, j!) / 86_400_000);
};

/** La pomme et l'orange sont le même conseil (le fruit entier plutôt que le jus) : un seul des deux à la fois. */
const famille = (c: CleEchange): CleEchange => (c === "pomme" ? "orange" : c);

/**
 * Les `n` conseils du jour `date` : celui qui s'appuie sur un repas du jour d'abord (échange), puis une fenêtre du jeu qui avance
 * d'un cran chaque jour ; pas deux fois la même famille, pas de légumineuses si la semaine en a eu, pas de riz complet ni de fruits à coque à qui en a
 * mangé aujourd'hui. `jour` : les lignes du jour ; `semaine` : celles des sept derniers jours, jour compris.
 */
export function conseilsDuJour(a: { date: string; jour: readonly LigneAstuce[]; semaine: readonly LigneAstuce[]; n: number }): Echange[] {
  const mange = (l: readonly LigneAstuce[], re: RegExp) => l.some((x) => re.test(normaliser(x.produit.nom)));
  const premier = echangeDuJour(a.jour, a.semaine);
  const liste: Echange[] = premier ? [premier] : [];
  const rizComplet = mange(a.jour, /\briz\b/) && mange(a.jour, COMPLET);
  const debut = ((numeroDuJour(a.date) % CONSEILS.length) + CONSEILS.length) % CONSEILS.length;
  for (let i = 0; i < CONSEILS.length && liste.length < a.n; i++) {
    const c = CONSEILS[(debut + i) % CONSEILS.length]!;
    if (liste.some((x) => famille(x.cle) === famille(c.cle))) continue;
    if (c.cle === "legumineuses" && mange(a.semaine, LEGUMINEUSES)) continue;
    if (c.cle === "riz" && rizComplet) continue;
    if (c.cle === "coque" && mange(a.jour, COQUE)) continue;
    liste.push(c);
  }
  return liste.slice(0, a.n);
}

/**
 * La carte d'astuce est-elle visible (D10, D11, D12) : aujourd'hui seulement, suivi des fibres allumé, astuce non masquée, chiffres
 * affichés, objectif pas encore atteint, un échange possible.
 */
export function astuceVisible(a: { aujourdhui: boolean; suivi: boolean; masquee: boolean; chiffres: boolean; fibresG: number; objectifG: number; echange: Echange | null }): boolean {
  return a.aujourdhui && a.suivi && !a.masquee && a.chiffres && a.fibresG < a.objectifG && a.echange != null;
}

// ------------------------------------------------------------------ Eau

/** Total d'eau d'un jour, en ml. */
export const totalEauMl = (ajouts: readonly { ml: number }[]) => ajouts.reduce((a, x) => a + x.ml, 0);

/** Litres écrits à la française ou à l'anglaise : au plus deux décimales, sans zéro inutile (1,2 ; 1,45 ; 2). */
export function litres(ml: number, virgule = true): string {
  const s = String(Math.round(ml / 10) / 100);
  return virgule ? s.replace(".", ",") : s;
}

/** Heure d'un ajout, « 08:12 ». */
export function heureTexte(heureMin: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(heureMin / 60))}:${p(heureMin % 60)}`;
}

/** Minutes depuis minuit à l'instant donné (jour local, D8 : un verre à 00:30 compte pour le jour qui commence). */
export const heureMinDe = (d: Date) => d.getHours() * 60 + d.getMinutes();
