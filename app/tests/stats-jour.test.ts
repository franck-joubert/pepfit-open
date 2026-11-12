// Jauges de Sport sur un jour passé (docs/JAUGES-PASSE.md, 31/10) : les chiffres du jour passé sont lus (pas ceux
// d'aujourd'hui), un jour à venir n'a ni jauges ni place, une lecture en panne finit en « — » (null) au lieu d'un squelette
// sans fin, et la mémoire de l'onglet rend un jour déjà lu tout de suite, sans relire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecDelai, creerMemoire, jaugesDuJour, joursAPrecharger } from "../src/ecrans/memoire-jours.ts";

test("jaugesDuJour : aujourd'hui et tout jour passé, jamais un jour à venir", () => {
  assert.equal(jaugesDuJour("2026-10-31", "2026-10-31"), true);
  assert.equal(jaugesDuJour("2026-10-29", "2026-10-31"), true);
  assert.equal(jaugesDuJour("2025-12-31", "2026-10-31"), true);
  assert.equal(jaugesDuJour("2026-11-01", "2026-10-31"), false);
});

test("joursAPrecharger : les jours passés de la semaine, sans celui affiché ni l'avenir", () => {
  assert.deepEqual(joursAPrecharger("2026-10-26", "2026-10-29", "2026-10-31"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-30", "2026-10-31"]);
  assert.deepEqual(joursAPrecharger("2026-11-02", "2026-11-02", "2026-10-31"), []);
});

test("avecDelai : la valeur, ou le repli si la lecture échoue ou ne revient jamais", async () => {
  assert.equal(await avecDelai(Promise.resolve(3), 50, null), 3);
  assert.equal(await avecDelai(Promise.reject(new Error("santé connect")), 50, null), null);
  const debut = Date.now();
  assert.equal(await avecDelai(new Promise(() => {}), 30, "—"), "—");
  assert.ok(Date.now() - debut < 500);
});

test("mémoire : un jour lu revient tout de suite, deux lectures en même temps n'en font qu'une", async () => {
  const m = creerMemoire<number>({ vieMs: 60_000 });
  let lectures = 0;
  const lire = () => new Promise<number>((ok) => setTimeout(() => ok(++lectures), 10));
  assert.equal(m.lu("2026-10-29"), undefined);
  const [a, b] = await Promise.all([m.charger("2026-10-29", lire), m.charger("2026-10-29", lire)]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(lectures, 1);
  assert.equal(m.lu("2026-10-29"), 1);
  assert.equal(m.frais("2026-10-29"), true);
  assert.equal(m.frais("2026-10-29", Date.now() + 61_000), false, "vieillie : relue à l'arrivée");
  assert.equal(await m.charger("2026-10-29", lire), 2, "une relecture demandée relit");
  // une lecture ratée ne reste pas en mémoire ni en cours
  await assert.rejects(m.charger("2026-10-28", () => Promise.reject(new Error("x"))));
  assert.equal(m.lu("2026-10-28"), undefined);
  assert.equal(await m.charger("2026-10-28", lire), 3);
});

test("mémoire bornée : les plus anciens jours partent d'abord", () => {
  const m = creerMemoire<number>({ vieMs: 60_000, max: 2 });
  m.poser("a", 1);
  m.poser("b", 2);
  m.poser("c", 3);
  assert.equal(m.lu("a"), undefined);
  assert.equal(m.lu("c"), 3);
});

test("jour passé (jeudi 29/10, une séance de musculation) : ses jauges sont lues, avec l'effort de ce jour", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { lireStatsJour, chargerStatsJour, memoireStats } = await import("../src/ecrans/stats-jour.ts");
  const { db, raw } = await baseDeTest(true);
  const jeudi = new Date(2026, 9, 29).getTime();
  const debut = jeudi + 18 * 3_600_000;
  raw
    .prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('push', '28/10 — Push A', ?, ?, 0, 'cat:musculation')")
    .run(debut, debut + 47 * 60_000);
  const samedi = new Date(2026, 9, 31, 10, 44).getTime();
  const s = await lireStatsJour(db, "2026-10-29", samedi, 2000);
  assert.equal(s.jour, jeudi);
  assert.ok(s.effort && s.effort.score > 0, `effort du jeudi : ${JSON.stringify(s.effort)}`);
  assert.equal(s.effort!.estime, true, "ni FC ni ressenti : le barème, « ~ »");
  // le lendemain n'a pas de séance : pas l'effort du jeudi
  assert.equal((await lireStatsJour(db, "2026-10-30", samedi, 2000)).effort, null);

  // la Récupération remplace la dépense (planche recuperation) : sans nuit mesurée, pas de score
  assert.equal(s.recup?.score, null);
  assert.equal(s.feminin, false);
  assert.equal("depense" in s, false, "la dépense n'est plus une jauge de Sport");

  memoireStats.oublier();
  const vus: unknown[] = [];
  const fin = await chargerStatsJour(db, "2026-10-29", (x) => vus.push(x), 2000);
  assert.equal(vus.length, 1, "les chiffres sont posés dès qu'ils sont là");
  assert.equal(memoireStats.lu("2026-10-29"), fin, "gardé pour le retour sur ce jour");
});
