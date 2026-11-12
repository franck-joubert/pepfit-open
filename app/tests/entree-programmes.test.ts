// Bouton « Programmes » de Sport (31/10) : une seule transition, la page choisie avant de partir.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cibleProgrammes, CLE_RECUS_COACH } from "../src/ecrans/entree-programmes.ts";
import { PREFIXE_CACHE } from "../src/db/depots/reglages.ts";

test("sans programme ni reçu du coach : la boutique directement ; sinon la page Programmes", () => {
  assert.equal(cibleProgrammes(0, 0), "/boutique");
  assert.equal(cibleProgrammes(1, 0), "/programmes");
  assert.equal(cibleProgrammes(0, 2), "/programmes");
});

test("le nombre de reçus gardé est un calcul local : ni sauvegardé ni synchronisé", () => {
  assert.ok(CLE_RECUS_COACH.startsWith(PREFIXE_CACHE));
});
