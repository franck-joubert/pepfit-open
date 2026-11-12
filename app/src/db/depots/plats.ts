import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import type { Nutriments, Portion, Unite } from "../../nutrition/calculs";
import {
  compositionPour, figer, grammesDePlat, nutrimentsPour100, poidsPortion, totalPlat, type Ajustement, type IngredientPlat, type LigneComposition, type PlatCalcul,
  type ProduitFige,
} from "../../nutrition/plats";
import { enregistrerProduit, produitParId } from "./nutrition";
import { ecrireFichiersAEffacer, fichierDistant, fichiersAEffacer } from "./photos";

// Plats personnalisés (planche plats, validée le 30/10) : Mes plats, création et modification, ajout au journal (une ligne,
// D2), « Enregistrer comme plat » depuis un repas (P9), recettes Fitatu devenues des plats (P12). Les écritures passent par la
// façade (transaction de exclusif.ts) ; plats et ingrédients sont synchronisés et chiffrés (sync/schema.ts).

export interface Plat extends PlatCalcul {
  id: string;
  nom: string;
  favori: boolean;
  source: "perso" | "fitatu";
  import_cle: string | null;
  photo: string | null;
  photo_vignette: string | null;
  photo_distante: string | null;
  cree_le: number;
  modifie_le: number;
  ingredients: IngredientPlat[];
}

interface LignePlat {
  id: string;
  nom: string;
  portions: number;
  poids_cuit_g: number | null;
  favori: number;
  source: "perso" | "fitatu";
  import_cle: string | null;
  sans_ingredients: number;
  nutriments_100g: string | null;
  poids_total_g: number | null;
  photo: string | null;
  photo_vignette: string | null;
  photo_distante: string | null;
  cree_le: number;
  modifie_le: number;
}

interface LigneIngredient {
  id: string;
  plat_id: string;
  produit_id: string;
  produit: string;
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
}

function lireJson<T>(texte: string | null, defaut: T): T {
  if (!texte) return defaut;
  try {
    return JSON.parse(texte) as T;
  } catch {
    return defaut;
  }
}

const versIngredient = (l: LigneIngredient): IngredientPlat => ({
  id: l.id,
  produit_id: l.produit_id,
  produit: lireJson<ProduitFige>(l.produit, { nom: "—", marque: null, base: "100g", nutriments: {}, portions: [] }),
  quantite_g: l.quantite_g,
  unite: l.unite,
  nb_unites: l.nb_unites,
});

const versPlat = (l: LignePlat, ingredients: IngredientPlat[]): Plat => ({
  ...l,
  favori: l.favori === 1,
  sans_ingredients: l.sans_ingredients === 1,
  nutriments_100g: lireJson<Nutriments | null>(l.nutriments_100g, null),
  ingredients,
});

async function ingredientsDe(db: Executeur, ids: readonly string[]): Promise<Map<string, IngredientPlat[]>> {
  const res = new Map<string, IngredientPlat[]>();
  if (!ids.length) return res;
  const l = await db.getAllAsync<LigneIngredient>(
    `SELECT id, plat_id, produit_id, produit, quantite_g, unite, nb_unites FROM plat_ingredients WHERE plat_id IN (${ids.map(() => "?").join(",")}) ORDER BY ordre, id`,
    [...ids],
  );
  for (const x of l) res.set(x.plat_id, [...(res.get(x.plat_id) ?? []), versIngredient(x)]);
  return res;
}

const COLONNES = "id, nom, portions, poids_cuit_g, favori, source, import_cle, sans_ingredients, nutriments_100g, poids_total_g, photo, photo_vignette, photo_distante, cree_le, modifie_le";

export async function lirePlat(db: Executeur, id: string): Promise<Plat | null> {
  const l = await db.getFirstAsync<LignePlat>(`SELECT ${COLONNES} FROM plats WHERE id = ?`, [id]);
  if (!l) return null;
  return versPlat(l, (await ingredientsDe(db, [id])).get(id) ?? []);
}

async function lirePlats(db: Executeur, sql: string, params: (string | number)[]): Promise<Plat[]> {
  const l = await db.getAllAsync<LignePlat>(sql, params);
  const ingr = await ingredientsDe(db, l.map((x) => x.id));
  return l.map((x) => versPlat(x, ingr.get(x.id) ?? []));
}

const DERNIER = "(SELECT MAX(c.cree_le) FROM consommations c WHERE c.plat_id = p.id)";

/**
 * Mes plats (P11) : le plus récemment mangé d'abord, puis le plus récemment créé. `texte` : chaque mot dans le nom (sans
 * casse). Le nom est chiffré dans la synchro, pas dans la base du téléphone : la recherche se fait ici.
 */
export async function listerPlats(db: Executeur, texte = ""): Promise<Plat[]> {
  const mots = texte.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cond = mots.length ? `WHERE ${mots.map(() => "LOWER(p.nom) LIKE ?").join(" AND ")}` : "";
  return lirePlats(db, `SELECT ${COLONNES.split(", ").map((c) => `p.${c}`).join(", ")} FROM plats p ${cond} ORDER BY COALESCE(${DERNIER}, 0) DESC, p.cree_le DESC, p.nom`, mots.map((m) => `%${m}%`));
}

/** Plats mangés dans ce repas, le plus récent d'abord (Récents d'Ajouter). */
export async function recentsPlatsDuRepas(db: Executeur, repasId: string, limite = 6): Promise<Plat[]> {
  return lirePlats(
    db,
    `SELECT ${COLONNES.split(", ").map((c) => `p.${c}`).join(", ")} FROM plats p
     JOIN (SELECT plat_id, MAX(cree_le) AS dernier FROM consommations WHERE repas_id = ? AND plat_id IS NOT NULL GROUP BY plat_id) c ON c.plat_id = p.id
     ORDER BY c.dernier DESC LIMIT ?`,
    [repasId, limite],
  );
}

export async function platsFavoris(db: Executeur): Promise<Plat[]> {
  return lirePlats(db, `SELECT ${COLONNES} FROM plats WHERE favori = 1 ORDER BY nom`, []);
}

export async function basculerFavoriPlat(db: Executeur, id: string, favori: boolean): Promise<void> {
  await db.runAsync("UPDATE plats SET favori = ?, modifie_le = ? WHERE id = ?", [favori ? 1 : 0, Date.now(), id]);
}

/** Ce qu'on saisit d'un plat (création, modification, repas → plat). */
export interface BrouillonPlat {
  nom: string;
  portions: number;
  poids_cuit_g: number | null;
  ingredients: (Omit<IngredientPlat, "id"> & { id?: string })[];
  /** Chemins relatifs de la photo et de sa vignette ; null : pas de photo. */
  photo: { photo: string; vignette: string } | null;
  sans_ingredients?: boolean;
  nutriments_100g?: Nutriments | null;
  poids_total_g?: number | null;
}

/** Fichiers d'une photo de plat qui part : effacés du serveur à la prochaine synchro si elle y était. */
async function noterPhotoDistante(db: Executeur, p: Pick<Plat, "photo" | "photo_vignette" | "photo_distante">): Promise<void> {
  if (!p.photo_distante || !p.photo || !p.photo_vignette) return;
  const l = await fichiersAEffacer(db);
  for (const c of [p.photo, p.photo_vignette].map(fichierDistant)) if (!l.includes(c)) l.push(c);
  await ecrireFichiersAEffacer(db, l);
}

/**
 * Crée (sans `id`) ou remplace un plat et ses ingrédients, tout ou rien. Renvoie son id et l'ancienne photo quand elle a été
 * changée ou retirée (l'appelant efface ses fichiers). Un plat sans nom ou, avec ses ingrédients, sans aucun, est refusé.
 */
export async function enregistrerPlat(
  db: Executeur,
  b: BrouillonPlat,
  id?: string,
  maintenant: number = Date.now(),
): Promise<{ id: string; anciennePhoto: { photo: string; vignette: string } | null }> {
  const nom = b.nom.trim();
  if (!nom) throw new Error("Nom du plat manquant");
  const sans = !!b.sans_ingredients && b.ingredients.length === 0;
  if (!sans && !b.ingredients.length) throw new Error("Plat sans ingrédient");
  const portions = Math.max(1, Math.round(b.portions));
  const poidsCuit = b.poids_cuit_g != null && b.poids_cuit_g > 0 ? b.poids_cuit_g : null;
  return transaction(db, async (db) => {
    const avant = id ? await db.getFirstAsync<LignePlat>(`SELECT ${COLONNES} FROM plats WHERE id = ?`, [id]) : null;
    const platId = avant?.id ?? id ?? nouvelId();
    const photo = b.photo?.photo ?? null;
    const vignette = b.photo?.vignette ?? null;
    const changee = !!avant?.photo && avant.photo !== photo;
    const distante = avant && !changee ? avant.photo_distante : null;
    const champs = [nom, portions, poidsCuit, sans ? 1 : 0, sans ? JSON.stringify(b.nutriments_100g ?? {}) : null, sans ? (b.poids_total_g ?? null) : null, photo, vignette, distante, maintenant];
    if (avant) {
      await db.runAsync(
        "UPDATE plats SET nom = ?, portions = ?, poids_cuit_g = ?, sans_ingredients = ?, nutriments_100g = ?, poids_total_g = ?, photo = ?, photo_vignette = ?, photo_distante = ?, modifie_le = ? WHERE id = ?",
        [...champs, platId],
      );
      if (changee) await noterPhotoDistante(db, avant);
    } else {
      await db.runAsync(
        "INSERT INTO plats (nom, portions, poids_cuit_g, sans_ingredients, nutriments_100g, poids_total_g, photo, photo_vignette, photo_distante, modifie_le, id, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [...champs, platId, maintenant],
      );
    }
    // Ingrédients : ceux qui restent gardent leur id (la synchro n'envoie que ce qui change), les autres partent.
    const gardes = new Set(b.ingredients.map((i) => i.id).filter(Boolean));
    const anciens = await db.getAllAsync<{ id: string }>("SELECT id FROM plat_ingredients WHERE plat_id = ?", [platId]);
    for (const a of anciens) if (!gardes.has(a.id)) await db.runAsync("DELETE FROM plat_ingredients WHERE id = ?", [a.id]);
    for (const [ordre, i] of b.ingredients.entries()) {
      const valeurs = [platId, i.produit_id, JSON.stringify(figer(i.produit)), i.quantite_g, i.unite, i.nb_unites, ordre];
      if (i.id && anciens.some((a) => a.id === i.id)) {
        await db.runAsync("UPDATE plat_ingredients SET plat_id = ?, produit_id = ?, produit = ?, quantite_g = ?, unite = ?, nb_unites = ?, ordre = ? WHERE id = ?", [...valeurs, i.id]);
      } else {
        await db.runAsync("INSERT INTO plat_ingredients (plat_id, produit_id, produit, quantite_g, unite, nb_unites, ordre, id) VALUES (?,?,?,?,?,?,?,?)", [...valeurs, nouvelId()]);
      }
    }
    return { id: platId, anciennePhoto: changee && avant?.photo && avant.photo_vignette ? { photo: avant.photo, vignette: avant.photo_vignette } : null };
  });
}

/**
 * Supprime un plat et ses ingrédients (le journal garde ses lignes, P4). Renvoie sa photo (fichiers à effacer). L'écran
 * attend la fin de « Annuler » (8 s) avant d'appeler : une suppression synchronisée ne se reprend pas.
 */
export async function supprimerPlat(db: Executeur, id: string): Promise<{ photo: string; vignette: string } | null> {
  return transaction(db, async (db) => {
    const p = await db.getFirstAsync<LignePlat>(`SELECT ${COLONNES} FROM plats WHERE id = ?`, [id]);
    if (!p) return null;
    await db.runAsync("DELETE FROM plat_ingredients WHERE plat_id = ?", [id]);
    await db.runAsync("DELETE FROM plats WHERE id = ?", [id]);
    await noterPhotoDistante(db, p);
    return p.photo && p.photo_vignette ? { photo: p.photo, vignette: p.photo_vignette } : null;
  });
}

/** Nom d'une copie (P11) : « Chili con carne (2) », puis (3)… si le nom est pris. */
export function nomCopie(nom: string, pris: ReadonlySet<string>): string {
  const base = nom.replace(/\s\(\d+\)$/, "");
  for (let n = 2; ; n++) {
    const x = `${base} (${n})`;
    if (!pris.has(x)) return x;
  }
}

// ---- Journal ----------------------------------------------------------------------------------------------------------

/** Ce que garde une consommation de plat (colonne `composition`) : les lignes mangées et les ajustements, pour la rouvrir. */
export interface CompositionFigee {
  lignes: LigneComposition[];
  ajustements: [string, Ajustement][];
}

/** Petite empreinte (djb2) d'un texte : clé du produit figé, pour qu'un même plat mangé pareil ne crée qu'un produit. */
function empreinte(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Produit figé d'une quantité de plat (catégorie « plat », hors des listes d'aliments) : réutilisé s'il existe déjà. */
async function produitFigeDe(db: Executeur, plat: Plat, nutriments: Nutriments, portion: Portion): Promise<string> {
  const cle = `plat:${empreinte(JSON.stringify([plat.id, plat.nom, nutriments, portion.grammes]))}`;
  const deja = await db.getFirstAsync<{ id: string }>("SELECT id FROM produits WHERE import_cle = ?", [cle]);
  if (deja) return deja.id;
  const p = await enregistrerProduit(db, { nom: plat.nom, categorie: "plat", nutriments, portions: [portion], source: "perso" });
  await db.runAsync("UPDATE produits SET import_cle = ? WHERE id = ?", [cle, p.id]);
  return p.id;
}

export interface AjoutPlat {
  plat: Plat;
  date: string;
  repasId: string;
  unite: "portion" | "g";
  nb: number;
  ajustements?: ReadonlyMap<string, Ajustement>;
  /** Ligne du journal à modifier (rouverte depuis le journal) ; sinon, une ligne s'ajoute à la fin du repas. */
  consoId?: string;
}

/**
 * Pose un plat au journal, en une ligne (D2) : la composition de la quantité choisie (ajustements « pour cette fois »
 * compris) y est figée (P4), avec un produit figé qui porte ses valeurs pour 100 g. Renvoie l'id de la ligne.
 */
export async function ajouterPlatAuJournal(db: Executeur, a: AjoutPlat, maintenant: number = Date.now()): Promise<string> {
  const grammes = grammesDePlat(a.plat, a.unite, a.nb);
  if (!(grammes > 0)) throw new Error("Quantité illisible");
  const ajustements = a.ajustements ?? new Map<string, Ajustement>();
  const comp = compositionPour(a.plat, grammes, ajustements);
  if (!(comp.poidsG > 0)) throw new Error("Quantité illisible");
  const nutriments = a.plat.sans_ingredients ? (a.plat.nutriments_100g ?? {}) : nutrimentsPour100(comp);
  const portionG = a.unite === "portion" ? comp.poidsG / a.nb : poidsPortion(a.plat);
  const figee: CompositionFigee = { lignes: comp.lignes, ajustements: [...ajustements.entries()] };
  return transaction(db, async (db) => {
    const produitId = await produitFigeDe(db, a.plat, nutriments, { type: "portion", libelle: "", grammes: Math.round(portionG * 10) / 10 });
    // La quantité choisie (portions ou grammes du plat) : relue telle quelle à la réouverture, ajustements à part.
    const nbUnites = a.nb;
    const valeurs = [produitId, Math.round(comp.poidsG * 10) / 10, a.unite, nbUnites, a.plat.id, JSON.stringify(figee), comp.ajuste ? 1 : 0];
    if (a.consoId) {
      await db.runAsync("UPDATE consommations SET produit_id = ?, quantite_g = ?, unite = ?, nb_unites = ?, plat_id = ?, composition = ?, ajuste = ?, repas_id = ? WHERE id = ?", [
        ...valeurs, a.repasId, a.consoId,
      ]);
      return a.consoId;
    }
    const id = nouvelId();
    const fin = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM consommations WHERE date = ? AND repas_id = ?", [a.date, a.repasId]);
    await db.runAsync(
      "INSERT INTO consommations (produit_id, quantite_g, unite, nb_unites, plat_id, composition, ajuste, id, date, repas_id, repete, ordre, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)",
      [...valeurs, id, a.date, a.repasId, (fin?.m ?? -1) + 1, maintenant],
    );
    return id;
  });
}

/** Ligne de plat du journal à rouvrir : sa quantité et ses ajustements. */
export async function consommationDePlat(db: Executeur, consoId: string): Promise<{ plat_id: string; repas_id: string; date: string; unite: Unite; nb_unites: number; ajustements: Map<string, Ajustement> } | null> {
  const l = await db.getFirstAsync<{ plat_id: string | null; repas_id: string; date: string; unite: Unite; nb_unites: number; composition: string | null }>(
    "SELECT plat_id, repas_id, date, unite, nb_unites, composition FROM consommations WHERE id = ?",
    [consoId],
  );
  if (!l?.plat_id) return null;
  const c = lireJson<CompositionFigee | null>(l.composition, null);
  return { plat_id: l.plat_id, repas_id: l.repas_id, date: l.date, unite: l.unite, nb_unites: l.nb_unites, ajustements: new Map(c?.ajustements ?? []) };
}

/** Ce que l'appli sait d'un plat (bloc « Ce plat ») : fois ce mois-ci, portions au total, repas le plus fréquent, création. */
export interface StatsPlat {
  foisMois: number;
  portions: number;
  repasFrequent: string | null;
}
export async function statsPlat(db: Executeur, plat: Plat, debutMois: string): Promise<StatsPlat> {
  const m = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM consommations WHERE plat_id = ? AND date >= ?", [plat.id, debutMois]);
  const l = await db.getAllAsync<{ unite: Unite; nb_unites: number; quantite_g: number }>("SELECT unite, nb_unites, quantite_g FROM consommations WHERE plat_id = ?", [plat.id]);
  const portion = poidsPortion(plat);
  const portions = l.reduce((s, x) => s + (x.unite === "portion" ? x.nb_unites : portion > 0 ? x.quantite_g / portion : 0), 0);
  const r = await db.getFirstAsync<{ repas_id: string }>("SELECT repas_id, COUNT(*) AS n, MAX(date) AS d FROM consommations WHERE plat_id = ? GROUP BY repas_id ORDER BY n DESC, d DESC LIMIT 1", [plat.id]);
  return { foisMois: m?.n ?? 0, portions, repasFrequent: r?.repas_id ?? null };
}

// ---- Repas → plat (P9) ------------------------------------------------------------------------------------------------

/**
 * Les aliments d'un repas, avec leurs quantités, en ingrédients d'un nouveau plat (une portion). Une ligne qui est déjà un
 * plat donne ses ingrédients (pas de plat dans un plat). Le journal ne change pas.
 */
export async function brouillonDepuisRepas(db: Executeur, date: string, repasId: string): Promise<BrouillonPlat> {
  const l = await db.getAllAsync<{ produit_id: string; quantite_g: number; unite: Unite; nb_unites: number; composition: string | null }>(
    "SELECT produit_id, quantite_g, unite, nb_unites, composition FROM consommations WHERE date = ? AND repas_id = ? ORDER BY ordre, cree_le",
    [date, repasId],
  );
  const ingredients: BrouillonPlat["ingredients"] = [];
  for (const x of l) {
    const c = lireJson<CompositionFigee | null>(x.composition, null);
    if (c?.lignes.length) {
      for (const y of c.lignes) ingredients.push({ produit_id: y.produit_id, produit: y.produit, quantite_g: y.quantite_g, unite: y.unite, nb_unites: y.nb_unites });
      continue;
    }
    const p = await produitParId(db, x.produit_id);
    if (!p) continue;
    ingredients.push({ produit_id: p.id, produit: figer(p), quantite_g: x.quantite_g, unite: x.unite, nb_unites: x.nb_unites });
  }
  return { nom: "", portions: 1, poids_cuit_g: null, ingredients, photo: null };
}

// ---- Recettes Fitatu (P12) --------------------------------------------------------------------------------------------

/**
 * Les recettes Fitatu déjà importées (produits « fitatu:recette:* ») deviennent des plats sans ingrédients (valeurs pour
 * 100 g, une portion de leur poids connu, sinon de 100 g) ; leurs consommations suivent (plat_id). Le produit reste, en
 * catégorie « plat » (hors des listes d'aliments) : il porte toujours les valeurs des lignes du journal. Idempotent ;
 * renvoie le nombre de plats créés.
 */
export async function recettesFitatuEnPlats(db: Executeur, maintenant: number = Date.now()): Promise<number> {
  const l = await db.getAllAsync<{ id: string; nom: string; nutriments: string; portions: string; import_cle: string }>(
    "SELECT id, nom, nutriments, portions, import_cle FROM produits WHERE import_cle LIKE 'fitatu:recette:%'",
    [],
  );
  let n = 0;
  for (const p of l) {
    const deja = await db.getFirstAsync<{ id: string }>("SELECT id FROM plats WHERE import_cle = ?", [p.import_cle]);
    const portion = lireJson<Portion[]>(p.portions, []).find((x) => x.grammes > 0);
    await transaction(db, async (db) => {
      let platId = deja?.id;
      if (!platId) {
        platId = nouvelId();
        await db.runAsync(
          "INSERT INTO plats (id, nom, portions, poids_cuit_g, source, import_cle, sans_ingredients, nutriments_100g, poids_total_g, cree_le, modifie_le) VALUES (?,?,1,NULL,'fitatu',?,1,?,?,?,?)",
          [platId, p.nom, p.import_cle, p.nutriments, portion?.grammes ?? 100, maintenant, maintenant],
        );
        n++;
      }
      await db.runAsync("UPDATE produits SET categorie = 'plat' WHERE id = ?", [p.id]);
      await db.runAsync("UPDATE consommations SET plat_id = ? WHERE produit_id = ? AND plat_id IS NULL", [platId, p.id]);
    });
  }
  return n;
}

/** kcal d'une portion (sous-lignes des listes). */
export const kcalPortion = (p: Plat) => totalPlat(p).kcal / Math.max(1, p.portions);

/** Chemins des photos de plats (ménage des fichiers orphelins, sauvegarde). */
export async function cheminsPhotosPlats(db: Executeur): Promise<string[]> {
  const l = await db.getAllAsync<{ photo: string; photo_vignette: string }>("SELECT photo, photo_vignette FROM plats WHERE photo IS NOT NULL AND photo_vignette IS NOT NULL", []);
  return l.flatMap((x) => [x.photo, x.photo_vignette]);
}
