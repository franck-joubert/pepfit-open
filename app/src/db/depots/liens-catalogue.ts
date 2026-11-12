import type { Executeur } from "../executeur";
import { chargerLiens } from "../liens-catalogue";
import { colonnesExercice } from "./exercices";
import { preparerCatalogue, procheDuCatalogue, type CataloguePrepare } from "../proximite";
import type { Exercice } from "../types";

// Rattachement d'un exercice perso au catalogue (docs/CODE-PICTOS-PERSO.md). Jamais une fusion : l'exercice perso garde ses
// séries, ses records, ses routines et son nom ; `lie_a` (slug du catalogue) lui donne seulement le picto et la 3D de l'autre.
// Jamais en silence : un lien n'est posé que sur une confirmation de la personne (suggestion acceptée, ou exercice choisi).

/** Un exercice perso et l'exercice du catalogue qui lui ressemble le plus. */
export interface Suggestion {
  exercice: Exercice;
  catalogue: Exercice;
  score: number;
  /** Autres exercices du catalogue à égalité (« Hip thrust » sans matériel : barre, machine et Smith) : la personne tranche. */
  autres: Exercice[];
}

/** Écart de score sous lequel deux propositions comptent comme à égalité. */
const ECART_EGALITE = 0.02;
const MAX_AUTRES = 2;

/** Le catalogue prêt à comparer, gardé tant que le nombre d'exercices ne change pas. */
let preparation: { n: number; cat: CataloguePrepare } | null = null;

async function catalogueNoms(db: Executeur): Promise<CataloguePrepare> {
  const l = await db.getAllAsync<{ slug: string; nom: string; nom_en: string | null; equipement: string; muscle: string | null }>(
    "SELECT slug, nom, nom_en, equipement, muscle FROM exercices WHERE perso = 0 AND slug IS NOT NULL",
    [],
  );
  if (preparation?.n === l.length) return preparation.cat;
  const cat = preparerCatalogue(l.map((e) => ({ slug: e.slug, nom: e.nom, nom_en: e.nom_en, materiel: e.equipement, muscle: e.muscle })));
  preparation = { n: l.length, cat };
  return cat;
}

export interface OptionsSuggestion {
  /** Départage deux propositions à égalité (0 à 1) : celle qui a son propre picto ou sa 3D d'abord. */
  departager?: (slug: string) => number;
  seuil?: number;
}

/** L'exercice du catalogue le plus proche d'un exercice perso, ou null (rien d'assez proche, déjà relié, refusé, pas perso). */
export async function suggestionPour(db: Executeur, exerciceId: string, o: OptionsSuggestion = {}): Promise<Suggestion | null> {
  const e = await db.getFirstAsync<Exercice>(`SELECT ${colonnesExercice()} FROM exercices WHERE id = ?`, [exerciceId]);
  if (!e || !e.perso || e.lie_a || e.lien_refuse || e.slug) return null;
  return proposer(db, e, await catalogueNoms(db), o);
}

async function proposer(db: Executeur, e: Exercice, cat: CataloguePrepare, o: OptionsSuggestion): Promise<Suggestion | null> {
  const l = procheDuCatalogue(e.nom, cat, { seuil: o.seuil, departager: o.departager, materiel: e.equipement, muscle: e.muscle, n: 1 + MAX_AUTRES, ecart: ECART_EGALITE });
  const [p, ...reste] = l;
  if (!p) return null;
  const lire = (slug: string) => db.getFirstAsync<Exercice>(`SELECT ${colonnesExercice()} FROM exercices WHERE slug = ? AND perso = 0`, [slug]);
  const c = await lire(p.slug);
  if (!c) return null;
  const autres: Exercice[] = [];
  for (const r of reste) {
    const x = await lire(r.slug);
    if (x) autres.push(x);
  }
  return { exercice: e, catalogue: c, score: p.score, autres };
}

/** Les exercices perso qui ont une suggestion à confirmer, du plus sûr au moins sûr (Hevy compris : ils arrivent perso). */
export async function suggestionsAConfirmer(db: Executeur, o: OptionsSuggestion = {}): Promise<Suggestion[]> {
  const persos = await db.getAllAsync<Exercice>(
    `SELECT ${colonnesExercice()} FROM exercices WHERE perso = 1 AND slug IS NULL AND lie_a IS NULL AND lien_refuse = 0`,
    [],
  );
  if (persos.length === 0) return [];
  const cat = await catalogueNoms(db);
  const sortie: Suggestion[] = [];
  for (const e of persos) {
    const s = await proposer(db, e, cat, o);
    if (s) sortie.push(s);
  }
  return sortie.sort((a, b) => b.score - a.score);
}

/** Relie l'exercice perso à l'exercice du catalogue de ce slug (lien confirmé) ; false si l'un des deux n'existe pas ou n'est pas du bon genre. */
export async function lierAuCatalogue(db: Executeur, exerciceId: string, slug: string): Promise<boolean> {
  const c = await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE slug = ? AND perso = 0", [slug]);
  if (!c) return false;
  await db.runAsync("UPDATE exercices SET lie_a = ?, lien_refuse = 0, maj_le = ? WHERE id = ? AND perso = 1", [slug, Date.now(), exerciceId]);
  await chargerLiens(db);
  return true;
}

/** Défait le lien : l'exercice redevient « perso » seul (picto neutre) et la suggestion n'est plus redemandée. */
export async function dissocierDuCatalogue(db: Executeur, exerciceId: string): Promise<void> {
  await db.runAsync("UPDATE exercices SET lie_a = NULL, lien_refuse = 1, maj_le = ? WHERE id = ? AND perso = 1", [Date.now(), exerciceId]);
  await chargerLiens(db);
}

/** La suggestion était fausse : l'exercice reste perso et on ne la redemande plus (il peut toujours être relié à la main). */
export async function refuserSuggestion(db: Executeur, exerciceId: string): Promise<void> {
  await db.runAsync("UPDATE exercices SET lien_refuse = 1, maj_le = ? WHERE id = ? AND perso = 1 AND lie_a IS NULL", [Date.now(), exerciceId]);
}
