// Transactions en file unique (db/exclusif.ts) : jamais deux BEGIN sur la connexion, écritures du dehors après la transaction
// ouverte, lectures libres ; garde-fou contre withTransactionAsync en direct ; synchro pendant la fin d'une séance et
// pendant l'ajout d'un repas, dans les deux sens. Données inventées.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { consommationsDuJour, ajoutRapide } from "../src/db/depots/nutrition.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance } from "../src/db/depots/seances.ts";
import { ErreurAppelDansTransaction, ErreurAttenteBase, transaction } from "../src/db/exclusif.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { terminer } from "../src/ecrans/donnees.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { baseDeTest, facade, horsTransaction } from "./aide.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Appels qui ouvrent une transaction sans passer par la file. */
const DIRECT = /\.\s*with(Exclusive)?TransactionAsync\s*\(|\b(exec|run)(Async|Sync)\s*\(\s*["'`]\s*(BEGIN|SAVEPOINT)\b/;

test("garde-fou : aucune transaction ouverte en direct dans l'appli, tout passe par transaction(db, …) (db/exclusif.ts)", () => {
  assert.ok(DIRECT.test("await db.withTransactionAsync(async () => {"));
  assert.ok(DIRECT.test("ctx.db.withExclusiveTransactionAsync((txn) =>"));
  assert.ok(DIRECT.test('await db.execAsync("BEGIN")'));
  assert.ok(!DIRECT.test("withTransactionAsync(tache: () => Promise<void>): Promise<void>;"));
  assert.ok(!DIRECT.test("CREATE TRIGGER x AFTER INSERT ON t BEGIN"));
  const fautifs = fichiers(SRC)
    .filter((f) => relative(SRC, f) !== join("db", "exclusif.ts"))
    .flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((l, i) => (DIRECT.test(l) ? [`src/${relative(SRC, f)}:${i + 1}`] : [])),
    );
  assert.deepEqual(fautifs, []);
});

/** Connexion qui compte les transactions ouvertes en même temps et prévient avant chaque écriture. */
function espion(db: Executeur, avant: (sql: string) => void = () => {}) {
  const compte = { ouvertes: 0, max: 0 };
  const x: Executeur = {
    ...db,
    execAsync: (sql) => (avant(sql), db.execAsync(sql)),
    runAsync: (sql, p) => (avant(sql), db.runAsync(sql, p)),
    withTransactionAsync: async (t) => {
      compte.max = Math.max(compte.max, ++compte.ouvertes);
      try {
        await db.withTransactionAsync(t);
      } finally {
        compte.ouvertes--;
      }
    },
  };
  return { x, compte };
}

const n = (raw: Awaited<ReturnType<typeof baseDeTest>>["raw"], sql: string, p: (string | number)[] = []) =>
  (raw.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...p) as { n: number }).n;

test("file unique : des transactions lancées ensemble passent une à une, toutes écrites", async () => {
  const { raw, brute } = await baseDeTest();
  const e = espion(brute);
  const db = facade(e.x);
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      transaction(db, async (db) => {
        await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, '1')", [`t${i}`]);
        await new Promise((r) => setTimeout(r, 1));
        await db.runAsync("UPDATE reglages SET valeur = '2' WHERE cle = ?", [`t${i}`]);
      }),
    ),
  );
  assert.equal(e.compte.max, 1);
  assert.equal(n(raw, "reglages WHERE cle LIKE 't%' AND valeur = '2'"), 8);
});

test("pendant une transaction : les lectures passent, une écriture du dehors attend sa fin et ne part pas avec son ROLLBACK", async () => {
  const { raw, db } = await baseDeTest();
  let lacher = () => {};
  const tenue = new Promise<void>((r) => (lacher = r));
  const t = transaction(db, async (db) => {
    await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('dedans', '1')", []);
    await tenue;
    throw new Error("échec voulu");
  });
  await new Promise((r) => setTimeout(r, 1));
  // la lecture n'attend pas la fin de la transaction
  assert.deepEqual({ ...(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM reglages WHERE cle = 'dedans'", [])) }, { n: 1 });
  let ecrite = false;
  const dehors = db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('dehors', '1')", []).then(() => (ecrite = true));
  await new Promise((r) => setTimeout(r, 1));
  assert.equal(ecrite, false, "l'écriture du dehors attend");
  lacher();
  await assert.rejects(t, /échec voulu/);
  await dehors;
  assert.equal(n(raw, "reglages WHERE cle = 'dedans'"), 0);
  assert.equal(n(raw, "reglages WHERE cle = 'dehors'"), 1, "elle n'a pas été annulée avec la transaction");
});

test("transaction dans une transaction : elle en fait partie (tout ou rien) ; withTransactionAsync de la façade refusé", async () => {
  const { raw, db } = await baseDeTest();
  await assert.rejects(
    transaction(db, async (db) => {
      await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('a', '1')", []);
      await transaction(db, async (db) => {
        await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('b', '1')", []);
      });
      throw new Error("non");
    }),
    /non/,
  );
  assert.equal(n(raw, "reglages WHERE cle IN ('a', 'b')"), 0);
  assert.equal(await transaction(db, async (db) => transaction(db, async () => 42)), 42);
  await assert.rejects(db.withTransactionAsync(async () => {}), /transaction\(db/);
});

test("attente trop longue : un appel bloqué derrière la file échoue (ErreurAttenteBase) et se journalise sans donnée", async (t) => {
  const avertir = t.mock.method(console, "warn", () => {});
  const { raw, brute } = await baseDeTest();
  const db = facade(brute, 50);
  let lacher = () => {};
  const tenue = new Promise<void>((r) => (lacher = r));
  const bloquante = transaction(db, async (db) => {
    await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('long', '1')", []);
    await tenue;
  });
  await new Promise((r) => setTimeout(r, 1));
  const debut = Date.now();
  await assert.rejects(db.runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, ?)", ["secret", "valeur-perso"]), (e: Error) => {
    assert.ok(e instanceof ErreurAttenteBase);
    assert.equal(e.name, "ErreurAttenteBase");
    assert.match(e.message, /attente de la base trop longue/);
    assert.equal(e.appel, "runAsync INSERT INTO reglages");
    return true;
  });
  assert.ok(Date.now() - debut < 1000);
  await assert.rejects(transaction(db, async () => {}), ErreurAttenteBase);
  const journal = avertir.mock.calls.map((c) => c.arguments.join(" "));
  assert.deepEqual(journal, ["[base] attente de la base trop longue : runAsync INSERT INTO reglages", "[base] attente de la base trop longue : transaction"]);
  assert.ok(!journal.join().includes("valeur-perso"));
  // la file repart : la transaction bloquante finit, les suivantes passent
  lacher();
  await bloquante;
  await transaction(db, async (db) => void (await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('apres', '1')", [])));
  assert.equal(n(raw, "reglages WHERE cle IN ('long', 'apres')"), 2);
  assert.equal(n(raw, "reglages WHERE cle = 'secret'"), 0);
});

test("en test : un appel à la façade depuis une de ses transactions échoue tout de suite (ErreurAppelDansTransaction)", async () => {
  const { raw, db } = await baseDeTest();
  for (const appel of [
    () => db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('dehors', '1')", []),
    () => db.getFirstAsync("SELECT 1 AS x", []),
    () => transaction(db, async () => {}),
  ]) {
    const debut = Date.now();
    await assert.rejects(
      transaction(db, async (tx) => {
        await tx.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('dedans', '1')", []);
        await appel();
      }),
      (e: Error) => e instanceof ErreurAppelDansTransaction && e.name === "ErreurAppelDansTransaction",
    );
    assert.ok(Date.now() - debut < 1000, "pas d'attente de 20 s");
  }
  assert.equal(n(raw, "reglages WHERE cle IN ('dedans', 'dehors')"), 0);
  // hors transaction, la façade marche, et l'exécuteur reçu aussi dans une transaction
  await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('ok', '1')", []);
  await transaction(db, async (tx) => void (await tx.getFirstAsync("SELECT 1 AS x", [])));
  assert.equal(n(raw, "reglages WHERE cle = 'ok'"), 1);
});

/** Serveur de synchro en mémoire (curseur = numéro d'ordre) ; `reseau` retarde la réponse à un envoi. */
class Serveur {
  lignes = new Map<string, Changement & { seq: number }>();
  seq = 0;
  reseau: () => Promise<void> = async () => {};
  transport(): Transport {
    return {
      pousser: async (lot) => {
        await this.reseau();
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur, limite): Promise<Lot> => {
        const tout = [...this.lignes.values()].filter((x) => x.seq > Number(curseur ?? 0)).sort((a, b) => a.seq - b.seq);
        const l = tout.slice(0, limite);
        return { changements: l.map(({ seq: _, ...c }) => c), curseur: l.length ? String(l[l.length - 1]!.seq) : curseur, encore: tout.length > limite };
      },
      envoyerFichier: async () => {},
      lireFichier: async () => null,
      supprimerFichier: async () => {},
    };
  }
}

/** Un téléphone : base avec la façade, synchro sur `serveur` ; `quand(sql)` est appelé avant chaque écriture. */
async function telephone(serveur: Serveur, cle: Uint8Array, noeud: string) {
  const { raw, brute } = await baseDeTest(true);
  let quand: (sql: string) => void = () => {};
  const e = espion(brute, (sql) => quand(sql));
  const db = facade(e.x);
  return {
    raw, db, compte: e.compte,
    sync: () => synchroniser({ db, transport: serveur.transport(), cle, noeud }),
    surEcriture: (f: (sql: string) => void) => void (quand = f),
  };
}

/** Promesse tenue à la première écriture qui contient `motif` (puis plus rien). */
function aLaPremiere(t: { surEcriture: (f: (sql: string) => void) => void }, motif: string, faire: () => void = () => {}): Promise<void> {
  return new Promise((r) => {
    let vu = false;
    t.surEcriture((sql) => {
      if (vu || !sql.includes(motif)) return;
      vu = true;
      faire();
      r();
    });
  });
}

async function seanceEnCours(db: Executeur) {
  const id = await demarrerSeance(db, null, "Push");
  for (const [kg, faite] of [[60, true], [70, true], [80, false]] as const) {
    const s = await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg, reps: 8 });
    if (faite) await cocherSerie(db, s, true);
  }
  return id;
}

const FIN = Date.UTC(2026, 9, 30, 18, 0);
const REPAS = { nom: "Resto", proteines: 40, lipides: 20, glucides: 60, date: "2026-10-30", repasId: "repas:dejeuner" };

/** La séance est terminée et entière : fin, note, séries non cochées retirées, les autres gardées. */
async function verifierFin(t: { raw: Awaited<ReturnType<typeof baseDeTest>>["raw"] }, id: string) {
  const s = t.raw.prepare("SELECT fin, note, nb_series FROM seances WHERE id = ?").get(id) as { fin: number; note: string; nb_series: number };
  assert.deepEqual({ ...s }, { fin: FIN, note: "Fin", nb_series: 2 });
  assert.equal(n(t.raw, "series WHERE seance_id = ?", [id]), 2);
}

test("synchro pendant la fin d'une séance : la réponse du serveur arrive au milieu, la séance se termine entière", async () => {
  await pret();
  const serveur = new Serveur();
  const a = await telephone(serveur, aleatoire(32), "A");
  const id = await seanceEnCours(a.db);
  await a.sync();
  await ajouterPesee(a.db, 80);

  const pendantFin = aLaPremiere(a, "DELETE FROM series");
  let auReseau = () => {};
  const attend = new Promise<void>((r) => (auReseau = r));
  serveur.reseau = async () => (auReseau(), pendantFin);
  const enCours = a.sync();
  await attend;
  await terminer(a.db, (await lireSeance(a.db, id))!, { note: "Fin", majRoutine: false, fin: FIN });
  await enCours;

  assert.equal(a.compte.max, 1, "jamais deux BEGIN");
  await verifierFin(a, id);
  serveur.reseau = async () => {};
  await a.sync();
  assert.equal(JSON.parse(serveur.lignes.get(`seances/${id}`)!.charge!).fin, FIN);
  assert.equal(n(a.raw, "sync_journal"), 0);
});

test("fin d'une séance pendant que la synchro applique des changements reçus : les deux passent", async () => {
  await pret();
  const serveur = new Serveur();
  const cle = aleatoire(32);
  const b = await telephone(serveur, cle, "B");
  await b.sync();
  await ajouterPesee(b.db, 81, Date.UTC(2026, 9, 29));
  await b.sync();
  const a = await telephone(serveur, cle, "A");
  const id = await seanceEnCours(a.db);
  const detail = (await lireSeance(a.db, id))!;

  let fin: Promise<void> = Promise.resolve();
  const pendantSynchro = aLaPremiere(a, "INTO sync_silence", () => (fin = horsTransaction(() => terminer(a.db, detail, { note: "Fin", majRoutine: false, fin: FIN }))));
  await a.sync();
  await pendantSynchro;
  await fin;

  assert.equal(a.compte.max, 1);
  await verifierFin(a, id);
  assert.equal(n(a.raw, "pesee WHERE kg = 81"), 1, "la pesée reçue est là");
});

test("synchro pendant l'ajout d'un repas, et ajout d'un repas pendant la synchro : rien ne se perd", async () => {
  await pret();
  const serveur = new Serveur();
  const cle = aleatoire(32);
  const b = await telephone(serveur, cle, "B");
  await b.sync();
  const a = await telephone(serveur, cle, "A");
  await a.sync();
  await ajouterPesee(a.db, 80);

  // la réponse du serveur arrive pendant l'écriture du produit de l'ajout rapide
  const pendantAjout = aLaPremiere(a, "INSERT INTO produits");
  let auReseau = () => {};
  const attend = new Promise<void>((r) => (auReseau = r));
  serveur.reseau = async () => (auReseau(), pendantAjout);
  const enCours = a.sync();
  await attend;
  await ajoutRapide(a.db, REPAS);
  await enCours;
  serveur.reseau = async () => {};

  // l'ajout tombe pendant que la synchro applique une pesée reçue
  await ajouterPesee(b.db, 82, Date.UTC(2026, 9, 29));
  await b.sync();
  let ajout: Promise<unknown> = Promise.resolve();
  const pendantSynchro = aLaPremiere(a, "INTO sync_silence", () => (ajout = horsTransaction(() => ajoutRapide(a.db, { ...REPAS, nom: "Snack" }))));
  await a.sync();
  await pendantSynchro;
  await ajout;

  assert.equal(a.compte.max, 1);
  assert.deepEqual((await consommationsDuJour(a.db, REPAS.date)).map((c) => c.produit.nom).sort(), ["Resto", "Snack"]);
  assert.equal(n(a.raw, "pesee WHERE kg = 82"), 1);
  assert.equal(n(a.raw, "sync_journal WHERE tab = 'pesee'"), 0, "la pesée de A est partie");
});
