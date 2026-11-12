// Routine « Test VMA » dans la course guidée (planche vma-vo2max, D3, D5) : étapes lues de la routine, étape « test »,
// récupération nommée, test arrêté par une pause (3 min de récup puis les 6 min), résultat ramené à 6 min.
import assert from "node:assert/strict";
import { test } from "node:test";
import { annonceEtape, avecRelances, etapesDeRoutine, nomEtape, resultatTest, RECUP_RELANCE_S, type LigneCourse } from "../src/ecrans/etapes-course.ts";

// Les lignes de la routine du catalogue (assets/catalogue/routines/r-test-vma.json)
const TEST_VMA: LigneCourse[] = [
  { reposS: 0, zone: 2, nom: "Course", note: "échauffement : footing facile, tu peux parler", cibles: [{ distanceM: null, dureeS: 780 }] },
  { reposS: 45, zone: 5, nom: "Course", note: "accélérations : 15 s vite, puis 45 s de trot", cibles: [{ distanceM: null, dureeS: 15 }, { distanceM: null, dureeS: 15 }] },
  { reposS: 0, zone: 1, nom: "Course", note: "récupération : trot ou marche, le test arrive", cibles: [{ distanceM: null, dureeS: 120 }] },
  { reposS: 0, zone: 5, nom: "Course", note: "test VMA : 6 min à fond, le plus loin possible, à allure régulière", cibles: [{ distanceM: null, dureeS: 360 }] },
  { reposS: 0, zone: 1, nom: "Course", note: "retour au calme : footing très lent, puis marche", cibles: [{ distanceM: null, dureeS: 600 }] },
];

test("étapes du test VMA : échauffement, 2 accélérations et leur récup, récupération, test, retour au calme", () => {
  const e = etapesDeRoutine(TEST_VMA);
  assert.deepEqual(e.map((x) => x.genre), ["echauffement", "effort", "recup", "effort", "recup", "test", "retour"]);
  assert.deepEqual(e.map((x) => x.dureeS), [780, 15, 45, 15, 120, 360, 600]);
  assert.equal(nomEtape(e[5]!), "Test VMA");
  assert.equal(annonceEtape(e[5]), "Test VMA : 6 minutes à fond, à allure régulière.");
  assert.equal(nomEtape(e[4]!), "Récup");
  // une routine de course d'avant ne change pas (la note de récupération d'un bloc répété)
  const fract = etapesDeRoutine([
    { reposS: 0, zone: 2, note: "échauffement", cibles: [{ distanceM: null, dureeS: 900 }] },
    { reposS: 120, zone: 4, note: "récupération en trottinant", cibles: [{ distanceM: 1000, dureeS: null }, { distanceM: 1000, dureeS: null }] },
    { reposS: 0, zone: 2, note: "retour au calme", cibles: [{ distanceM: null, dureeS: 600 }] },
  ]);
  assert.deepEqual(fract.map((x) => x.genre), ["echauffement", "effort", "recup", "effort", "retour"]);
});

test("D3 : test arrêté par une pause, une récup de 3 min puis les 6 min ; deux fois de suite aussi", () => {
  const e = etapesDeRoutine(TEST_VMA);
  const une = avecRelances(e, [5]);
  assert.deepEqual(une.map((x) => x.genre), ["echauffement", "effort", "recup", "effort", "recup", "test", "recup", "test", "retour"]);
  assert.equal(une[6]!.dureeS, RECUP_RELANCE_S);
  assert.equal(une[7]!.dureeS, 360);
  const deux = avecRelances(e, [5, 7]);
  assert.deepEqual(deux.map((x) => x.genre).slice(5), ["test", "recup", "test", "recup", "test", "retour"]);
  // une relance sur une étape qui n'est pas un test est ignorée
  assert.deepEqual(avecRelances(e, [0]), e);
});

test("résultat : la distance du dernier test fini, ramenée à 6 min ; un test passé trop tôt n'en donne pas", () => {
  const e = etapesDeRoutine(TEST_VMA);
  // tours : un par étape finie (s en ms, d en m) ; le test (étape 5) de 1 140 s à 1 501 s : 1 516,2 m en 361 s
  const tours = [
    { s: 780_000, d: 2100 }, { s: 795_000, d: 2160 }, { s: 840_000, d: 2260 }, { s: 855_000, d: 2320 }, { s: 975_000, d: 2560 },
    { s: 1_336_000, d: 2560 + 1516.2 },
  ];
  const r = resultatTest(e, [], tours)!;
  assert.equal(r.i, 5);
  assert.ok(Math.abs(r.distanceM - (1516.2 * 360) / 361) < 0.01);
  // le test n'est pas fini : rien
  assert.equal(resultatTest(e, [], tours.slice(0, 5)), null);
  // « Étape » touché au bout de 3 min : rien
  assert.equal(resultatTest(e, [], [...tours.slice(0, 5), { s: 1_155_000, d: 3300 }]), null);
  // test relancé : le second compte, pas le premier (interrompu)
  const r2 = avecRelances(e, [5]);
  const toursR = [...tours.slice(0, 5), { s: 1_100_000, d: 3000 }, { s: 1_280_000, d: 3300 }, { s: 1_640_000, d: 3300 + 1490 }];
  assert.ok(Math.abs(resultatTest(r2, [5], toursR)!.distanceM - 1490) < 0.01);
});

test("la routine du catalogue, ajoutée depuis la boutique (fr et en), donne les étapes du test", async () => {
  const { readFileSync } = await import("node:fs");
  const { baseDeTest } = await import("./aide.ts");
  const { ajouterRoutineBoutique } = await import("../src/db/depots/plans.ts");
  const { lireRoutine } = await import("../src/db/depots/routines.ts");
  const { lignesCourse } = await import("../src/ecrans/etapes-course.ts");
  const r = JSON.parse(readFileSync(new URL("../assets/catalogue/routines/r-test-vma.json", import.meta.url), "utf8"));
  for (const langue of ["fr", "en"] as const) {
    const { db } = await baseDeTest(true);
    const id = await ajouterRoutineBoutique(db, r, langue);
    const e = etapesDeRoutine(lignesCourse((await lireRoutine(db, id))!));
    assert.deepEqual(e.map((x) => x.genre), ["echauffement", "effort", "recup", "effort", "recup", "test", "retour"], langue);
    assert.deepEqual(e.map((x) => x.dureeS), [780, 15, 45, 15, 120, 360, 600], langue);
  }
});
