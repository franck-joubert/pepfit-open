// Parcours de séance : création et modification d'une séance prévue (sport seul, routine, jour/heure, durée, lieu, répétition).
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { lireReglagesPrevus, lireSeancePrevue, lireLieuPrevu, listerProgrammationsEtReglages } from "../src/db/depots/programmations.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { creerSalle } from "../src/db/depots/salles.ts";
import { creerSeanceDuParcours, modifierSeanceDuParcours } from "../src/ecrans/parcours/creer-parcours.ts";
import { resumeExercices } from "../src/ecrans/parcours-seance.ts";
import { instantDe, lignesDuJour, lirePlanning } from "../src/ecrans/planif-donnees.ts";

const PLAN = { sport: "cat:course", routineId: null, nom: "Course", jour: "2026-11-06", heure: "18:00", sansHeure: false, dureeMin: 90, lieuId: null };

test("sport seul : séance prévue avec ses réglages, sans exercices", async () => {
  const { db } = await baseDeTest(true);
  const { programmationId } = await creerSeanceDuParcours(db, PLAN, "fr");
  assert.deepEqual(await lireReglagesPrevus(db, programmationId), { sport: "cat:course", dureeMin: 90, sansHeure: false });
  const p = await lireSeancePrevue(db, programmationId, "2026-11-06");
  assert.equal(p?.date, "2026-11-06");
  assert.equal(p?.repetee, false);
});

test("routine choisie : la séance prévue la programme, lieu du jour posé, sans heure gardée", async () => {
  const { db } = await baseDeTest(true);
  const salle = await creerSalle(db, "Maison");
  const routineId = await creerRoutine(db, "Push", [{ exerciceId: "cat:couche", nbSeries: 3 }]);
  const r = await creerSeanceDuParcours(db, { ...PLAN, sport: null, routineId, nom: "Push", sansHeure: true, dureeMin: null, lieuId: salle }, "fr");
  assert.equal(r.routineId, routineId);
  assert.deepEqual(await lireReglagesPrevus(db, r.programmationId), { sport: null, dureeMin: null, sansHeure: true });
  assert.deepEqual(await lireLieuPrevu(db, r.programmationId, "2026-11-06"), { id: salle, nom: "Maison" });
});

test("modifier : jour, heure, durée et lieu changent, la clé reste", async () => {
  const { db } = await baseDeTest(true);
  const salle = await creerSalle(db, "Parc");
  const { programmationId } = await creerSeanceDuParcours(db, PLAN, "fr");
  const cle = await modifierSeanceDuParcours(db, { programmationId, dateOrigine: "2026-11-06" }, { jour: "2026-11-08", heure: "07:30", sansHeure: false, dureeMin: 45, lieuId: salle }, "fr");
  assert.deepEqual(cle, { programmationId, dateOrigine: "2026-11-06" });
  const p = await lireSeancePrevue(db, programmationId, "2026-11-06");
  assert.equal(p?.date, "2026-11-08");
  assert.equal(p?.heure, "07:30");
  assert.equal((await lireReglagesPrevus(db, programmationId))?.dureeMin, 45);
  assert.deepEqual(await lireLieuPrevu(db, programmationId, "2026-11-06"), { id: salle, nom: "Parc" });
});

test("modifier avec « Répéter » : la séance devient une série", async () => {
  const { db } = await baseDeTest(true);
  const { programmationId } = await creerSeanceDuParcours(db, PLAN, "fr");
  const cle = await modifierSeanceDuParcours(db, { programmationId, dateOrigine: "2026-11-06" }, { jour: "2026-11-06", heure: "18:00", sansHeure: false, dureeMin: 90, lieuId: null, repeter: "semaine" }, "fr");
  assert.equal((await lireSeancePrevue(db, cle.programmationId, cle.dateOrigine))?.repetee, true);
});

test("résumé d'exercices : sans point médian", () => {
  const s = resumeExercices(5, 15);
  assert.ok(!s.includes("·"));
  assert.match(s, /5/);
  assert.match(s, /15/);
});

test("lecture groupée : les règles et leurs réglages viennent d'une seule requête", async () => {
  const { db } = await baseDeTest(true);
  const routineId = await creerRoutine(db, "Push", [{ exerciceId: "cat:couche", nbSeries: 3 }]);
  const a = await creerSeanceDuParcours(db, PLAN, "fr");
  const b = await creerSeanceDuParcours(db, { ...PLAN, sport: null, routineId, nom: "Push", sansHeure: true, dureeMin: null }, "fr");
  const { progs, reglages } = await listerProgrammationsEtReglages(db);
  assert.equal(progs.length, 2);
  assert.deepEqual(reglages.get(a.programmationId), await lireReglagesPrevus(db, a.programmationId));
  assert.deepEqual(reglages.get(b.programmationId), { sport: null, dureeMin: null, sansHeure: true });
});

test("planning : la ligne d'une séance prévue porte la durée voulue, le sport et « sans heure »", async () => {
  const { db } = await baseDeTest(true);
  const routineId = await creerRoutine(db, "Push", [{ exerciceId: "cat:couche", nbSeries: 3 }]);
  await creerSeanceDuParcours(db, PLAN, "fr");
  await creerSeanceDuParcours(db, { ...PLAN, sport: null, routineId, nom: "Push", jour: "2026-11-07", sansHeure: true, dureeMin: null }, "fr");
  const p = await lirePlanning(db, "2026-11-04", "2026-11-10", instantDe("2026-11-04", "08:00"));
  const prevues = (j: string) => lignesDuJour(p, j).flatMap((l) => (l.genre === "prevue" ? [l] : []));
  const [course] = prevues("2026-11-06");
  assert.equal(course?.dureeS, 90 * 60);
  assert.equal(course?.dureeChoisie, true);
  assert.equal(course?.sport, "cat:course");
  const [push] = prevues("2026-11-07");
  assert.equal(push?.sansHeure, true);
  assert.equal(push?.dureeChoisie, false);
  assert.equal(push?.sport, null);
});
