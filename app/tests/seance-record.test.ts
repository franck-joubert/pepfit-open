// Nouveau record en séance : meilleur kg × réps ou 1RM estimé de l'exercice ; médaille sur la première série qui le bat.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUCUN, estRecord, meilleursDe, recordsDeSeance, type SerieRepere } from "../src/ecrans/seance-reperes.ts";

const histo = meilleursDe([
  { kg: 80, reps: 8, duree_s: null },
  { kg: 82.5, reps: 6, duree_s: null },
]);

test("meilleurs de l'historique", () => {
  assert.equal(histo.n, 2);
  assert.equal(histo.kg, 82.5);
  assert.equal(histo.reps, 8);
  assert.equal(histo.volume, 640);
  assert.equal(histo.e1rm, 101.33);
});

test("record : kg × réps battu", () => {
  assert.equal(estRecord({ kg: 82.5, reps: 8, duree_s: null }, histo), true);
  assert.equal(estRecord({ kg: 80, reps: 8, duree_s: null }, histo), false);
});

test("record : 1RM estimé battu sans battre le volume", () => {
  // 100 × 1 : volume 100 (< 640) mais 1RM 100 < 101,33 ; 105 × 1 : 1RM 105.
  assert.equal(estRecord({ kg: 100, reps: 1, duree_s: null }, histo), false);
  assert.equal(estRecord({ kg: 105, reps: 1, duree_s: null }, histo), true);
});

test("pas de record sans historique ni sur une série vide", () => {
  assert.equal(estRecord({ kg: 200, reps: 10, duree_s: null }, AUCUN), false);
  assert.equal(estRecord({ kg: null, reps: null, duree_s: null }, histo), false);
});

test("poids du corps : les réps ; gainage : la durée", () => {
  const corps = meilleursDe([{ kg: null, reps: 12, duree_s: null }]);
  assert.equal(estRecord({ kg: null, reps: 13, duree_s: null }, corps), true);
  assert.equal(estRecord({ kg: null, reps: 12, duree_s: null }, corps), false);
  const gainage = meilleursDe([{ kg: null, reps: null, duree_s: 60 }]);
  assert.equal(estRecord({ kg: null, reps: null, duree_s: 75 }, gainage), true);
});

test("séance : seule la première série qui bat le record a la médaille, échauffements et séries à faire exclus", () => {
  const s = (id: string, kg: number, reps: number, faite = true, echauffement = false): SerieRepere => ({ id, exercice_id: "dc", kg, reps, duree_s: null, faite, echauffement });
  const r = recordsDeSeance([s("e", 120, 10, true, true), s("1", 85, 8), s("2", 85, 8), s("3", 90, 8, false), s("4", 87.5, 8)], { dc: histo });
  assert.deepEqual([...r], ["1", "4"]);
  assert.equal(recordsDeSeance([s("1", 85, 8)], {}).size, 0);
});
