// D3 (option b) de la planche seance-duree, audit A11 : une séance de course d'un programme garde ses étapes (ligne
// d'origine, zone visée, récup de chaque bloc) au lieu de tout fondre dans un exercice à repos 0.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { demarrerPlan } from "../src/db/depots/plans.ts";
import { listerRoutines } from "../src/db/depots/routines.ts";
import { demarrerSeanceDepuisRoutine, lireSeance, reposApresSerie } from "../src/db/depots/seances.ts";
import { changerReposSeance } from "../src/ecrans/donnees.ts";
import { baseDeTest } from "./aide.ts";

const DOSSIER = new URL("../assets/catalogue/programmes/", import.meta.url);
const P = (id: string) => readdirSync(DOSSIER).map((f) => JSON.parse(readFileSync(new URL(f, DOSSIER), "utf8"))).find((p) => p.id === id);

test("Fractionné 6 × 3 min : chaque série garde sa zone et sa récup ; la récup du fractionné est de 2 min, pas 0", async () => {
  const { db } = await baseDeTest(true);
  await demarrerPlan(db, P("c10"), { jours: [1, 3, 4, 6], longue: 6, debut: "2026-11-02", heure: "18:30" }, {}, "fr");
  const r = (await listerRoutines(db)).find((x: { nom: string }) => x.nom === "Fractionné 6 × 3 min")!;
  const id = await demarrerSeanceDepuisRoutine(db, r.id);
  const s = (await lireSeance(db, id))!;
  const series = s.exercices[0]!.series;
  assert.deepEqual(series.map((x) => x.zone), [2, 4, 4, 4, 4, 4, 4, 2]);
  assert.deepEqual(series.map((x) => x.repos_s), [0, 120, 120, 120, 120, 120, 120, 0]);
  assert.equal(new Set(series.map((x) => x.ligne_id)).size, 3);
  assert.equal((await reposApresSerie(db, series[1]!.id))!.s, 120);
  assert.equal((await reposApresSerie(db, series[0]!.id))!.s, 0);
  // Le repos réglé à la main pour l'exercice passe devant les récups des étapes.
  await changerReposSeance(db, id, s.exercices[0]!.exercice.id, 45);
  assert.equal((await reposApresSerie(db, series[1]!.id))!.s, 45);
});

test("une routine de muscu ordinaire (un exercice par ligne) garde le repos de l'exercice, sans récup par série", async () => {
  const { db } = await baseDeTest(true);
  await demarrerPlan(db, P("fb"), { jours: [1, 3, 5], longue: null, debut: "2026-11-02", heure: "18:30" }, {}, "fr");
  const r = (await listerRoutines(db))[0]!;
  const id = await demarrerSeanceDepuisRoutine(db, r.id);
  const s = (await lireSeance(db, id))!;
  assert.ok(s.exercices.every((e) => e.series.every((x) => x.repos_s == null && x.zone == null)));
});
