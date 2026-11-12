// Calculs des plats (planche plats, validée le 30/10 ; P4 à P6), sans React Native (testés sous Node). Un plat est fait
// d'ingrédients (un produit et sa quantité) ; il pèse son poids cuit, sinon la somme de ses ingrédients. Portion = plat entier
// ÷ nombre de portions ; 100 g sur le poids du plat. Une quantité choisie donne un facteur (grammes ÷ poids du plat)
// appliqué à chaque ingrédient ; un ingrédient ajusté « pour cette fois » prend sa propre quantité, et le poids de la ligne
// suit son écart cru × rapport cuit / cru (alors approximatif, « ~ »). Un plat sans ingrédients (recette Fitatu sans détail)
// n'a que ses valeurs pour 100 g et son poids.
import { additionner, energiePour100, macrosPourQuantite, MACROS_VIDES, type Macros, type Nutriments, type Portion, type Unite } from "./calculs";

/** Le produit d'un ingrédient, figé dans le plat : le plat se lit même sans le produit (autre téléphone, produit effacé). */
export interface ProduitFige {
  nom: string;
  marque: string | null;
  base: "100g" | "100ml";
  nutriments: Nutriments;
  portions: Portion[];
}

export interface IngredientPlat {
  id: string;
  produit_id: string;
  produit: ProduitFige;
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
}

/** Ce qu'il faut d'un plat pour le calculer. */
export interface PlatCalcul {
  portions: number;
  poids_cuit_g: number | null;
  sans_ingredients: boolean;
  /** Plat sans ingrédients : ses valeurs pour 100 g et son poids entier. */
  nutriments_100g: Nutriments | null;
  poids_total_g: number | null;
  ingredients: readonly IngredientPlat[];
}

/** Un ingrédient ajusté pour cette fois : sa quantité à la place de celle du plat, ou retiré (null). */
export type Ajustement = { quantite_g: number; unite: Unite; nb_unites: number } | null;

/** Poids cru : la somme des ingrédients. */
export const poidsCru = (ingredients: readonly Pick<IngredientPlat, "quantite_g">[]) => ingredients.reduce((s, i) => s + i.quantite_g, 0);

/** Poids du plat : le poids cuit, sinon celui des ingrédients (plat sans ingrédients : son poids entier). */
export function poidsPlat(p: PlatCalcul): number {
  if (p.sans_ingredients) return p.poids_total_g ?? 100 * Math.max(1, p.portions);
  return p.poids_cuit_g != null && p.poids_cuit_g > 0 ? p.poids_cuit_g : poidsCru(p.ingredients);
}

/** Poids d'une portion. */
export const poidsPortion = (p: PlatCalcul) => poidsPlat(p) / Math.max(1, p.portions);

/** Valeurs du plat entier. */
export function totalPlat(p: PlatCalcul): Macros {
  if (p.sans_ingredients) return macrosPourQuantite(p.nutriments_100g ?? {}, poidsPlat(p));
  return p.ingredients.reduce((m, i) => additionner(m, macrosPourQuantite(i.produit.nutriments, i.quantite_g)), MACROS_VIDES);
}

const echelle = (m: Macros, f: number): Macros => ({
  kcal: m.kcal * f,
  proteines: m.proteines * f,
  glucides: m.glucides * f,
  lipides: m.lipides * f,
  sucres: m.sucres * f,
  approx: m.approx,
});

/** Valeurs d'une portion, de 100 g et du plat entier, avec leurs poids (bloc « Valeurs »). */
export function valeursPlat(p: PlatCalcul): { portion: Macros; portionG: number; cent: Macros; entier: Macros; poidsG: number } {
  const entier = totalPlat(p);
  const poidsG = poidsPlat(p);
  const n = Math.max(1, p.portions);
  return { portion: echelle(entier, 1 / n), portionG: poidsG / n, cent: poidsG > 0 ? echelle(entier, 100 / poidsG) : { ...MACROS_VIDES }, entier, poidsG };
}

/** Une ligne de la composition d'une quantité mangée (figée dans la consommation, P4). */
export interface LigneComposition {
  /** Id de l'ingrédient dans le plat. */
  id: string;
  produit_id: string;
  produit: ProduitFige;
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
  ajuste: boolean;
}

export interface Composition {
  lignes: LigneComposition[];
  macros: Macros;
  /** Poids de la quantité mangée ; approximatif dès qu'un ingrédient est ajusté. */
  poidsG: number;
  ajuste: boolean;
}

const arrondi2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Composition de `grammes` du plat, ajustements compris. Sans ajustement, le poids est `grammes` ; avec, il suit l'écart cru
 * des ingrédients ajustés, ramené au rapport cuit / cru du plat (P6).
 */
export function compositionPour(p: PlatCalcul, grammes: number, ajustements: ReadonlyMap<string, Ajustement> = new Map()): Composition {
  if (p.sans_ingredients) return { lignes: [], macros: macrosPourQuantite(p.nutriments_100g ?? {}, grammes), poidsG: grammes, ajuste: false };
  const poids = poidsPlat(p);
  const cru = poidsCru(p.ingredients);
  const f = poids > 0 ? grammes / poids : 0;
  const rapport = cru > 0 ? poids / cru : 1;
  const lignes: LigneComposition[] = [];
  let ecartCru = 0;
  let ajuste = false;
  for (const i of p.ingredients) {
    const a = ajustements.get(i.id);
    const prevu = i.quantite_g * f;
    if (a === null) {
      ecartCru -= prevu;
      ajuste = true;
      continue;
    }
    if (a) {
      ecartCru += a.quantite_g - prevu;
      ajuste = true;
      lignes.push({ id: i.id, produit_id: i.produit_id, produit: i.produit, quantite_g: a.quantite_g, unite: a.unite, nb_unites: a.nb_unites, ajuste: true });
    } else {
      lignes.push({ id: i.id, produit_id: i.produit_id, produit: i.produit, quantite_g: prevu, unite: i.unite, nb_unites: arrondi2(i.nb_unites * f), ajuste: false });
    }
  }
  const macros = lignes.reduce((m, l) => additionner(m, macrosPourQuantite(l.produit.nutriments, l.quantite_g)), MACROS_VIDES);
  return { lignes, macros, poidsG: Math.max(0, grammes + ecartCru * rapport), ajuste };
}

const SIMPLES = ["lipides", "satures", "glucides", "sucres", "fibres", "proteines", "sel"] as const;

/**
 * Nutriments pour 100 g d'une composition (le produit figé d'une ligne du journal) : chaque valeur des ingrédients, ramenée
 * au poids de la quantité mangée. L'énergie est celle de l'étiquette de chaque ingrédient (ou recalculée).
 */
export function nutrimentsPour100(c: Pick<Composition, "lignes" | "poidsG">): Nutriments {
  const res: Nutriments = {};
  if (!(c.poidsG > 0)) return res;
  const f = 100 / c.poidsG;
  let kcal = 0;
  for (const l of c.lignes) kcal += (energiePour100(l.produit.nutriments).kcal * l.quantite_g) / 100;
  res.energie_kcal = arrondi2(kcal * f);
  for (const k of SIMPLES) {
    let somme = 0;
    let vu = false;
    for (const l of c.lignes) {
      const v = l.produit.nutriments[k];
      if (v == null) continue;
      vu = true;
      somme += (v * l.quantite_g) / 100;
    }
    if (vu) res[k] = arrondi2(somme * f);
  }
  return res;
}

/** Grammes d'une quantité de plat : en portions (poids d'une portion) ou en grammes. */
export const grammesDePlat = (p: PlatCalcul, unite: "portion" | "g", nb: number) => (unite === "portion" ? nb * poidsPortion(p) : nb);

/** Copie figée d'un produit pour un ingrédient. */
export const figer = (p: ProduitFige): ProduitFige => ({ nom: p.nom, marque: p.marque ?? null, base: p.base, nutriments: p.nutriments, portions: p.portions });
