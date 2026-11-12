import { test } from "node:test";
import assert from "node:assert/strict";
import { moisDe, plansPasses } from "../src/boutique/passes.ts";
import type { PlanEnCours } from "../src/boutique/donnees.ts";

// Page Programmes (planche sport-programmes-routines v2, A2) : un passé par programme du catalogue, le plus récent d'abord ;
// « Terminé 2 fois » ; un programme arrêté n'est ni en cours ni « fini ».
const plan = (o: Partial<PlanEnCours> & { id: string; catalogueId: string }): PlanEnCours => ({
  nom: o.catalogueId, debut: "2026-01-05", fin: "2026-03-29", jours: [0, 2, 4], heure: "18:00", nbSeances: 36, arreteLe: null,
  programme: null, semaine: 12, semaines: 12, prochaine: null, commence: true, fini: false, faites: 0, derniere: null, ...o,
});

test("passés : finis et arrêtés seulement, un par programme, « Terminé n fois » compte les suivis finis", () => {
  const suivis = [
    plan({ id: "a", catalogueId: "semi" }), // en cours
    plan({ id: "b", catalogueId: "mob", fini: true, derniere: "2026-06-20" }),
    plan({ id: "c", catalogueId: "hb", fini: true, derniere: "2026-03-28" }),
    plan({ id: "d", catalogueId: "f5", arreteLe: 1_767_000_000_000, semaine: 5, faites: 14 }),
    plan({ id: "e", catalogueId: "mob", fini: true, derniere: "2026-02-01" }),
  ];
  const p = plansPasses(suivis);
  assert.deepEqual(p.map((x) => [x.id, x.fois]), [["b", 2], ["c", 1], ["d", 0]]);
});

test("mois : seul cette année, avec l'année sinon", () => {
  assert.match(moisDe("2026-03-12", "2026-10-29"), /^mars$/i);
  assert.match(moisDe("2025-09-12", "2026-10-29"), /2025/);
});
