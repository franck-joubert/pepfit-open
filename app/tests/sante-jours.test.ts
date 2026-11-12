// Page du mois de Santé (docs/SANTE-CALENDRIER.md) : les jours qui ont des données de santé, lus en une requête dans la
// base (jamais Santé Connect), rangés à leur jour, et leur ligne de la vue liste.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";

await import("./resolveur-ecrans.mjs");
const { lireJoursSante, premierJourSante, ligneJourSante, resumerJoursSante } = await import("../src/ecrans/sante-jours.ts");

const a = (j: string, h = 0, min = 0) => {
  const [y, m, d] = j.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, h, min).getTime();
};

async function base() {
  const { raw, db } = await baseDeTest();
  const run = (sql: string, ...p: (string | number | null)[]) => raw.prepare(sql).run(...p);
  // pesées : deux le 3 (la dernière compte), une le 10 à 23 h 50 (reste le 10)
  run("INSERT INTO pesee (id, date, kg) VALUES ('p1', ?, 80.2), ('p2', ?, 79.8), ('p3', ?, 79.5)", a("2026-10-03", 7), a("2026-10-03", 19), a("2026-10-10", 23, 50));
  // VFC et FC de Santé Connect le 5, masse grasse le 7, taille (hors jour) le 8, test VMA (hors jour) le 9
  for (const [id, type, j, v] of [["m1", "vfc", "2026-10-05", 61], ["m2", "fc", "2026-10-05", 50], ["m3", "gras", "2026-10-07", 18.2], ["m4", "taille", "2026-10-08", 183], ["m5", "vma_test", "2026-10-09", 1500]] as const)
    run("INSERT INTO mesure_corps (id, type, date, valeur, source, cree_le) VALUES (?, ?, ?, ?, 'sante_connect', 0)", id, type, a(j, 7), v, );
  // un tour de taille le 12, la taille saisie le 13 (hors jour)
  run("INSERT INTO mensurations (id, type, date, valeur) VALUES ('t1', 'tour_taille', ?, 84), ('t2', 'taille', ?, 183)", a("2026-10-12", 9), a("2026-10-13", 9));
  // Whoop le 5 (prime sur Santé Connect pour la nuit) ; un jour Whoop sans donnée utile le 14
  run("INSERT INTO whoop_jour (jour, sommeil_min, vfc, fc_repos, pas, maj_le) VALUES (?, 432, 58, 49, 6000, 0), (?, NULL, NULL, NULL, NULL, 0)", a("2026-10-05"), a("2026-10-14"));
  // pas des journées : le 5 (prime sur Whoop), le 20 ; un jour sans pas le 21
  for (const [j, pas] of [["2026-10-05", 8400], ["2026-10-20", 3000], ["2026-10-21", null]] as const)
    run("INSERT INTO jour_activite (jour, charge, methode, pas, version, empreinte, maj_le) VALUES (?, 1, 'pas', ?, 1, '', 0)", j, pas);
  return db;
}

test("jours avec données : une requête, rangés au jour, hors-jour écartés", async () => {
  const db = await base();
  let n = 0;
  const compte = new Proxy(db, { get: (c, k) => (k === "getAllAsync" || k === "getFirstAsync" ? (...x: unknown[]) => (n++, (Reflect.get(c, k) as Function).apply(c, x)) : Reflect.get(c, k)) });
  const m = await lireJoursSante(compte, "2026-10-01", "2026-10-31");
  assert.equal(n, 1, "une seule requête pour tout le mois");
  assert.deepEqual([...m.keys()].sort(), ["2026-10-03", "2026-10-05", "2026-10-07", "2026-10-10", "2026-10-12", "2026-10-20"]);
  assert.equal(m.get("2026-10-03")!.poids, 79.8, "la dernière pesée du jour");
  assert.deepEqual(m.get("2026-10-05"), { sommeilMin: 432, vfc: 58, fcRepos: 49, poids: null, pas: 8400, mesures: 0 });
  assert.equal(m.get("2026-10-07")!.mesures, 1);
  assert.equal(m.get("2026-10-10")!.poids, 79.5);
  // fenêtre bornée : fin comprise, rien après
  assert.deepEqual([...(await lireJoursSante(db, "2026-10-04", "2026-10-07")).keys()].sort(), ["2026-10-05", "2026-10-07"]);
  assert.equal(await premierJourSante(db), "2026-10-03");
});

test("premier jour : null sans donnée", async () => {
  const { db } = await baseDeTest();
  assert.equal(await premierJourSante(db), null);
  assert.equal((await lireJoursSante(db, "2026-10-01", "2026-10-31")).size, 0);
});

test("ligne de la vue liste : données principales, sinon le nombre de mesures", () => {
  const x = { sommeilMin: 432, vfc: 58, fcRepos: 49, poids: 79.84, pas: 8400, mesures: 2 };
  const l = ligneJourSante(x, "kg").replace(/\s/g, " ");
  assert.equal(l, "7 h 12, 58 ms, 49 bpm, 79,8 kg, 8 400 pas");
  assert.equal(ligneJourSante({ ...x, sommeilMin: null, vfc: null, fcRepos: null, poids: null, pas: null }, "kg"), "2 mesures");
  assert.equal(resumerJoursSante([]).size, 0);
});
