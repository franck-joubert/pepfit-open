// Ajout optimiste d'une série en séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeanceDetail } from "../src/db/index.ts";
import { avecAjouts, serieAjoutee } from "../src/ecrans/ajout-optimiste.ts";

const serie = (id: string, position: number, kg: number | null) => ({ id, exercice_id: "ex", position, kg, reps: 8, duree_s: null, distance_m: null, groupe_superset: null }) as never;
const exo = (series: unknown[]) => ({ exercice: { id: "ex" }, groupeSuperset: null, series }) as never;
const seance = (series: unknown[]): SeanceDetail => ({ seance: { id: "s" }, exercices: [exo(series)], blocs: [{ exercices: [exo(series)] }] }) as unknown as SeanceDetail;

test("la nouvelle série reprend la dernière, à la suite", () => {
  const a = serieAjoutee("s", exo([serie("a", 0, 50), serie("b", 1, 60)]), "n");
  assert.equal(a.id, "n");
  assert.equal(a.position, 2);
  assert.equal(a.kg, 60);
  assert.equal(a.reps, 8);
  assert.equal(a.faite, 0);
  assert.equal(serieAjoutee("s", exo([]), "n").position, 0);
});

test("la série ajoutée apparaît dans les exercices et les blocs, une seule fois", () => {
  const base = seance([serie("a", 0, 50)]);
  const a = serieAjoutee("s", base.exercices[0]!, "n");
  const v = avecAjouts(base, [a]);
  assert.deepEqual(v.exercices[0]!.series.map((x) => x.id), ["a", "n"]);
  assert.deepEqual(v.blocs[0]!.exercices[0]!.series.map((x) => x.id), ["a", "n"]);
  // Relue de la base : pas doublée.
  assert.deepEqual(avecAjouts(seance([serie("a", 0, 50), serie("n", 1, 50)]), [a]).exercices[0]!.series.map((x) => x.id), ["a", "n"]);
  assert.equal(avecAjouts(base, []), base);
});
