// Champs de poids : un seul séparateur, la virgule tapée devient un point.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireNombre, saisieDecimale } from "../src/ecrans/format.ts";

test("la virgule devient un point", () => {
  assert.equal(saisieDecimale("79,5"), "79.5");
  assert.equal(saisieDecimale("79,"), "79.");
});

test("un seul séparateur", () => {
  assert.equal(saisieDecimale("79..,5"), "79.5");
  assert.equal(saisieDecimale("7.9.5"), "7.95");
  assert.equal(saisieDecimale(".,"), ".");
});

test("rien d'autre que des chiffres", () => {
  assert.equal(saisieDecimale("1 000,5"), "1000.5");
  assert.equal(saisieDecimale("-78"), "78");
  assert.equal(saisieDecimale(""), "");
});

test("la saisie nettoyée se relit", () => {
  assert.equal(lireNombre(saisieDecimale("79..,5")), 79.5);
});
