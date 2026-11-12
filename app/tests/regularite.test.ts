// Régularité (27/10) : série de semaines (lundi-dimanche) et jours de repos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { joursDeRepos, seancesTerminees, serieHebdo } from "../src/db/regularite.ts";
import { baseDeTest } from "./aide.ts";

/** Le jour (heure locale, 18 h) : 2026-10-26 est un lundi. */
const j = (a: number, m: number, d: number, h = 18) => new Date(a, m - 1, d, h).getTime();
const s = (t: number, fin: number | null = t + 3_600_000) => ({ debut: t, fin });

test("série en cours : la semaine en cours compte dès sa première séance", () => {
  const l = [s(j(2026, 10, 27)), s(j(2026, 10, 20)), s(j(2026, 10, 14))];
  assert.deepEqual(serieHebdo(l, j(2026, 10, 28)), { enCours: 3, meilleure: 3 });
});

test("série en cours : une semaine en cours encore vide ne casse pas la série", () => {
  const l = [s(j(2026, 10, 20)), s(j(2026, 10, 13))];
  assert.equal(serieHebdo(l, j(2026, 11, 1, 22)).enCours, 2); // dimanche soir
  assert.equal(serieHebdo(l, j(2026, 11, 2, 9)).enCours, 0); // lundi suivant : une semaine sans séance est passée
});

test("meilleure série : la plus longue suite, séances non terminées ignorées", () => {
  const l = [
    s(j(2026, 10, 27)),
    s(j(2026, 10, 6)), s(j(2026, 9, 29)), s(j(2026, 9, 22)), s(j(2026, 9, 24)),
    s(j(2026, 10, 13), null),
  ];
  assert.deepEqual(serieHebdo(l, j(2026, 10, 28)), { enCours: 1, meilleure: 3 });
  assert.deepEqual(serieHebdo([], j(2026, 10, 28)), { enCours: 0, meilleure: 0 });
});

test("série : le passage à l'heure d'hiver (25/10) ne coupe pas la suite", () => {
  const l = [s(j(2026, 10, 26)), s(j(2026, 10, 19))];
  assert.deepEqual(serieHebdo(l, j(2026, 10, 27)), { enCours: 2, meilleure: 2 });
});

test("série : 40 semaines d'affilée à travers les deux changements d'heure, à minuit près", () => {
  // Une séance par semaine du lundi 26/01 au vendredi 30/10/2026, un jour et une heure différents chaque semaine (lundi 0 h 30,
  // dimanche 23 h 30…), plus une séance non terminée et un trou avant la série.
  const l = Array.from({ length: 40 }, (_, k) => {
    const jour = k % 7;
    const [h, mn] = jour === 0 ? [0, 30] : jour === 6 ? [23, 30] : [18, 0];
    return s(new Date(2026, 0, 26 + 7 * k + jour, h, mn).getTime());
  });
  l.push(s(j(2026, 1, 12), null), s(j(2026, 1, 1)));
  assert.deepEqual(serieHebdo(l, j(2026, 11, 1, 12)), { enCours: 40, meilleure: 40 });
  // Sans la séance de cette semaine : la série court encore (39) jusqu'à dimanche soir.
  assert.equal(serieHebdo(l.slice(0, 39).concat(l.slice(40)), j(2026, 11, 1, 12)).enCours, 39);
});

test("jours de repos : jours calendaires depuis la dernière séance terminée", () => {
  const l = [s(j(2026, 10, 24, 23)), s(j(2026, 10, 20)), s(j(2026, 10, 27, 7), null)];
  assert.equal(joursDeRepos(l, j(2026, 10, 25, 8)), 1);
  assert.equal(joursDeRepos(l, j(2026, 10, 27, 20)), 3);
  assert.equal(joursDeRepos([s(j(2026, 10, 27, 7))], j(2026, 10, 27, 20)), 0);
  assert.equal(joursDeRepos([], j(2026, 10, 27)), null);
});

test("seancesTerminees lit les séances finies, de la plus récente à la plus ancienne", async () => {
  const { raw, db } = await baseDeTest();
  raw.exec(`INSERT INTO seances (id, debut, fin, maj_le) VALUES ('a', 100, 200, 1), ('b', 300, NULL, 1), ('c', 500, 600, 1)`);
  assert.deepEqual((await seancesTerminees(db)).map((x) => ({ ...x })), [{ debut: 500, fin: 600 }, { debut: 100, fin: 200 }]);
});
