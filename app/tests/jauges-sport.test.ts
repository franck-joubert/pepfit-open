// Couleurs des anneaux de Sport (planche sport-stats v2, S2) : les cas du panneau « Les anneaux et leurs couleurs ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatDepense, etatPas, etatRecup, objectifDepense, partAnneau } from "../src/ecrans/jauges-sport.ts";

const J = new Date(2026, 9, 30).getTime();
const a = (h: number, m = 0) => J + (h * 60 + m) * 60_000;

test("dépense : verte de 90 à 125 %, rouge au-delà, rouge en retard sur l'heure, orange sinon", () => {
  assert.equal(etatDepense(2540, 2610, J, a(19, 10)), "ok");
  assert.equal(etatDepense(3400, 2610, J, a(19, 10)), "alerte");
  assert.equal(etatDepense(1050, 2610, J, a(15)), "alerte", "62 % de la journée passée");
  assert.equal(etatDepense(760, 2610, J, a(9, 30)), "cours", "pas de rouge chaque matin");
  assert.equal(etatDepense(2000, 2610, J, a(19, 10)), "cours");
  assert.equal(etatDepense(null, 2610, J, a(12)), "cours");
  assert.equal(etatDepense(1200, null, J, a(12)), "cours", "sans journée d'habitude : orange");
  // un jour fini se juge sur toute la journée
  assert.equal(etatDepense(1500, 2610, J, a(48)), "alerte");
});

test("pas : verts à l'objectif, rouges sous la moitié de ce que l'heure laisse attendre (7:00 à 22:00)", () => {
  assert.equal(etatPas(14870, 8000, J, a(19, 10)), "ok");
  assert.equal(etatPas(8000, 8000, J, a(10)), "ok");
  assert.equal(etatPas(1900, 8000, J, a(16)), "alerte");
  assert.equal(etatPas(2310, 8000, J, a(9, 30)), "cours");
  assert.equal(etatPas(0, 8000, J, a(6, 30)), "cours", "avant 7:00, rien n'est attendu");
  assert.equal(etatPas(null, 8000, J, a(16)), "cours");
});

test("part de l'anneau : bornée de 0 à 1", () => {
  assert.equal(partAnneau(14870, 8000), 1);
  assert.equal(partAnneau(4000, 8000), 0.5);
  assert.equal(partAnneau(null, 8000), 0);
  assert.equal(partAnneau(10, 0), 0);
});

test("page Énergie : dépense face à la journée d'habitude (anneau et pourcentage), rien sans habitude", () => {
  assert.deepEqual(objectifDepense(2412, 2738), { part: 2412 / 2738, p: 88 });
  assert.equal(objectifDepense(3400, 2610)!.part > 1, true, "au-delà : second tour de l'anneau");
  assert.equal(objectifDepense(null, 2610), null);
  assert.equal(objectifDepense(2000, null), null);
  assert.equal(objectifDepense(2000, 0), null);
});

test("Récupération (planche recuperation, D8) : vert dès « Prêt » (67), orange en dessous, jamais rouge", () => {
  assert.equal(etatRecup(90), "ok");
  assert.equal(etatRecup(67), "ok");
  assert.equal(etatRecup(66), "cours");
  assert.equal(etatRecup(5), "cours");
  assert.equal(etatRecup(null), "cours");
  for (let s = 0; s <= 100; s++) assert.notEqual(etatRecup(s), "alerte");
});
