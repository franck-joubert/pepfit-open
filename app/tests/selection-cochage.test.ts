// Cochage depuis la page d'un exercice : transmis à la liste de choix par le module de sélection.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cocher, demanderCochage, prendreCochages, rendreExercices } from "../src/ecrans/selection.ts";

test("cocher ajoute sans doublon ni exercice déjà présent", () => {
  assert.deepEqual(cocher(["a"], ["b", "b", "a", "c"], new Set(["c"])), ["a", "b"]);
  const l = ["a"];
  assert.equal(cocher(l, ["a"], new Set()), l);
});

test("le cochage demandé est lu une fois, puis vidé", () => {
  demanderCochage("x");
  assert.deepEqual(prendreCochages(), ["x"]);
  assert.deepEqual(prendreCochages(), []);
});

test("rendre les exercices vide les cochages en attente", () => {
  demanderCochage("y");
  rendreExercices([]);
  assert.deepEqual(prendreCochages(), []);
});
