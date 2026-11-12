import { transaction } from "../db/exclusif";
import sodium from "react-native-libsodium";
import type { Executeur } from "../db/executeur";
import { PREFIXE_CACHE } from "../db/depots/reglages";
import { recalculerTout } from "../db/depots/recalcul";
import { aleatoire, b64, deB64, envelopperCleArchive, ouvrirCleArchive } from "../sync/chiffrement";
import { reparerOrphelins, type Fichiers } from "../sync/moteur";

// Sauvegarde dans un fichier (planches/idees-etudes/SAUVEGARDE.md) : toute la base (hors état de synchro) et les photos de
// séance, en un fichier `.pepfit` (`.fonte` avant le renommage : le sélecteur lit tout). Chiffré par défaut : une clé d'archive aléatoire, enveloppée par la phrase de secours.
//
// Fichier : « FONTE », version (1 octet), longueur de l'en-tête (u32), en-tête JSON en clair (date, nombre de séances : de
// quoi montrer un aperçu avant la phrase), puis des blocs : fin (1 octet), longueur (u32), contenu. Chiffré, chaque bloc est
// un XChaCha20-Poly1305 de 64 Kio au plus (react-native-libsodium n'a pas secretstream en natif) : nonce = préfixe + rang,
// données associées = empreinte de l'en-tête, rang et fin. Un bloc retiré, déplacé ou une fin coupée ne s'ouvre pas.
// Le contenu clair est une suite d'entrées : nom (u16 + UTF-8), données (u32 + octets) ; un nom vide clôt l'archive.

// identifiant de protocole figé : ne pas renommer (les sauvegardes faites par Fonte doivent se restaurer dans pepfit)
const MAGIE = [0x46, 0x4f, 0x4e, 0x54, 0x45]; // « FONTE »
const VERSION = 1;
const BLOC = 64 * 1024;
const TAG = 16;
const NONCE = 24;
const PREFIXE = 16;

/** Réglages propres à ce téléphone (dossier choisi, état des sauvegardes) : ni écrasés ni repris par une restauration. */
export const PREFIXE_REGLAGES_LOCAUX = "sauvegarde_";

export interface Entete {
  v: 1;
  cree_le: number;
  /** PRAGMA user_version de la base sauvegardée. */
  schema: number;
  seances: number;
  photos: number;
  chiffre: boolean;
  /** Clé d'archive enveloppée par la phrase (chiffré seulement). */
  cle?: string;
  /** Préfixe des nonces (chiffré seulement). */
  nonce?: string;
}

export type Raison = "format" | "phrase" | "tronque" | "version";

export class ErreurSauvegarde extends Error {
  readonly raison: Raison;
  constructor(raison: Raison) {
    super(`sauvegarde : ${raison}`);
    this.raison = raison;
  }
}

/** Où écrire : fichier du dossier choisi, ou mémoire dans les tests. */
export interface Sortie {
  ecrire(o: Uint8Array): Promise<void>;
}

/** D'où lire : `lire(n)` rend au plus n octets, un tableau vide à la fin. */
export interface Entree {
  lire(n: number): Promise<Uint8Array>;
}

const enc = new TextEncoder();
const utf8 = (s: string) => enc.encode(s);

const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const lireU32 = (o: Uint8Array, a = 0) => ((o[a]! << 24) >>> 0) + (o[a + 1]! << 16) + (o[a + 2]! << 8) + o[a + 3]!;

function joindre(...l: Uint8Array[]): Uint8Array {
  const r = new Uint8Array(l.reduce((s, x) => s + x.length, 0));
  let k = 0;
  for (const x of l) (r.set(x, k), (k += x.length));
  return r;
}

const empreinte = (entete: Uint8Array) => sodium.to_hex(sodium.crypto_generichash(16, entete, null));

function nonceBloc(prefixe: Uint8Array, rang: number): Uint8Array {
  const n = new Uint8Array(NONCE);
  n.set(prefixe);
  for (let i = 0, r = rang; i < 8; i++, r = Math.floor(r / 256)) n[NONCE - 1 - i] = r % 256;
  return n;
}

// identifiant de protocole figé : ne pas renommer
const adBloc = (e: string, rang: number, fin: boolean) => `fonte:archive:bloc:${e}:${rang}:${fin ? 1 : 0}`;

interface Chiffre {
  cle: Uint8Array;
  prefixe: Uint8Array;
  empreinte: string;
}

/** Découpe le contenu clair en blocs, chiffrés s'il y a une clé. */
class Ecrivain {
  private tampon = new Uint8Array(BLOC);
  private n = 0;
  private rang = 0;
  octets = 0;
  private sortie: Sortie;
  private chiffre: Chiffre | null;

  constructor(sortie: Sortie, chiffre: Chiffre | null) {
    this.sortie = sortie;
    this.chiffre = chiffre;
  }

  async ajouter(o: Uint8Array): Promise<void> {
    for (let k = 0; k < o.length; ) {
      const m = Math.min(BLOC - this.n, o.length - k);
      this.tampon.set(o.subarray(k, k + m), this.n);
      this.n += m;
      k += m;
      if (this.n === BLOC) await this.vider(false);
    }
  }

  async entree(nom: string, donnees: Uint8Array): Promise<void> {
    const n = utf8(nom);
    await this.ajouter(joindre(new Uint8Array([n.length >> 8, n.length & 255]), n, u32(donnees.length)));
    await this.ajouter(donnees);
  }

  async clore(): Promise<void> {
    await this.ajouter(new Uint8Array([0, 0]));
    await this.vider(true);
  }

  private async vider(fin: boolean): Promise<void> {
    const clair = this.tampon.slice(0, this.n);
    const c = this.chiffre;
    const bloc = c
      ? sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(clair, adBloc(c.empreinte, this.rang, fin), null, nonceBloc(c.prefixe, this.rang), c.cle)
      : clair;
    const tout = joindre(new Uint8Array([fin ? 1 : 0]), u32(bloc.length), bloc);
    await this.sortie.ecrire(tout);
    this.octets += tout.length;
    this.n = 0;
    this.rang++;
  }
}

/** Lecture exacte de n octets ; ErreurSauvegarde « tronque » si le fichier finit avant. */
class Octets {
  private reste: Uint8Array = new Uint8Array(0);
  private entree: Entree;
  constructor(entree: Entree) {
    this.entree = entree;
  }

  async lire(n: number, finPermise = false): Promise<Uint8Array | null> {
    const morceaux = [this.reste];
    let total = this.reste.length;
    while (total < n) {
      const o = await this.entree.lire(Math.max(n - total, BLOC));
      if (!o.length) {
        if (finPermise && total === 0) return null;
        throw new ErreurSauvegarde("tronque");
      }
      morceaux.push(o);
      total += o.length;
    }
    const tout = morceaux.length === 1 ? this.reste : joindre(...morceaux);
    this.reste = tout.subarray(n);
    return tout.subarray(0, n);
  }
}

async function lireEnteteBrut(o: Octets): Promise<{ entete: Entete; brut: Uint8Array }> {
  const debut = await o.lire(MAGIE.length + 5).catch(() => {
    throw new ErreurSauvegarde("format");
  });
  if (!debut || !MAGIE.every((x, i) => debut[i] === x)) throw new ErreurSauvegarde("format");
  if (debut[MAGIE.length] !== VERSION) throw new ErreurSauvegarde("version");
  const n = lireU32(debut, MAGIE.length + 1);
  if (n > 1 << 20) throw new ErreurSauvegarde("format");
  const brut = (await o.lire(n))!;
  try {
    return { entete: JSON.parse(sodium.to_string(brut)) as Entete, brut };
  } catch {
    throw new ErreurSauvegarde("format");
  }
}

/** En-tête d'une sauvegarde, sans la phrase : pour l'aperçu. */
export async function lireEntete(entree: Entree): Promise<Entete> {
  return (await lireEnteteBrut(new Octets(entree))).entete;
}

/** Vrai si la phrase ouvre cette sauvegarde (toujours vrai pour une sauvegarde lisible). */
export function phraseOuvre(entete: Entete, phrase: string): boolean {
  if (!entete.chiffre) return true;
  try {
    ouvrirCleArchive(entete.cle!, phrase);
    return true;
  } catch {
    return false;
  }
}

/** Tables sauvegardées : toutes, sauf l'état de synchro (propre à ce téléphone et à son compte) et celles de SQLite. */
async function tablesDe(db: Executeur): Promise<string[]> {
  const l = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE 'sync\\_%' ESCAPE '\\' ORDER BY name",
    [],
  );
  return l.map((x) => x.name);
}

async function photosDe(db: Executeur, fichiers: Fichiers): Promise<string[]> {
  const l = await db.getAllAsync<{ chemin_local: string; chemin_vignette: string }>("SELECT chemin_local, chemin_vignette FROM seance_photo ORDER BY id", []);
  // Photos des plats (migration 46) : même dossier, mêmes règles.
  const plats = await db.getAllAsync<{ photo: string; photo_vignette: string }>("SELECT photo, photo_vignette FROM plats WHERE photo IS NOT NULL ORDER BY id", []);
  // Photos des exercices (migration 70) : de même.
  const exercices = await db.getAllAsync<{ photo: string; photo_vignette: string }>("SELECT photo, photo_vignette FROM exercices WHERE photo IS NOT NULL ORDER BY id", []);
  return [...new Set([...l.flatMap((x) => [x.chemin_local, x.chemin_vignette]), ...[...plats, ...exercices].flatMap((x) => [x.photo, x.photo_vignette])])].filter((c) => fichiers.existe(c));
}

export interface Bilan {
  seances: number;
  photos: number;
  octets: number;
}

/** Écrit une sauvegarde complète. `phrase` : chiffrée par elle ; null : lisible. */
export async function sauvegarder(db: Executeur, fichiers: Fichiers, sortie: Sortie, phrase: string | null, maintenant = Date.now()): Promise<Bilan> {
  const tables = await tablesDe(db);
  const photos = await photosDe(db, fichiers);
  const seances = (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances WHERE fin IS NOT NULL", []))?.n ?? 0;
  const schema = (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []))?.user_version ?? 0;
  const entete: Entete = { v: 1, cree_le: maintenant, schema, seances, photos: photos.length, chiffre: !!phrase };
  let cle: Uint8Array | null = null;
  let prefixe: Uint8Array | null = null;
  if (phrase) {
    cle = aleatoire(32);
    prefixe = aleatoire(PREFIXE);
    entete.cle = envelopperCleArchive(phrase, cle);
    entete.nonce = b64(prefixe);
  }
  const brut = utf8(JSON.stringify(entete));
  await sortie.ecrire(joindre(new Uint8Array([...MAGIE, VERSION]), u32(brut.length), brut));
  const e = new Ecrivain(sortie, cle && prefixe ? { cle, prefixe, empreinte: empreinte(brut) } : null);
  // les calculs gardés (PREFIXE_CACHE) se refont sur le téléphone : pas dans la sauvegarde
  for (const t of tables)
    await e.entree(`table/${t}`, utf8(JSON.stringify(await db.getAllAsync(`SELECT * FROM "${t}"${t === "reglages" ? " WHERE cle NOT LIKE ?" : ""}`, t === "reglages" ? [`${PREFIXE_CACHE}%`] : []))));
  for (const p of photos) await e.entree(`fichier/${p}`, await fichiers.lire(p));
  await e.clore();
  return { seances, photos: photos.length, octets: MAGIE.length + 5 + brut.length + e.octets };
}

/** Relit les blocs et rend le contenu clair, entrée par entrée. */
class Lecteur {
  private bloc: Uint8Array = new Uint8Array(0);
  private pos = 0;
  private rang = 0;
  private fini = false;
  private o: Octets;
  private chiffre: Chiffre | null;

  constructor(o: Octets, chiffre: Chiffre | null) {
    this.o = o;
    this.chiffre = chiffre;
  }

  private async suivant(): Promise<void> {
    if (this.fini) throw new ErreurSauvegarde("tronque");
    const t = (await this.o.lire(5))!;
    const fin = t[0] === 1;
    const n = lireU32(t, 1);
    if (n > BLOC + TAG) throw new ErreurSauvegarde("format");
    const brut = (await this.o.lire(n))!;
    const c = this.chiffre;
    if (c) {
      try {
        this.bloc = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, brut, adBloc(c.empreinte, this.rang, fin), nonceBloc(c.prefixe, this.rang), c.cle);
      } catch {
        throw new ErreurSauvegarde("format");
      }
    } else this.bloc = brut.slice();
    this.pos = 0;
    this.rang++;
    this.fini = fin;
  }

  async lire(n: number): Promise<Uint8Array> {
    const r = new Uint8Array(n);
    for (let k = 0; k < n; ) {
      if (this.pos === this.bloc.length) await this.suivant();
      const m = Math.min(n - k, this.bloc.length - this.pos);
      r.set(this.bloc.subarray(this.pos, this.pos + m), k);
      this.pos += m;
      k += m;
    }
    return r;
  }

  /** Après le nom vide : tout a été lu, le dernier bloc était le bloc final et rien ne suit. */
  async verifierFin(): Promise<void> {
    if (!this.fini || this.pos !== this.bloc.length) throw new ErreurSauvegarde("format");
    if (await this.o.lire(1, true)) throw new ErreurSauvegarde("format");
  }
}

export interface Contenu {
  entete: Entete;
  tables: Map<string, Record<string, unknown>[]>;
  /** Chemins des fichiers écrits (photos). */
  fichiers: string[];
}

const CHEMIN_SUR = /^photos\/[\w.-]+$/;

/**
 * Lit une sauvegarde entière : tables en mémoire, photos écrites au fil de l'eau (des fichiers de plus sans la base ne gênent
 * pas : le ménage des photos les retire). Lève ErreurSauvegarde : « phrase » si aucune phrase ne l'ouvre, « tronque »,
 * « format », « version » (base plus récente que l'appli).
 */
export async function lireSauvegarde(entree: Entree, phrases: readonly string[], fichiers: Fichiers, schemaLocal: number): Promise<Contenu> {
  const o = new Octets(entree);
  const { entete, brut } = await lireEnteteBrut(o);
  if (entete.schema > schemaLocal) throw new ErreurSauvegarde("version");
  let chiffre: Chiffre | null = null;
  if (entete.chiffre) {
    if (!entete.cle || !entete.nonce) throw new ErreurSauvegarde("format");
    let cle: Uint8Array | null = null;
    for (const p of phrases) {
      try {
        cle = ouvrirCleArchive(entete.cle, p);
        break;
      } catch {
        // phrase suivante
      }
    }
    if (!cle) throw new ErreurSauvegarde("phrase");
    chiffre = { cle, prefixe: deB64(entete.nonce), empreinte: empreinte(brut) };
  }
  const l = new Lecteur(o, chiffre);
  const tables = new Map<string, Record<string, unknown>[]>();
  const ecrits: string[] = [];
  for (;;) {
    const t = await l.lire(2);
    const nn = (t[0]! << 8) + t[1]!;
    if (!nn) break;
    const nom = sodium.to_string(await l.lire(nn));
    const donnees = await l.lire(lireU32(await l.lire(4)));
    if (nom.startsWith("table/")) {
      tables.set(nom.slice(6), JSON.parse(sodium.to_string(donnees)) as Record<string, unknown>[]);
    } else if (nom.startsWith("fichier/") && CHEMIN_SUR.test(nom.slice(8))) {
      await fichiers.ecrire(nom.slice(8), donnees);
      ecrits.push(nom.slice(8));
    }
  }
  await l.verifierFin();
  return { entete, tables, fichiers: ecrits };
}

export type Mode = "remplacer" | "fusionner";

/**
 * Applique le contenu lu, en une transaction. Remplacer : chaque table de la sauvegarde remplace la locale (réglages de ce
 * téléphone gardés), sans journal ; l'état de synchro est oublié, un compte repart d'un premier échange complet (ce que le
 * serveur a gagne, le reste part). Fusionner : seules les lignes absentes sont ajoutées (journalisées, elles partiront à la
 * synchro) ; les records sont recalculés.
 */
export async function appliquerSauvegarde(db: Executeur, c: Contenu, mode: Mode): Promise<void> {
  const locales = new Set(await tablesDe(db));
  const remplacer = mode === "remplacer";
  await transaction(db, async (db) => {
    await db.execAsync("PRAGMA defer_foreign_keys = ON");
    const tables = [...c.tables].filter(([t]) => locales.has(t) && (remplacer || t !== "records"));
    if (remplacer) {
      await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
      // Tout effacer avant de rien remettre : une suppression en cascade viderait une table déjà remise.
      for (const [t] of tables) {
        const reglages = t === "reglages";
        await db.runAsync(`DELETE FROM "${t}"${reglages ? " WHERE cle NOT LIKE ?" : ""}`, reglages ? [`${PREFIXE_REGLAGES_LOCAUX}%`] : []);
      }
    }
    for (const [t, lignes] of tables) {
      const connues = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${t}")`, [])).map((x) => x.name));
      const reglages = t === "reglages";
      for (const ligne of lignes) {
        // les calculs gardés d'une sauvegarde d'avant (PREFIXE_CACHE) ne sont pas repris : ils se refont sur ces données
        if (reglages && (String(ligne.cle).startsWith(PREFIXE_REGLAGES_LOCAUX) || String(ligne.cle).startsWith(PREFIXE_CACHE))) continue;
        const cols = Object.keys(ligne).filter((k) => connues.has(k));
        await db.runAsync(
          `INSERT INTO "${t}" (${cols.map((k) => `"${k}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})${remplacer ? "" : " ON CONFLICT DO NOTHING"}`,
          cols.map((k) => (ligne[k] ?? null) as string | number | null),
        );
      }
    }
    await reparerOrphelins(db);
    if (remplacer) await db.execAsync("DELETE FROM sync_silence; DELETE FROM sync_etat; DELETE FROM sync_version; DELETE FROM sync_journal; DELETE FROM sync_attente; DELETE FROM sync_alias;");
  });
  if (!remplacer) {
    // Records et volumes ne voyagent pas : recalculés ici, hors journal.
    await db.runAsync("INSERT OR IGNORE INTO sync_silence (un) VALUES (1)", []);
    try {
      await recalculerTout(db);
    } finally {
      await db.runAsync("DELETE FROM sync_silence", []);
    }
  }
}
