import assert from "node:assert/strict";
import { test } from "node:test";
import { desintegration as D } from "../src/theme/mouvement.ts";
import {
  hauteurOuverture,
  bezier, CHAMPS, clesParRang, DUREE_MARQUE, fusionner, grains, marquerSuppression, opaciteGrain, poserGrain, prendreMarque, retirerFantome, teintes, type Entree,
} from "../src/ui/suppression-animee.ts";

const cle = (x: { id: string }) => x.id;
const ids = (l: Entree<{ id: string }>[]) => l.map((e) => `${e.cle}:${e.etat}`);
const items = (...l: string[]) => l.map((id) => ({ id }));

test("grains : une série de 412 × 48 en grains de 3 px, une carte reste sous le plafond", () => {
  const g = grains(412, 48);
  assert.equal(g.pas, 3);
  assert.equal(g.n, Math.ceil(412 / 3) * 16);
  assert.equal(g.donnees.length, g.n * CHAMPS);
  const carte = grains(412, 196);
  assert.ok(carte.n <= D.grainsMax, `${carte.n} grains`);
  assert.ok(carte.pas > 3);
});

test("grains : le front balaie de gauche à droite, tout s'éteint avant 800 ms", () => {
  const g = grains(412, 48);
  const depart = (i: number) => g.donnees[i * CHAMPS + 2]!;
  const gauche = depart(0);
  const droite = depart(Math.ceil(412 / 3) - 1);
  assert.ok(droite > gauche + 150, `${gauche} puis ${droite}`);
  for (let i = 0; i < g.n; i++) assert.ok(depart(i) >= 0);
  assert.ok(g.fin > D.resserreA + D.resserre && g.fin < 800, `fin ${g.fin}`);
  assert.deepEqual(grains(412, 48).donnees, g.donnees);
});

test("poserGrain : en place avant le départ, dérive vers la droite et le haut, échelle 0 une fois éteint", () => {
  const g = grains(120, 30);
  const pose = (i: number, u: number) => {
    let r: number[] = [0, 0, 0, 0];
    poserGrain(g.donnees, i, u, 2.625, 40, { set: (...a: number[]) => (r = a) });
    return r as [number, number, number, number];
  };
  const i = 5;
  const [x, y, dep] = [g.donnees[i * CHAMPS]!, g.donnees[i * CHAMPS + 1]!, g.donnees[i * CHAMPS + 2]!];
  assert.deepEqual(pose(i, dep - 1), [1 / 2.625, 0, x, y + 40]);
  const milieu = pose(i, dep + 100);
  assert.ok(milieu[2] > x && milieu[3] < y + 40);
  assert.ok(milieu[0] < 1 / 2.625 && milieu[0] > 0);
  assert.equal(pose(i, g.fin + 1)[0], 0);
  assert.equal(opaciteGrain(g.donnees, i, dep - 1), 1);
  assert.ok(opaciteGrain(g.donnees, i, dep + 100) < 1);
  assert.equal(opaciteGrain(g.donnees, i, g.fin + 1), 0);
});

test("bezier : bornes et courbe de sortie qui part vite", () => {
  const f = bezier(0.23, 1, 0.32, 1);
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
  assert.ok(f(0.2) > 0.6);
});

test("marques : consommées une fois, périmées après 15 s", () => {
  marquerSuppression(["m1", "m2"]);
  marquerSuppression("m3", 220);
  assert.equal(prendreMarque("m1"), 0);
  assert.equal(prendreMarque("m1"), null);
  assert.equal(prendreMarque("m2", Date.now() + DUREE_MARQUE + 1), null);
  assert.equal(prendreMarque("m3"), 220);
  assert.equal(prendreMarque("inconnue"), null);
});

test("fusionner : l'élément supprimé et marqué reste en fantôme à sa place ; sans marque, il part sec", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b", "c"), cle, () => null, parties);
  assert.deepEqual(ids(a), ["a:vu", "b:vu", "c:vu"]);
  const b = fusionner(a, items("a", "c"), cle, (k) => (k === "b" ? 0 : null), parties);
  assert.deepEqual(ids(b), ["a:vu", "b:sort", "c:vu"]);
  assert.equal(b[1]!.delai, 0);
  // Un rendu de plus pendant la sortie : le fantôme reste, sans nouvelle marque.
  const c = fusionner(b, items("a", "c", "d"), cle, () => null, parties);
  assert.deepEqual(ids(c), ["a:vu", "b:sort", "c:vu", "d:vu"]);
  assert.deepEqual(ids(retirerFantome(c, "b")), ["a:vu", "c:vu", "d:vu"]);
  // Disparition sans marque (filtre, repli) : pas de fantôme.
  assert.deepEqual(ids(fusionner(c, items("a"), cle, () => null, new Set())), ["a:vu", "b:sort"]);
  assert.deepEqual(ids(fusionner(retirerFantome(c, "b"), items("a"), cle, () => null, new Set())), ["a:vu"]);
});

test("fusionner : premier élément supprimé, plusieurs d'un coup, et retour par Annuler", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b", "c", "d"), cle, () => null, parties);
  const b = fusionner(a, items("c"), cle, (k) => (k !== "c" ? 0 : null), parties);
  assert.deepEqual(ids(b), ["a:sort", "b:sort", "c:vu", "d:sort"]);
  const fini = retirerFantome(retirerFantome(retirerFantome(b, "a"), "b"), "d");
  const retour = fusionner(fini, items("b", "c"), cle, () => null, parties);
  assert.deepEqual(ids(retour), ["b:entre", "c:vu"]);
  // L'entrée ne se rejoue pas au rendu suivant.
  assert.deepEqual(ids(fusionner(retour, items("b", "c"), cle, () => null, parties)), ["b:vu", "c:vu"]);
});

test("fusionner : Annuler pendant la sortie, le même élément repasse à « entre »", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b"), cle, () => null, parties);
  const b = fusionner(a, items("a"), cle, () => 220, parties);
  assert.equal(b[1]!.delai, 220);
  assert.equal(fusionner(b, items("a"), cle, () => null, parties)[1]!.delai, 220);
  assert.deepEqual(ids(fusionner(b, items("a", "b"), cle, () => null, parties)), ["a:vu", "b:entre"]);
});

test("fusionner : avec `nouveaux`, un ajout entre ; un remplacement (même longueur) change sur place ; rien au premier rendu", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b"), cle, () => null, parties, true);
  assert.deepEqual(ids(a), ["a:vu", "b:vu"]);
  const b = fusionner(a, items("a", "b", "c"), cle, () => null, parties, true);
  assert.deepEqual(ids(b), ["a:vu", "b:vu", "c:entre"]);
  assert.deepEqual(ids(fusionner(b, items("a", "x", "c"), cle, () => null, parties, true)), ["a:vu", "x:vu", "c:vu"]);
  assert.deepEqual(ids(fusionner(a, items("a", "b", "c"), cle, () => null, parties)), ["a:vu", "b:vu", "c:vu"]);
});

test("clesParRang : la série supprimée perd sa clé, les suivantes gardent la leur ; ajout en fin", () => {
  let n = 0;
  const neuve = () => `k${n++}`;
  const a = clesParRang([], 3, null, neuve);
  assert.deepEqual(a, ["k0", "k1", "k2"]);
  assert.deepEqual(clesParRang(a, 2, 1, neuve), ["k0", "k2"]);
  assert.deepEqual(clesParRang(a, 4, null, neuve), ["k0", "k1", "k2", "k3"]);
  assert.deepEqual(clesParRang(a, 2, null, neuve), ["k0", "k1"]);
  assert.deepEqual(clesParRang(a, 3, 1, neuve), a);
});

test("fusionner (`nouveaux`) : ajout en fin et au milieu, l'élément ajouté entre, les autres ne bougent pas", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("s1", "s2"), cle, () => null, parties, true);
  const fin = fusionner(a, items("s1", "s2", "s3"), cle, () => null, parties, true);
  assert.deepEqual(ids(fin), ["s1:vu", "s2:vu", "s3:entre"]);
  // Le rendu suivant (rechargement) : l'élément ajouté est connu, il est « vu » ; sa vue, de même clé, finit son ouverture.
  assert.deepEqual(ids(fusionner(fin, items("s1", "s2", "s3"), cle, () => null, parties, true)), ["s1:vu", "s2:vu", "s3:vu"]);
  assert.deepEqual(ids(fusionner(a, items("s1", "x", "s2"), cle, () => null, parties, true)), ["s1:vu", "x:entre", "s2:vu"]);
});

test("fusionner : ajout d'un exercice à la séance, la carte (bloc) entre ; un superset garde sa clé", () => {
  type Bloc = { groupe: number | null; exercices: string[] };
  const cleBloc = (b: Bloc) => (b.groupe != null ? `g${b.groupe}` : b.exercices[0]!);
  const parties = new Set<string>();
  const avant = fusionner([], [{ groupe: null, exercices: ["dc"] }, { groupe: 1, exercices: ["tr", "bi"] }], cleBloc, () => null, parties, true);
  const apres = fusionner(avant, [{ groupe: null, exercices: ["dc"] }, { groupe: 1, exercices: ["tr", "bi"] }, { groupe: null, exercices: ["sq"] }], cleBloc, () => null, parties, true);
  assert.deepEqual(apres.map((e) => `${e.cle}:${e.etat}`), ["dc:vu", "g1:vu", "sq:entre"]);
});

test("fusionner : un réordonnancement (même ensemble) ne fait rien entrer ni sortir", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b", "c"), cle, () => null, parties, true);
  assert.deepEqual(ids(fusionner(a, items("c", "a", "b"), cle, () => null, parties, true)), ["c:vu", "a:vu", "b:vu"]);
  // Même si une marque traîne (glisser qui a touché une ligne) : rien n'a disparu, rien ne sort.
  assert.deepEqual(ids(fusionner(a, items("b", "c", "a"), cle, () => 0, parties, true)), ["b:vu", "c:vu", "a:vu"]);
  assert.equal(parties.size, 0);
});

test("fusionner (`nouveaux`) : suppression puis Annuler, l'élément revient à sa place en « entre »", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b", "c"), cle, () => null, parties, true);
  const sortie = fusionner(a, items("a", "c"), cle, (k) => (k === "b" ? 0 : null), parties, true);
  assert.deepEqual(ids(sortie), ["a:vu", "b:sort", "c:vu"]);
  assert.deepEqual(ids(fusionner(sortie, items("a", "b", "c"), cle, () => null, parties, true)), ["a:vu", "b:entre", "c:vu"]);
  // Annuler après la fin de la sortie (fantôme retiré) : l'élément revient aussi en « entre ».
  const parties2 = new Set<string>();
  const s2 = fusionner(a, items("a", "c"), cle, (k) => (k === "b" ? 0 : null), parties2, true);
  const fini = retirerFantome(s2, "b");
  assert.deepEqual(ids(fusionner(fini, items("a", "b", "c"), cle, () => null, parties2, true)), ["a:vu", "b:entre", "c:vu"]);
});

test("fusionner (`nouveaux`) : suppression pendant un ajout, l'ajouté garde sa vue, le supprimé sort", () => {
  const parties = new Set<string>();
  const a = fusionner([], items("a", "b"), cle, () => null, parties, true);
  const ajout = fusionner(a, items("a", "b", "c"), cle, () => null, parties, true);
  assert.deepEqual(ids(ajout), ["a:vu", "b:vu", "c:entre"]);
  const res = fusionner(ajout, items("a", "c"), cle, (k) => (k === "b" ? 0 : null), parties, true);
  assert.deepEqual(ids(res), ["a:vu", "b:sort", "c:vu"]);
});

test("teintes : dégradé de la partie à 135°, clair en haut à gauche, foncé en bas à droite", () => {
  const arrets = [
    { offset: 0, couleur: "#ff8a1f" },
    { offset: 0.48, couleur: "#f2610f" },
    { offset: 1, couleur: "#e0391a" },
  ];
  const g = grains(120, 60);
  const c = teintes(g, 120, 60, arrets);
  assert.equal(c.length, g.n * 3);
  assert.ok(c.every((v) => v >= 0 && v <= 1));
  const proche = (i: number, hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const att = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    return att.every((v, k) => Math.abs(c[i * 3 + k]! - v) < 0.06);
  };
  assert.ok(proche(0, "#ff8a1f"), "premier grain (haut gauche) : orange clair");
  assert.ok(proche(g.n - 1, "#e0391a"), "dernier grain (bas droite) : orange foncé");
  // Ordre des arrêts indifférent ; une seule couleur : teinte unie.
  assert.deepEqual(teintes(g, 120, 60, [...arrets].reverse()), c);
  assert.ok(teintes(g, 120, 60, [{ offset: 0, couleur: "#16a34a" }]).every((v, i) => Math.abs(v - [0x16, 0xa3, 0x4a][i % 3]! / 255) < 1e-9));
});

test("un élément qui entre mesuré à 0 s'ouvre jusqu'à la hauteur de ses voisins", () => {
  assert.equal(hauteurOuverture(48, 52), 48);
  assert.equal(hauteurOuverture(0, 52), 52);
  assert.equal(hauteurOuverture(0, 0), 0);
});
