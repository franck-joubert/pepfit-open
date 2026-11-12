// Santé : blessures (statut daté, journal) et compléments (prises), migration 25. Chaque écriture porte son
// auteur : « moi » ou l'id d'une connexion IA (le futur serveur MCP passera le sien). Les jours sont des chaînes AAAA-MM-JJ
// choisies par l'écran (fuseau de l'appli) ; la base ne calcule aucun jour.
import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { ecrireSignes, lireSignes, typeBlessure, typeDeZone, type Signe, type TypeBlessure } from "../zones-blessure";

export const MOI = "moi";

export type StatutBlessure = "active" | "reduite" | "disparue";
export type Cote = "g" | "d" | "2" | "-";
export type TypeJournal = "douleur" | "ressenti" | "aide";
// La table garde son nom (`traitement`) et ses colonnes `type` et `blessure_id`, sans usage depuis la migration 48 (hors du
// médical, 31/10) : une ligne est toujours un complément (type « complement »), jamais lié à une blessure.
export type Moment = "matin" | "midi" | "soir" | "coucher";

export interface Blessure {
  id: string;
  titre: string;
  zone: string | null;
  /** Muscle, articulation ou autre (migration 65) ; lu par typeBlessure (une zone connue fait foi). */
  type: TypeBlessure;
  cote: Cote;
  debut: string;
  notes: string | null;
  notes_auteur: string | null;
  notes_maj: number | null;
  statut: StatutBlessure;
  auteur: string;
  cree_le: number;
  maj_le: number;
}

/** Une blessure de la liste, avec la date de son dernier changement de statut. */
export interface BlessureListe extends Blessure {
  depuis: string;
}

export interface ChangementStatut {
  id: string;
  blessure_id: string;
  statut: StatutBlessure;
  date: string;
  auteur: string;
  cree_le: number;
}

export interface EntreeJournal {
  id: string;
  blessure_id: string;
  date: string;
  type: TypeJournal;
  douleur: number | null;
  /** Signes notés (D6, migration 65) : raideur, gonflement ; vide sans signe. */
  signes: Signe[];
  texte: string;
  auteur: string;
  cree_le: number;
}

export interface Traitement {
  id: string;
  nom: string;
  dose: string | null;
  /** « jour », « besoin », « jours:1,3,5 » (1 = lundi), « semaine:n ». */
  frequence: string;
  max_jour: number | null;
  moment: Moment | null;
  debut: string;
  fin: string | null;
  notes: string | null;
  notes_auteur: string | null;
  notes_maj: number | null;
  /** HH:MM ; null = pas de rappel (D11 : éteint par défaut). */
  rappel: string | null;
  auteur: string;
  cree_le: number;
  maj_le: number;
}

export interface Prise {
  id: string;
  traitement_id: string;
  date: string;
  heure: string;
  dose: string | null;
  auteur: string;
  cree_le: number;
}

const COLS_BLESSURE = "id, titre, zone, type, cote, debut, notes, notes_auteur, notes_maj, statut, auteur, cree_le, maj_le";

/** Ligne lue → type sûr (une ligne d'avant la migration 65, ou reçue d'une appli d'avant, n'a pas de type). */
const avecType = <B extends { zone: string | null; type: string | null }>(b: B): B & { type: TypeBlessure } => ({ ...b, type: typeBlessure(b.zone, b.type) });
const avecSignes = (e: Omit<EntreeJournal, "signes"> & { signes: string | null }): EntreeJournal => ({ ...e, signes: lireSignes(e.signes) });
const COLS_TRAITEMENT =
  "id, nom, dose, frequence, max_jour, moment, debut, fin, notes, notes_auteur, notes_maj, rappel, auteur, cree_le, maj_le";

// ——— Blessures ———

/** Blessures non supprimées, la plus récemment changée d'abord ; `depuis` = date du dernier changement de statut. */
export async function listerBlessures(db: Executeur): Promise<BlessureListe[]> {
  const l = await db.getAllAsync<BlessureListe>(
    `SELECT ${COLS_BLESSURE.split(", ").map((c) => `b.${c}`).join(", ")},
       COALESCE((SELECT s.date FROM blessure_statut s WHERE s.blessure_id = b.id ORDER BY s.date DESC, s.cree_le DESC LIMIT 1), b.debut) AS depuis
     FROM blessure b WHERE b.supprime_le IS NULL ORDER BY depuis DESC, b.cree_le DESC`,
    [],
  );
  return l.map(avecType);
}

export async function lireBlessure(
  db: Executeur,
  id: string,
): Promise<{ blessure: Blessure; statuts: ChangementStatut[]; journal: EntreeJournal[] } | null> {
  const b = await db.getFirstAsync<Blessure>(`SELECT ${COLS_BLESSURE} FROM blessure WHERE id = ? AND supprime_le IS NULL`, [id]);
  if (!b) return null;
  const blessure = avecType(b);
  const statuts = await db.getAllAsync<ChangementStatut>(
    "SELECT id, blessure_id, statut, date, auteur, cree_le FROM blessure_statut WHERE blessure_id = ? ORDER BY date DESC, cree_le DESC",
    [id],
  );
  const journal = (
    await db.getAllAsync<Omit<EntreeJournal, "signes"> & { signes: string | null }>(
      "SELECT id, blessure_id, date, type, douleur, signes, texte, auteur, cree_le FROM blessure_journal WHERE blessure_id = ? AND supprime_le IS NULL ORDER BY date DESC, cree_le DESC",
      [id],
    )
  ).map(avecSignes);
  return { blessure, statuts, journal };
}

/** Nouvelle blessure : active depuis son début (un premier changement de statut daté du début). Type : déduit de la zone. */
export async function creerBlessure(
  db: Executeur,
  b: { titre: string; zone: string | null; cote: Cote; debut: string; notes?: string | null; type?: TypeBlessure },
  auteur: string = MOI,
  maintenant: number = Date.now(),
): Promise<string> {
  const titre = b.titre.trim();
  if (!titre) throw new Error("Titre vide");
  const id = nouvelId();
  const notes = b.notes?.trim() || null;
  await transaction(db, async (db) => {
    await db.runAsync(
      "INSERT INTO blessure (id, titre, zone, type, cote, debut, notes, notes_auteur, notes_maj, statut, auteur, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?)",
      [id, titre, b.zone, typeBlessure(b.zone, b.type ?? typeDeZone(b.zone)), b.cote, b.debut, notes, notes ? auteur : null, notes ? maintenant : null, auteur, maintenant, maintenant],
    );
    await db.runAsync("INSERT INTO blessure_statut (id, blessure_id, statut, date, auteur, cree_le) VALUES (?,?,'active',?,?,?)", [
      nouvelId(), id, b.debut, auteur, maintenant,
    ]);
  });
  return id;
}

/** Titre, zone, côté, début ou notes ; les notes gardent leur dernier auteur et l'instant de l'écriture. La zone change le type. */
export async function modifierBlessure(
  db: Executeur,
  id: string,
  patch: Partial<Pick<Blessure, "titre" | "zone" | "cote" | "debut" | "notes">>,
  auteur: string = MOI,
  maintenant: number = Date.now(),
): Promise<void> {
  const champs: string[] = [];
  const valeurs: (string | number | null)[] = [];
  const poser = (c: string, v: string | number | null) => {
    champs.push(`${c} = ?`);
    valeurs.push(v);
  };
  if (patch.titre !== undefined) {
    const t = patch.titre.trim();
    if (!t) throw new Error("Titre vide");
    poser("titre", t);
  }
  if (patch.zone !== undefined) {
    poser("zone", patch.zone);
    poser("type", typeDeZone(patch.zone));
  }
  if (patch.cote !== undefined) poser("cote", patch.cote);
  if (patch.debut !== undefined) poser("debut", patch.debut);
  if (patch.notes !== undefined) {
    poser("notes", patch.notes?.trim() || null);
    poser("notes_auteur", auteur);
    poser("notes_maj", maintenant);
  }
  if (!champs.length) return;
  poser("maj_le", maintenant);
  await db.runAsync(`UPDATE blessure SET ${champs.join(", ")} WHERE id = ?`, [...valeurs, id]);
}

/** Recopie dans blessure.statut le changement le plus récent (par date, puis par instant d'écriture). */
export async function recalculerStatut(db: Executeur, id: string, maintenant: number = Date.now()): Promise<void> {
  const d = await db.getFirstAsync<{ statut: StatutBlessure }>(
    "SELECT statut FROM blessure_statut WHERE blessure_id = ? ORDER BY date DESC, cree_le DESC LIMIT 1",
    [id],
  );
  const statut = d?.statut ?? "active";
  await db.runAsync("UPDATE blessure SET statut = ?, maj_le = ? WHERE id = ? AND statut <> ?", [statut, maintenant, id, statut]);
}

/** Un toucher sur Active, Réduite ou Disparue : un changement daté (aujourd'hui par défaut, à l'écran). Même statut : rien. */
export async function changerStatut(
  db: Executeur,
  id: string,
  statut: StatutBlessure,
  date: string,
  auteur: string = MOI,
  maintenant: number = Date.now(),
): Promise<void> {
  const b = await db.getFirstAsync<{ statut: StatutBlessure }>("SELECT statut FROM blessure WHERE id = ?", [id]);
  if (!b || b.statut === statut) return;
  await db.runAsync("INSERT INTO blessure_statut (id, blessure_id, statut, date, auteur, cree_le) VALUES (?,?,?,?,?,?)", [
    nouvelId(), id, statut, date, auteur, maintenant,
  ]);
  await recalculerStatut(db, id, maintenant);
}

/** Corrige la date d'un changement (liste « Statut »). */
export async function corrigerDateStatut(db: Executeur, changementId: string, date: string, maintenant: number = Date.now()): Promise<void> {
  const c = await db.getFirstAsync<{ blessure_id: string }>("SELECT blessure_id FROM blessure_statut WHERE id = ?", [changementId]);
  if (!c) return;
  await db.runAsync("UPDATE blessure_statut SET date = ? WHERE id = ?", [date, changementId]);
  await recalculerStatut(db, c.blessure_id, maintenant);
}

/** Retire un changement de statut ; le dernier qui reste ne se retire pas (une blessure a toujours un statut). */
export async function supprimerStatut(db: Executeur, changementId: string, maintenant: number = Date.now()): Promise<void> {
  const c = await db.getFirstAsync<{ blessure_id: string }>("SELECT blessure_id FROM blessure_statut WHERE id = ?", [changementId]);
  if (!c) return;
  const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM blessure_statut WHERE blessure_id = ?", [c.blessure_id]);
  if ((n?.n ?? 0) < 2) return;
  await db.runAsync("DELETE FROM blessure_statut WHERE id = ?", [changementId]);
  await recalculerStatut(db, c.blessure_id, maintenant);
}

export async function ajouterAuJournal(
  db: Executeur,
  blessureId: string,
  e: { date: string; type: TypeJournal; douleur: number | null; texte: string; signes?: readonly string[] },
  auteur: string = MOI,
  maintenant: number = Date.now(),
): Promise<string> {
  const douleur = e.type === "douleur" ? Math.max(0, Math.min(10, Math.round(e.douleur ?? 0))) : null;
  const id = nouvelId();
  await db.runAsync(
    "INSERT INTO blessure_journal (id, blessure_id, date, type, douleur, signes, texte, auteur, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?)",
    // « Ce qui aide » ne porte pas de signes (planche, B6)
    [id, blessureId, e.date, e.type, douleur, e.type === "aide" ? null : ecrireSignes(e.signes), e.texte.trim(), auteur, maintenant, maintenant],
  );
  return id;
}

export async function supprimerEntreeJournal(db: Executeur, id: string, maintenant: number = Date.now()): Promise<void> {
  await db.runAsync("UPDATE blessure_journal SET supprime_le = ?, maj_le = ? WHERE id = ?", [maintenant, maintenant, id]);
}

/** Suppression douce (D8) : la blessure quitte les listes ; « Annuler » la rend, puis `purgerBlessure` l'efface. */
export async function supprimerBlessure(db: Executeur, id: string, maintenant: number = Date.now()): Promise<void> {
  await db.runAsync("UPDATE blessure SET supprime_le = ?, maj_le = ? WHERE id = ?", [maintenant, maintenant, id]);
}

export async function restaurerBlessure(db: Executeur, id: string, maintenant: number = Date.now()): Promise<void> {
  await db.runAsync("UPDATE blessure SET supprime_le = NULL, maj_le = ? WHERE id = ?", [maintenant, id]);
}

/** Efface pour de bon une blessure supprimée (statuts et journal suivent). */
export async function purgerBlessure(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM blessure WHERE id = ? AND supprime_le IS NOT NULL", [id]);
}

// ——— Compléments ———

/** Compléments non supprimés, dans l'ordre où ils ont été ajoutés. */
export function listerTraitements(db: Executeur): Promise<Traitement[]> {
  return db.getAllAsync<Traitement>(`SELECT ${COLS_TRAITEMENT} FROM traitement WHERE supprime_le IS NULL ORDER BY cree_le, rowid`, []);
}

export function lireTraitement(db: Executeur, id: string): Promise<Traitement | null> {
  return db.getFirstAsync<Traitement>(`SELECT ${COLS_TRAITEMENT} FROM traitement WHERE id = ? AND supprime_le IS NULL`, [id]);
}

export async function creerTraitement(
  db: Executeur,
  x: { nom: string; debut: string } & Partial<Pick<Traitement, "dose" | "frequence" | "max_jour" | "moment" | "fin" | "notes">>,
  auteur: string = MOI,
  maintenant: number = Date.now(),
): Promise<string> {
  const nom = x.nom.trim();
  if (!nom) throw new Error("Nom vide");
  const id = nouvelId();
  const notes = x.notes?.trim() || null;
  await db.runAsync(
    `INSERT INTO traitement (id, nom, dose, frequence, max_jour, moment, debut, fin, notes, notes_auteur, notes_maj, rappel, auteur, cree_le, maj_le)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)`,
    [
      id, nom, x.dose?.trim() || null, x.frequence ?? "jour", x.max_jour ?? null, x.moment ?? null, x.debut, x.fin ?? null,
      notes, notes ? auteur : null, notes ? maintenant : null, auteur, maintenant, maintenant,
    ],
  );
  return id;
}

export async function modifierTraitement(
  db: Executeur,
  id: string,
  patch: Partial<Pick<Traitement, "nom" | "dose" | "frequence" | "max_jour" | "moment" | "debut" | "fin" | "notes" | "rappel">>,
  auteur: string = MOI,
  maintenant: number = Date.now(),
): Promise<void> {
  const champs: string[] = [];
  const valeurs: (string | number | null)[] = [];
  for (const [c, v] of Object.entries(patch) as [string, string | number | null | undefined][]) {
    if (v === undefined || c === "notes") continue;
    if (c === "nom" && !String(v).trim()) throw new Error("Nom vide");
    champs.push(`${c} = ?`);
    valeurs.push(typeof v === "string" && (c === "nom" || c === "dose") ? v.trim() || null : v);
  }
  if (patch.notes !== undefined) {
    champs.push("notes = ?", "notes_auteur = ?", "notes_maj = ?");
    valeurs.push(patch.notes?.trim() || null, auteur, maintenant);
  }
  if (!champs.length) return;
  champs.push("maj_le = ?");
  valeurs.push(maintenant);
  await db.runAsync(`UPDATE traitement SET ${champs.join(", ")} WHERE id = ?`, [...valeurs, id]);
}

export async function supprimerTraitement(db: Executeur, id: string, maintenant: number = Date.now()): Promise<void> {
  await db.runAsync(`UPDATE traitement SET supprime_le = ?, maj_le = ? WHERE id = ?`, [maintenant, maintenant, id]);
}

export async function restaurerTraitement(db: Executeur, id: string, maintenant: number = Date.now()): Promise<void> {
  await db.runAsync("UPDATE traitement SET supprime_le = NULL, maj_le = ? WHERE id = ?", [maintenant, id]);
}

/** Efface pour de bon un complément supprimé, et ses prises. */
export async function purgerTraitement(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM traitement WHERE id = ? AND supprime_le IS NOT NULL", [id]);
}

/** Prises des compléments non supprimés entre deux jours (inclus), dans l'ordre du jour et de l'heure. */
export function prisesEntre(db: Executeur, de: string, a: string): Promise<Prise[]> {
  return db.getAllAsync<Prise>(
    `SELECT p.id, p.traitement_id, p.date, p.heure, p.dose, p.auteur, p.cree_le FROM prise p JOIN traitement t ON t.id = p.traitement_id
     WHERE p.date BETWEEN ? AND ? AND t.supprime_le IS NULL ORDER BY p.date, p.heure, p.cree_le`,
    [de, a],
  );
}

/** Jour de la première prise (borne de l'historique des prises), null sans prise. */
export async function premierePrise(db: Executeur): Promise<string | null> {
  const x = await db.getFirstAsync<{ d: string | null }>(
    `SELECT MIN(p.date) AS d FROM prise p JOIN traitement t ON t.id = p.traitement_id WHERE t.supprime_le IS NULL`,
    [],
  );
  return x?.d ?? null;
}

/** Une case cochée, ou « Noter la prise » (un « si besoin » peut en avoir plusieurs par jour). */
export async function noterPrise(
  db: Executeur,
  traitementId: string,
  date: string,
  heure: string,
  auteur: string = MOI,
  maintenant: number = Date.now(),
  dose: string | null = null,
): Promise<string> {
  const id = nouvelId();
  await db.runAsync("INSERT INTO prise (id, traitement_id, date, heure, dose, auteur, cree_le) VALUES (?,?,?,?,?,?,?)", [
    id, traitementId, date, heure, dose, auteur, maintenant,
  ]);
  return id;
}

/** Décocher : la dernière prise du jour s'efface (ne rien cocher n'écrit rien). */
export async function retirerPrise(db: Executeur, traitementId: string, date: string): Promise<void> {
  await db.runAsync(
    "DELETE FROM prise WHERE id = (SELECT id FROM prise WHERE traitement_id = ? AND date = ? ORDER BY heure DESC, cree_le DESC LIMIT 1)",
    [traitementId, date],
  );
}

/** Ce qu'une IA a écrit (révocation, D16) : `auteurs`, les formes de son id (« abc », « ia.abc », « ia:abc »). */
export interface EcritsIA {
  blessures: number;
  entrees: number;
  statuts: number;
  traitements: number;
  prises: number;
  notes: number;
}

const dans = (auteurs: readonly string[]) => `(${auteurs.map(() => "?").join(", ")})`;

export async function compterEcritsIA(db: Executeur, auteurs: readonly string[]): Promise<EcritsIA> {
  const n = async (sql: string, p: (string | number)[] = [...auteurs]) => (await db.getFirstAsync<{ n: number }>(sql, p))?.n ?? 0;
  const a = dans(auteurs);
  return {
    blessures: await n(`SELECT COUNT(*) AS n FROM blessure WHERE auteur IN ${a} AND supprime_le IS NULL`),
    entrees: await n(`SELECT COUNT(*) AS n FROM blessure_journal WHERE auteur IN ${a} AND supprime_le IS NULL`),
    statuts: await n(`SELECT COUNT(*) AS n FROM blessure_statut WHERE auteur IN ${a}`),
    traitements: await n(`SELECT COUNT(*) AS n FROM traitement WHERE auteur IN ${a} AND supprime_le IS NULL`),
    prises: await n(`SELECT COUNT(*) AS n FROM prise WHERE auteur IN ${a}`),
    notes: await n(
      `SELECT (SELECT COUNT(*) FROM blessure WHERE notes_auteur IN ${a} AND supprime_le IS NULL)
            + (SELECT COUNT(*) FROM traitement WHERE notes_auteur IN ${a} AND supprime_le IS NULL) AS n`,
      [...auteurs, ...auteurs],
    ),
  };
}

/**
 * « Les supprimer aussi » : blessures, entrées et compléments de l'IA supprimés (doux, comme à la main), ses statuts et
 * prises effacés, ses notes vidées ; le statut des blessures touchées est recalculé. Le journal de synchro note tout.
 */
export async function effacerEcritsIA(db: Executeur, auteurs: readonly string[], maintenant: number = Date.now()): Promise<void> {
  const a = dans(auteurs);
  const p = [...auteurs];
  await transaction(db, async (db) => {
    const touchees = await db.getAllAsync<{ blessure_id: string }>(`SELECT DISTINCT blessure_id FROM blessure_statut WHERE auteur IN ${a}`, p);
    for (const [t, filtre] of [["blessure", ""], ["traitement", ``]]) {
      await db.runAsync(`UPDATE ${t} SET supprime_le = ?, maj_le = ? WHERE auteur IN ${a} AND supprime_le IS NULL${filtre}`, [maintenant, maintenant, ...p]);
      await db.runAsync(`UPDATE ${t} SET notes = NULL, notes_auteur = NULL, notes_maj = ?, maj_le = ? WHERE notes_auteur IN ${a}${filtre}`, [maintenant, maintenant, ...p]);
    }
    await db.runAsync(`UPDATE blessure_journal SET supprime_le = ?, maj_le = ? WHERE auteur IN ${a} AND supprime_le IS NULL`, [maintenant, maintenant, ...p]);
    await db.runAsync(`DELETE FROM blessure_statut WHERE auteur IN ${a}`, p);
    await db.runAsync(`DELETE FROM prise WHERE auteur IN ${a}`, p);
    for (const { blessure_id } of touchees) await recalculerStatut(db, blessure_id, maintenant);
  });
}

/** Efface pour de bon ce qui a été supprimé avant `avant` (ms) : le délai d'Annuler est passé (appli fermée entre-temps). */
export async function purgerSupprimes(db: Executeur, avant: number): Promise<void> {
  await db.runAsync("DELETE FROM blessure WHERE supprime_le IS NOT NULL AND supprime_le < ?", [avant]);
  await db.runAsync("DELETE FROM traitement WHERE supprime_le IS NOT NULL AND supprime_le < ?", [avant]);
  await db.runAsync("DELETE FROM blessure_journal WHERE supprime_le IS NOT NULL AND supprime_le < ?", [avant]);
}

/** Muscle principal et secondaires (« a|b ») des exercices donnés : le repère des blessures en séance (D7). */
export async function musclesDesExercices(db: Executeur, ids: readonly string[]): Promise<Map<string, { muscle: string | null; secondaires: string | null }>> {
  if (!ids.length) return new Map();
  const l = await db.getAllAsync<{ id: string; muscle: string | null; secondaires: string | null }>(
    `SELECT id, muscle, secondaires FROM exercices WHERE id IN (${ids.map(() => "?").join(",")})`,
    [...ids],
  );
  return new Map(l.map((x) => [x.id, { muscle: x.muscle, secondaires: x.secondaires }]));
}
