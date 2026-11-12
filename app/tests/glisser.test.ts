// Glisser-déposer de l'éditeur de routine : rangées, cible, écart des voisines, dépôt (exercice ou superset), défilement automatique.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cibleGlisser, decalagesVoisins, deplacerBloc, deplacerExercice, depotDe, fentes, HAUTEUR_REPLIEE, hautDeLaPlace, hauteursGlisser,
  rangeesDe, reordonner, uniteTenue, VITESSE_MAX, vitesseDefilement, type Fente, type LigneDispo, type Rangee,
} from "../src/ecrans/glisser.ts";

const R = HAUTEUR_REPLIEE;
const toutes = (n: number): Fente[] => Array.from({ length: n + 1 }, (_, index) => ({ index, groupe: null }));
const cible = (autres: number[], haut: number, depart: number) => cibleGlisser(autres, toutes(autres.length), haut, depart).index;

// Routine type : A seul, Biset 1 (B, C), D seul, Triset 2 (E, F, G).
const lignes: LigneDispo[] = [
  { id: "A", groupe: null, repos: 120 },
  { id: "B", groupe: 1, repos: 0 },
  { id: "C", groupe: 1, repos: 90 },
  { id: "D", groupe: null, repos: 60 },
  { id: "E", groupe: 2, repos: 0 },
  { id: "F", groupe: 2, repos: 0 },
  { id: "G", groupe: 2, repos: 75 },
];
const rangees = rangeesDe(lignes);
const ids = (rs: { id: string }[]) => rs.map((r) => r.id).join(" ");

test("rangées : un superset devient en-tête, membres, pied", () => {
  assert.equal(ids(rangees), "A t1 B C p1 D t2 E F G p2");
  assert.deepEqual(rangees[2], { id: "B", type: "membre", groupe: 1 });
});

test("unité tenue : un membre seul, l'en-tête prend tout le superset, le pied ne se prend pas", () => {
  assert.deepEqual(uniteTenue(rangees, "B"), { a: 2, b: 2, mode: "exercice" });
  assert.deepEqual(uniteTenue(rangees, "A"), { a: 0, b: 0, mode: "exercice" });
  assert.deepEqual(uniteTenue(rangees, "t2"), { a: 6, b: 10, mode: "bloc" });
  assert.equal(uniteTenue(rangees, "p1"), null);
});

test("hauteurs : les cartes dépliées se replient, les repliées, l'en-tête et le pied ne bougent pas, la tenue garde la sienne", () => {
  const rs: Rangee[] = [
    { id: "A", type: "seul", groupe: null },
    { id: "t1", type: "tete", groupe: 1 },
    { id: "B", type: "membre", groupe: 1 },
    { id: "C", type: "membre", groupe: 1 },
    { id: "p1", type: "pied", groupe: 1 },
  ];
  assert.deepEqual(hauteursGlisser(rs, [400, 48, 72.4, 300, 60], 3, 3), [R, 48, 72.4, 300, 60]);
  assert.deepEqual(hauteursGlisser(rs, [400, 48, 72.4, 300, 60], 1, 4), [R, 48, 72.4, 300, 60]);
});

test("fentes : dedans entre en-tête, membres et pied d'un superset ; un superset entier ne se pose que dehors", () => {
  const autres = rangees.filter((r) => r.id !== "A"); // t1 B C p1 D t2 E F G p2
  const f = fentes(autres, "exercice");
  assert.deepEqual(f.filter((x) => x.groupe === 1).map((x) => x.index), [1, 2, 3]); // t1|B, B|C, C|p1
  assert.deepEqual(f.filter((x) => x.groupe === 2).map((x) => x.index), [6, 7, 8, 9]);
  assert.deepEqual(f.filter((x) => x.groupe === null).map((x) => x.index), [0, 4, 5, 10]);
  const sansT2 = rangees.slice(0, 6); // A t1 B C p1 D
  assert.deepEqual(fentes(sansT2, "bloc").map((x) => x.index), [0, 1, 5, 6]);
});

test("cible : sans déplacement, le bloc reste à sa place", () => {
  assert.equal(cible([R, R, R], R, 1), 1);
});

test("cible : vers le bas, le bord bas de la carte passe le milieu de la voisine", () => {
  // tenue en 0 (hauteur 100), autres : 3 × 56 ; milieux des voisines (avec la place réservée) : 128, 184, 240
  const a = [56, 56, 56];
  assert.equal(cible(a, 0, 0), 0);
  assert.equal(cible(a, 28, 0), 0);
  assert.equal(cible(a, 29, 0), 1);
  assert.equal(cible(a, 85, 0), 2);
  assert.equal(cible(a, 200, 0), 3);
});

test("cible : vers le haut, le bord haut passe le milieu de la voisine, et bornes", () => {
  const a = [56, 56, 56]; // tenue en 3 ; milieux : 28, 84, 140
  assert.equal(cible(a, 168, 3), 3);
  assert.equal(cible(a, 140, 3), 3);
  assert.equal(cible(a, 139, 3), 2);
  assert.equal(cible(a, 100, 3), 2);
  assert.equal(cible(a, 83, 3), 1);
  assert.equal(cible(a, 0, 3), 0);
  assert.equal(cible(a, -500, 3), 0);
  assert.equal(cible(a, 9999, 3), 3);
});

test("cible : un superset haut reste en place au repos et franchit au bon moment", () => {
  const a = [56, 56]; // tenu (300) entre les deux
  assert.equal(cible(a, 56, 1), 1);
  assert.equal(cible(a, 84, 1), 1);
  assert.equal(cible(a, 85, 1), 2);
  assert.equal(cible(a, 28, 1), 1);
  assert.equal(cible(a, 27, 1), 0);
});

test("cible : seules les fentes permises comptent ; dedans ou dehors à la fin d'un superset", () => {
  // autres : t1 (48) B (73) C (73) p1 (60) D (73) ; fin du biset = 194 (dedans), après le pied = 254 (dehors)
  const autres = rangees.filter((r) => r.id !== "A").slice(0, 5);
  const h = [48, R, R, 60, R];
  const f = fentes(autres, "exercice");
  assert.deepEqual(cibleGlisser(h, f, 190, 0), { index: 3, groupe: 1 });
  assert.deepEqual(cibleGlisser(h, f, 230, 0), { index: 4, groupe: null });
  assert.deepEqual(cibleGlisser(h, fentes(autres, "bloc"), 120, 0), { index: 0, groupe: null }); // bloc : pas de fente dedans
});

test("place : haut de l'emplacement dans la liste sans la carte tenue", () => {
  assert.equal(hautDeLaPlace([56, 56, 56], 0), 0);
  assert.equal(hautDeLaPlace([56, 56, 56], 1), 56);
  assert.equal(hautDeLaPlace([56, 56, 56], 3), 168);
});

test("voisines : elles s'écartent de la hauteur de la carte tenue", () => {
  assert.deepEqual(decalagesVoisins(4, 1, 3, 100), [0, -100, -100, 0]);
  assert.deepEqual(decalagesVoisins(4, 3, 1, 100), [0, 100, 100, 0]);
  assert.deepEqual(decalagesVoisins(4, 2, 2, 100), [0, 0, 0, 0]);
});

test("dépôt : rangées et fente traduites en geste", () => {
  // C (index 3) posé entre t1 et B du même biset
  assert.deepEqual(depotDe(rangees, 3, 3, "exercice", { index: 1, groupe: 1 }), { mode: "exercice", id: "C", avant: "B", groupe: 1 });
  // B posé après le pied du biset : avant D, dehors
  assert.deepEqual(depotDe(rangees, 2, 2, "exercice", { index: 3, groupe: null }), { mode: "exercice", id: "B", avant: "D", groupe: null });
  // A posé à la fin du triset (avant p2)
  assert.deepEqual(depotDe(rangees, 0, 0, "exercice", { index: 9, groupe: 2 }), { mode: "exercice", id: "A", avant: null, groupe: 2 });
  // triset entier (t2..p2) posé en tête : bloc 3 → 0
  assert.deepEqual(depotDe(rangees, 6, 10, "bloc", { index: 0, groupe: null }), { mode: "bloc", de: 3, vers: 0 });
});

test("réordonner dans un biset : le repos du tour reste sur la dernière ligne", () => {
  const r = deplacerExercice(lignes, "C", "B", 1, 120);
  assert.deepEqual(r.slice(0, 3), [
    { id: "A", groupe: null, repos: 120 },
    { id: "C", groupe: 1, repos: 0 },
    { id: "B", groupe: 1, repos: 90 },
  ]);
});

test("sortir d'un biset : il est dissous, le sortant reprend le repos par défaut, le restant garde le repos du tour", () => {
  const r = deplacerExercice(lignes, "B", "D", null, 120);
  assert.equal(ids(r), "A C B D E F G");
  assert.deepEqual(r[1], { id: "C", groupe: null, repos: 90 });
  assert.deepEqual(r[2], { id: "B", groupe: null, repos: 120 });
  assert.equal(ids(rangeesDe(r)), "A C B D t2 E F G p2");
});

test("sortir d'un triset : il reste un biset, le repos du tour passe à la nouvelle dernière ligne", () => {
  const r = deplacerExercice(lignes, "G", null, null, 120);
  assert.deepEqual(r.slice(4), [
    { id: "E", groupe: 2, repos: 0 },
    { id: "F", groupe: 2, repos: 75 },
    { id: "G", groupe: null, repos: 120 },
  ]);
});

test("entrer dans un superset : au milieu enchaîné sans repos, en dernier il prend le repos du tour", () => {
  const milieu = deplacerExercice(lignes, "D", "C", 1, 120);
  assert.deepEqual(milieu.slice(1, 4), [
    { id: "B", groupe: 1, repos: 0 },
    { id: "D", groupe: 1, repos: 0 },
    { id: "C", groupe: 1, repos: 90 },
  ]);
  const fin = deplacerExercice(lignes, "A", null, 2, 120);
  assert.deepEqual(fin.slice(5), [
    { id: "G", groupe: 2, repos: 0 },
    { id: "A", groupe: 2, repos: 75 },
  ]);
  // passer d'un superset à l'autre : le biset quitté est dissous
  const autre = deplacerExercice(lignes, "B", "F", 2, 120);
  assert.equal(ids(rangeesDe(autre)), "A C D t2 E B F G p2");
  assert.deepEqual(autre[1], { id: "C", groupe: null, repos: 90 });
});

test("déplacer un superset entier : il passe d'un bloc, repos inchangés", () => {
  assert.equal(ids(deplacerBloc(lignes, 3, 0)), "E F G A B C D");
  assert.equal(ids(deplacerBloc(lignes, 1, 2)), "A D B C E F G");
  assert.deepEqual(deplacerBloc(lignes, 1, 2)[3], { id: "C", groupe: 1, repos: 90 });
});

test("réordonner : bloc déplacé vers le bas, vers le haut, sans changement", () => {
  assert.deepEqual(reordonner(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reordonner(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(reordonner(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("défilement : nul au milieu, croissant vers les bords, plafonné", () => {
  assert.equal(vitesseDefilement(300, 600), 0);
  assert.equal(vitesseDefilement(64, 600), 0);
  assert.equal(vitesseDefilement(0, 600), -VITESSE_MAX);
  assert.equal(vitesseDefilement(-50, 600), -VITESSE_MAX);
  assert.equal(vitesseDefilement(32, 600), -VITESSE_MAX / 2);
  assert.equal(vitesseDefilement(600, 600), VITESSE_MAX);
  assert.equal(vitesseDefilement(568, 600), VITESSE_MAX / 2);
  assert.ok(vitesseDefilement(560, 600) > 0);
});
