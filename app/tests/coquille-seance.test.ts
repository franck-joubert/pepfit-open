// Ouverture de la séance : la coquille couvre l'écran, pas plus.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blocsCoquille, LIGNES_COQUILLE } from "../src/ecrans/coquille-seance.ts";
import { courbe, duree } from "../src/theme/mouvement.ts";

const bloc = (...series: number[]) => ({ exercices: series.map((n) => ({ series: Array.from({ length: n }) })) });

test("séance vide ou courte : tout est rendu dès l'ouverture", () => {
  assert.equal(blocsCoquille([]), 0);
  assert.equal(blocsCoquille([bloc(3), bloc(3)]), 2);
});

test("séance longue : les blocs qui remplissent l'écran, celui qui déborde compris", () => {
  // 6 lignes par exercice de 3 séries : 18 lignes atteintes au 3e bloc.
  const blocs = Array.from({ length: 8 }, () => bloc(3));
  assert.equal(blocsCoquille(blocs), 3);
  assert.equal(blocsCoquille(blocs, 7), 2);
});

test("un premier bloc plus haut que l'écran (superset, longue liste) est rendu seul", () => {
  assert.equal(blocsCoquille([bloc(10, 10), bloc(3)]), 1);
  assert.ok(LIGNES_COQUILLE >= 12);
});

test("la séance redescend plus vite qu'elle ne monte, en accélérant", () => {
  assert.ok(duree.seanceSortie >= 200 && duree.seanceSortie <= 250);
  assert.ok(duree.seanceSortie < duree.seance);
  // Accélère (y1 = 0) et sort lancée, sans se poser (x2 = y2 = 1).
  assert.equal(courbe.fermeture[1], 0);
  assert.deepEqual(courbe.fermeture.slice(2), [1, 1]);
});
