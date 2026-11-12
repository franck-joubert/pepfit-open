// Lot 2 de la planche seance-duree (cas mixtes, audit A10) : distance au-delà d'un kilomètre en km dans les textes de série,
// une seule série pour une course ajoutée à une séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { serieNatureTexte } from "../src/ecrans/format.ts";
import { ajouterExerciceASeance, demarrerSeance, lireSeance } from "../src/db/depots/seances.ts";
import { baseDeTest } from "./aide.ts";

const vide = { kg: null, reps: null, duree_s: null, distance_m: null };

test("textes de série : « 8,4 km, 45:30 » au-delà d'un kilomètre, « 800 m » en dessous ; poids et distance", () => {
  assert.equal(serieNatureTexte(["distance_m", "duree_s"], { ...vide, distance_m: 8400, duree_s: 2730 }, "kg"), "8,4 km, 45:30");
  assert.equal(serieNatureTexte(["distance_m", "duree_s"], { ...vide, distance_m: 800, duree_s: 240 }, "kg"), "800 m, 4:00");
  assert.equal(serieNatureTexte(["kg", "distance_m"], { ...vide, kg: 24, distance_m: 40 }, "kg"), "24 kg, 40 m");
  assert.equal(serieNatureTexte(["kg", "duree_s"], { ...vide, kg: 10, duree_s: 45 }, "kg"), "10 kg, 0:45");
});

test("une course ajoutée à une séance prend une seule série ; un exercice de force en garde trois", async () => {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null);
  await ajouterExerciceASeance(db, id, "cat:course", { nbSeries: 3 });
  await ajouterExerciceASeance(db, id, "cat:plank", { nbSeries: 3 });
  const s = (await lireSeance(db, id))!;
  const nb = (ex: string) => s.exercices.find((e) => e.exercice.id === ex)!.series.length;
  assert.equal(nb("cat:course"), 1);
  assert.equal(nb("cat:plank"), 3);
});
