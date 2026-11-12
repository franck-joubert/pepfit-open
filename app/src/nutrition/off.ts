// Open Food Facts (API publique, lecture seule) : adresses, appels et conversion d'un produit OFF en produit pepfit.
// Sans React Native (la conversion est testée sous Node).

import type { CleNutriment, Nutriments, Portion } from "./calculs";

export const USER_AGENT = "pepfit-libre/0.1 (Android)";
const RACINE = "https://world.openfoodfacts.org";
/** Recherche par texte d'OFF (search-a-licious) : l'ancienne `cgi/search.pl` répondait 503 en continu le 27/10. */
const RECHERCHE = "https://search.openfoodfacts.org/search";
const CHAMPS = "code,product_name,product_name_fr,brands,categories_tags,nutriments,nutrition_data_per,serving_size,serving_quantity,quantity,product_quantity,nutriscore_grade,nova_group,ingredients_text_fr,ingredients_text,last_modified_t,quantity";

export interface ProduitOff {
  codeBarres: string;
  nom: string;
  marque: string | null;
  categorie: string | null;
  base: "100g" | "100ml";
  nutriments: Nutriments;
  portions: Portion[];
  nutriscore: string | null;
  nova: number | null;
  ingredients: string | null;
  offMaj: number | null;
}

type Brut = Record<string, unknown>;

const nombre = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Poids en grammes d'un texte du genre « 250 g », « 1,5 kg », « 33 cl » (millilitres comptés comme grammes) ; undefined si illisible. */
export function grammesDuTexte(texte: unknown): number | undefined {
  if (typeof texte !== "string") return undefined;
  const m = texte.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (!m) return undefined;
  const v = parseFloat(m[1]!);
  const f = { kg: 1000, g: 1, ml: 1, cl: 10, l: 1000 }[m[2] as "kg" | "g" | "ml" | "cl" | "l"];
  return v * f;
}

/** Convertit un produit OFF ; null si le code ou le nom manque, ou si aucune valeur nutritive n'est connue. */
export function produitDepuisOff(p: Brut): ProduitOff | null {
  const code = typeof p.code === "string" ? p.code : null;
  const nom = String(p.product_name_fr || p.product_name || "").trim();
  if (!code || !nom) return null;
  const n = (p.nutriments ?? {}) as Brut;
  const v = (cle: string) => nombre(n[`${cle}_100g`]);
  const kj = v("energy-kj") ?? (nombre(n["energy_100g"]) ?? undefined);
  const nutriments: Nutriments = {};
  const mettre = <K extends CleNutriment>(k: K, x: number | undefined) => {
    if (x != null) nutriments[k] = x;
  };
  mettre("energie_kcal", v("energy-kcal"));
  mettre("energie_kj", kj);
  mettre("lipides", v("fat"));
  mettre("satures", v("saturated-fat"));
  mettre("glucides", v("carbohydrates"));
  mettre("sucres", v("sugars"));
  mettre("fibres", v("fiber"));
  mettre("proteines", v("proteins"));
  mettre("sel", v("salt"));
  if (Object.keys(nutriments).length === 0) return null;
  const base = p.nutrition_data_per === "100ml" || (typeof p.quantity === "string" && /\d\s*(ml|cl|l)\b/i.test(p.quantity) && !/\d\s*g\b/i.test(p.quantity)) ? "100ml" : "100g";
  const portions: Portion[] = [];
  const portion = nombre(p.serving_quantity) ?? grammesDuTexte(p.serving_size);
  if (portion && portion > 0) portions.push({ type: "portion", libelle: typeof p.serving_size === "string" ? p.serving_size : `${portion} g`, grammes: portion });
  const paquet = nombre(p.product_quantity) ?? grammesDuTexte(p.quantity);
  if (paquet && paquet > 0 && paquet !== portion) portions.push({ type: "paquet", libelle: typeof p.quantity === "string" ? p.quantity : `${paquet} g`, grammes: paquet });
  const categories = Array.isArray(p.categories_tags) ? (p.categories_tags as string[]) : [];
  const grade = typeof p.nutriscore_grade === "string" && /^[a-e]$/i.test(p.nutriscore_grade) ? p.nutriscore_grade.toUpperCase() : null;
  return {
    codeBarres: code,
    nom,
    // `brands` : texte « A, B » (API produit) ou liste (search-a-licious).
    marque: (Array.isArray(p.brands) ? String(p.brands[0] ?? "") : typeof p.brands === "string" ? p.brands.split(",")[0]! : "").trim() || null,
    categorie: categories.length ? categories[categories.length - 1]!.replace(/^\w\w:/, "") : null,
    base,
    nutriments,
    portions,
    nutriscore: grade,
    nova: nombre(p.nova_group) ?? null,
    ingredients: String(p.ingredients_text_fr || p.ingredients_text || "").trim() || null,
    offMaj: nombre(p.last_modified_t) != null ? nombre(p.last_modified_t)! * 1000 : null,
  };
}

const entetes = { "User-Agent": USER_AGENT, Accept: "application/json" };

async function lire(url: string, delaiMs = 8000): Promise<Brut | null> {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), delaiMs);
  try {
    const r = await fetch(url, { headers: entetes, signal: c.signal });
    return r.ok ? ((await r.json()) as Brut) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Un produit par code-barres ; null s'il est inconnu ou si le réseau manque. */
export async function produitOffParCode(code: string): Promise<ProduitOff | null> {
  if (!/^\d{6,14}$/.test(code)) return null;
  const j = await lire(`${RACINE}/api/v2/product/${code}.json?fields=${CHAMPS}`);
  return j?.status === 1 && j.product ? produitDepuisOff({ code, ...(j.product as Brut) }) : null;
}

/** Recherche par texte ; null si le réseau manque (hors ligne), liste vide si rien n'est trouvé. */
export async function chercherOff(texte: string, limite = 20): Promise<ProduitOff[] | null> {
  const q = texte.trim();
  if (q.length < 2) return [];
  // search-a-licious d'abord, l'ancienne recherche en repli ; null seulement si les deux échouent.
  const j =
    (await lire(`${RECHERCHE}?q=${encodeURIComponent(q)}&page_size=${limite}&fields=${CHAMPS}`)) ??
    (await lire(`${RACINE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limite}&fields=${CHAMPS}`));
  if (!j) return null;
  const liste = Array.isArray(j.hits) ? (j.hits as Brut[]) : Array.isArray(j.products) ? (j.products as Brut[]) : [];
  return liste.map(produitDepuisOff).filter((x): x is ProduitOff => x != null);
}
