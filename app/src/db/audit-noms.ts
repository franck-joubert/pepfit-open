import type { EntreeCatalogue } from "./catalogue";
import { indicesLangue } from "./noms";
import { normaliser } from "./normaliser";

export interface BilanNoms {
  total: number;
  sansNomFr: string[];
  sansNomEn: string[];
  frVisiblementAnglais: string[];
  enVisiblementFrancais: string[];
  identiques: string[];
  composesAutomatiquement: number;
}

type Entree = Pick<EntreeCatalogue, "slug" | "nom" | "nom_en"> & { nom_auto?: boolean };

/** Exercices du catalogue sans nom dans une langue, ou dont un nom est de l'autre langue (heuristique de `indicesLangue` : mots d'une seule langue, aucun de l'autre). */
export function bilanNoms(entrees: readonly Entree[]): BilanNoms {
  const b: BilanNoms = {
    total: entrees.length, sansNomFr: [], sansNomEn: [], frVisiblementAnglais: [], enVisiblementFrancais: [], identiques: [], composesAutomatiquement: 0,
  };
  for (const e of entrees) {
    const fr = (e.nom ?? "").trim();
    const en = (e.nom_en ?? "").trim();
    if (!fr) b.sansNomFr.push(e.slug);
    if (!en) b.sansNomEn.push(e.slug);
    if (fr && indicesLangue(fr).en > 0 && indicesLangue(fr).fr === 0) b.frVisiblementAnglais.push(e.slug);
    if (en && indicesLangue(en).fr > 0 && indicesLangue(en).en === 0) b.enVisiblementFrancais.push(e.slug);
    if (fr && en && normaliser(fr) === normaliser(en)) b.identiques.push(e.slug);
    if (e.nom_auto) b.composesAutomatiquement++;
  }
  return b;
}
