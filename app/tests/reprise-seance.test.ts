// Reprise d'une séance en cours : quel exercice montrer et où défiler (docs/CODE-REPRISE-SEANCE.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cibleReprise, positionReprise, type MesuresReprise } from "../src/ecrans/reprise-seance.ts";
import type { SeanceDetail } from "../src/db/index.ts";

type S = { id: string; faite: number };
const exo = (id: string, series: S[], groupe: number | null = null) => ({ exercice: { id }, groupeSuperset: groupe, series: series.map((x) => ({ ...x, exercice_id: id })) });
const seance = (...exercices: ReturnType<typeof exo>[]): SeanceDetail => {
  // Blocs : un par exercice, sauf les exercices d'un même superset.
  const blocs: { groupeSuperset: number | null; exercices: ReturnType<typeof exo>[] }[] = [];
  for (const e of exercices) {
    const b = e.groupeSuperset != null ? blocs.find((x) => x.groupeSuperset === e.groupeSuperset) : undefined;
    if (b) b.exercices.push(e);
    else blocs.push({ groupeSuperset: e.groupeSuperset, exercices: [e] });
  }
  return { exercices, blocs } as unknown as SeanceDetail;
};
const f = (id: string) => ({ id, faite: 1 });
const a = (id: string) => ({ id, faite: 0 });

test("cible : le premier exercice qui a des séries à faire", () => {
  const s = seance(exo("A", [f("a1"), f("a2")]), exo("B", [f("b1"), a("b2")]), exo("C", [a("c1")]));
  assert.deepEqual(cibleReprise(s), { genre: "exercice", exerciceId: "B" });
});

test("cible : séance neuve, le premier exercice", () => {
  assert.deepEqual(cibleReprise(seance(exo("A", [a("a1")]), exo("B", [a("b1")]))), { genre: "exercice", exerciceId: "A" });
});

test("cible : un superset suit l'ordre des tours (A1 B1 A2 B2)", () => {
  const s = seance(exo("A", [f("a1"), a("a2")], 1), exo("B", [f("b1"), a("b2")], 1), exo("C", [a("c1")]));
  assert.deepEqual(cibleReprise(s), { genre: "exercice", exerciceId: "A" });
  const t = seance(exo("A", [f("a1"), f("a2")], 1), exo("B", [f("b1"), a("b2")], 1));
  assert.deepEqual(cibleReprise(t), { genre: "exercice", exerciceId: "B" });
});

test("cible : une série sautée plus haut reste la prochaine à faire", () => {
  const s = seance(exo("A", [f("a1"), a("a2"), f("a3")]), exo("B", [f("b1")]));
  assert.deepEqual(cibleReprise(s), { genre: "exercice", exerciceId: "A" });
});

test("cible : tout est fait → la fin de la liste ; sans exercice ni série → rien", () => {
  assert.deepEqual(cibleReprise(seance(exo("A", [f("a1")]), exo("B", [f("b1")]))), { genre: "fin" });
  assert.equal(cibleReprise(seance()), null);
  assert.equal(cibleReprise(seance(exo("A", []))), null);
});

const m = (o: Partial<MesuresReprise> = {}): MesuresReprise => ({ exercice: { haut: 1000, hauteur: 200 }, zone: 600, contenu: 3000, y: 0, ...o });
const exercice = { genre: "exercice", exerciceId: "B" } as const;

test("position : l'exercice est centré dans la zone", () => {
  // milieu de l'exercice = 1100, moitié de zone = 300
  assert.equal(positionReprise(exercice, m()), 800);
});

test("position : près du début, au plus près (0), sans espace vide au-dessus", () => {
  const proche = { haut: 100, hauteur: 200 };
  assert.equal(positionReprise(exercice, m({ exercice: proche, y: 500 })), 0);
  assert.equal(positionReprise(exercice, m({ exercice: proche, y: 0 })), null);
});

test("position : près de la fin, bornée au bas du contenu, sans espace vide en dessous", () => {
  assert.equal(positionReprise(exercice, m({ exercice: { haut: 2700, hauteur: 200 } })), 2400);
});

test("position : liste qui tient dans la zone → rien à défiler", () => {
  assert.equal(positionReprise(exercice, m({ contenu: 600 })), null);
  assert.equal(positionReprise(exercice, m({ contenu: 500 })), null);
});

test("position : tout fait → le bas ; déjà au bas → rien", () => {
  assert.equal(positionReprise({ genre: "fin" }, m()), 2400);
  assert.equal(positionReprise({ genre: "fin" }, m({ y: 2400 })), null);
});

test("position : exercice supprimé ou non mesuré, séance sans exercice → rien", () => {
  assert.equal(positionReprise(exercice, m({ exercice: null })), null);
  assert.equal(positionReprise(null, m()), null);
});

test("position : exercice déjà à sa place (à quelques px) → pas de mouvement", () => {
  assert.equal(positionReprise(exercice, m({ y: 804 })), null);
});

test("position : exercice plus haut que la zone (petit écran) → son début en haut", () => {
  assert.equal(positionReprise(exercice, m({ zone: 300, exercice: { haut: 1000, hauteur: 500 } })), 1000);
});

test("position : zone non mesurée → rien", () => {
  assert.equal(positionReprise(exercice, m({ zone: 0 })), null);
});
