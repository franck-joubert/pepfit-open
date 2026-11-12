import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import { enregistrerProduit, produitParCode } from "../db/depots/nutrition";
import { recettesFitatuEnPlats } from "../db/depots/plats";
import type { CleNutriment, Nutriments, Portion, TypePortion, Unite } from "../nutrition/calculs";
import { ErreurImport } from "./hevy-csv";

// Import de l'historique Fitatu (D-nutri-2) : un export JSON (jours → repas → aliments, plus la fiche de chaque produit) lu
// en lecture seule depuis le compte. Repas : breakfast = Petit déjeuner, second_breakfast = Collation, lunch = Déjeuner,
// dinner = Goûter, supper = Dîner, snack = Apéritif. Produits dédoublonnés (clé Fitatu, puis code-barres) ; chaque
// consommation garde sa clé d'origine : relancer l'import ne double rien. Avec `joursRelus` (import depuis le compte), chaque
// jour relu est mis en accord avec Fitatu : ligne modifiée mise à jour, ligne disparue supprimée (docs/FITATU-MAJ.md).

export interface ItemFitatu {
  planDayDietItemId?: string;
  foodType?: string;
  productId?: number | string | null;
  recipeId?: number | string | null;
  name?: string;
  brand?: string | null;
  measureId?: number | null;
  measureName?: string | null;
  measureQuantity?: number | null;
  weight?: number | null;
  energy?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbohydrate?: number | null;
  sugars?: number | null;
  fiber?: number | null;
  saturatedFat?: number | null;
  salt?: number | null;
  liquid?: boolean;
  updatedAt?: string | null;
}

export interface MesureFitatu {
  id?: number;
  name?: string;
  weightPerUnit?: number;
}

/** Fiche d'un produit (valeurs pour 100 g) ou d'une recette Fitatu, telle que l'API la donne. */
export interface FicheFitatu {
  id?: number;
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  energy?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbohydrate?: number | null;
  sugars?: number | null;
  fiber?: number | null;
  saturatedFat?: number | null;
  salt?: number | null;
  liquid?: boolean;
  private?: boolean;
  userId?: number | null;
  measures?: MesureFitatu[];
  _erreur?: number;
}

export interface ExportFitatu {
  exporte_le?: string;
  jours: Record<string, Record<string, { mealName?: string | null; items: ItemFitatu[] }>>;
  aliments: Record<string, FicheFitatu>;
}

export const REPAS_FITATU: Record<string, string> = {
  breakfast: "repas:petit_dej",
  second_breakfast: "repas:collation",
  lunch: "repas:dejeuner",
  dinner: "repas:gouter",
  supper: "repas:diner",
  snack: "repas:aperitif",
};

/** Mesures Fitatu qui ont un équivalent dans pepfit (portion, pièce, paquet) ; les autres (cuillère, verre…) passent en grammes. */
const MESURES: Record<number, TypePortion> = { 39: "portion", 46: "piece", 2: "paquet" };

export interface RapportFitatu {
  joursLus: number;
  /** Jours où au moins un aliment a été ajouté. */
  joursImportes: number;
  alimentsLus: number;
  alimentsImportes: number;
  /** Aliments déjà importés (réimport), inchangés. */
  alimentsDejaPresents: number;
  /** Mise en accord : aliments déjà importés dont la quantité, l'aliment, le repas ou le jour a changé chez Fitatu. */
  alimentsMisAJour?: number;
  /** Mise en accord : aliments importés qui n'existent plus chez Fitatu ce jour-là. */
  alimentsSupprimes?: number;
  /** Lignes de plus de SEUIL_SEC_G d'un aliment sec (unité « paquet » ou poids d'unité ambigu ?), gardées telles quelles. */
  alertes?: string[];
  produitsCrees: number;
  /** Produits déjà connus de l'appli (même code-barres, ou import précédent). */
  produitsReutilises: number;
  /** Recettes devenues des plats (P12 de la planche plats) ; sans ingrédients : l'export n'en donne pas. */
  platsCrees?: number;
  erreurs: string[];
  dureeMs: number;
}

export function lireExportFitatu(texte: string): ExportFitatu {
  let d: unknown;
  try {
    d = JSON.parse(texte);
  } catch {
    throw new ErreurImport("Fichier Fitatu illisible");
  }
  const e = d as Partial<ExportFitatu> | null;
  if (!e || typeof e !== "object" || typeof e.jours !== "object" || !e.jours || typeof e.aliments !== "object" || !e.aliments) {
    throw new ErreurImport("Fichier Fitatu illisible");
  }
  return { exporte_le: e.exporte_le, jours: e.jours, aliments: e.aliments };
}

/** Le fichier est-il un export Fitatu (et non des routines Hevy) ? */
export const estExportFitatu = (texte: string) => /^\s*\{/.test(texte) && /"jours"\s*:/.test(texte) && /"aliments"\s*:/.test(texte);

const n = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arrondi = (v: number) => Math.round(v * 1000) / 1000;

/** Nutriments pour 100 g d'une fiche produit Fitatu (ses valeurs sont déjà pour 100 g). */
export function nutrimentsDeFiche(f: FicheFitatu): Nutriments {
  const r: Nutriments = {};
  const mettre = (k: CleNutriment, v: unknown) => {
    const x = n(v);
    if (x != null) r[k] = x;
  };
  mettre("energie_kcal", f.energy);
  mettre("proteines", f.protein);
  mettre("lipides", f.fat);
  mettre("glucides", f.carbohydrate);
  mettre("sucres", f.sugars);
  mettre("fibres", f.fiber);
  mettre("satures", f.saturatedFat);
  mettre("sel", f.salt);
  return r;
}

/** Nutriments pour 100 g déduits d'un aliment du journal (ses valeurs sont pour `grammes`). */
export function nutrimentsDeItem(i: ItemFitatu, grammes: number): Nutriments {
  const f = grammes > 0 ? 100 / grammes : 1;
  const r: Nutriments = {};
  const mettre = (k: CleNutriment, v: unknown) => {
    const x = n(v);
    if (x != null) r[k] = arrondi(x * f);
  };
  mettre("energie_kcal", i.energy);
  mettre("proteines", i.protein);
  mettre("lipides", i.fat);
  mettre("glucides", i.carbohydrate);
  mettre("sucres", i.sugars);
  mettre("fibres", i.fiber);
  mettre("satures", i.saturatedFat);
  mettre("sel", i.salt);
  return r;
}

/** Portions d'une fiche : une par type connu (portion, pièce, paquet), au poids de l'unité. */
export function portionsDeFiche(f: FicheFitatu): Portion[] {
  const vues = new Set<TypePortion>();
  const res: Portion[] = [];
  for (const m of f.measures ?? []) {
    const type = m.id != null ? MESURES[m.id] : undefined;
    const g = n(m.weightPerUnit);
    if (!type || !g || g <= 0 || vues.has(type)) continue;
    vues.add(type);
    res.push({ type, libelle: "", grammes: g });
  }
  return res;
}

/** Clé du produit d'un aliment : produit public ou perso, recette, aliment libre (nom et valeurs). */
export function cleProduit(i: ItemFitatu, fiche: FicheFitatu | undefined): string {
  const type = (i.foodType ?? "PRODUCT").toUpperCase();
  if (type === "RECIPE" || type === "RECIPE_AI") return `fitatu:recette:${i.recipeId}`;
  if (type === "PRODUCT" && i.productId != null) return `fitatu:${fiche?.private || (fiche?.userId ?? 0) > 0 ? "perso" : "produit"}:${i.productId}`;
  return `fitatu:libre:${(i.name ?? "").trim().toLowerCase()}|${i.energy ?? ""}|${i.protein ?? ""}|${i.fat ?? ""}|${i.carbohydrate ?? ""}`;
}

/** Au-delà, une ligne d'aliment sec (non liquide, au moins KCAL_SEC kcal / 100 g) est signalée : 1 kg de flocons, le 31/10. */
export const SEUIL_SEC_G = 800;
export const KCAL_SEC = 250;

/** Grammes d'un aliment : son poids, sinon nombre × poids de l'unité, sinon la quantité si l'unité est le gramme. */
function grammesDe(i: ItemFitatu, fiche: FicheFitatu | undefined): number | null {
  const w = n(i.weight);
  if (w && w > 0) return w;
  const q = n(i.measureQuantity) ?? 1;
  const m = fiche?.measures?.find((x) => x.id === i.measureId);
  if (m && n(m.weightPerUnit)) return q * m.weightPerUnit!;
  if ((i.measureName ?? "").trim().toLowerCase() === "g" || i.measureId === 1) return q;
  return null;
}

/**
 * Importe un export Fitatu. Idempotent : un aliment déjà importé (même identifiant Fitatu) n'est pas doublé ; un produit déjà
 * connu (même clé Fitatu, ou même code-barres) est réutilisé tel quel. Tout se fait dans une transaction.
 * `joursRelus` : jours lus en entier chez Fitatu (même vides). Leurs lignes importées de Fitatu suivent la réponse : mises à
 * jour si elles ont changé, supprimées si leur clé n'y est plus. Les lignes saisies dans pepfit (sans clé Fitatu) et les
 * autres jours ne sont jamais touchés. Sans `joursRelus` (fichier), l'import ne fait qu'ajouter.
 */
export async function importerFitatu(db: Executeur, e: ExportFitatu, maintenant: number = Date.now(), o: { joursRelus?: readonly string[] } = {}): Promise<RapportFitatu> {
  const debut = Date.now();
  const rapport: RapportFitatu = { joursLus: 0, joursImportes: 0, alimentsLus: 0, alimentsImportes: 0, alimentsDejaPresents: 0, alimentsMisAJour: 0, alimentsSupprimes: 0, produitsCrees: 0, produitsReutilises: 0, alertes: [], erreurs: [], dureeMs: 0 };
  const repasConnus = new Set((await db.getAllAsync<{ id: string }>("SELECT id FROM repas", [])).map((r) => r.id));
  const produits = new Map<string, { id: string; portions: Portion[]; sec: boolean }>();
  const reutilises = new Set<string>();
  const relus = new Set(o.joursRelus ?? []);

  /** Aliment sec : non liquide et dense en énergie (flocons, pâtes crues, fruits secs…). */
  const estSec = (base: string, nutriments: Nutriments) => base !== "100ml" && (nutriments.energie_kcal ?? 0) >= KCAL_SEC;

  // `db` en paramètre : appelée dans la transaction, elle écrit par son exécuteur
  const produitPour = async (db: Executeur, i: ItemFitatu, grammes: number | null): Promise<{ id: string; portions: Portion[]; sec: boolean } | null> => {
    const type = (i.foodType ?? "PRODUCT").toUpperCase();
    const fiche = type === "PRODUCT" && i.productId != null ? e.aliments[`PRODUCT:${i.productId}`] : type.startsWith("RECIPE") ? e.aliments[`RECIPE:${i.recipeId}`] : undefined;
    const ficheValide = fiche && !fiche._erreur ? fiche : undefined;
    const cle = cleProduit(i, ficheValide);
    const vu = produits.get(cle);
    if (vu) return vu;
    const deja = await db.getFirstAsync<{ id: string; portions: string; base: string; nutriments: string }>("SELECT id, portions, base, nutriments FROM produits WHERE import_cle = ?", [cle]);
    if (deja) {
      const p = { id: deja.id, portions: JSON.parse(deja.portions) as Portion[], sec: estSec(deja.base, JSON.parse(deja.nutriments) as Nutriments) };
      produits.set(cle, p);
      if (!reutilises.has(cle)) (reutilises.add(cle), rapport.produitsReutilises++);
      return p;
    }
    const code = type === "PRODUCT" ? (ficheValide?.barcode ?? "").trim() || null : null;
    if (code) {
      const existant = await produitParCode(db, code);
      if (existant) {
        if (!existant.import_cle) await db.runAsync("UPDATE produits SET import_cle = ? WHERE id = ?", [cle, existant.id]);
        const p = { id: existant.id, portions: existant.portions, sec: estSec(existant.base, existant.nutriments) };
        produits.set(cle, p);
        reutilises.add(cle);
        rapport.produitsReutilises++;
        return p;
      }
    }
    const libre = type !== "PRODUCT" && !type.startsWith("RECIPE");
    let nutriments: Nutriments;
    let portions: Portion[];
    if (type === "PRODUCT" && ficheValide) {
      nutriments = nutrimentsDeFiche(ficheValide);
      portions = portionsDeFiche(ficheValide);
    } else if (libre) {
      // Aliment libre (sans poids) : ses valeurs sont celles d'une portion, comptée 100 g.
      const q = n(i.measureQuantity) || 1;
      nutriments = nutrimentsDeItem(i, 100 * q);
      portions = [{ type: "portion", libelle: "", grammes: 100 }];
    } else {
      if (!grammes) return null;
      nutriments = nutrimentsDeItem(i, grammes);
      portions = ficheValide ? portionsDeFiche(ficheValide) : [];
    }
    const nom = (ficheValide?.name ?? i.name ?? "").trim();
    if (!nom) return null;
    const base = (ficheValide?.liquid ?? i.liquid) ? "100ml" : "100g";
    const p = await enregistrerProduit(
      db,
      {
        code_barres: code,
        nom,
        marque: (ficheValide?.brand ?? i.brand ?? null) || null,
        base,
        nutriments,
        portions,
        source: "perso",
      },
      maintenant,
    );
    await db.runAsync("UPDATE produits SET import_cle = ? WHERE id = ?", [cle, p.id]);
    rapport.produitsCrees++;
    const r = { id: p.id, portions, sec: estSec(base, nutriments) };
    produits.set(cle, r);
    return r;
  };

  type Ligne = { id: string; date: string; repas_id: string; produit_id: string; quantite_g: number; unite: string; nb_unites: number; import_cle: string };
  const dates = [...new Set([...Object.keys(e.jours), ...relus])].sort();
  await transaction(db, async (db) => {
    for (const date of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        rapport.erreurs.push(`jour ${date} : date illisible`);
        continue;
      }
      rapport.joursLus++;
      let ajoutes = 0;
      // clés Fitatu vues ce jour-là, même celles qu'on n'a pas su convertir : leur ligne déjà importée reste
      const vues = new Set<string>();
      for (const [cleRepas, repas] of Object.entries(e.jours[date] ?? {})) {
        const repasId = REPAS_FITATU[cleRepas];
        if (!repasId || !repasConnus.has(repasId)) {
          rapport.alimentsLus += repas.items?.length ?? 0;
          for (const i of repas.items ?? []) if (i.planDayDietItemId) vues.add(`fitatu:${i.planDayDietItemId}`);
          rapport.erreurs.push(`${date} : repas « ${cleRepas} » inconnu`);
          continue;
        }
        const fin = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM consommations WHERE date = ? AND repas_id = ?", [date, repasId]);
        let ordre = (fin?.m ?? -1) + 1;
        for (const i of repas.items ?? []) {
          rapport.alimentsLus++;
          const cle = i.planDayDietItemId ? `fitatu:${i.planDayDietItemId}` : null;
          if (!cle) {
            rapport.erreurs.push(`${date} : « ${i.name ?? "?"} » sans identifiant`);
            continue;
          }
          vues.add(cle);
          const deja = await db.getFirstAsync<Ligne>("SELECT id, date, repas_id, produit_id, quantite_g, unite, nb_unites, import_cle FROM consommations WHERE import_cle = ?", [cle]);
          if (deja && !relus.has(date)) {
            rapport.alimentsDejaPresents++;
            continue;
          }
          const type = (i.foodType ?? "PRODUCT").toUpperCase();
          const ficheBrute = type === "PRODUCT" ? e.aliments[`PRODUCT:${i.productId}`] : undefined;
          const libre = type !== "PRODUCT" && !type.startsWith("RECIPE");
          const grammes = libre ? 100 * (n(i.measureQuantity) || 1) : grammesDe(i, ficheBrute && !ficheBrute._erreur ? ficheBrute : undefined);
          const p = await produitPour(db, i, grammes);
          if (!p || !grammes || grammes <= 0) {
            rapport.erreurs.push(`${date} : « ${i.name ?? "?"} » sans quantité ni valeurs`);
            continue;
          }
          // Unité : celle de Fitatu si le produit la connaît (portion, pièce, paquet), sinon des grammes.
          const typeMesure = i.measureId != null ? MESURES[i.measureId] : undefined;
          const portion = typeMesure ? p.portions.find((x) => x.type === typeMesure) : undefined;
          const q = n(i.measureQuantity);
          const unite: Unite = libre ? "portion" : portion && q ? portion.type : "g";
          const nb = libre ? n(i.measureQuantity) || 1 : unite === "g" ? grammes : q!;
          if (p.sec && grammes > SEUIL_SEC_G) rapport.alertes!.push(`${date} : « ${i.name ?? "?"} » ${Math.round(grammes)} g${i.measureName ? ` (${q ?? 1} × ${i.measureName})` : ""}`);
          if (deja) {
            // même clé : mise à jour si quelque chose a changé (un changement de repas ou de jour la met en fin de repas)
            const vals = { date, repas_id: repasId, produit_id: p.id, quantite_g: arrondi(grammes), unite, nb_unites: arrondi(nb) };
            if ((Object.keys(vals) as (keyof typeof vals)[]).every((k) => deja[k] === vals[k])) {
              rapport.alimentsDejaPresents++;
              continue;
            }
            const deplace = deja.date !== date || deja.repas_id !== repasId;
            await db.runAsync(
              `UPDATE consommations SET date = ?, repas_id = ?, produit_id = ?, quantite_g = ?, unite = ?, nb_unites = ?${deplace ? ", ordre = ?" : ""} WHERE id = ?`,
              [vals.date, vals.repas_id, vals.produit_id, vals.quantite_g, vals.unite, vals.nb_unites, ...(deplace ? [ordre++] : []), deja.id],
            );
            rapport.alimentsMisAJour!++;
            continue;
          }
          const cree = i.updatedAt ? Date.parse(i.updatedAt.replace(" ", "T")) : NaN;
          await db.runAsync(
            "INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, unite, nb_unites, repete, ordre, cree_le, import_cle) VALUES (?,?,?,?,?,?,?,0,?,?,?)",
            [nouvelId(), date, repasId, p.id, arrondi(grammes), unite, arrondi(nb), ordre++, Number.isFinite(cree) ? cree : Date.parse(`${date}T12:00:00`), cle],
          );
          rapport.alimentsImportes++;
          ajoutes++;
        }
      }
      if (relus.has(date)) {
        // lignes importées de Fitatu absentes de la réponse : supprimées (DELETE ordinaire, que les déclencheurs de synchro notent)
        const lignes = await db.getAllAsync<{ id: string; import_cle: string }>("SELECT id, import_cle FROM consommations WHERE date = ? AND import_cle LIKE 'fitatu:%'", [date]);
        for (const l of lignes) {
          if (vues.has(l.import_cle)) continue;
          await db.runAsync("DELETE FROM consommations WHERE id = ?", [l.id]);
          rapport.alimentsSupprimes!++;
        }
      }
      if (ajoutes) rapport.joursImportes++;
    }
  });
  rapport.dureeMs = Date.now() - debut;
  return rapport;
}

/** Une seule transaction (exclusif.ts) ; les recettes importées deviennent ensuite des plats (planche plats, P12). */
export async function importerFitatuTexte(db: Executeur, texte: string): Promise<RapportFitatu> {
  const e = lireExportFitatu(texte);
  return transaction(db, async (db) => {
    const r = await importerFitatu(db, e);
    return { ...r, platsCrees: await recettesFitatuEnPlats(db) };
  });
}
