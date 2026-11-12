// Réglages d'une séance prévue (migration 90) : sport, durée voulue jusqu'à 48 h, sans heure ; synchro et copie d'occurrence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { creerSeancePrevue, personnaliserOccurrence } from "../src/db/depots/agenda.ts";
import { lireLieuPrevu, lireReglagesPrevus, poserReglagesPrevus } from "../src/db/depots/programmations.ts";
import { creerSalle } from "../src/db/depots/salles.ts";
import { TABLES_SYNC } from "../src/sync/schema.ts";

test("synchro : programmation_reglages voyage, une ligne par programmation, après son parent", () => {
  const i = TABLES_SYNC.findIndex((x) => x.nom === "programmation_reglages");
  assert.ok(i > TABLES_SYNC.findIndex((x) => x.nom === "programmations"));
  assert.deepEqual(TABLES_SYNC[i]!.uniques, [["programmation_id"]]);
});

test("séance créée avec ses réglages et son lieu ; relue ; durée tenue à 48 h", async () => {
  const { db, raw } = await baseDeTest(true);
  const salle = await creerSalle(db, "Maison");
  const { programmationId } = await creerSeancePrevue(
    db,
    { date: "2026-11-06", heure: "18:00", nom: "Course", lignes: [{ exerciceId: "cat:couche", nbSeries: 1 }], reglages: { sport: "cat:course", dureeMin: 90, sansHeure: false }, lieuId: salle },
    "fr",
  );
  assert.deepEqual(await lireReglagesPrevus(db, programmationId), { sport: "cat:course", dureeMin: 90, sansHeure: false });
  assert.deepEqual(await lireLieuPrevu(db, programmationId, "2026-11-06"), { id: salle, nom: "Maison" });
  await poserReglagesPrevus(db, programmationId, { sport: "cat:course", dureeMin: 99999, sansHeure: true });
  assert.deepEqual(await lireReglagesPrevus(db, programmationId), { sport: "cat:course", dureeMin: 2880, sansHeure: true });
  await poserReglagesPrevus(db, programmationId, { sport: null, dureeMin: null, sansHeure: false });
  assert.deepEqual(await lireReglagesPrevus(db, programmationId), { sport: null, dureeMin: null, sansHeure: false });
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM programmation_reglages").get() as { n: number }).n, 1);
  assert.ok((raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'programmation_reglages' AND supprime = 0").get() as { n: number }).n >= 1);
});

test("sans réglages : undefined (séance d'avant) ; la base refuse plus de 48 h", async () => {
  const { db, raw } = await baseDeTest(true);
  const { programmationId } = await creerSeancePrevue(db, { date: "2026-11-06", heure: "18:00", nom: "Gym", lignes: [{ exerciceId: "cat:couche", nbSeries: 1 }] }, "fr");
  assert.equal(await lireReglagesPrevus(db, programmationId), undefined);
  assert.throws(() => raw.prepare("INSERT INTO programmation_reglages (id, programmation_id, duree_min, maj_le) VALUES ('x', ?, 2881, 0)").run(programmationId));
});

test("la suppression de la séance emporte ses réglages ; la retouche d'une occurrence les copie", async () => {
  const { db, raw } = await baseDeTest(true);
  const { programmationId } = await creerSeancePrevue(
    db,
    { date: "2026-11-06", heure: "18:00", nom: "Vélo", lignes: [{ exerciceId: "cat:couche", nbSeries: 1 }], reglages: { sport: "cat:bicycling", dureeMin: 60, sansHeure: false } },
    "fr",
  );
  const copie = await personnaliserOccurrence(db, programmationId, "2026-11-06", "fr");
  assert.ok(copie);
  // Séance déjà propre : rendue telle quelle, mêmes réglages.
  assert.equal(copie.programmationId, programmationId);
  raw.prepare("DELETE FROM programmations WHERE id = ?").run(programmationId);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM programmation_reglages").get() as { n: number }).n, 0);
});
