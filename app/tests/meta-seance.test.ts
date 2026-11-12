// Sous-ligne d'une séance faite par famille (revue finale du 30/10, n° 3) : plus de « 1 série » sous une course, un padel,
// des étirements ou une activité associée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { chiffresSeances, metaSeance } from "../src/ecrans/meta-seance.ts";
import { baseDeTest } from "./aide.ts";

type Db = Awaited<ReturnType<typeof baseDeTest>>["db"];

async function seance(db: Db, series: { exo: string; kg?: number; reps?: number; dureeS?: number; distanceM?: number; echauffement?: boolean }[]) {
  const id = await demarrerSeance(db, null, "Test");
  for (const s of series) {
    const sid = await ajouterSerie(db, { seanceId: id, exerciceId: s.exo, kg: s.kg, reps: s.reps, dureeS: s.dureeS, distanceM: s.distanceM, type: s.echauffement ? "echauffement" : "normale" });
    await cocherSerie(db, sid, true);
  }
  await terminerSeance(db, id);
  return id;
}

test("chaque famille ses chiffres : force en séries, endurance en distance, le reste en durée", async () => {
  const { db } = await baseDeTest(true);
  const squat = await creerExercice(db, { nom: "Squat" });
  const force = await seance(db, [{ exo: squat, kg: 100, reps: 5 }, { exo: squat, kg: 100, reps: 5 }, { exo: "cat:plank", dureeS: 60 }]);
  const course = await seance(db, [{ exo: "cat:course", dureeS: 1920, distanceM: 5200 }]);
  const tapis = await seance(db, [{ exo: "cat:course", dureeS: 1200 }]);
  const padel = await seance(db, [{ exo: "cat:padel", dureeS: 3900 }]);
  const etirements = await seance(db, [{ exo: "cat:etirements", dureeS: 900 }]);
  const vide = await seance(db, []);
  const c = await chiffresSeances(db, [force, course, tapis, padel, etirements, vide]);

  assert.equal(metaSeance(52, 3, c.get(force)), "52 min, 3 séries");
  assert.equal(metaSeance(32, 1, c.get(course)), "32 min, 5,2 km");
  assert.equal(metaSeance(20, 1, c.get(tapis)), "20 min");
  assert.equal(metaSeance(65, 1, c.get(padel)), "1 h 05");
  assert.equal(metaSeance(15, 1, c.get(etirements)), "15 min");
  assert.equal(metaSeance(1, 0, c.get(vide)), "1 min");
  // Pas encore lus : la durée seule, jamais « 1 série ».
  assert.equal(metaSeance(32, 1, undefined), "32 min");
});

test("un échauffement seul ne fait pas une séance de force", async () => {
  const { db } = await baseDeTest(true);
  const squat = await creerExercice(db, { nom: "Squat" });
  const id = await seance(db, [{ exo: squat, kg: 40, reps: 10, echauffement: true }, { exo: "cat:course", dureeS: 600, distanceM: 1500 }]);
  const c = await chiffresSeances(db, [id]);
  assert.deepEqual(c.get(id), { force: false, distanceM: 1500 });
  assert.equal((await chiffresSeances(db, [])).size, 0);
});
