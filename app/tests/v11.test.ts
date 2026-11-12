// Passe V1.1 : corrections relevées sur le Fold (ECARTS.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { changerNature, creerExercice } from "../src/db/depots/exercices.ts";
import {
  ajouterExerciceARoutine, creerRoutine, creerSuperset, definirCibleSerie, lireRoutine, modifierLigneRoutine, retirerLigneDeRoutine,
} from "../src/db/depots/routines.ts";
import { MIGRATIONS, migrer } from "../src/db/migrations.ts";
import { DatabaseSync } from "node:sqlite";
import {
  ajouterSerie, cocherSerie, demarrerSeance, demarrerSeanceDepuisRoutine, lireSeance, lireSeries, modifierSerie, terminerSeance,
} from "../src/db/depots/seances.ts";
import { progressionExercice, recordsExercice } from "../src/db/stats.ts";
import { changementsRoutine, majRoutineParDefaut, terminer } from "../src/ecrans/donnees.ts";
import { unRmTexte } from "../src/ecrans/format.ts";
import { adapter, baseDeTest, jour } from "./aide.ts";

type Db = Awaited<ReturnType<typeof baseDeTest>>["db"];

async function seanceFaite(db: Db, exo: string, debut: number, series: [number | null, number][]) {
  const id = await demarrerSeance(db, null, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [debut, id]);
  for (const [kg, reps] of series) await cocherSerie(db, await ajouterSerie(db, { seanceId: id, exerciceId: exo, kg: kg ?? undefined, reps }), true);
  await terminerSeance(db, id, debut + 3_600_000);
}

test("V1.1 (22) : une séance écourtée ne rétrécit pas la routine par défaut", async () => {
  const { db } = await baseDeTest();
  const squat = await creerExercice(db, { nom: "Squat" });
  const presse = await creerExercice(db, { nom: "Presse" });
  const r = await creerRoutine(db, "Jambes", []);
  await modifierLigneRoutine(db, await ajouterExerciceARoutine(db, r, squat), { nbSeries: 3 });
  await modifierLigneRoutine(db, await ajouterExerciceARoutine(db, r, presse), { nbSeries: 3 });

  // Une seule série cochée par exercice.
  const id = await demarrerSeanceDepuisRoutine(db, r);
  const series = await lireSeries(db, id);
  for (const ex of [squat, presse]) {
    const s = series.find((x) => x.exercice_id === ex)!;
    await modifierSerie(db, s.id, { kg: 50, reps: 10 });
    await cocherSerie(db, s.id, true);
  }
  const seance = (await lireSeance(db, id))!;
  const c = await changementsRoutine(db, seance);
  assert.deepEqual(c.map((x) => [x.avant, x.apres]), [[3, 1], [3, 1]]);
  assert.equal(majRoutineParDefaut(c), false);

  await terminer(db, seance, { note: "", majRoutine: majRoutineParDefaut(c) });
  const apres = (await lireRoutine(db, r))!;
  assert.deepEqual(apres.blocs.map((b) => b.lignes[0]!.nb_series), [3, 3]);
});

test("V1.1 (22) : plus de séries, ou rien à reporter", () => {
  assert.equal(majRoutineParDefaut([{ avant: 3, apres: 4 }]), true);
  assert.equal(majRoutineParDefaut([{ avant: 3, apres: 4 }, { avant: 3, apres: 2 }]), false);
  assert.equal(majRoutineParDefaut([]), false);
});

test("V1.1 (21) : exercice en réps seules suivi en répétitions, lesté en charge", async () => {
  const { db } = await baseDeTest();
  const tractions = await creerExercice(db, { nom: "Tractions", nature: "reps" });
  await seanceFaite(db, tractions, jour(2026, 9, 1), [[null, 8], [null, 6]]);
  await seanceFaite(db, tractions, jour(2026, 9, 8), [[0, 10], [0, 7]]);
  assert.deepEqual((await progressionExercice(db, tractions, "charge")).points, []);
  const reps = await progressionExercice(db, tractions, "reps");
  assert.deepEqual(reps.points.map((p) => p.valeur), [8, 10]);
  assert.equal(reps.gain, 2);
  assert.deepEqual((await progressionExercice(db, tractions, "reps_total")).points.map((p) => p.valeur), [14, 17]);
  assert.equal((await recordsExercice(db, tractions)).actuels.reps?.valeur, 10);

  // D10 : réps seules -> lesté en place ; la charge lestée entre dans les courbes de charge.
  assert.equal((await changerNature(db, tractions, "leste"))?.mode, "en_place");
  await seanceFaite(db, tractions, jour(2026, 9, 15), [[10, 5]]);
  assert.deepEqual((await progressionExercice(db, tractions, "charge")).points.map((p) => p.valeur), [10]);
});

test("V1.1 (13) : 1RM estimé affiché en séance (Epley, unité de l'exercice)", () => {
  assert.equal(unRmTexte(79, 10, "kg"), "1RM 105");
  assert.equal(unRmTexte(100, 1, "kg"), "1RM 100");
  assert.equal(unRmTexte(100, 1, "lbs"), "1RM 220");
  assert.equal(unRmTexte(null, 10, "kg"), "");
  assert.equal(unRmTexte(0, 10, "kg"), "");
  assert.equal(unRmTexte(60, null, "kg"), "");
});

test("V1.1 (1) : migration 3, une base en version 2 garde ses routines et gagne les cibles", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 2);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('e','Rowing',0,1,1);
    INSERT INTO routines VALUES ('r','Pull',NULL,0,1,1);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,nb_series) VALUES ('l','r','e',0,2);`);
  await migrer(db, 3);
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 3);
  await migrer(db);
  const l = (await lireRoutine(db, "r"))!.blocs[0]!.lignes[0]!;
  assert.equal(l.nb_series, 2);
  assert.deepEqual(l.cibles, [
    { kg: null, reps: null, duree_s: null, distance_m: null, type: "normale", reps_max: null },
    { kg: null, reps: null, duree_s: null, distance_m: null, type: "normale", reps_max: null },
  ]);
});

test("V1.1 (1) : cibles par série, priorité sur le précédent, champ par champ", async () => {
  const { db } = await baseDeTest();
  const rowing = await creerExercice(db, { nom: "Rowing" });
  const r = await creerRoutine(db, "Pull", []);
  const l = await ajouterExerciceARoutine(db, r, rowing, { nbSeries: 3 });

  // Une séance passée : 60 × 10 sur chaque série (le précédent).
  await seanceFaite(db, rowing, jour(2026, 10, 1), [[60, 10], [60, 10], [60, 10]]);

  await definirCibleSerie(db, l, 0, { kg: 72.5, reps: 8 });
  await definirCibleSerie(db, l, 1, { kg: 75 });
  await definirCibleSerie(db, l, 5, { kg: 99 }); // hors des séries : ignoré
  assert.deepEqual((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles, [
    { kg: 72.5, reps: 8, duree_s: null, distance_m: null, type: "normale", reps_max: null },
    { kg: 75, reps: null, duree_s: null, distance_m: null, type: "normale", reps_max: null },
    { kg: null, reps: null, duree_s: null, distance_m: null, type: "normale", reps_max: null },
  ]);

  const id = await demarrerSeanceDepuisRoutine(db, r);
  const series = await lireSeries(db, id);
  assert.deepEqual(series.map((x) => [x.kg, x.reps]), [[72.5, 8], [75, 10], [60, 10]]);

  // Effacer les deux champs supprime la cible ; retirer des séries retire leurs cibles.
  await definirCibleSerie(db, l, 0, { kg: null, reps: null });
  await modifierLigneRoutine(db, l, { nbSeries: 1 });
  await modifierLigneRoutine(db, l, { nbSeries: 3 });
  assert.deepEqual((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles.map((c) => c.kg), [null, null, null]);

  // Ligne retirée : ses cibles partent avec elle (cascade).
  await definirCibleSerie(db, l, 2, { reps: 12 });
  await retirerLigneDeRoutine(db, l);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM routine_series", []))!.n, 0);
});

test("V1.1 (1) : cibles dans un superset, séries entrelacées", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Tirage" });
  const b = await creerExercice(db, { nom: "Pompes" });
  const r = await creerRoutine(db, "SS", []);
  const la = await ajouterExerciceARoutine(db, r, a, { nbSeries: 2 });
  const lb = await ajouterExerciceARoutine(db, r, b, { nbSeries: 2 });
  await creerSuperset(db, r, [la, lb]);
  await definirCibleSerie(db, la, 1, { kg: 50, reps: 10 });
  await definirCibleSerie(db, lb, 0, { reps: 20 });
  const series = await lireSeries(db, await demarrerSeanceDepuisRoutine(db, r));
  assert.deepEqual(series.map((x) => [x.exercice_id === a ? "A" : "B", x.kg, x.reps]), [
    ["A", null, null], ["B", null, 20], ["A", 50, 10], ["B", null, null],
  ]);
});
