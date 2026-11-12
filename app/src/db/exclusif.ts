import type { Executeur } from "./executeur";

// expo-sqlite ne réserve pas la connexion pendant withTransactionAsync : une autre tâche (synchro du compte au retour au premier
// plan, synchro Whoop, écran) écrit dans la transaction ouverte, et son propre BEGIN, refusé, passe par un ROLLBACK qui annule
// la transaction de l'autre. Réimport Hevy du 30/10 : la synchro repartie au retour du sélecteur de fichiers a annulé la
// transaction de l'import ; la suite, écrite hors transaction, visait des séances et des exercices effacés (« FOREIGN KEY
// constraint failed »). Toute écriture pouvait se perdre ainsi (fin de séance, repas, suppression).
//
// Toute transaction passe donc par transaction(db, (db) => …) : une file unique, jamais deux BEGIN sur la connexion. La tâche
// reçoit l'exécuteur de sa transaction (le `db` du rappel masque celui du dehors) ; pendant qu'elle tourne, les écritures du
// dehors attendent sa fin (elles ne s'y glissent plus), les lectures passent. Une transaction dans une transaction en fait
// partie. withExclusiveTransactionAsync d'expo-sqlite n'est pas retenu : il ouvre une autre connexion (sans foreign_keys,
// le PRAGMA ne s'applique pas dans une transaction ouverte, donc sans cascades) et toutes les tâches écrivent par `db`.

/** Un appel attend la file depuis trop longtemps (20 s) : il échoue au lieu de bloquer l'appli. */
export class ErreurAttenteBase extends Error {
  override name = "ErreurAttenteBase";
  readonly appel: string;
  constructor(appel: string, ms: number) {
    super(`attente de la base trop longue (${Math.round(ms / 1000)} s) : ${appel}`);
    this.appel = appel;
  }
}

/** Appel à la façade depuis une transaction de cette façade : il attendrait sa propre fin (détecté en test). */
export class ErreurAppelDansTransaction extends Error {
  override name = "ErreurAppelDansTransaction";
  readonly appel: string;
  constructor(appel: string) {
    super(`appel à la façade depuis l'intérieur d'une transaction : passer par le db reçu par la tâche (${appel})`);
    this.appel = appel;
  }
}

/** Contexte asynchrone (AsyncLocalStorage de Node, en test) : dit si un appel vient d'une transaction de la façade. */
export interface ContexteAsynchrone {
  run<R>(store: unknown, f: () => R): R;
  getStore(): unknown;
}

export interface OptionsFacade {
  /** Attente maximale d'un appel dans la file ; 20 s par défaut. */
  attenteMs?: number;
  /** En test seulement (Hermes n'a pas de contexte asynchrone) : un appel à la façade fait dans une transaction échoue. */
  contexte?: ContexteAsynchrone;
}

interface Etat {
  brute: Executeur;
  /** Fin de la dernière transaction demandée : elles passent l'une après l'autre. */
  file: Promise<void>;
  /** Fin de la transaction en cours (ou qui attend les écritures en vol) ; null s'il n'y en a pas. */
  ouverte: Promise<void> | null;
  /** Écritures du dehors en cours d'exécution, et qui attend qu'il n'y en ait plus. */
  enVol: number;
  vides: (() => void)[];
  attenteMs: number;
  contexte: ContexteAsynchrone | undefined;
}

const facades = new WeakMap<object, Etat>();

/**
 * Transactions longues et attentes (audit M14, docs/PERF-D.md) : toute transaction de plus de `transactionMs` et toute
 * attente de la file de plus de `attenteMs` est journalisée (« [base] lente … », lu dans logcat comme les lignes [perf]).
 * Une écriture de l'écran ne doit jamais attendre derrière une longue transaction : les longs travaux se découpent.
 */
export const seuilsBase = {
  transactionMs: 500,
  attenteMs: 200,
  journal: (m: string) => console.warn(m),
};

/** Écritures et transactions finies depuis le lancement (toutes façades) : un écran lu après la dernière n'a pas à se relire
 * (useCharge, M12 : docs/PERF-A.md). */
let ecritures = 0;
export const compteurEcritures = (): number => ecritures;
/** Exécuteurs remis aux tâches : une transaction demandée par l'un d'eux est déjà ouverte. */
const executeursDeTransaction = new WeakSet<object>();
const ECRITURES = new Set<PropertyKey>(["execAsync", "runAsync"]);
const LECTURES = new Set<PropertyKey>(["getFirstAsync", "getAllAsync"]);

/** L'appel, sans donnée : la méthode et le début du SQL (« runAsync INSERT INTO reglages ») ; les valeurs sont à part. */
const decrire = (nom: PropertyKey, a: readonly unknown[]) =>
  [String(nom), ...(typeof a[0] === "string" ? a[0].trim().split(/\s+/).slice(0, 3) : [])].join(" ");

/** `p`, ou ErreurAttenteBase à `limite` (heure, ms) ; l'appel en attente est journalisé. */
function avantLimite(e: Etat, p: Promise<void>, limite: number, appel: string): Promise<void> {
  return new Promise((ok, ko) => {
    const minuteur = setTimeout(() => {
      console.warn(`[base] attente de la base trop longue : ${appel}`);
      ko(new ErreurAttenteBase(appel, e.attenteMs));
    }, Math.max(0, limite - Date.now()));
    void p.then(() => {
      clearTimeout(minuteur);
      ok();
    });
  });
}

function verifierHors(e: Etat, appel: string): void {
  if (e.contexte && e.contexte.getStore() === e) throw new ErreurAppelDansTransaction(appel);
}

/** La façade de `db` (même type), à passer à toute l'appli : écritures en file derrière les transactions, lectures libres. */
export function avecExclusivite<T extends Executeur>(db: T, o: OptionsFacade = {}): T {
  const e: Etat = { brute: db, file: Promise.resolve(), ouverte: null, enVol: 0, vides: [], attenteMs: o.attenteMs ?? 20_000, contexte: o.contexte };
  const facade = new Proxy(db, {
    get(cible, nom) {
      if (nom === "withTransactionAsync") {
        return async () => {
          throw new Error("transaction hors de la file : passer par transaction(db, (db) => …) (db/exclusif.ts)");
        };
      }
      const v: unknown = Reflect.get(cible, nom, cible);
      if (typeof v !== "function") return v;
      if (LECTURES.has(nom) || !ECRITURES.has(nom)) {
        if (!e.contexte || !LECTURES.has(nom)) return v.bind(cible);
        return (...a: unknown[]) => {
          verifierHors(e, decrire(nom, a));
          return v.apply(cible, a);
        };
      }
      return async (...a: unknown[]) => {
        const appel = decrire(nom, a);
        verifierHors(e, appel);
        const debut = Date.now();
        const limite = debut + e.attenteMs;
        // le test et le compte dans le même tour : une transaction ne peut pas s'ouvrir entre les deux
        while (e.ouverte) await avantLimite(e, e.ouverte, limite, appel);
        const attente = Date.now() - debut;
        if (attente > seuilsBase.attenteMs) seuilsBase.journal(`[base] lente : ${appel} a attendu ${attente} ms`);
        e.enVol++;
        try {
          return await v.apply(cible, a);
        } finally {
          ecritures++;
          if (--e.enVol === 0) e.vides.splice(0).forEach((f) => f());
        }
      };
    },
  });
  facades.set(facade, e);
  return facade;
}

/**
 * L'exécuteur d'une transaction : la connexion directe tant qu'elle est ouverte, puis `apres` (une promesse oubliée par la
 * tâche n'écrit plus hors de la file). Une transaction demandée dedans s'exécute dedans.
 */
function executeurDeTransaction(brute: Executeur, apres: Executeur): { x: Executeur; fermer: () => void; premiere: () => string } {
  let ouverte = true;
  // Première écriture de la transaction (méthode et début du SQL, sans valeur) : de quoi reconnaître une transaction lente.
  let premiere = "";
  const via = () => (ouverte ? brute : apres);
  const noter = (nom: string, sql: string) => void (premiere ||= decrire(nom, [sql]));
  const x: Executeur = {
    execAsync: (sql) => (noter("execAsync", sql), via().execAsync(sql)),
    runAsync: (sql, p) => (noter("runAsync", sql), via().runAsync(sql, p)),
    getFirstAsync: (sql, p) => via().getFirstAsync(sql, p),
    getAllAsync: (sql, p) => via().getAllAsync(sql, p),
    withTransactionAsync: (tache) => (ouverte ? tache() : transaction(apres, () => tache())),
  };
  executeursDeTransaction.add(x);
  return { x, fermer: () => void (ouverte = false), premiere: () => premiere };
}

/**
 * Exécute `tache` dans une transaction, à son tour : tout ou rien, sans autre BEGIN ni écriture du dehors au milieu. `tache`
 * reçoit l'exécuteur de la transaction et ne doit passer que par lui (`transaction(db, async (db) => …)`). Ne jamais attendre
 * dedans une écriture faite par la façade ou une autre transaction : elle attendrait la fin de celle-ci (ErreurAttenteBase
 * au bout de 20 s ; ErreurAppelDansTransaction tout de suite en test).
 */
export async function transaction<R>(db: Executeur, tache: (db: Executeur) => Promise<R>): Promise<R> {
  if (executeursDeTransaction.has(db)) return tache(db);
  const e = facades.get(db);
  let r!: R;
  if (!e) {
    // connexion sans façade (ouverture de la base, tests) : personne d'autre ne s'en sert
    const tx = executeurDeTransaction(db, db);
    try {
      await db.withTransactionAsync(async () => void (r = await tache(tx.x)));
    } finally {
      tx.fermer();
      ecritures++;
    }
    return r;
  }
  verifierHors(e, "transaction");
  const demande = Date.now();
  const limite = demande + e.attenteMs;
  let liberer!: () => void;
  const fin = new Promise<void>((f) => (liberer = f));
  const avant = e.file;
  e.file = avant.then(() => fin);
  try {
    await avantLimite(e, avant, limite, "transaction");
  } catch (err) {
    // abandonnée : les suivantes passent quand même après celle qui bloque
    liberer();
    throw err;
  }
  e.ouverte = fin;
  const tx = executeurDeTransaction(e.brute, db);
  const ouvrir = () => e.brute.withTransactionAsync(async () => void (r = await tache(tx.x)));
  let ouverteA = 0;
  try {
    while (e.enVol > 0) await avantLimite(e, new Promise<void>((f) => e.vides.push(f)), limite, "transaction");
    ouverteA = Date.now();
    await (e.contexte ? e.contexte.run(e, ouvrir) : ouvrir());
  } finally {
    tx.fermer();
    ecritures++;
    e.ouverte = null;
    liberer();
    const fin = Date.now();
    const attente = (ouverteA || fin) - demande;
    const duree = ouverteA ? fin - ouverteA : 0;
    if (duree > seuilsBase.transactionMs || attente > seuilsBase.attenteMs) {
      seuilsBase.journal(`[base] lente : transaction ${duree} ms, attente ${attente} ms${tx.premiere() ? ` (${tx.premiere()})` : ""}`);
    }
  }
  return r;
}
