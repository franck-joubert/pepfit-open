import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { ecrireFichiersAEffacer, fichiersAEffacer } from "../db/depots/photos";
import { chargerLiens } from "../db/liens-catalogue";
import { exercicesAuPoidsDuCorps, recalculerExercice, recalculerToutesSeances } from "../db/depots/recalcul";
import { chiffrerChamps, chiffrerFichier, cleFichierChiffre, dechiffrerChamps, dechiffrerFichier } from "./chiffrement";
import { Horloge, hlcTexte } from "./horloge";
import { CLE_PARTAGE_WHOOP_IA, cleSql, filtreSql, tableSync, TABLES_SYNC, TABLES_WHOOP_IA, valeursCle, voyage, type TableSync } from "./schema";

// Moteur de synchro, commun à tous les serveurs (NOTES § 6.2) : tire les changements reçus et les fusionne (le dernier qui
// écrit gagne, ligne par ligne), puis pousse le journal local, puis les photos. Le transport ne voit que des lignes déjà
// chiffrées pour leurs colonnes sensibles, et des photos chiffrées sous un nom opaque.

/** Une ligne telle qu'elle voyage : `charge` est le JSON des colonnes en clair, plus « _s », le bloc chiffré des sensibles. */
export interface Changement {
  tab: string;
  cle: string;
  hlc: string;
  supprime: boolean;
  charge: string | null;
}

export interface Lot {
  changements: Changement[];
  curseur: string | null;
  encore: boolean;
}

export interface Transport {
  /** Idempotent : renvoyer le même changement ne crée pas de doublon. */
  pousser(lot: Changement[]): Promise<void>;
  tirer(curseur: string | null, limite: number): Promise<Lot>;
  /** Idempotent : un fichier déjà envoyé sous cette clé n'est pas remplacé. */
  envoyerFichier(cle: string, contenu: Uint8Array): Promise<void>;
  /** Contenu d'un fichier envoyé, null s'il n'existe pas. */
  lireFichier(cle: string): Promise<Uint8Array | null>;
  /** Sans effet si le fichier n'existe pas. */
  supprimerFichier(cle: string): Promise<void>;
}

/** Accès aux fichiers du téléphone (chemins relatifs au dossier des documents). */
export interface Fichiers {
  existe(chemin: string): boolean;
  lire(chemin: string): Promise<Uint8Array>;
  ecrire(chemin: string, contenu: Uint8Array): Promise<void>;
}

export interface Contexte {
  db: Executeur;
  transport: Transport;
  /** Clé de données (32 octets), déverrouillée. */
  cle: Uint8Array;
  /** Identifiant de ce téléphone, fixe. */
  noeud: string;
  fichiers?: Fichiers;
  maintenant?: () => number;
  /**
   * Compte synchronisé (userId). L'état de synchro lui appartient : un autre compte repart d'un premier passage, et ce
   * premier passage ne mêle les données déjà là qu'après une réponse (2e, ChoixRequis).
   */
  compte?: string;
}

/** Réponse de 2e : les données déjà sur ce téléphone rejoignent le compte, ou en partent. */
export type ChoixDonnees = "ajouter" | "effacer";

/** Ce que 2e montre : les séances et les pesées déjà sur ce téléphone. */
export interface DonneesIci {
  seances: number;
  pesees: number;
}

/** Premier passage d'un compte sur un téléphone qui a déjà des données à soi : rien n'est mêlé sans réponse (2e, D3). */
export class ChoixRequis extends Error {
  readonly donnees: DonneesIci;
  constructor(donnees: DonneesIci) {
    super("choix requis : données déjà sur ce téléphone");
    this.donnees = donnees;
  }
}

/**
 * Tables des données de la personne (séances, mesures, santé, publications), dans l'ordre de TABLES_SYNC : celles que 2e
 * compte et que « Les effacer de ce téléphone » vide. Hors liste : le catalogue (salles, exercices, produits), les routines,
 * les plats et les réglages, que l'appli pose d'elle-même ou que le serveur départage déjà ligne à ligne.
 */
export const TABLES_PERSONNELLES = [
  "seances", "seance_exercices", "notes", "series", "seance_charge", "jour_activite", "recup_nuit", "recup_activite",
  "jour_energie", "whoop_brut_jour", "whoop_brut_seance", "pesee", "cycle_jour", "seance_photo", "blessure",
  "blessure_statut", "blessure_journal", "traitement", "prise", "consommations", "eau_ajout", "mensurations", "mesure_corps",
  "publications", "reactions", "commentaires", "circuit",
];

const compter = async (db: Executeur, tab: string) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tab}`, []))?.n ?? 0;

/** Le prochain passage de ce compte sera-t-il un premier passage ? (Autre compte, ou jamais synchronisé.) */
async function premierPour(db: Executeur, compte: string | undefined): Promise<boolean> {
  const proprio = await lireEtat(db, "compte");
  if ((await lireEtat(db, "initial")) !== "1") return true;
  // État d'avant cette clé : il appartient au compte connecté.
  return !!compte && proprio !== null && proprio !== compte;
}

/** Données à soi sur ce téléphone, avant le premier passage d'un compte et sans réponse encore ; null sinon. */
export async function choixDonneesIci(db: Executeur, compte: string): Promise<DonneesIci | null> {
  if (!(await premierPour(db, compte)) || (await lireEtat(db, "donnees_ici"))) return null;
  let n = 0;
  for (const t of TABLES_PERSONNELLES) if ((n = await compter(db, t)) > 0) break;
  return n > 0 ? { seances: await compter(db, "seances"), pesees: await compter(db, "pesee") } : null;
}

export const ecrireChoixDonnees = (db: Executeur, choix: ChoixDonnees) => ecrireEtat(db, "donnees_ici", choix);

export interface Bilan {
  recus: number;
  appliques: number;
  envoyes: number;
  photosEnvoyees: number;
  photosRecues: number;
  /** Photos envoyées en clair autrefois, désormais chiffrées sur le serveur et dont la copie en clair est supprimée. */
  photosMigrees: number;
}

const PAQUET_TIRER = 500;
/**
 * Un paquet confirmé par le serveur quitte aussitôt le journal : un envoi interrompu (limite de débit, réseau) reprend au
 * paquet suivant. Même taille que le lot PocketBase (PAQUET_BATCH) : un paquet = une requête, rien n'est renvoyé pour rien.
 */
const PAQUET_POUSSER = 20;

async function lireEtat(db: Executeur, cle: string): Promise<string | null> {
  return (await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM sync_etat WHERE cle = ?", [cle]))?.valeur ?? null;
}

async function ecrireEtat(db: Executeur, cle: string, valeur: string | null): Promise<void> {
  if (valeur === null) await db.runAsync("DELETE FROM sync_etat WHERE cle = ?", [cle]);
  else await db.runAsync("INSERT INTO sync_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", [cle, valeur]);
}

const ecrireVersion = (db: Executeur, c: Changement) =>
  db.runAsync(
    `INSERT INTO sync_version (tab, cle, hlc, supprime) VALUES (?, ?, ?, ?)
     ON CONFLICT(tab, cle) DO UPDATE SET hlc = excluded.hlc, supprime = excluded.supprime`,
    [c.tab, c.cle, c.hlc, c.supprime ? 1 : 0],
  );

const colonnesCache = new WeakMap<Executeur, Map<string, Set<string>>>();

async function colonnes(db: Executeur, tab: string): Promise<Set<string>> {
  let m = colonnesCache.get(db);
  if (!m) colonnesCache.set(db, (m = new Map()));
  let c = m.get(tab);
  if (!c) {
    c = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tab})`, [])).map((x) => x.name));
    m.set(tab, c);
  }
  return c;
}

/** Ligne locale → changement à envoyer (null si la ligne n'existe plus : c'est alors une suppression). */
async function emballer(db: Executeur, t: TableSync, cle: string, cleDonnees: Uint8Array): Promise<string | null> {
  const ligne = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM ${t.nom} WHERE ${cleSql(t)} = ?`, [cle]);
  if (!ligne) return null;
  const clair: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ligne)) (t.sensibles.includes(k) ? secret : clair)[k] = v;
  if (t.sensibles.length) clair._s = chiffrerChamps(cleDonnees, `${t.nom}/${cle}`, secret);
  return JSON.stringify(clair);
}

function deballer(t: TableSync, c: Changement, cleDonnees: Uint8Array): Record<string, unknown> {
  const { _s, ...clair } = JSON.parse(c.charge ?? "{}") as Record<string, unknown>;
  return typeof _s === "string" ? { ...clair, ...dechiffrerChamps(cleDonnees, `${t.nom}/${c.cle}`, _s) } : clair;
}

// Clés étrangères et doublons (docs/SYNC-COMPLETE.md § 3). Une ligne peut arriver avant son parent (pages de 500 triées par
// heure d'écriture sur le serveur, ou écrite par l'IA dans n'importe quel ordre) : elle attend dans sync_attente, telle que
// reçue (chiffrée), que le parent arrive, et rien n'est perdu. Deux lignes qui se disputent un index unique : le plus ancien
// gagne (même règle sur tous les appareils, donc même résultat) ; le perdant est noté dans sync_alias, pour que ce qui le
// vise encore, ici ou à l'arrivée, soit réécrit vers le gagnant (et renvoyé ainsi au serveur).

/** Clé étrangère vers une table synchronisée : colonne de la ligne, table et colonne visées. */
interface Parent {
  colonne: string;
  table: string;
  vers: string;
}

const parentsCache = new WeakMap<Executeur, Map<string, Parent[]>>();

async function parents(db: Executeur, tab: string): Promise<Parent[]> {
  let m = parentsCache.get(db);
  if (!m) parentsCache.set(db, (m = new Map()));
  let p = m.get(tab);
  if (!p) {
    const fk = await db.getAllAsync<{ id: number; table: string; from: string; to: string | null }>(`PRAGMA foreign_key_list(${tab})`, []);
    const parId = new Map<number, typeof fk>();
    for (const x of fk) parId.set(x.id, [...(parId.get(x.id) ?? []), x]);
    p = [...parId.values()]
      .filter((l) => l.length === 1 && tableSync(l[0]!.table) && tableSync(l[0]!.table)!.cles.length === 1)
      .map(([x]) => ({ colonne: x!.from, table: x!.table, vers: x!.to ?? tableSync(x!.table)!.cles[0]! }));
    m.set(tab, p);
  }
  return p;
}

/** Références réécrites vers le gagnant d'une fusion, par table qui référence : colonne et table visée. */
const RENVOIS = new Map<string, { colonne: string; parent: string }[]>();
for (const t of TABLES_SYNC) for (const r of t.renvois ?? []) RENVOIS.set(r.table, [...(RENVOIS.get(r.table) ?? []), { colonne: r.colonne, parent: t.nom }]);

/** Ligne supprimée, ici (pas encore envoyée) ou ailleurs : ses enfants qui arrivent suivent l'ancienne règle (reparerOrphelins). */
async function supprimee(db: Executeur, tab: string, cle: string): Promise<boolean> {
  const v = await db.getFirstAsync<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM sync_version WHERE tab = ? AND cle = ? AND supprime = 1) + (SELECT COUNT(*) FROM sync_journal WHERE tab = ? AND cle = ? AND supprime = 1) AS n",
    [tab, cle, tab, cle],
  );
  return (v?.n ?? 0) > 0;
}

/** Gagnant d'une fusion qui a remplacé `cle` (en suivant la chaîne), null s'il n'y en a pas. */
export async function alias(db: Executeur, tab: string, cle: string): Promise<string | null> {
  let n: string | null = null;
  for (let i = 0; i < 20; i++) {
    const l: { nouveau: string } | null = await db.getFirstAsync<{ nouveau: string }>("SELECT nouveau FROM sync_alias WHERE tab = ? AND ancien = ?", [tab, n ?? cle]);
    if (!l || l.nouveau === cle) return n;
    n = l.nouveau;
  }
  return n;
}

const noterAlias = (db: Executeur, tab: string, ancien: string, nouveau: string) =>
  db.runAsync("INSERT INTO sync_alias (tab, ancien, nouveau) VALUES (?, ?, ?) ON CONFLICT(tab, ancien) DO UPDATE SET nouveau = excluded.nouveau", [tab, ancien, nouveau]);

/** Note une écriture au journal (comme les déclencheurs) pendant que le journal est coupé : elle partira au prochain envoi. */
const noter = (db: Executeur, tab: string, cle: string, supprime: boolean) =>
  db.runAsync(
    `INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES (?, ?, ?, ?)
     ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime`,
    [tab, cle, Date.now(), supprime ? 1 : 0],
  );

/** Écritures journalisées par les déclencheurs (cascades comprises), au milieu d'une application où le journal est coupé. */
async function sansSilence(db: Executeur, f: () => Promise<void>): Promise<void> {
  await db.runAsync("DELETE FROM sync_silence", []);
  try {
    await f();
  } finally {
    await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
  }
}

/** Les références au perdant d'une fusion passent au gagnant (journalisées). */
async function rediriger(db: Executeur, t: TableSync, perdant: string, gagnant: string): Promise<void> {
  for (const r of t.renvois ?? []) await db.runAsync(`UPDATE ${r.table} SET ${r.colonne} = ? WHERE ${r.colonne} = ?`, [gagnant, perdant]);
}

type Valeurs = Record<string, unknown>;
const sql = (v: unknown) => (v === undefined ? null : (v as string | number | null));

/**
 * Index uniques de la ligne reçue `cle` : à chaque conflit avec une autre ligne, le plus ancien gagne (`anciennete`, puis la
 * clé). Renvoie les valeurs à écrire (celles d'un produit perdant, vidées de ses colonnes en conflit), ou null si la ligne
 * reçue perd un doublon : elle n'est pas écrite, et sa suppression part au serveur. `noterApres` : la ligne écrite diffère
 * de la version reçue, elle repartira.
 */
async function fusionner(db: Executeur, t: TableSync, cle: string, v: Valeurs): Promise<{ valeurs: Valeurs; noterApres: boolean } | null> {
  const k = t.cles[0]!;
  let valeurs = v;
  let noterApres = false;
  for (const u of t.uniques ?? []) {
    if (u.some((c) => valeurs[c] == null)) continue;
    const autre = await db.getFirstAsync<{ k: string; a: number | null }>(
      `SELECT ${k} AS k, ${t.anciennete ?? "NULL"} AS a FROM ${t.nom} WHERE ${u.map((c) => `${c} = ?`).join(" AND ")} AND ${k} <> ?`,
      [...u.map((c) => sql(valeurs[c])), cle],
    );
    if (!autre) continue;
    const a = t.anciennete ? Number(valeurs[t.anciennete] ?? 0) : 0;
    const b = Number(autre.a ?? 0);
    const recueGagne = a !== b ? a < b : cle < autre.k;
    const [gagnant, perdant] = recueGagne ? [cle, autre.k] : [autre.k, cle];
    await noterAlias(db, t.nom, perdant, gagnant);
    await sansSilence(db, async () => {
      await rediriger(db, t, perdant, gagnant);
      if (!recueGagne) return;
      if (t.fusion === "remplace") {
        await db.runAsync(`UPDATE ${t.nom} SET ${u.map((c) => `${c} = NULL`).join(", ")}, remplace_par = ? WHERE ${k} = ?`, [gagnant, perdant]);
      } else await db.runAsync(`DELETE FROM ${t.nom} WHERE ${k} = ?`, [perdant]);
    });
    if (recueGagne) continue;
    if (t.fusion !== "remplace") {
      await noter(db, t.nom, cle, true);
      return null;
    }
    valeurs = { ...valeurs, ...Object.fromEntries(u.map((c) => [c, null])), remplace_par: gagnant };
    noterApres = true;
  }
  return { valeurs, noterApres };
}

interface Suivi {
  exercices: Set<string>;
  tables: Set<string>;
}

/**
 * Un changement reçu, journal coupé : retenu s'il est plus récent que la version connue de la ligne, que celle qui attend son
 * parent et que l'écriture locale pas encore envoyée. « gare » : son parent n'est pas encore là, il attend dans sync_attente.
 */
async function appliquerUn(db: Executeur, c: Changement, cleDonnees: Uint8Array, horloge: Horloge, suivi: Suivi): Promise<"applique" | "ignore" | "gare"> {
  horloge.recevoir(c.hlc);
  const t = tableSync(c.tab)!;
  const connue = await db.getFirstAsync<{ hlc: string; supprime: number }>("SELECT hlc, supprime FROM sync_version WHERE tab = ? AND cle = ?", [c.tab, c.cle]);
  if (connue && connue.hlc >= c.hlc) return "ignore";
  // Ligne à id unique (jamais réutilisé) : la suppression gagne, même contre une écriture plus récente (une série ajoutée
  // à une séance supprimée ailleurs ne la ressuscite pas). Clé composée : le dernier qui écrit gagne, on peut la recréer.
  const definitif = t.cles.length === 1;
  if (definitif && connue?.supprime && !c.supprime) return "ignore";
  const garee = await db.getFirstAsync<{ hlc: string }>("SELECT hlc FROM sync_attente WHERE tab = ? AND cle = ?", [c.tab, c.cle]);
  if (garee && garee.hlc >= c.hlc && !(definitif && c.supprime)) return "ignore";
  const enAttente = await db.getFirstAsync<{ ms: number }>("SELECT ms FROM sync_journal WHERE tab = ? AND cle = ?", [c.tab, c.cle]);
  if (enAttente && !(definitif && c.supprime) && hlcTexte({ ms: enAttente.ms, c: 0, noeud: horloge.noeud }) >= c.hlc) return "ignore";

  let valeurs: Valeurs | null = null;
  let reecrite = false;
  if (!c.supprime) {
    const connues = await colonnes(db, c.tab);
    valeurs = Object.fromEntries(Object.entries(deballer(t, c, cleDonnees)).filter(([k]) => connues.has(k)));
    // Référence à une ligne fusionnée ailleurs ou ici : elle vise le gagnant.
    for (const r of RENVOIS.get(c.tab) ?? []) {
      const v = valeurs[r.colonne];
      const n = typeof v === "string" ? await alias(db, r.parent, v) : null;
      if (n) {
        valeurs[r.colonne] = n;
        reecrite = true;
      }
    }
    for (const p of await parents(db, c.tab)) {
      const v = valeurs[p.colonne];
      if (v == null || (await db.getFirstAsync(`SELECT 1 FROM ${p.table} WHERE ${p.vers} = ?`, [sql(v)])) || (await supprimee(db, p.table, String(v)))) continue;
      await db.runAsync(
        `INSERT INTO sync_attente (tab, cle, hlc, charge, attend_tab, attend_col, attend_val) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tab, cle) DO UPDATE SET hlc = excluded.hlc, charge = excluded.charge, attend_tab = excluded.attend_tab,
           attend_col = excluded.attend_col, attend_val = excluded.attend_val`,
        [c.tab, c.cle, c.hlc, c.charge, p.table, p.vers, String(v)],
      );
      return "gare";
    }
  }
  if (garee) await db.runAsync("DELETE FROM sync_attente WHERE tab = ? AND cle = ?", [c.tab, c.cle]);
  if (enAttente) await db.runAsync("DELETE FROM sync_journal WHERE tab = ? AND cle = ?", [c.tab, c.cle]);

  const cles = valeursCle(c.cle);
  // Règle propre à la table (charge de l'Effort calculée avec la FC) : la ligne locale reste et repart au serveur.
  if (valeurs && t.garderLocale) {
    const locale = await db.getFirstAsync<Valeurs>(`SELECT * FROM ${c.tab} WHERE ${t.cles.map((k) => `${k} = ?`).join(" AND ")}`, cles);
    if (locale && t.garderLocale(locale, valeurs)) {
      await ecrireVersion(db, c);
      await noter(db, c.tab, c.cle, false);
      return "ignore";
    }
  }
  if (c.tab === "series" || c.tab === "seance_exercices") {
    const ex = await db.getFirstAsync<{ exercice_id: string }>(`SELECT exercice_id FROM ${c.tab} WHERE ${cleSql(t)} = ?`, [c.cle]);
    if (ex) suivi.exercices.add(ex.exercice_id);
  }
  if (!valeurs) {
    await db.runAsync(`DELETE FROM ${c.tab} WHERE ${t.cles.map((k) => `${k} = ?`).join(" AND ")}`, cles);
  } else {
    if (t.uniques) {
      const f = await fusionner(db, t, c.cle, valeurs);
      if (!f) {
        suivi.tables.add(c.tab);
        await ecrireVersion(db, c);
        return "applique";
      }
      valeurs = f.valeurs;
      reecrite ||= f.noterApres;
    }
    const noms = Object.keys(valeurs);
    const maj = noms.filter((k) => !t.cles.includes(k));
    await db.runAsync(
      `INSERT INTO ${c.tab} (${noms.join(", ")}) VALUES (${noms.map(() => "?").join(", ")})
       ON CONFLICT(${t.cles.join(", ")}) DO ${maj.length ? `UPDATE SET ${maj.map((k) => `${k} = excluded.${k}`).join(", ")}` : "NOTHING"}`,
      noms.map((k) => sql(valeurs![k])),
    );
    if (t.fusion === "remplace" && typeof valeurs.remplace_par === "string") await noterAlias(db, c.tab, c.cle, valeurs.remplace_par);
    if (reecrite) await noter(db, c.tab, c.cle, false);
    if (typeof valeurs.exercice_id === "string") suivi.exercices.add(valeurs.exercice_id);
  }
  suivi.tables.add(c.tab);
  await ecrireVersion(db, c);
  return "applique";
}

/** Lignes en attente dont le parent est arrivé, a été supprimé ou fusionné : appliquées à leur tour. */
async function reprendreGarees(db: Executeur, cleDonnees: Uint8Array, horloge: Horloge, suivi: Suivi): Promise<number> {
  let n = 0;
  for (let tour = 0; tour < 10; tour++) {
    const prets: (Changement & { rang: number })[] = [];
    for (const g of await db.getAllAsync<{ attend_tab: string; attend_col: string }>("SELECT DISTINCT attend_tab, attend_col FROM sync_attente", [])) {
      if (!tableSync(g.attend_tab) || !(await colonnes(db, g.attend_tab)).has(g.attend_col)) continue;
      const l = await db.getAllAsync<{ tab: string; cle: string; hlc: string; charge: string | null }>(
        `SELECT a.tab, a.cle, a.hlc, a.charge FROM sync_attente a WHERE a.attend_tab = ? AND a.attend_col = ? AND (
           EXISTS (SELECT 1 FROM ${g.attend_tab} p WHERE p.${g.attend_col} = a.attend_val)
           OR EXISTS (SELECT 1 FROM sync_version v WHERE v.tab = a.attend_tab AND v.cle = a.attend_val AND v.supprime = 1)
           OR EXISTS (SELECT 1 FROM sync_journal j WHERE j.tab = a.attend_tab AND j.cle = a.attend_val AND j.supprime = 1)
           OR EXISTS (SELECT 1 FROM sync_alias s WHERE s.tab = a.attend_tab AND s.ancien = a.attend_val))`,
        [g.attend_tab, g.attend_col],
      );
      prets.push(...l.filter((x) => tableSync(x.tab)).map((x) => ({ ...x, supprime: false, rang: tableSync(x.tab)!.rang })));
    }
    if (!prets.length) return n;
    prets.sort((a, b) => a.rang - b.rang);
    for (const { rang: _, ...c } of prets) {
      await db.runAsync("DELETE FROM sync_attente WHERE tab = ? AND cle = ?", [c.tab, c.cle]);
      if ((await appliquerUn(db, c, cleDonnees, horloge, suivi)) === "applique") n++;
    }
  }
  return n;
}

/**
 * Changements appliqués par transaction (audit M14) : un lot reçu (PAQUET_TIRER) passe en plusieurs transactions courtes, et
 * une écriture de l'écran n'attend jamais plus que l'une d'elles. Sans risque : un enfant dont le parent n'est pas encore là
 * attend (sync_attente), et un lot interrompu est retiré à la synchro suivante (le curseur n'avance qu'à la fin du lot, une
 * ligne déjà appliquée est ignorée).
 */
export const LOT_TRANSACTION = 100;

/**
 * Applique des changements reçus, par transactions de LOT_TRANSACTION, journal coupé (appliquerUn), puis reprend les lignes qui
 * attendaient leur parent. Renvoie les exercices touchés (records à recalculer) et le nombre de lignes appliquées.
 */
export async function appliquer(
  db: Executeur,
  changements: Changement[],
  cleDonnees: Uint8Array,
  horloge: Horloge,
): Promise<{ appliques: number; exercices: Set<string>; tables: Set<string> }> {
  const suivi: Suivi = { exercices: new Set<string>(), tables: new Set<string>() };
  let appliques = 0;
  // Une table filtrée (réglages) ne reçoit que ses clés : un réglage local d'un autre appareil ne s'écrit pas ici.
  const valides = changements.filter((c) => {
    const t = tableSync(c.tab);
    return t && voyage(t, c.cle);
  });
  // Ajouts : parents d'abord ; suppressions : enfants d'abord, après les ajouts.
  const ordre = (c: Changement) => (c.supprime ? 1000 - tableSync(c.tab)!.rang : tableSync(c.tab)!.rang);
  valides.sort((a, b) => ordre(a) - ordre(b));

  const enfants = await tablesEnfants(db);
  for (let i = 0; i < valides.length; i += LOT_TRANSACTION) {
    const lot = valides.slice(i, i + LOT_TRANSACTION);
    await transaction(db, async (db) => {
      await db.execAsync("PRAGMA defer_foreign_keys = ON");
      await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
      for (const c of lot) if ((await appliquerUn(db, c, cleDonnees, horloge, suivi)) === "applique") appliques++;
      await reparerOrphelins(db, aVerifier(lot, enfants));
      await db.runAsync("DELETE FROM sync_silence", []);
    });
  }
  // Lignes qui attendaient leur parent : leur propre transaction, seulement s'il y en a.
  if (await db.getFirstAsync("SELECT 1 AS x FROM sync_attente LIMIT 1", [])) {
    await transaction(db, async (db) => {
      await db.execAsync("PRAGMA defer_foreign_keys = ON");
      await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
      const repris = await reprendreGarees(db, cleDonnees, horloge, suivi);
      appliques += repris;
      // Une ligne reprise dont le parent a été supprimé ailleurs devient orpheline dans sa propre table (déjà dans suivi.tables).
      if (repris) await reparerOrphelins(db, [...suivi.tables]);
      await db.runAsync("DELETE FROM sync_silence", []);
    });
  }
  return { appliques, exercices: suivi.exercices, tables: suivi.tables };
}

/** Pour chaque table, les tables qui la référencent (clé étrangère) : lues une fois par connexion. */
const memoireEnfants = new WeakMap<object, Map<string, string[]>>();
async function tablesEnfants(db: Executeur): Promise<Map<string, string[]>> {
  const deja = memoireEnfants.get(db);
  if (deja) return deja;
  const m = new Map<string, string[]>();
  const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'", []);
  for (const { name } of tables) {
    for (const fk of await db.getAllAsync<{ table: string }>(`PRAGMA foreign_key_list(${name})`, [])) {
      const l = m.get(fk.table) ?? [];
      if (!l.includes(name)) l.push(name);
      m.set(fk.table, l);
    }
  }
  memoireEnfants.set(db, m);
  return m;
}

/**
 * Tables où un lot peut laisser des orphelins : les tables reçues, et celles qui référencent une table où une ligne a été
 * supprimée. Un ajout ne fait pas d'orphelin (sans son parent, il attend : sync_attente).
 */
function aVerifier(lot: readonly Changement[], enfants: ReadonlyMap<string, string[]>): string[] {
  const t = new Set<string>();
  for (const c of lot) {
    t.add(c.tab);
    if (c.supprime) for (const e of enfants.get(c.tab) ?? []) t.add(e);
  }
  return [...t];
}

/**
 * Lignes reçues dont le parent a été supprimé ailleurs : la référence est vidée si la clé étrangère le prévoit (salle d'une
 * séance), sinon la ligne part avec son parent (série d'une séance supprimée).
 */
export async function reparerOrphelins(db: Executeur, tables?: readonly string[]): Promise<void> {
  // Sur les seules tables du lot (audit M14) : le contrôle de toute la base coûtait à chaque lot reçu.
  const verifier = async () =>
    tables
      ? (await Promise.all([...new Set(tables)].map((t) => db.getAllAsync<{ table: string; rowid: number; fkid: number }>(`PRAGMA foreign_key_check(${t})`, [])))).flat()
      : db.getAllAsync<{ table: string; rowid: number; fkid: number }>("PRAGMA foreign_key_check", []);
  for (let tour = 0; tour < 5; tour++) {
    const l = await verifier();
    if (!l.length) return;
    for (const o of l) {
      const fk = (await db.getAllAsync<{ id: number; from: string; on_delete: string }>(`PRAGMA foreign_key_list(${o.table})`, [])).find(
        (x) => x.id === o.fkid,
      );
      if (fk?.on_delete === "SET NULL") await db.runAsync(`UPDATE ${o.table} SET ${fk.from} = NULL WHERE rowid = ?`, [o.rowid]);
      else await db.runAsync(`DELETE FROM ${o.table} WHERE rowid = ?`, [o.rowid]);
    }
  }
}

/** Note dans le journal toutes les lignes que le serveur n'a pas encore (premier envoi d'un téléphone). */
export async function marquerTout(db: Executeur, ms: number): Promise<void> {
  for (const t of TABLES_SYNC) {
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_journal (tab, cle, ms, supprime)
       SELECT ?, ${cleSql(t, "x.")}, ?, 0 FROM ${t.nom} x
       WHERE ${filtreSql(t, "x.")} AND NOT EXISTS (SELECT 1 FROM sync_version v WHERE v.tab = ? AND v.cle = ${cleSql(t, "x.")})`,
      [t.nom, ms, t.nom],
    );
  }
}

async function tirer(ctx: Contexte, horloge: Horloge, bilan: Bilan, exercices: Set<string>, tables: Set<string>): Promise<void> {
  let curseur = await lireEtat(ctx.db, "curseur");
  for (;;) {
    const lot = await ctx.transport.tirer(curseur, PAQUET_TIRER);
    bilan.recus += lot.changements.length;
    if (lot.changements.length) {
      const r = await appliquer(ctx.db, lot.changements, ctx.cle, horloge);
      bilan.appliques += r.appliques;
      r.exercices.forEach((e) => exercices.add(e));
      r.tables.forEach((t) => tables.add(t));
    }
    curseur = lot.curseur;
    await ecrireEtat(ctx.db, "curseur", curseur);
    if (!lot.encore || !lot.changements.length) return;
  }
}

async function pousser(ctx: Contexte, horloge: Horloge, bilan: Bilan): Promise<void> {
  const tout = await ctx.db.getAllAsync<{ tab: string; cle: string; ms: number; supprime: number }>(
    "SELECT tab, cle, ms, supprime FROM sync_journal ORDER BY ms",
    [],
  );
  // Réglage local noté par erreur, table inconnue : ne part pas, quitte le journal. Valeurs brutes de Whoop : elles ne partent que
  // si le partage avec l'IA est allumé (seules leurs suppressions partent toujours : retirer le partage efface le serveur).
  const partage = (await ctx.db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [CLE_PARTAGE_WHOOP_IA]))?.valeur === "1";
  const ecartes = tout.filter((j) => !tableSync(j.tab) || !voyage(tableSync(j.tab)!, j.cle) || (!partage && !j.supprime && TABLES_WHOOP_IA.includes(j.tab)));
  for (const j of ecartes) await ctx.db.runAsync("DELETE FROM sync_journal WHERE tab = ? AND cle = ? AND ms = ?", [j.tab, j.cle, j.ms]);
  // À heure égale (lignes notées d'un coup par une migration), parents d'abord : l'autre appareil les reçoit dans cet ordre.
  const journal = tout
    .filter((j) => !ecartes.includes(j))
    .sort((a, b) => a.ms - b.ms || tableSync(a.tab)!.rang - tableSync(b.tab)!.rang);
  for (let i = 0; i < journal.length; i += PAQUET_POUSSER) {
    const paquet = journal.slice(i, i + PAQUET_POUSSER);
    const lot: Changement[] = [];
    for (const j of paquet) {
      const t = tableSync(j.tab)!;
      const charge = j.supprime ? null : await emballer(ctx.db, t, j.cle, ctx.cle);
      lot.push({ tab: j.tab, cle: j.cle, hlc: horloge.envoyer(j.ms), supprime: charge === null, charge });
    }
    await ctx.transport.pousser(lot);
    await transaction(ctx.db, async (db) => {
      for (const [k, c] of lot.entries()) {
        await ecrireVersion(db, c);
        // Une écriture faite pendant l'envoi a changé `ms` : elle reste au journal pour le prochain envoi.
        await db.runAsync("DELETE FROM sync_journal WHERE tab = ? AND cle = ? AND ms = ?", [c.tab, c.cle, paquet[k]!.ms]);
      }
      await ecrireEtat(db, "hlc", horloge.etat());
    });
    bilan.envoyes += lot.length;
  }
}

/**
 * Fichiers des photos supprimées ou remplacées (noms locaux) : effacés du serveur, sous leur clé chiffrée et sous leur
 * ancien nom en clair ; un échec reste en file pour la prochaine fois.
 */
async function effacerFichiers(ctx: Contexte): Promise<void> {
  const l = await fichiersAEffacer(ctx.db);
  if (!l.length) return;
  const restants: string[] = [];
  for (const nom of l) {
    try {
      await ctx.transport.supprimerFichier(cleFichierChiffre(ctx.cle, nom));
      await ctx.transport.supprimerFichier(nom);
    } catch (e) {
      console.warn("fichier distant non effacé", nom, e);
      restants.push(nom);
    }
  }
  // Relu : une photo supprimée pendant l'effacement a pu en ajouter.
  const nouveaux = (await fichiersAEffacer(ctx.db)).filter((c) => !l.includes(c));
  await ecrireFichiersAEffacer(ctx.db, [...restants, ...nouveaux]);
}

// Photos (photo de séance et vignette) : chiffrées par la clé de données, sous une clé distante opaque tirée du nom local. Les
// premières versions les envoyaient en clair, sous leur nom : elles restent lisibles (ancienne clé), puis chaque téléphone
// les réenvoie chiffrées et supprime la copie en clair, une fois la version chiffrée relue (repère « photo_chiffree:<id> »).

const nomPhoto = (chemin: string) => chemin.split("/").pop()!;
const egaux = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

async function envoyerPhoto(ctx: Contexte, f: Fichiers, chemin: string): Promise<void> {
  const nom = nomPhoto(chemin);
  await ctx.transport.envoyerFichier(cleFichierChiffre(ctx.cle, nom), chiffrerFichier(ctx.cle, nom, await f.lire(chemin)));
}

/** Télécharge un fichier manquant : la version chiffrée, sinon l'ancienne en clair. False s'il n'est pas sur le serveur. */
async function recevoirPhoto(ctx: Contexte, f: Fichiers, chemin: string): Promise<boolean> {
  const nom = nomPhoto(chemin);
  const chiffre = await ctx.transport.lireFichier(cleFichierChiffre(ctx.cle, nom));
  const recu = chiffre ?? (await ctx.transport.lireFichier(nom));
  if (!recu) return false;
  await f.ecrire(chemin, dechiffrerFichier(ctx.cle, nom, recu, !chiffre));
  return true;
}

/** Version chiffrée envoyée si besoin, relue et déchiffrée à l'identique, puis copie en clair supprimée ; false sinon. */
async function chiffrerPhotoEnvoyee(ctx: Contexte, f: Fichiers, chemin: string): Promise<boolean> {
  const nom = nomPhoto(chemin);
  const cle = cleFichierChiffre(ctx.cle, nom);
  const clair = await f.lire(chemin);
  let relu = await ctx.transport.lireFichier(cle);
  if (!relu) {
    await ctx.transport.envoyerFichier(cle, chiffrerFichier(ctx.cle, nom, clair));
    relu = await ctx.transport.lireFichier(cle);
  }
  if (!relu || !egaux(dechiffrerFichier(ctx.cle, nom, relu), clair)) return false;
  await ctx.transport.supprimerFichier(nom);
  return true;
}

/**
 * Photos : envoi (chiffré) de celles qui n'ont pas de clé distante, téléchargement de celles qui manquent sur ce téléphone,
 * puis migration de celles qui ont pu partir en clair.
 */
async function photos(ctx: Contexte, bilan: Bilan): Promise<void> {
  await effacerFichiers(ctx);
  const f = ctx.fichiers;
  if (!f) return;
  // Photo de séance, puis photo de plat (migration 46 : envoyée chiffrée de même, repérée par photo_distante), puis photo
  // d'exercice (migration 70, de même).
  const seances = await ctx.db.getAllAsync<{ id: string; chemin_local: string; chemin_vignette: string; cle_distante: string | null }>(
    "SELECT id, chemin_local, chemin_vignette, cle_distante FROM seance_photo",
    [],
  );
  const plats = await ctx.db.getAllAsync<{ id: string; chemin_local: string; chemin_vignette: string; cle_distante: string | null }>(
    "SELECT id, photo AS chemin_local, photo_vignette AS chemin_vignette, photo_distante AS cle_distante FROM plats WHERE photo IS NOT NULL AND photo_vignette IS NOT NULL",
    [],
  );
  const exercices = await ctx.db.getAllAsync<{ id: string; chemin_local: string; chemin_vignette: string; cle_distante: string | null }>(
    "SELECT id, photo AS chemin_local, photo_vignette AS chemin_vignette, photo_distante AS cle_distante FROM exercices WHERE photo IS NOT NULL AND photo_vignette IS NOT NULL",
    [],
  );
  const l = [
    ...seances.map((p) => ({ ...p, table: "seance_photo" as const })),
    ...plats.map((p) => ({ ...p, table: "plats" as const })),
    ...exercices.map((p) => ({ ...p, table: "exercices" as const })),
  ];
  const repere = (id: string) => `photo_chiffree:${id}`;
  for (const p of l) {
    const chemins = [p.chemin_local, p.chemin_vignette];
    if (!p.cle_distante) {
      if (!chemins.every((c) => f.existe(c))) continue;
      for (const c of chemins) await envoyerPhoto(ctx, f, c);
      const quand = (ctx.maintenant ?? Date.now)();
      if (p.table === "plats") await ctx.db.runAsync("UPDATE plats SET photo_distante = ?, modifie_le = ? WHERE id = ?", [nomPhoto(p.chemin_local), quand, p.id]);
      else if (p.table === "exercices") await ctx.db.runAsync("UPDATE exercices SET photo_distante = ?, maj_le = ? WHERE id = ?", [nomPhoto(p.chemin_local), quand, p.id]);
      else await ctx.db.runAsync("UPDATE seance_photo SET cle_distante = ?, maj_le = ? WHERE id = ?", [p.id, quand, p.id]);
      await ecrireEtat(ctx.db, repere(p.id), "1");
      bilan.photosEnvoyees++;
      continue;
    }
    let recue = false;
    for (const c of chemins) {
      if (f.existe(c)) continue;
      try {
        if (await recevoirPhoto(ctx, f, c)) recue = true;
      } catch (e) {
        // Illisible (abîmée, ou pas de ce compte) : les autres photos passent quand même.
        console.warn("photo non déchiffrée", e);
      }
    }
    if (recue) bilan.photosRecues++;
    if (!chemins.every((c) => f.existe(c)) || (await lireEtat(ctx.db, repere(p.id))) === "1") continue;
    let ok = true;
    for (const c of chemins) {
      try {
        ok = (await chiffrerPhotoEnvoyee(ctx, f, c)) && ok;
      } catch (e) {
        // Réessayée à la prochaine synchro ; la copie en clair reste tant que la chiffrée n'est pas relue.
        console.warn("photo non migrée", e);
        ok = false;
      }
    }
    if (ok) {
      await ecrireEtat(ctx.db, repere(p.id), "1");
      bilan.photosMigrees++;
    }
  }
}

/**
 * Une synchro complète. Au premier passage d'un téléphone, le journal local est vidé et tout est tiré d'abord : ce que le
 * serveur a déjà gagne (le catalogue d'origine ne réécrase pas les notes d'un autre téléphone), puis on envoie le reste.
 */
export async function synchroniser(ctx: Contexte): Promise<Bilan> {
  const { db } = ctx;
  const maintenant = ctx.maintenant ?? Date.now;
  const horloge = new Horloge(ctx.noeud, await lireEtat(db, "hlc"));
  const bilan: Bilan = { recus: 0, appliques: 0, envoyes: 0, photosEnvoyees: 0, photosRecues: 0, photosMigrees: 0 };
  const premier = await premierPour(db, ctx.compte);
  if (premier) {
    // Les données déjà là ne sont mêlées au compte qu'après une réponse (2e) ; « effacer » les retire avant de tirer.
    const choix = (await lireEtat(db, "donnees_ici")) as ChoixDonnees | null;
    if (!choix && ctx.compte) {
      const ici = await choixDonneesIci(db, ctx.compte);
      if (ici) throw new ChoixRequis(ici);
    }
    if (choix === "effacer")
      await transaction(db, async (db) => {
        await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
        for (const t of [...TABLES_PERSONNELLES].reverse()) await db.runAsync(`DELETE FROM ${t}`, []);
        await db.runAsync("DELETE FROM sync_silence", []);
      });
    await db.runAsync("DELETE FROM sync_journal", []);
    await ecrireEtat(db, "curseur", null);
    // État d'un autre compte : oublié (les versions vues, les lignes en attente et les alias étaient les siens).
    const proprio = await lireEtat(db, "compte");
    if (ctx.compte && proprio !== null && proprio !== ctx.compte) {
      await db.execAsync("DELETE FROM sync_version; DELETE FROM sync_attente; DELETE FROM sync_alias;");
      await ecrireEtat(db, "initial", null);
    }
  }
  if (ctx.compte) await ecrireEtat(db, "compte", ctx.compte);
  const exercices = new Set<string>();
  const tables = new Set<string>();
  await tirer(ctx, horloge, bilan, exercices, tables);
  // Un exercice perso relié au catalogue sur un autre appareil : son picto et sa 3D valent ici aussi.
  if (tables.has("exercices")) await chargerLiens(db);
  if (premier) {
    await marquerTout(db, maintenant());
    await ecrireEtat(db, "initial", "1");
    await ecrireEtat(db, "donnees_ici", null);
  }
  await pousser(ctx, horloge, bilan);
  await photos(ctx, bilan);
  if (bilan.photosEnvoyees) await pousser(ctx, horloge, bilan);
  await ecrireEtat(db, "hlc", horloge.etat());
  if (exercices.size || tables.has("seances") || tables.has("pesee")) {
    // Records et volumes ne voyagent pas : on les recalcule ici, sans les noter au journal (chaque téléphone les recalcule).
    // Une transaction par exercice (audit M14) : journal coupé dans chacune, et une écriture de l'écran passe entre deux.
    const silence = (f: (db: Executeur) => Promise<void>) =>
      transaction(db, async (db) => {
        await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
        await f(db);
        await db.runAsync("DELETE FROM sync_silence", []);
      });
    const aRecalculer = new Set([...(tables.has("pesee") ? await exercicesAuPoidsDuCorps(db) : []), ...exercices]);
    for (const e of aRecalculer) await silence((db) => recalculerExercice(db, e));
    await silence((db) => recalculerToutesSeances(db));
  }
  return bilan;
}

/** Oublie l'état de synchro (déconnexion, compte supprimé) : le prochain compte repartira d'un premier envoi complet. */
export async function oublierSynchro(db: Executeur): Promise<void> {
  await db.execAsync(
    "DELETE FROM sync_etat; DELETE FROM sync_version; DELETE FROM sync_journal; DELETE FROM sync_attente; DELETE FROM sync_alias; DELETE FROM sync_coach_cles; DELETE FROM sync_coach_partages; DELETE FROM sync_coach_lignes;",
  );
}
