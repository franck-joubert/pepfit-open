// Quantité d'un aliment sur sa fiche (g, portion, pièce, paquet) : conversions et mise en forme, sans React Native (testées
// sous Node). Une même quantité se lit dans toutes les unités : grammes, % du paquet, nombre de portions, fraction.

import { nombre } from "../ecrans/format";
import { t } from "../i18n/index";
import { grammesDepuisUnite, portionDe, valeursGrammes, valeursUnites, type Portion, type TypePortion, type Unite } from "./calculs";

const EPS = 1e-6;

/** Unités dans l'ordre des onglets : le gramme à gauche, le paquet à droite. */
export function ordreUnites(unites: readonly Unite[]): Unite[] {
  const rang: Record<Unite, number> = { g: 0, portion: 1, piece: 2, paquet: 3 };
  return [...unites].sort((a, b) => rang[a] - rang[b]);
}

/** Part du paquet en % (entier, sans décimale) ; null si le poids du paquet est inconnu ou nul. */
export function pourcentPaquet(grammes: number, paquetG: number | null | undefined): number | null {
  if (!paquetG || paquetG <= 0 || !Number.isFinite(grammes)) return null;
  return Math.round((grammes / paquetG) * 100);
}

/** Nombre de portions d'un poids (ou d'un paquet) ; null si le poids d'une portion est inconnu ou nul. */
export function nombrePortions(grammes: number, portionG: number | null | undefined): number | null {
  if (!portionG || portionG <= 0 || !Number.isFinite(grammes)) return null;
  return grammes / portionG;
}

/** Pas de la roue : demi-portions pour la portion, quarts pour le paquet et la pièce. */
export const PAS_UNITE: Record<TypePortion, number> = { portion: 0.5, piece: 0.25, paquet: 0.25 };

/** Valeurs de la roue d'une unité : grammes (5 en 5…), demi-portions, quarts de pièce ou de paquet. */
export function valeursPourUnite(unite: Unite): number[] {
  if (unite === "g") return valeursGrammes();
  if (unite === "portion") return Array.from({ length: 40 }, (_, i) => (i + 1) / 2);
  return valeursUnites();
}

/** Vrai si `v` tombe sur un cran de la roue de l'unité. */
export function surGrille(unite: Unite, v: number): boolean {
  if (unite === "g") return valeursGrammes().some((x) => Math.abs(x - v) < EPS);
  const pas = PAS_UNITE[unite];
  const k = v / pas;
  return v >= pas - EPS && Math.abs(k - Math.round(k)) < 1e-4;
}

/** Les valeurs de la roue, plus `extra` (une quantité hors grille, gardée telle quelle) à sa place. */
export function avecValeur(valeurs: readonly number[], extra: number | null): number[] {
  if (extra == null || valeurs.some((v) => Math.abs(v - extra) < EPS)) return [...valeurs];
  return [...valeurs, extra].sort((a, b) => a - b);
}

/**
 * Quantité dans une unité pour une masse en grammes : la valeur, et `horsGrille` si elle ne tombe pas sur un cran de la roue
 * (200 g d'un paquet de 240 g = 0,83 paquet). Les grammes sont arrondis au gramme ; une valeur proche d'un cran s'y pose.
 * Null si l'unité n'existe pas pour ce produit.
 */
export function quantiteDepuisGrammes(unite: Unite, grammes: number, portions: readonly Portion[]): { nb: number; horsGrille: boolean } | null {
  if (unite === "g") {
    const g = Math.max(1, Math.round(grammes));
    return { nb: g, horsGrille: !surGrille("g", g) };
  }
  const p = portionDe(portions, unite);
  if (!p) return null;
  const pas = PAS_UNITE[unite];
  const brut = Math.max(pas, grammes / p.grammes);
  const cran = Math.round(brut / pas) * pas;
  if (Math.abs(brut - cran) < 0.02 * pas) return { nb: cran, horsGrille: false };
  return { nb: Math.round(brut * 1e4) / 1e4, horsGrille: true };
}

/** Quantité enregistrée : sa valeur hors grille pour la roue de son unité, sinon null. */
export function horsGrille(unite: Unite, nb: number): number | null {
  return surGrille(unite, nb) ? null : nb;
}

// ---- Mise en forme --------------------------------------------------------------------------------------------------

/** « ¼ », « ½ », « 1 ½ », « 2 » ; null si la valeur n'est pas un quart. */
export function fractionGlyphe(v: number): string | null {
  const entier = Math.floor(v + 1e-9);
  const q = (v - entier) * 4;
  const reste = Math.round(q);
  if (Math.abs(q - reste) > 1e-4 || reste > 3) return null;
  const f = ["", "¼", "½", "¾"][reste] ?? "";
  if (!entier) return f || "0";
  return f ? `${entier} ${f}` : String(entier);
}

/** « 1/4 », « 1/2 », « 1 1/2 » (lu par le lecteur d'écran, ou écrit à la main) ; null si la valeur n'est pas un quart. */
export function fractionSimple(v: number): string | null {
  const g = fractionGlyphe(v);
  return g == null ? null : g.replace("¼", "1/4").replace("½", "1/2").replace("¾", "3/4");
}

/** « 83 % » (sans décimale). */
export const pourcentTexte = (pct: number) => t("nutrition.pourcent", { n: nombre(pct, 0) });

/** Quantité de la roue d'une unité : fraction sur un cran (« ½ »), sinon « 83 % » (paquet) ou « 3,3 » (portion, pièce). */
export function quantiteTexte(unite: Unite, v: number): string {
  if (unite === "g") return nombre(v, 0);
  const f = fractionGlyphe(v);
  if (f != null) return f;
  return unite === "paquet" ? pourcentTexte(v * 100) : nombre(v, 1);
}

/**
 * Les grammes derrière la quantité de la roue : « ½, 120 g » ; une virgule décimale (« 3,3 ») ne se fait pas suivre d'une autre
 * virgule, un espace large sépare alors les deux mesures.
 */
export const grammesApres = (plein: string, grammes: number, base: string) => `${plein.includes(",") ? " " : ", "}${nombre(grammes, 0)} ${base}`;

/** Même quantité, lue : « 1/2 paquet, 120 grammes » ; hors grille : « 83 pour cent du paquet, 200 grammes ». */
export function quantiteLue(unite: Unite, v: number, grammes: number, libelleUnite: string, ml: boolean): string {
  const g = `${nombre(grammes, 0)} ${t(ml ? "nutrition.millilitresLus" : "nutrition.grammesLus")}`;
  if (unite === "g") return g;
  const f = fractionSimple(v);
  if (f != null) return `${f} ${libelleUnite}, ${g}`;
  return unite === "paquet" ? `${t("nutrition.pourcentPaquetLu", { n: nombre(v * 100, 0) })}, ${g}` : `${nombre(v, 1)} ${libelleUnite}, ${g}`;
}

/**
 * Sous le nom d'un onglet : le gramme montre la quantité choisie (« 200 g »), le paquet son équivalent en % (« 83 % »), la portion
 * et la pièce leur nombre (« 3,3 »). Undefined si l'unité n'existe pas ou si son poids est inconnu.
 */
export function sousOnglet(unite: Unite, grammes: number, portions: readonly Portion[], base: string): string | undefined {
  if (unite === "g") return `${nombre(grammes, 0)} ${base}`;
  const p = portionDe(portions, unite);
  if (!p) return undefined;
  if (unite === "paquet") {
    const pct = pourcentPaquet(grammes, p.grammes);
    return pct == null ? undefined : pourcentTexte(pct);
  }
  const n = nombrePortions(grammes, p.grammes);
  return n == null ? undefined : nombre(n, n < 10 ? 1 : 0);
}

/** Grammes de la valeur d'une unité (sans repli : 0 si l'unité n'existe pas). */
export const grammesDe = (unite: Unite, nb: number, portions: readonly Portion[]) => grammesDepuisUnite(unite, nb, portions) ?? 0;

// ---- Portions d'une fiche ----------------------------------------------------------------------------------------------

/** Poids du paquet, de la portion, nombre de portions par paquet : trois champs liés (paquet = portion × nombre). */
export interface ChampsPortion {
  paquetG: number | null;
  portionG: number | null;
  nbPortions: number | null;
}

const arrondi1 = (v: number) => Math.round(v * 10) / 10;
const positif = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) && v > 0 ? v : null);

/** Champs lus sur la fiche : le poids du paquet et de la portion, et leur quotient. */
export function champsDepuisPortions(portions: readonly Portion[]): ChampsPortion {
  const paquetG = portionDe(portions, "paquet")?.grammes ?? null;
  const portionG = portionDe(portions, "portion")?.grammes ?? null;
  const n = paquetG && portionG ? paquetG / portionG : null;
  return { paquetG, portionG, nbPortions: n == null ? null : Math.round(n * 100) / 100 };
}

/**
 * Un champ change, les autres suivent : le nombre de portions calcule le poids d'une portion (et inversement) depuis le poids du
 * paquet ; changer le paquet garde la dernière valeur saisie des deux (`pilote`) et recalcule l'autre. Une valeur nulle ou
 * négative vide le champ ; sans poids de paquet, le nombre de portions ne peut ni se calculer ni se garder.
 */
export function recalculerPortions(champs: ChampsPortion, modifie: keyof ChampsPortion, valeur: number | null, pilote: "portionG" | "nbPortions" = "portionG"): ChampsPortion {
  const v = positif(valeur);
  const c: ChampsPortion = { ...champs };
  const cent = (x: number) => Math.round(x * 100) / 100;
  if (modifie === "paquetG") {
    c.paquetG = v;
    if (pilote === "nbPortions") c.portionG = v && c.nbPortions ? arrondi1(v / c.nbPortions) : null;
    else c.nbPortions = v && c.portionG ? cent(v / c.portionG) : null;
  } else if (modifie === "portionG") {
    c.portionG = v;
    c.nbPortions = v && c.paquetG ? cent(c.paquetG / v) : null;
  } else {
    c.nbPortions = v;
    if (v && c.paquetG) c.portionG = arrondi1(c.paquetG / v);
  }
  return c;
}

/**
 * Portions de la fiche après la saisie : le paquet et la portion remplacés (marqués `perso`, pour qu'un rafraîchissement depuis
 * Open Food Facts ne les efface pas), les autres unités (pièce) gardées. Un poids vide retire l'unité. Le libellé d'origine est
 * gardé si le poids n'a pas changé.
 */
export function portionsApresSaisie(anciennes: readonly Portion[], champs: ChampsPortion): Portion[] {
  const refaire = (type: TypePortion, grammes: number | null): Portion[] => {
    const g = positif(grammes);
    if (!g) return [];
    const avant = anciennes.find((p) => p.type === type && p.grammes > 0);
    if (avant && Math.abs(avant.grammes - g) < EPS) return [avant];
    return [{ type, libelle: "", grammes: g, perso: true }];
  };
  const autres = anciennes.filter((p) => p.type !== "portion" && p.type !== "paquet");
  return [...refaire("portion", champs.portionG), ...autres, ...refaire("paquet", champs.paquetG)];
}

/** Rafraîchissement d'une fiche (Open Food Facts) : les poids saisis par la personne gardent la place de ceux qui arrivent. */
export function garderPortionsPerso(anciennes: readonly Portion[], nouvelles: readonly Portion[]): Portion[] {
  const perso = anciennes.filter((p) => p.perso);
  if (!perso.length) return [...nouvelles];
  const types = new Set(perso.map((p) => p.type));
  return [...nouvelles.filter((p) => !types.has(p.type)), ...perso];
}

/** Y a-t-il une portion dont le poids est connu ? Sinon la fiche invite à en définir une. */
export const aUnePortion = (portions: readonly Portion[]): boolean => portionDe(portions, "portion") != null;
