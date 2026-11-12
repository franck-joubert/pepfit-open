// Dernière série d'un exercice supprimée : l'exercice part avec elle (carte entière), « Annuler » le ramène.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeanceDetail } from "../src/db/index.ts";
import { exerciceEmporte, sansExercice } from "../src/ecrans/retrait-serie.ts";

const ex = (id: string, series: string[], groupe: number | null = null) => ({
  exercice: { id },
  groupeSuperset: groupe,
  series: series.map((s) => ({ id: s, exercice_id: id })),
});
const seance = (...l: ReturnType<typeof ex>[]) => {
  const blocs: { groupeSuperset: number | null; exercices: ReturnType<typeof ex>[]; reposS: number }[] = [];
  for (const e of l) {
    const b = e.groupeSuperset != null ? blocs.find((x) => x.groupeSuperset === e.groupeSuperset) : undefined;
    if (b) b.exercices.push(e);
    else blocs.push({ groupeSuperset: e.groupeSuperset, exercices: [e], reposS: 90 });
  }
  return { seance: { id: "s" }, exercices: l, blocs } as unknown as SeanceDetail;
};

test("la dernière série emporte l'exercice ; une série parmi d'autres, non", () => {
  const s = seance(ex("dc", ["1", "2"]), ex("sq", ["3"]));
  assert.equal(exerciceEmporte(s, "3"), "sq");
  assert.equal(exerciceEmporte(s, "1"), null);
  assert.equal(exerciceEmporte(s, "inconnue"), null);
});

test("la séance affichée perd l'exercice et son bloc ; Annuler revient à la séance d'origine", () => {
  const s = seance(ex("dc", ["1", "2"]), ex("sq", ["3"]));
  const vue = sansExercice(s, "sq");
  assert.deepEqual(vue.exercices.map((e) => e.exercice.id), ["dc"]);
  assert.deepEqual(vue.blocs.map((b) => b.exercices.map((e) => e.exercice.id)), [["dc"]]);
  // La donnée d'origine n'est pas touchée : Annuler réaffiche l'exercice et sa série.
  assert.deepEqual(s.exercices.map((e) => e.exercice.id), ["dc", "sq"]);
  assert.deepEqual(s.exercices[1]!.series.map((x) => x.id), ["3"]);
});

test("dans un superset, seul l'exercice part ; le bloc reste avec les autres", () => {
  const s = seance(ex("tr", ["1"], 1), ex("bi", ["2", "3"], 1));
  assert.equal(exerciceEmporte(s, "1"), "tr");
  const vue = sansExercice(s, "tr");
  assert.deepEqual(vue.blocs.map((b) => [b.groupeSuperset, b.exercices.map((e) => e.exercice.id)]), [[1, ["bi"]]]);
});
