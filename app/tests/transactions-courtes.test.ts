// Transactions courtes (audit M14, docs/PERF-D.md) : la file unique des transactions (db/exclusif.ts) fait attendre toute
// écriture de l'écran derrière la transaction en cours. Synchro reçue, recalculs d'après une pesée et retraitement Whoop
// passent donc en transactions courtes ; toute transaction longue ou attente longue est journalisée (« [base] lente »).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { recalculerPoidsDuCorps } from "../src/db/depots/recalcul.ts";
import { seuilsBase, transaction } from "../src/db/exclusif.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { LOT_TRANSACTION, synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { baseDeTest, facade, horsTransaction } from "./aide.ts";

/**
 * Connexion qui rend la main à chaque requête, comme expo-sqlite (appel natif asynchrone) : sous Node, node:sqlite répond
 * dans le même tour et rien d'autre (un geste de l'écran) ne pourrait passer pendant une synchro.
 */
function commeLeTelephone(brute: Executeur): Executeur {
  return new Proxy(brute, {
    get(cible, nom) {
      const v = Reflect.get(cible, nom, cible);
      if (typeof v !== "function" || !["execAsync", "runAsync", "getFirstAsync", "getAllAsync"].includes(String(nom))) return typeof v === "function" ? v.bind(cible) : v;
      return (...a: unknown[]) => new Promise((r) => setImmediate(r)).then(() => v.apply(cible, a));
    },
  });
}

/** Serveur en mémoire (comme tests/synchro.test.ts) ; `apresTirer` est appelé après chaque lot rendu. */
function serveur(apresTirer: () => void = () => {}) {
  const lignes = new Map<string, Changement & { seq: number }>();
  let seq = 0;
  const transport: Transport = {
    pousser: async (lot) => {
      for (const c of lot) lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++seq });
    },
    tirer: async (curseur, limite): Promise<Lot> => {
      const depuis = curseur ? Number(curseur) : 0;
      const l = [...lignes.values()].filter((x) => x.seq > depuis).sort((a, b) => a.seq - b.seq);
      const page = l.slice(0, limite);
      setImmediate(apresTirer);
      return { changements: page.map(({ seq: _, ...c }) => c), curseur: page.length ? String(page[page.length - 1]!.seq) : curseur, encore: l.length > limite };
    },
    envoyerFichier: async () => {},
    lireFichier: async () => null,
    supprimerFichier: async () => {},
  };
  return { transport, lignes };
}

test("synchro reçue de plus de 2 000 lignes : une écriture de l'écran lancée pendant passe en moins de 300 ms, après un lot court", async () => {
  await pret();
  const cle = aleatoire(32);
  const A = await baseDeTest(true);
  // 120 séances de 15 séries : plus de 2 000 lignes à recevoir avec le catalogue.
  A.raw.exec("BEGIN");
  for (let i = 0; i < 120; i++) {
    const debut = Date.now() - (i + 1) * 86_400_000;
    A.raw.prepare("INSERT INTO seances (id, debut, fin, maj_le) VALUES (?, ?, ?, ?)").run(`s${i}`, debut, debut + 3_600_000, debut);
    A.raw.prepare("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?, 'cat:couche', 0)").run(`s${i}`);
    for (let k = 0; k < 15; k++) {
      A.raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, kg, reps, faite) VALUES (?, ?, 'cat:couche', ?, ?, 8, 1)").run(`s${i}-${k}`, `s${i}`, k, 40 + k);
    }
  }
  A.raw.exec("COMMIT");
  const srv = serveur();
  await synchroniser({ db: A.db, transport: srv.transport, cle, noeud: "A" });
  assert.ok(srv.lignes.size > 2000, `${srv.lignes.size} lignes sur le serveur`);

  const B = await baseDeTest(true);
  const dbB = facade(commeLeTelephone(B.brute));
  const geste: { ecriture: Promise<{ ms: number; appliquees: number }> | null } = { ecriture: null };
  const compter = () => Number((B.raw.prepare("SELECT COUNT(*) AS n FROM series").get() as { n: number }).n);
  const tirage = serveur(() => {
    // Au premier lot rendu, pendant qu'il s'applique : un geste de l'écran écrit un réglage.
    if (geste.ecriture) return;
    const debut = performance.now();
    geste.ecriture = horsTransaction(() => ecrireReglage(dbB, "geste_ecran", "1")).then(() => ({ ms: performance.now() - debut, appliquees: compter() }));
  });
  for (const [k, v] of srv.lignes) tirage.lignes.set(k, v);
  const bilan = await synchroniser({ db: dbB, transport: tirage.transport, cle, noeud: "B" });
  assert.ok(bilan.appliques > 2000);
  assert.ok(geste.ecriture, "l'écriture a été lancée pendant la synchro");
  const r = await geste.ecriture;
  assert.ok(r.ms < 300, `écriture passée en ${Math.round(r.ms)} ms`);
  // Elle n'a attendu qu'un lot court, pas les 500 lignes du lot reçu ni toute la synchro.
  assert.ok(r.appliquees <= 2 * LOT_TRANSACTION, `${r.appliquees} séries appliquées avant elle (lot de transaction : ${LOT_TRANSACTION})`);
  assert.equal(compter(), 1800);
  assert.equal(B.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("pesée : le recalcul des exercices au poids du corps passe un exercice par transaction ; une écriture passe entre deux", async () => {
  const { raw, brute } = await baseDeTest(true);
  const db = facade(commeLeTelephone(brute));
  raw.exec("BEGIN");
  const exos = (raw.prepare("SELECT id FROM exercices WHERE nature = 'reps' LIMIT 6").all() as { id: string }[]).map((x) => x.id);
  for (let i = 0; i < 30; i++) {
    const debut = Date.now() - (i + 1) * 86_400_000;
    raw.prepare("INSERT INTO seances (id, debut, fin, maj_le) VALUES (?, ?, ?, ?)").run(`s${i}`, debut, debut + 3_600_000, debut);
    for (const [k, e] of exos.entries()) {
      raw.prepare("INSERT OR IGNORE INTO seance_exercices (seance_id, exercice_id, position) VALUES (?, ?, ?)").run(`s${i}`, e, k);
      raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, reps, faite) VALUES (?, ?, ?, ?, 10, 1)").run(`s${i}-${k}`, `s${i}`, e, k);
    }
  }
  raw.exec("COMMIT");
  // Transactions ouvertes sur la connexion ; à l'ouverture de la première, un geste de l'écran écrit un réglage.
  let ouvertes = 0;
  let geste: Promise<number> | null = null;
  const ouvrir = brute.withTransactionAsync.bind(brute);
  brute.withTransactionAsync = async (t) => {
    ouvertes++;
    geste ??= horsTransaction(() => new Promise<void>((r) => setImmediate(r)).then(() => ecrireReglage(db, "geste_ecran", "1")).then(() => ouvertes));
    return ouvrir(t);
  };
  await recalculerPoidsDuCorps(db);
  const auGeste = await geste!;
  assert.ok(ouvertes >= exos.length + 1, `${ouvertes} transactions : une par exercice, puis les séances`);
  assert.ok(auGeste <= 3, `le geste est passé après ${auGeste} transactions sur ${ouvertes}`);
});

test("[base] lente : une transaction trop longue et une écriture qui l'a attendue sont journalisées, avec la première écriture", async () => {
  const { db } = await baseDeTest();
  const journal: string[] = [];
  const avant = { ...seuilsBase };
  Object.assign(seuilsBase, { transactionMs: 40, attenteMs: 20, journal: (m: string) => void journal.push(m) });
  try {
    const longue = transaction(db, async (t) => {
      await t.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('x', '1')", []);
      await new Promise((r) => setTimeout(r, 80));
    });
    await new Promise((r) => setTimeout(r, 5));
    await ecrireReglage(db, "geste_ecran", "1");
    await longue;
    await transaction(db, async (t) => void (await t.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('y', '1')", [])));
  } finally {
    Object.assign(seuilsBase, avant);
  }
  assert.equal(journal.filter((m) => /^\[base\] lente : transaction \d+ ms, attente \d+ ms \(runAsync INSERT INTO reglages\)$/.test(m)).length, 1, journal.join("\n"));
  assert.equal(journal.filter((m) => /^\[base\] lente : runAsync INSERT OR REPLACE a attendu \d+ ms$|^\[base\] lente : runAsync .* a attendu \d+ ms$/.test(m)).length, 1, journal.join("\n"));
  assert.equal(journal.length, 2, "la transaction courte n'est pas journalisée");
});
