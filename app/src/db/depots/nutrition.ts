import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { macrosPourQuantite, totaux, type Macros, type Nutriments, type Portion, type Unite } from "../../nutrition/calculs";
import type { ProduitOff } from "../../nutrition/off";
import { variantesCode } from "../../nutrition/codes";
import { garderPortionsPerso } from "../../nutrition/quantite";

// Produits (copie locale), repas et consommations du journal (Nutrition, lot 1).

export interface Produit {
  id: string;
  code_barres: string | null;
  nom: string;
  marque: string | null;
  categorie: string | null;
  base: "100g" | "100ml";
  nutriments: Nutriments;
  portions: Portion[];
  nutriscore: string | null;
  nova: number | null;
  ingredients: string | null;
  source: "off" | "fonte" | "perso"; // identifiant de protocole figé : ne pas renommer (valeur stockée)
  licence: string | null;
  off_maj: number | null;
  cree_le: number;
  vu_le: number;
  favori: boolean;
  /** Clé d'origine d'un produit importé (« fitatu:… »), sinon null. */
  import_cle: string | null;
}

interface LigneProduit extends Omit<Produit, "nutriments" | "portions" | "favori"> {
  nutriments: string;
  portions: string;
  favori: number;
}

/** Hors des listes d'aliments : les produits figés des plats mangés (catégorie « plat », depots/plats.ts). */
const PAS_PLAT = "COALESCE(categorie, '') <> 'plat'";
/** Hors des listes : un produit en double fusionné par la synchro dans le plus ancien (sync/moteur.ts, fusionner). */
const ACTUEL = "remplace_par IS NULL";

/**
 * Les aliments mangés (table `manges`, à poser dans un WITH) : une ligne par consommation, sauf celle d'un plat, remplacée
 * par les ingrédients de sa composition figée (quantités déjà au prorata de la portion). Un plat sans ingrédients (recette
 * Fitatu sans détail) reste une ligne, son produit figé. `cle` regroupe un aliment : le produit, ou « plat:<id> » pour un
 * plat sans ingrédients (ses produits figés successifs ne font qu'un). Une composition illisible compte comme un aliment.
 */
const JSON_COMPO = "(CASE WHEN json_valid(c.composition) THEN c.composition ELSE '{}' END)";
/** `manges` ; `borne` : seulement depuis une date (« c.date >= ? », deux fois, un paramètre par branche). */
const manges = (borne = false) => `manges AS (
  SELECT c.id, c.date, c.repas_id, c.cree_le, c.produit_id, c.quantite_g, c.unite, c.nb_unites,
    CASE WHEN c.plat_id IS NULL THEN c.produit_id ELSE 'plat:' || c.plat_id END AS cle, c.plat_id
  FROM consommations c WHERE COALESCE(json_array_length(${JSON_COMPO}, '$.lignes'), 0) = 0${borne ? " AND c.date >= ?" : ""}
  UNION ALL
  SELECT c.id, c.date, c.repas_id, c.cree_le, json_extract(l.value, '$.produit_id'), json_extract(l.value, '$.quantite_g'), json_extract(l.value, '$.unite'),
    json_extract(l.value, '$.nb_unites'), json_extract(l.value, '$.produit_id'), NULL
  FROM consommations c, json_each(${JSON_COMPO}, '$.lignes') l${borne ? " WHERE c.date >= ?" : ""}
)`;
const MANGES = manges();

const COLONNES = "id, code_barres, nom, marque, categorie, base, nutriments, portions, nutriscore, nova, ingredients, source, licence, off_maj, cree_le, vu_le, favori";
/** Colonnes lues : celles qu'on écrit, plus la clé d'import (« fitatu:… »). */
const LUES = `${COLONNES}, import_cle`;

function lireJson<T>(texte: string, defaut: T): T {
  try {
    return JSON.parse(texte) as T;
  } catch {
    return defaut;
  }
}

const versProduit = (l: LigneProduit): Produit => ({ ...l, nutriments: lireJson<Nutriments>(l.nutriments, {}), portions: lireJson<Portion[]>(l.portions, []), favori: l.favori === 1 });

export interface NouveauProduit {
  code_barres?: string | null;
  nom: string;
  marque?: string | null;
  categorie?: string | null;
  base?: "100g" | "100ml";
  nutriments: Nutriments;
  portions?: Portion[];
  nutriscore?: string | null;
  nova?: number | null;
  ingredients?: string | null;
  source: Produit["source"];
  off_maj?: number | null;
}

/** Ajoute un produit ; si son code-barres est déjà connu, la fiche existante est mise à jour (source Open Food Facts) et renvoyée. */
export async function enregistrerProduit(db: Executeur, p: NouveauProduit, maintenant: number = Date.now()): Promise<Produit> {
  const nom = p.nom.trim();
  if (!nom) throw new Error("Nom du produit manquant");
  const existant = p.code_barres ? await produitParCode(db, p.code_barres) : null;
  const licence = p.source === "off" ? "ODbL" : null;
  if (existant) {
    // Les poids saisis sur la fiche (portion, paquet) restent : seule la fiche locale les connaît, jamais Open Food Facts.
    const portions = garderPortionsPerso(existant.portions, p.portions ?? []);
    await db.runAsync(
      "UPDATE produits SET nom = ?, marque = ?, categorie = ?, base = ?, nutriments = ?, portions = ?, nutriscore = ?, nova = ?, ingredients = ?, source = ?, licence = ?, off_maj = ? WHERE id = ?",
      [nom, p.marque ?? null, p.categorie ?? null, p.base ?? "100g", JSON.stringify(p.nutriments), JSON.stringify(portions), p.nutriscore ?? null, p.nova ?? null, p.ingredients ?? null, p.source, licence, p.off_maj ?? null, existant.id],
    );
    return (await produitParId(db, existant.id))!;
  }
  const id = nouvelId();
  await db.runAsync(`INSERT INTO produits (${COLONNES}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`, [
    id, p.code_barres ?? null, nom, p.marque ?? null, p.categorie ?? null, p.base ?? "100g", JSON.stringify(p.nutriments), JSON.stringify(p.portions ?? []),
    p.nutriscore ?? null, p.nova ?? null, p.ingredients ?? null, p.source, licence, p.off_maj ?? null, maintenant, maintenant,
  ]);
  return (await produitParId(db, id))!;
}

/** Un produit d'Open Food Facts, gardé dans la copie locale dès qu'il est affiché. */
export const enregistrerProduitOff = (db: Executeur, o: ProduitOff) =>
  enregistrerProduit(db, {
    code_barres: o.codeBarres, nom: o.nom, marque: o.marque, categorie: o.categorie, base: o.base, nutriments: o.nutriments, portions: o.portions,
    nutriscore: o.nutriscore, nova: o.nova, ingredients: o.ingredients, source: "off", off_maj: o.offMaj,
  });

/** Par code-barres : la copie locale, puis Open Food Facts ; le produit trouvé en ligne est gardé. */
export async function trouverParCode(db: Executeur, code: string, off: (c: string) => Promise<ProduitOff | null>): Promise<Produit | null> {
  const local = await produitParCode(db, code);
  if (local) return local;
  const o = await off(code);
  return o ? enregistrerProduitOff(db, o) : null;
}

export async function produitParId(db: Executeur, id: string): Promise<Produit | null> {
  const l = await db.getFirstAsync<LigneProduit>(`SELECT ${LUES} FROM produits WHERE id = ?`, [id]);
  return l ? versProduit(l) : null;
}

/**
 * Un produit par code-barres, sous n'importe quelle forme équivalente (UPC-A, zéro de tête, espaces : nutrition/codes.ts) :
 * la copie locale d'abord, par l'index ; sinon le code gardé avec des espaces ou des tirets (fiche saisie à la main).
 */
export async function produitParCode(db: Executeur, code: string): Promise<Produit | null> {
  // Une chaîne qui n'est pas un code (trop courte, trop longue) se compare telle quelle : l'index unique la refuserait en double.
  const formes = variantesCode(code).length ? variantesCode(code) : code.trim() ? [code.trim()] : [];
  if (!formes.length) return null;
  const marques = formes.map(() => "?").join(", ");
  const l =
    (await db.getFirstAsync<LigneProduit>(`SELECT ${LUES} FROM produits WHERE code_barres IN (${marques}) ORDER BY cree_le LIMIT 1`, formes)) ??
    (await db.getFirstAsync<LigneProduit>(
      `SELECT ${LUES} FROM produits WHERE code_barres IS NOT NULL AND REPLACE(REPLACE(REPLACE(code_barres, ' ', ''), '-', ''), '.', '') IN (${marques}) ORDER BY cree_le LIMIT 1`,
      formes,
    ));
  return l ? versProduit(l) : null;
}

/** Recherche locale : chaque mot doit figurer dans le nom ou la marque, sans tenir compte de la casse. */
export async function chercherLocal(db: Executeur, texte: string, limite = 30): Promise<Produit[]> {
  const mots = texte.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];
  const cond = mots.map(() => "(LOWER(nom) LIKE ? OR LOWER(COALESCE(marque, '')) LIKE ?)").join(" AND ");
  const params = mots.flatMap((m) => [`%${m}%`, `%${m}%`]);
  const l = await db.getAllAsync<LigneProduit>(`SELECT ${LUES} FROM produits WHERE ${cond} AND ${PAS_PLAT} AND ${ACTUEL} ORDER BY favori DESC, nom LIMIT ?`, [...params, limite]);
  return l.map(versProduit);
}

export async function listerFavoris(db: Executeur): Promise<Produit[]> {
  return (await db.getAllAsync<LigneProduit>(`SELECT ${LUES} FROM produits WHERE favori = 1 AND ${ACTUEL} ORDER BY nom`, [])).map(versProduit);
}

export async function listerProduitsPerso(db: Executeur): Promise<Produit[]> {
  return (await db.getAllAsync<LigneProduit>(`SELECT ${LUES} FROM produits WHERE source = 'perso' AND COALESCE(categorie, '') <> 'rapide' AND (import_cle IS NULL OR import_cle LIKE 'fitatu:perso:%') AND ${ACTUEL} ORDER BY nom`, [])).map(versProduit);
}

/**
 * Portions et poids du paquet d'une fiche, saisis par la personne : écrits sur la copie locale du produit seulement (jamais
 * renvoyés à Open Food Facts ni à Fitatu). La ligne `produits` voyage avec la synchro (le déclencheur de la migration 49 couvre
 * toute mise à jour) ; le nom et les valeurs nutritives y sont chiffrés, les poids restent en clair comme partout (sync/schema.ts).
 */
export async function modifierPortionsProduit(db: Executeur, id: string, portions: readonly Portion[]): Promise<void> {
  await db.runAsync("UPDATE produits SET portions = ? WHERE id = ?", [JSON.stringify(portions), id]);
}

export async function basculerFavori(db: Executeur, id: string, favori: boolean): Promise<void> {
  await db.runAsync("UPDATE produits SET favori = ? WHERE id = ?", [favori ? 1 : 0, id]);
}

/**
 * Produits récemment consommés dans ce repas (null : dans tous, pour les ingrédients d'un plat), le plus récent d'abord ;
 * les ingrédients d'un plat mangé comptent (les plats ont leurs propres récents).
 */
export async function recentsDuRepas(db: Executeur, repasId: string | null, limite = 12, aujourdhui: string = cleDuJour(Date.now())): Promise<Produit[]> {
  // Les 90 derniers jours d'abord (audit de performance, M10 : tout l'historique relu à chaque ouverture d'Ajouter) ; tout
  // l'historique seulement s'ils n'en donnent pas assez.
  const lire = async (depuis: string | null) =>
    (
      await db.getAllAsync<LigneProduit>(
        `WITH ${manges(depuis != null)} SELECT ${LUES.split(", ").map((c) => `p.${c}`).join(", ")} FROM produits p
         JOIN (SELECT produit_id, MAX(cree_le) AS dernier FROM manges ${repasId == null ? "" : "WHERE repas_id = ?"} GROUP BY produit_id) c ON c.produit_id = p.id
         WHERE COALESCE(p.categorie, '') <> 'plat' AND p.${ACTUEL}
         ORDER BY c.dernier DESC LIMIT ?`,
        [...(depuis != null ? [depuis, depuis] : []), ...(repasId == null ? [] : [repasId]), limite],
      )
    ).map(versProduit);
  const recents = await lire(decalerCle(aujourdhui, -RECENTS_JOURS));
  return recents.length >= limite ? recents : lire(null);
}

/** Fenêtre des récents d'un repas (jours). */
const RECENTS_JOURS = 90;
const cleDuJour = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const decalerCle = (j: string, n: number) => {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  return cleDuJour(new Date(a, m - 1, d + n).getTime());
};

/** Dernière quantité consommée de chaque produit (dans ce repas s'il est donné, sinon partout ; ingrédients des plats compris). */
export interface Quantite {
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
}
export async function dernieresQuantites(db: Executeur, produitIds: readonly string[], repasId: string | null = null): Promise<Map<string, Quantite>> {
  const res = new Map<string, Quantite>();
  if (!produitIds.length) return res;
  const marques = produitIds.map(() => "?").join(",");
  const l = await db.getAllAsync<Quantite & { produit_id: string }>(
    `WITH ${MANGES} SELECT produit_id, quantite_g, unite, nb_unites FROM manges WHERE produit_id IN (${marques}) ${repasId ? "AND repas_id = ?" : ""} ORDER BY date DESC, cree_le DESC`,
    repasId ? [...produitIds, repasId] : [...produitIds],
  );
  for (const x of l) if (!res.has(x.produit_id)) res.set(x.produit_id, { quantite_g: x.quantite_g, unite: x.unite, nb_unites: x.nb_unites });
  return res;
}

/** Nombre de consommations de chaque produit depuis `depuis` (« AAAA-MM-JJ »), dans les plats compris. */
export async function foisDepuis(db: Executeur, produitIds: readonly string[], depuis: string): Promise<Map<string, number>> {
  const res = new Map<string, number>();
  if (!produitIds.length) return res;
  const l = await db.getAllAsync<{ produit_id: string; n: number }>(
    `WITH ${MANGES} SELECT produit_id, COUNT(*) AS n FROM manges WHERE date >= ? AND produit_id IN (${produitIds.map(() => "?").join(",")}) GROUP BY produit_id`,
    [depuis, ...produitIds],
  );
  for (const x of l) res.set(x.produit_id, x.n);
  return res;
}

/**
 * Ce que l'appli sait d'un produit (bloc « Ce produit ») : fois ce mois-ci, quantité totale, repas le plus fréquent, première
 * fois ; un plat mangé compte pour ses ingrédients, au prorata de la portion.
 */
export interface StatsProduit {
  foisMois: number;
  totalG: number;
  repasFrequent: string | null;
  premiere: string | null;
}
export async function statsProduit(db: Executeur, produitId: string, debutMois: string): Promise<StatsProduit> {
  const a = await db.getFirstAsync<{ total: number | null; premiere: string | null }>(`WITH ${MANGES} SELECT SUM(quantite_g) AS total, MIN(date) AS premiere FROM manges WHERE produit_id = ?`, [produitId]);
  const m = await db.getFirstAsync<{ n: number }>(`WITH ${MANGES} SELECT COUNT(*) AS n FROM manges WHERE produit_id = ? AND date >= ?`, [produitId, debutMois]);
  const r = await db.getFirstAsync<{ repas_id: string }>(`WITH ${MANGES} SELECT repas_id, COUNT(*) AS n, MAX(date) AS d FROM manges WHERE produit_id = ? GROUP BY repas_id ORDER BY n DESC, d DESC LIMIT 1`, [produitId]);
  return { foisMois: m?.n ?? 0, totalG: a?.total ?? 0, repasFrequent: r?.repas_id ?? null, premiere: a?.premiere ?? null };
}

/** Nombre d'aliments différents déjà consommés (« Mes aliments · 214 produits ») : ingrédients des plats et plats sans ingrédients compris. */
export async function nbProduitsConsommes(db: Executeur): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>(`WITH ${MANGES} SELECT COUNT(DISTINCT m.cle) AS n FROM manges m JOIN produits p ON p.id = m.produit_id`, []))?.n ?? 0;
}

/** Ajout rapide : un produit perso (catégorie « rapide », hors de « Mes produits ») dont les valeurs sont celles d'une portion. Tout ou rien. */
export function ajoutRapide(db: Executeur, a: { nom: string; proteines: number; lipides: number; glucides: number; date: string; repasId: string }): Promise<string> {
  return transaction(db, async (db) => {
    const p = await enregistrerProduit(db, {
      nom: a.nom.trim() || "—",
      categorie: "rapide",
      nutriments: { proteines: a.proteines, lipides: a.lipides, glucides: a.glucides },
      portions: [{ type: "portion", libelle: "1", grammes: 100 }],
      source: "perso",
    });
    return ajouterConsommation(db, { date: a.date, repasId: a.repasId, produitId: p.id, quantiteG: 100, unite: "portion", nbUnites: 1 });
  });
}

// ---- Repas et journal ---------------------------------------------------------------------------------------------

export interface Repas {
  id: string;
  cle: string;
  nom: string | null;
  ordre: number;
  heure_min: number;
  actif: boolean;
}

/** Repas, dans leur ordre ; `tous` : éteints compris (Repas et horaires). */
export async function listerRepas(db: Executeur, tous = false): Promise<Repas[]> {
  const l = await db.getAllAsync<Omit<Repas, "actif"> & { actif: number }>(`SELECT id, cle, nom, ordre, heure_min, actif FROM repas ${tous ? "" : "WHERE actif = 1"} ORDER BY ordre`, []);
  return l.map((r) => ({ ...r, actif: r.actif === 1 }));
}

/** Repas et horaires : allume ou éteint un repas, change son heure. */
export async function modifierRepas(db: Executeur, id: string, m: { actif?: boolean; heureMin?: number; nom?: string | null }): Promise<void> {
  if (m.actif != null) await db.runAsync("UPDATE repas SET actif = ? WHERE id = ?", [m.actif ? 1 : 0, id]);
  if (m.heureMin != null) await db.runAsync("UPDATE repas SET heure_min = ? WHERE id = ?", [m.heureMin, id]);
  if (m.nom !== undefined) await db.runAsync("UPDATE repas SET nom = ? WHERE id = ?", [m.nom, id]);
}

/** Supprime un repas ajouté à la main et jamais utilisé ; les cinq repas d'origine (ou un repas qui a un historique) s'éteignent seulement. */
export async function supprimerRepas(db: Executeur, id: string): Promise<boolean> {
  const r = await db.getFirstAsync<{ cle: string }>("SELECT cle FROM repas WHERE id = ?", [id]);
  const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM consommations WHERE repas_id = ?", [id]);
  if (!r || r.cle !== id || (n?.n ?? 0) > 0) {
    await db.runAsync("UPDATE repas SET actif = 0 WHERE id = ?", [id]);
    return false;
  }
  await db.runAsync("DELETE FROM repas WHERE id = ?", [id]);
  return true;
}

/** Nouvel ordre des repas (ids dans l'ordre voulu). */
export async function ordonnerRepas(db: Executeur, ids: readonly string[]): Promise<void> {
  for (const [i, id] of ids.entries()) await db.runAsync("UPDATE repas SET ordre = ? WHERE id = ?", [i, id]);
}

/** Ajoute un repas nommé, allumé, à la fin. */
export async function ajouterRepas(db: Executeur, nom: string, heureMin: number): Promise<string> {
  const id = `repas:${nouvelId()}`;
  const fin = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM repas", []);
  await db.runAsync("INSERT INTO repas (id, cle, nom, ordre, heure_min, actif) VALUES (?,?,?,?,?,1)", [id, id, nom.trim(), (fin?.m ?? -1) + 1, heureMin]);
  return id;
}

/** Repas de l'heure : celui dont l'horaire est le dernier atteint (le premier avant l'aube). */
export function repasDeLHeure(repas: readonly Repas[], minuteDuJour: number): Repas | null {
  const tries = [...repas].sort((a, b) => a.heure_min - b.heure_min);
  let choisi = tries[0] ?? null;
  for (const r of tries) if (r.heure_min <= minuteDuJour) choisi = r;
  return choisi;
}

export interface Consommation {
  id: string;
  date: string;
  repas_id: string;
  produit_id: string;
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
  repete: boolean;
  ordre: number;
  produit: Produit;
  macros: Macros;
  /** Clé d'origine d'une consommation importée : gardée si on l'annule puis la remet. */
  import_cle?: string | null;
  /** Ligne d'un plat (D2) : son plat, sa composition figée (JSON, P4), un ingrédient ajusté pour cette fois (P5). */
  plat_id?: string | null;
  composition?: string | null;
  ajuste?: boolean;
}

interface LigneConso {
  id: string;
  date: string;
  repas_id: string;
  produit_id: string;
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
  repete: number;
  ordre: number;
  import_cle?: string | null;
  plat_id?: string | null;
  composition?: string | null;
  ajuste?: number;
}

/** Une consommation, avec son produit et ses macros ; l'approximation vient d'une énergie recalculée ou d'une unité au poids inconnu. */
function enrichir(l: LigneConso, produit: Produit): Consommation {
  return { ...l, repete: l.repete === 1, ajuste: l.ajuste === 1, produit, macros: macrosPourQuantite(produit.nutriments, l.quantite_g) };
}

/** Colonnes d'une consommation jointe à son produit (préfixe « p_ » pour celles du produit). */
const CONSO_PRODUIT = `c.id, c.date, c.repas_id, c.produit_id, c.quantite_g, c.unite, c.nb_unites, c.repete, c.ordre, c.import_cle, c.plat_id, c.composition, c.ajuste,
  ${LUES.split(", ").map((x) => `p.${x} AS p_${x}`).join(", ")}`;

/** Une ligne de la jointure → la consommation et son produit (même conversion que produitParId). */
function deJointure(x: Record<string, unknown>): Consommation {
  const c: Record<string, unknown> = {};
  const p: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (k.startsWith("p_")) p[k.slice(2)] = v;
    else c[k] = v;
  }
  return enrichir(c as unknown as LigneConso, versProduit(p as unknown as LigneProduit));
}

/** Consommations d'un jour avec leur produit, en une lecture (jointure) ; une ligne dont le produit manque est écartée. */
export async function consommationsDuJour(db: Executeur, date: string): Promise<Consommation[]> {
  const l = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${CONSO_PRODUIT} FROM consommations c JOIN produits p ON p.id = c.produit_id WHERE c.date = ? ORDER BY c.repas_id, c.ordre, c.cree_le`,
    [date],
  );
  return l.map(deJointure);
}

/** Consommations de `debut` à `fin` (« AAAA-MM-JJ », inclus), par date, en une lecture : le bilan d'énergie de plusieurs jours. */
export async function consommationsEntre(db: Executeur, debut: string, fin: string): Promise<Map<string, Consommation[]>> {
  const l = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${CONSO_PRODUIT} FROM consommations c JOIN produits p ON p.id = c.produit_id WHERE c.date >= ? AND c.date <= ? ORDER BY c.date, c.repas_id, c.ordre, c.cree_le`,
    [debut, fin],
  );
  const m = new Map<string, Consommation[]>();
  for (const x of l) {
    const c = deJointure(x);
    const jour = m.get(c.date);
    if (jour) jour.push(c);
    else m.set(c.date, [c]);
  }
  return m;
}

/** Produits par identifiant, en une lecture ; ceux qui manquent sont absents de la table rendue. */
export async function produitsParIds(db: Executeur, ids: readonly string[]): Promise<Map<string, Produit>> {
  const m = new Map<string, Produit>();
  const uniques = [...new Set(ids)];
  // par paquets : SQLite borne le nombre de paramètres d'une requête
  for (let i = 0; i < uniques.length; i += 500) {
    const lot = uniques.slice(i, i + 500);
    const l = await db.getAllAsync<LigneProduit>(`SELECT ${LUES} FROM produits WHERE id IN (${lot.map(() => "?").join(",")})`, lot);
    for (const x of l) m.set(x.id, versProduit(x));
  }
  return m;
}

export interface AjoutConsommation {
  date: string;
  repasId: string;
  produitId: string;
  quantiteG: number;
  unite: Unite;
  nbUnites: number;
  repete?: boolean;
  /** Ligne d'un plat recopiée (Copier, Répéter) : elle garde son plat et sa composition. */
  plat?: { platId: string | null; composition: string | null; ajuste: boolean };
  /** Clé d'origine (unique) : une répétition faite sur deux appareils ne fait qu'une ligne une fois synchronisée. */
  importCle?: string;
}

export async function ajouterConsommation(db: Executeur, a: AjoutConsommation, maintenant: number = Date.now()): Promise<string> {
  if (!(a.quantiteG > 0)) throw new Error("Quantité illisible");
  const id = nouvelId();
  const fin = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM consommations WHERE date = ? AND repas_id = ?", [a.date, a.repasId]);
  await db.runAsync("INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, unite, nb_unites, repete, ordre, cree_le, plat_id, composition, ajuste, import_cle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    id, a.date, a.repasId, a.produitId, a.quantiteG, a.unite, a.nbUnites, a.repete ? 1 : 0, (fin?.m ?? -1) + 1, maintenant,
    a.plat?.platId ?? null, a.plat?.composition ?? null, a.plat?.ajuste ? 1 : 0, a.importCle ?? null,
  ]);
  return id;
}

export async function modifierConsommation(db: Executeur, id: string, q: { quantiteG: number; unite: Unite; nbUnites: number }): Promise<void> {
  if (!(q.quantiteG > 0)) throw new Error("Quantité illisible");
  await db.runAsync("UPDATE consommations SET quantite_g = ?, unite = ?, nb_unites = ? WHERE id = ?", [q.quantiteG, q.unite, q.nbUnites, id]);
}

export async function supprimerConsommation(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM consommations WHERE id = ?", [id]);
}

/** Remet une consommation supprimée (Annuler) à sa place d'origine. */
export async function restaurerConsommation(db: Executeur, c: Consommation): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO consommations (id, date, repas_id, produit_id, quantite_g, unite, nb_unites, repete, ordre, cree_le, import_cle, plat_id, composition, ajuste) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    c.id, c.date, c.repas_id, c.produit_id, c.quantite_g, c.unite, c.nb_unites, c.repete ? 1 : 0, c.ordre, Date.now(), c.import_cle ?? null, c.plat_id ?? null, c.composition ?? null, c.ajuste ? 1 : 0,
  ]);
}

/** Déplace une consommation vers `repasId` à la position `index` de ce repas (ordre renuméroté des deux repas). */
export async function deplacerConsommation(db: Executeur, id: string, repasId: string, index: number): Promise<void> {
  const c = await db.getFirstAsync<{ date: string; repas_id: string }>("SELECT date, repas_id FROM consommations WHERE id = ?", [id]);
  if (!c) return;
  await transaction(db, async (db) => {
    const dest = (await db.getAllAsync<{ id: string }>("SELECT id FROM consommations WHERE date = ? AND repas_id = ? AND id <> ? ORDER BY ordre, cree_le", [c.date, repasId, id])).map((x) => x.id);
    dest.splice(Math.max(0, Math.min(dest.length, index)), 0, id);
    await db.runAsync("UPDATE consommations SET repas_id = ? WHERE id = ?", [repasId, id]);
    for (const [i, cid] of dest.entries()) await db.runAsync("UPDATE consommations SET ordre = ? WHERE id = ?", [i, cid]);
    if (c.repas_id !== repasId) {
      const source = await db.getAllAsync<{ id: string }>("SELECT id FROM consommations WHERE date = ? AND repas_id = ? ORDER BY ordre, cree_le", [c.date, c.repas_id]);
      for (const [i, s] of source.entries()) await db.runAsync("UPDATE consommations SET ordre = ? WHERE id = ?", [i, s.id]);
    }
  });
}

/** Plat d'une ligne recopiée (Copier, Répéter) : sa composition et ses ajustements la suivent. */
const platDe = (x: LigneConso): AjoutConsommation["plat"] => (x.plat_id || x.composition ? { platId: x.plat_id ?? null, composition: x.composition ?? null, ajuste: x.ajuste === 1 } : undefined);

/** Répète un repas d'un jour vers un autre (D5) : directement au journal, lignes marquées ↻. Renvoie le nombre de lignes ajoutées. */
export async function repeterRepas(
  db: Executeur,
  de: { date: string; repasId: string },
  vers: { date: string; repasId: string },
  auto = false,
): Promise<number> {
  const l = await db.getAllAsync<LigneConso>("SELECT id, date, repas_id, produit_id, quantite_g, unite, nb_unites, repete, ordre, plat_id, composition, ajuste FROM consommations WHERE date = ? AND repas_id = ? ORDER BY ordre, cree_le", [de.date, de.repasId]);
  // Répétition automatique : clé tirée du repas, du jour et de la ligne d'origine, la même sur tous les appareils (synchro).
  for (const x of l) {
    await ajouterConsommation(db, {
      date: vers.date, repasId: vers.repasId, produitId: x.produit_id, quantiteG: x.quantite_g, unite: x.unite, nbUnites: x.nb_unites, repete: true, plat: platDe(x),
      importCle: auto ? `repete:${vers.repasId}:${vers.date}:${x.id}` : undefined,
    });
  }
  return l.length;
}

/** Consommations d'un repas un jour donné, dans l'ordre. */
export async function consommationsDuRepas(db: Executeur, date: string, repasId: string): Promise<Consommation[]> {
  return (await consommationsDuJour(db, date)).filter((c) => c.repas_id === repasId).sort((a, b) => a.ordre - b.ordre);
}

/** Jours (« AAAA-MM-JJ ») entre `debut` et `fin` inclus où le journal a au moins un aliment. */
export async function joursRemplis(db: Executeur, debut: string, fin: string): Promise<Set<string>> {
  const l = await db.getAllAsync<{ date: string }>("SELECT DISTINCT date FROM consommations WHERE date >= ? AND date <= ?", [debut, fin]);
  return new Set(l.map((x) => x.date));
}

/** kcal de chaque jour rempli entre `debut` et `fin` (page du mois). */
export async function kcalParJour(db: Executeur, debut: string, fin: string): Promise<Map<string, number>> {
  const l = await db.getAllAsync<{ date: string; quantite_g: number; nutriments: string }>(
    "SELECT c.date, c.quantite_g, p.nutriments FROM consommations c JOIN produits p ON p.id = c.produit_id WHERE c.date >= ? AND c.date <= ?",
    [debut, fin],
  );
  const res = new Map<string, number>();
  for (const x of l) res.set(x.date, (res.get(x.date) ?? 0) + macrosPourQuantite(lireJson<Nutriments>(x.nutriments, {}), x.quantite_g).kcal);
  return res;
}

/** Premier jour qui a un repas noté (borne de la liste de la page du mois), null sans repas. */
export async function premierJourNutrition(db: Executeur): Promise<string | null> {
  const x = await db.getFirstAsync<{ d: string | null }>("SELECT MIN(date) AS d FROM consommations", []);
  return x?.d ?? null;
}

/** Copie des consommations (Copier d'un autre jour) à la fin d'un repas ; renvoie le nombre de lignes ajoutées. */
export async function copierConsommations(db: Executeur, ids: readonly string[], vers: { date: string; repasId: string }): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const x = await db.getFirstAsync<LigneConso>("SELECT id, date, repas_id, produit_id, quantite_g, unite, nb_unites, repete, ordre, plat_id, composition, ajuste FROM consommations WHERE id = ?", [id]);
    if (!x) continue;
    await ajouterConsommation(db, { date: vers.date, repasId: vers.repasId, produitId: x.produit_id, quantiteG: x.quantite_g, unite: x.unite, nbUnites: x.nb_unites, plat: platDe(x) });
    n++;
  }
  return n;
}

// ---- Répéter un repas (D5) --------------------------------------------------------------------------------------------

export type RegleRepetition = "jamais" | "tous" | "entrainement" | "repos" | "semaine";
export const REGLES_REPETITION: readonly RegleRepetition[] = ["jamais", "tous", "entrainement", "repos", "semaine"];
export interface Repetition {
  regle: RegleRepetition;
  /** Jour modèle : son contenu est repris. */
  date: string;
}

const cleRepetition = (repasId: string) => `nutri_repeter:${repasId}`;

export async function lireRepetition(db: Executeur, repasId: string): Promise<Repetition | null> {
  const v = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [cleRepetition(repasId)]);
  const r = v ? lireJson<Repetition | null>(v.valeur, null) : null;
  return r && r.regle !== "jamais" ? r : null;
}

export async function ecrireRepetition(db: Executeur, repasId: string, r: Repetition): Promise<void> {
  await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", [cleRepetition(repasId), JSON.stringify(r)]);
}

/** Le jour `date` relève-t-il de la règle ? (lundi au vendredi, jour d'entraînement ou de repos.) */
export function regleVaut(regle: RegleRepetition, date: string, entrainement: boolean): boolean {
  if (regle === "jamais") return false;
  if (regle === "tous") return true;
  if (regle === "entrainement") return entrainement;
  if (regle === "repos") return !entrainement;
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  const js = new Date(a, m - 1, j, 12).getDay();
  return js >= 1 && js <= 5;
}

/**
 * Répétitions dues le jour `date` (jusqu'à aujourd'hui, après le jour modèle) : un repas vide qui relève de sa règle reçoit le
 * contenu du jour modèle, marqué ↻. Une seule fois par jour et par repas : vidé ensuite, il reste vide.
 */
export async function appliquerRepetitions(db: Executeur, date: string, entrainement: boolean, aujourdhui: string): Promise<number> {
  if (date > aujourdhui) return 0;
  let n = 0;
  // les règles de tous les repas en une lecture (bornes de clé : l'index de la table sert)
  const [repas, regles] = await Promise.all([
    listerRepas(db),
    db.getAllAsync<{ cle: string; valeur: string }>("SELECT cle, valeur FROM reglages WHERE cle >= ? AND cle < ?", [cleRepetition(""), cleRepetition("").slice(0, -1) + ";"]),
  ]);
  const parCle = new Map(regles.map((x) => [x.cle, x.valeur]));
  for (const r of repas) {
    const v = parCle.get(cleRepetition(r.id));
    const lue = v ? lireJson<Repetition | null>(v, null) : null;
    const rep = lue && lue.regle !== "jamais" ? lue : null;
    if (!rep || date <= rep.date || !regleVaut(rep.regle, date, entrainement)) continue;
    const fait = `nutri_repete_fait:${r.id}:${date}`;
    if (await db.getFirstAsync("SELECT 1 FROM reglages WHERE cle = ?", [fait])) continue;
    await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, '1')", [fait]);
    const deja = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM consommations WHERE date = ? AND repas_id = ?", [date, r.id]);
    if ((deja?.n ?? 0) > 0) continue;
    n += await repeterRepas(db, { date: rep.date, repasId: r.id }, { date, repasId: r.id }, true);
  }
  return n;
}

/** Totaux d'une liste de consommations. */
export const totalDe = (l: readonly Consommation[]): Macros => totaux(l.map((c) => c.macros));

// ---- Mes aliments (D4) ------------------------------------------------------------------------------------------

export type Periode = "semaine" | "mois" | "annee" | "tout";
export type TriAliments = "fois" | "quantite" | "kcal";

export interface StatAliment {
  produit: Produit;
  /** Plat sans ingrédients (son produit figé est `produit`) : sa fiche s'ouvre à la place de celle du produit. */
  platId: string | null;
  fois: number;
  quantiteG: number;
  kcal: number;
  derniere: string;
  /** Repas où il est le plus souvent mangé. */
  repasFrequent: string | null;
}

/**
 * Aliments classés sur une période finissant à `jusqua` (« AAAA-MM-JJ ») : nombre de consommations, quantité et kcal totales.
 * Un plat mangé compte pour ses ingrédients, au prorata de la portion ; un plat sans ingrédients, pour un aliment (`manges`).
 * Sans les aliments retirés de la liste (`masquerAliment`), sauf ceux consommés de nouveau depuis.
 */
export async function mesAliments(db: Executeur, periode: Periode, tri: TriAliments, depuis: string | null): Promise<StatAliment[]> {
  const periodeSql = periode === "tout" || !depuis ? "" : "m.date >= ? AND";
  const params = periodeSql ? [depuis!] : [];
  const l = await db.getAllAsync<{ cle: string; produit_id: string; plat_id: string | null; fois: number; q: number; derniere: string }>(
    `WITH ${MANGES}, groupes AS (SELECT m.cle, MAX(p.masque_le) AS masque, MAX(m.cree_le) AS dernier FROM manges m JOIN produits p ON p.id = m.produit_id GROUP BY m.cle)
     SELECT m.cle, MAX(m.produit_id) AS produit_id, MAX(m.plat_id) AS plat_id, COUNT(*) AS fois, SUM(m.quantite_g) AS q, MAX(m.date) AS derniere
     FROM manges m JOIN produits p ON p.id = m.produit_id JOIN groupes g ON g.cle = m.cle
     WHERE ${periodeSql} (g.masque IS NULL OR g.dernier > g.masque)
     GROUP BY m.cle`,
    params,
  );
  // Repas le plus fréquent de chaque aliment, en une lecture.
  const parRepas = await db.getAllAsync<{ cle: string; repas_id: string; n: number }>(
    `WITH ${MANGES} SELECT m.cle, m.repas_id, COUNT(*) AS n FROM manges m WHERE ${periodeSql} 1 GROUP BY m.cle, m.repas_id`,
    params,
  );
  const frequent = new Map<string, { repas_id: string; n: number }>();
  for (const x of parRepas) if (x.n > (frequent.get(x.cle)?.n ?? 0)) frequent.set(x.cle, x);
  const plats = new Set((await db.getAllAsync<{ id: string }>("SELECT id FROM plats", [])).map((x) => x.id));
  const res: StatAliment[] = [];
  const produits = await produitsParIds(db, l.map((x) => x.produit_id));
  for (const x of l) {
    const produit = produits.get(x.produit_id);
    if (!produit) continue;
    res.push({
      produit, platId: x.plat_id && plats.has(x.plat_id) ? x.plat_id : null, fois: x.fois, quantiteG: x.q, kcal: macrosPourQuantite(produit.nutriments, x.q).kcal, derniere: x.derniere,
      repasFrequent: frequent.get(x.cle)?.repas_id ?? null,
    });
  }
  const cle = tri === "fois" ? "fois" : tri === "quantite" ? "quantiteG" : "kcal";
  return res.sort((a, b) => b[cle] - a[cle] || a.produit.nom.localeCompare(b.produit.nom));
}

/**
 * Retire un aliment de Mes aliments (audit du 28/10, constat 21) : le journal ne bouge pas, l'aliment revient dès qu'il est
 * de nouveau consommé. Rend l'état d'avant, que `remettreAliment` rétablit (« Annuler »).
 */
export async function masquerAliment(db: Executeur, produitId: string, quand: number = Date.now()): Promise<number | null> {
  const avant = await db.getFirstAsync<{ masque_le: number | null }>("SELECT masque_le FROM produits WHERE id = ?", [produitId]);
  await db.runAsync("UPDATE produits SET masque_le = ? WHERE id = ?", [quand, produitId]);
  return avant?.masque_le ?? null;
}

/** Annule `masquerAliment` : remet l'état d'avant (en général, aucun retrait). */
export async function remettreAliment(db: Executeur, produitId: string, avant: number | null = null): Promise<void> {
  await db.runAsync("UPDATE produits SET masque_le = ? WHERE id = ?", [avant, produitId]);
}
