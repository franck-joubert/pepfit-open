import type { Unite } from "../../nutrition/calculs";
import type { ProduitFige } from "../../nutrition/plats";

// Passages entre les pages d'un plat (comme code-lu.ts) : Ajouter en mode ingrédient et la fiche d'un aliment déposent les
// ingrédients choisis, la page du plat les prend en revenant ; la page du plat dépose la bulle « Plat enregistré · Voir »
// (repas → plat, P9), le journal la prend en revenant.

export interface IngredientChoisi {
  produit_id: string;
  produit: ProduitFige;
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
}

let ingredients: IngredientChoisi[] = [];

export function deposerIngredients(l: readonly IngredientChoisi[]): void {
  ingredients = [...ingredients, ...l];
}

export function prendreIngredients(): IngredientChoisi[] {
  const l = ingredients;
  ingredients = [];
  return l;
}

let bulle: { nom: string; platId: string } | null = null;

export function deposerBullePlat(b: { nom: string; platId: string }): void {
  bulle = b;
}

export function prendreBullePlat(): { nom: string; platId: string } | null {
  const b = bulle;
  bulle = null;
  return b;
}
