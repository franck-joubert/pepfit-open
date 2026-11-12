import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ajouterExerciceARoutine, creerRoutine, dupliquerRoutine, listerRoutines, supprimerRoutine } from "../src/db/depots/routines.ts";
import {
  creerSection, deplacerRoutineVers, deplacerSection, grouperParSection, listerSections, placerRoutine, rangerRoutine, renommerSection, reordonnerSections,
  replierSection, sectionParDefaut, sectionParNom, supprimerSection,
} from "../src/db/depots/sections.ts";
import { migrer, SECTION_ROUTINES } from "../src/db/migrations.ts";
import { importerRoutinesHevyTexte } from "../src/import/importer.ts";
import {
  APPUI_LONG_MS, ciblePlusProche, ciblesRoutine, decalageSection, decalagesRoutine, HAUTEUR_SECTION, MILIEU_ENTETE, rangVise, TOLERANCE_PX, type Rangee,
} from "../src/ecrans/ordre-sections.ts";
import { demarreBalayer } from "../src/ecrans/balayer.ts";
import { TABLES_SYNC } from "../src/sync/schema.ts";
import { adapter, baseDeTest } from "./aide.ts";

/** Les routines par section, en noms : [[section, [routines…]], …]. */
async function vue(db: Awaited<ReturnType<typeof baseDeTest>>["db"]) {
  return grouperParSection(await listerSections(db), await listerRoutines(db)).map((g) => [g.section.nom, g.routines.map((r) => r.nom)]);
}

test("migration 21 : les routines existantes vont dans la section « Routines », rien d'autre ne bouge", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 20);
  raw.exec(`INSERT INTO routines (id,nom,note,ordre,cree_le,maj_le) VALUES ('r1','Push','n',0,1,5),('r2','Pull',NULL,1,2,6);
    INSERT INTO seances (id,debut,maj_le,routine_id) VALUES ('s1',1,1,'r2');`);
  await migrer(db);
  assert.deepEqual(await listerSections(db), [{ id: SECTION_ROUTINES, nom: "Routines", ordre: 0, repliee: false }]);
  assert.deepEqual(raw.prepare("SELECT id, nom, note, ordre, section_id FROM routines ORDER BY ordre").all().map((r) => ({ ...r })), [
    { id: "r1", nom: "Push", note: "n", ordre: 0, section_id: SECTION_ROUTINES },
    { id: "r2", nom: "Pull", note: null, ordre: 1, section_id: SECTION_ROUTINES },
  ]);
  assert.equal((raw.prepare("SELECT routine_id FROM seances WHERE id = 's1'").get() as { routine_id: string }).routine_id, "r2");
  // Journal de synchro : la section part comme les autres tables.
  assert.ok(raw.prepare("SELECT 1 FROM sync_journal WHERE tab = 'routine_sections' AND cle = ?").get(SECTION_ROUTINES));
});

test("synchro : routine_sections est synchronisée, avant les routines qui la référencent", () => {
  const noms = TABLES_SYNC.map((t) => t.nom);
  assert.ok(noms.includes("routine_sections"));
  assert.ok(noms.indexOf("routine_sections") < noms.indexOf("routines"));
});

test("base neuve : une section « Routines » ; une routine créée va dans la première section, en fin", async () => {
  const { db } = await baseDeTest();
  const cardio = await creerSection(db, "  Cardio ");
  await reordonnerSections(db, [cardio, SECTION_ROUTINES]);
  await creerRoutine(db, "A", []);
  await creerRoutine(db, "B", [], SECTION_ROUTINES);
  assert.deepEqual(await vue(db), [["Cardio", ["A"]], ["Routines", ["B"]]]);
});

test("ordre des sections : créer en fin, monter, descendre, glisser ; replier et renommer", async () => {
  const { db } = await baseDeTest();
  const a = await creerSection(db, "A");
  const b = await creerSection(db, "B");
  assert.deepEqual((await listerSections(db)).map((s) => s.nom), ["Routines", "A", "B"]);
  await deplacerSection(db, b, -1);
  assert.deepEqual((await listerSections(db)).map((s) => s.nom), ["Routines", "B", "A"]);
  await deplacerSection(db, SECTION_ROUTINES, -1); // déjà en haut : rien
  await deplacerSection(db, a, 1); // déjà en bas : rien
  assert.deepEqual((await listerSections(db)).map((s) => s.nom), ["Routines", "B", "A"]);
  await reordonnerSections(db, [a, SECTION_ROUTINES, b]);
  assert.deepEqual((await listerSections(db)).map((s) => s.nom), ["A", "Routines", "B"]);
  await replierSection(db, b, true);
  await renommerSection(db, a, " Jambes ");
  assert.deepEqual((await listerSections(db)).map((s) => [s.nom, s.repliee]), [["Jambes", false], ["Routines", false], ["B", true]]);
});

test("déplacer une routine : elle arrive en fin de la section visée ; une copie reste dans sa section", async () => {
  const { db } = await baseDeTest();
  const s = await creerSection(db, "Push / Pull");
  const r1 = await creerRoutine(db, "R1", []);
  await creerRoutine(db, "R2", [], s);
  await creerRoutine(db, "R3", []);
  await deplacerRoutineVers(db, r1, s);
  assert.deepEqual(await vue(db), [["Routines", ["R3"]], ["Push / Pull", ["R2", "R1"]]]);
  await dupliquerRoutine(db, r1);
  assert.deepEqual(await vue(db), [["Routines", ["R3"]], ["Push / Pull", ["R2", "R1", "R1 (copie)"]]]);
});

test("routine sans section ou à section disparue : rangée dans la première", () => {
  const sections = [
    { id: "a", nom: "A", ordre: 0, repliee: false },
    { id: "b", nom: "B", ordre: 1, repliee: false },
  ];
  const g = grouperParSection(sections, [
    { nom: "x", sectionId: "b" },
    { nom: "y", sectionId: null },
    { nom: "z", sectionId: "disparue" },
  ]);
  assert.deepEqual(g.map((x) => [x.section.id, x.routines.map((r) => r.nom)]), [["a", ["y", "z"]], ["b", ["x"]]]);
  assert.deepEqual(grouperParSection([], [{ sectionId: null }]), []);
});

test("supprimer une section : ses routines vont en fin d'une autre, dans leur ordre", async () => {
  const { db } = await baseDeTest();
  const pp = await creerSection(db, "Push / Pull");
  await creerRoutine(db, "Haut", []);
  await creerRoutine(db, "Push", [], pp);
  await creerRoutine(db, "Pull", [], pp);
  await supprimerSection(db, pp, { vers: SECTION_ROUTINES });
  assert.deepEqual(await vue(db), [["Routines", ["Haut", "Push", "Pull"]]]);
});

test("supprimer une section avec ses routines : les séances passées restent, sans routine", async () => {
  const { db } = await baseDeTest();
  const pp = await creerSection(db, "Push / Pull");
  await creerRoutine(db, "Haut", []);
  const push = await creerRoutine(db, "Push", [], pp);
  await db.runAsync("INSERT INTO seances (id, debut, maj_le, routine_id) VALUES ('s1', 1, 1, ?)", [push]);
  await supprimerSection(db, pp, "supprimer");
  assert.deepEqual(await vue(db), [["Routines", ["Haut"]]]);
  assert.deepEqual({ ...(await db.getFirstAsync<{ id: string; routine_id: string | null }>("SELECT id, routine_id FROM seances", [])) }, { id: "s1", routine_id: null });
});

test("supprimer la première section emporte aussi les routines sans section qui s'y affichaient", async () => {
  const { db } = await baseDeTest();
  const b = await creerSection(db, "B");
  const r = await creerRoutine(db, "Orpheline", []);
  await db.runAsync("UPDATE routines SET section_id = NULL WHERE id = ?", [r]);
  await supprimerSection(db, SECTION_ROUTINES, { vers: b });
  assert.deepEqual(await vue(db), [["B", ["Orpheline"]]]);
});

test("plus aucune section : « Routines » est recréée pour une nouvelle routine", async () => {
  const { db } = await baseDeTest();
  await supprimerSection(db, SECTION_ROUTINES, "supprimer");
  assert.deepEqual(await listerSections(db), []);
  await creerRoutine(db, "Neuve", []);
  assert.deepEqual(await vue(db), [["Routines", ["Neuve"]]]);
  assert.equal(await sectionParDefaut(db), SECTION_ROUTINES);
});

test("sectionParNom : reprend une section du même nom (casse et espaces ignorés), sinon la crée en fin", async () => {
  const { db } = await baseDeTest();
  assert.equal(await sectionParNom(db, " routines "), SECTION_ROUTINES);
  const force = await sectionParNom(db, "Force");
  assert.equal(await sectionParNom(db, "FORCE"), force);
  assert.deepEqual((await listerSections(db)).map((s) => s.nom), ["Routines", "Force"]);
});

// Données inventées, au format de l'API Hevy v1.
const routineHevy = (id: string, title: string, folder_id: number | null) => ({
  id, title, folder_id, notes: null,
  exercises: [{ index: 0, title: "Pull Up", notes: null, superset_id: null, rest_seconds: 90, sets: [{ index: 0, type: "normal", weight_kg: null, reps: 8 }] }],
});
const HEVY = JSON.stringify({
  routine_folders: [
    { id: 2, index: 1, title: "Mobilité" },
    { id: 1, index: 0, title: "Force" },
  ],
  routines: [routineHevy("a", "Sans dossier", null), routineHevy("b", "Souplesse", 2), routineHevy("c", "Haut", 1), routineHevy("d", "Bas", 1)],
});

test("import Hevy : chaque dossier devient une section, dans l'ordre Hevy ; sans dossier, « Routines » ; réimport sans doublon", async () => {
  const { db } = await baseDeTest(true);
  await creerSection(db, "force"); // déjà là : reprise
  const r = await importerRoutinesHevyTexte(db, HEVY);
  assert.equal(r.routinesImportees, 4);
  assert.deepEqual(await vue(db), [
    ["Routines", ["Sans dossier"]],
    ["force", ["Haut", "Bas"]],
    ["Mobilité", ["Souplesse"]],
  ]);
  await importerRoutinesHevyTexte(db, HEVY);
  assert.equal((await listerSections(db)).length, 3);
});

test("glisser des sections : rang visé sous le doigt et écart des voisines", () => {
  assert.equal(rangVise(MILIEU_ENTETE, 4), 0);
  assert.equal(rangVise(MILIEU_ENTETE + 2 * HAUTEUR_SECTION + 20, 4), 2);
  assert.equal(rangVise(-200, 4), 0);
  assert.equal(rangVise(5000, 4), 3);
  // La 1 tenue descend au rang 3 : les 2 et 3 remontent d'un cran, la 0 ne bouge pas.
  assert.deepEqual([0, 2, 3].map((k) => decalageSection(k, 1, 3)), [0, -HAUTEUR_SECTION, -HAUTEUR_SECTION]);
  // La 3 tenue monte au rang 1 : les 1 et 2 descendent.
  assert.deepEqual([0, 1, 2].map((k) => decalageSection(k, 3, 1)), [0, HAUTEUR_SECTION, HAUTEUR_SECTION]);
});

test("placerRoutine : dans sa section, vers une autre, vers une vide, rang borné", () => {
  const g = [
    { sectionId: "a", ids: ["r1", "r2", "r3"] },
    { sectionId: "b", ids: ["r4"] },
    { sectionId: "c", ids: [] },
  ];
  const vue = (l: typeof g) => l.map((x) => x.ids);
  assert.deepEqual(vue(placerRoutine(g, "r1", "a", 2)), [["r2", "r3", "r1"], ["r4"], []]);
  assert.deepEqual(vue(placerRoutine(g, "r3", "b", 0)), [["r1", "r2"], ["r3", "r4"], []]);
  assert.deepEqual(vue(placerRoutine(g, "r2", "c", 0)), [["r1", "r3"], ["r4"], ["r2"]]);
  assert.deepEqual(vue(placerRoutine(g, "r1", "b", 99)), [["r2", "r3"], ["r4", "r1"], []]);
  assert.deepEqual(vue(placerRoutine(g, "r1", "inconnue", 0)), vue(g));
  assert.deepEqual(vue(g), [["r1", "r2", "r3"], ["r4"], []]); // l'entrée n'est pas modifiée
});

test("rangerRoutine : l'ordre est enregistré (et journalisé) ; seules les routines qui bougent sont écrites", async () => {
  const { db } = await baseDeTest();
  const b = await creerSection(db, "B");
  const vide = await creerSection(db, "Vide");
  const r1 = await creerRoutine(db, "R1", []);
  await creerRoutine(db, "R2", []);
  const r3 = await creerRoutine(db, "R3", []);
  await creerRoutine(db, "R4", [], b);
  await rangerRoutine(db, r3, SECTION_ROUTINES, 0);
  assert.deepEqual(await vue(db), [["Routines", ["R3", "R1", "R2"]], ["B", ["R4"]], ["Vide", []]]);
  await rangerRoutine(db, r1, b, 0);
  assert.deepEqual(await vue(db), [["Routines", ["R3", "R2"]], ["B", ["R1", "R4"]], ["Vide", []]]);
  await rangerRoutine(db, r1, vide, 0);
  assert.deepEqual(await vue(db), [["Routines", ["R3", "R2"]], ["B", ["R4"]], ["Vide", ["R1"]]]);
  // Reposer à la même place : rien n'est écrit.
  const avant = await db.getAllAsync<{ id: string; maj_le: number }>("SELECT id, maj_le FROM routines ORDER BY id", []);
  await rangerRoutine(db, r1, vide, 0);
  assert.deepEqual(await db.getAllAsync("SELECT id, maj_le FROM routines ORDER BY id", []), avant);
  const journal = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'routines'", []);
  assert.ok((journal?.n ?? 0) > 0);
});

test("rangerRoutine : une routine sans section, affichée dans la première, garde sa place quand une autre bouge", async () => {
  const { db } = await baseDeTest();
  const b = await creerSection(db, "B");
  const o = await creerRoutine(db, "Orpheline", []);
  const r = await creerRoutine(db, "R", []);
  await db.runAsync("UPDATE routines SET section_id = NULL WHERE id = ?", [o]);
  await rangerRoutine(db, r, SECTION_ROUTINES, 0);
  assert.deepEqual(await vue(db), [["Routines", ["R", "Orpheline"]], ["B", []]]);
  await rangerRoutine(db, o, b, 0);
  assert.deepEqual(await vue(db), [["Routines", ["R"]], ["B", ["Orpheline"]]]);
});

test("import Hevy après un glisser : les routines importées arrivent en fin, l'ordre glissé ne bouge pas", async () => {
  const { db } = await baseDeTest(true);
  const x = await creerRoutine(db, "X", []);
  await creerRoutine(db, "Y", []);
  await rangerRoutine(db, x, SECTION_ROUTINES, 1);
  await importerRoutinesHevyTexte(db, HEVY);
  assert.deepEqual((await vue(db))[0], ["Routines", ["Y", "X", "Sans dossier"]]);
});

// Liste à plat : A (ouverte : c1 100, c2 100), B (repliée), C (ouverte, vide). En-têtes 56, cadre vide 72.
const LISTE: Rangee[] = [
  { genre: "tete", sectionId: "A", ouverte: true, h: 56 },
  { genre: "carte", id: "c1", sectionId: "A", h: 100 },
  { genre: "carte", id: "c2", sectionId: "A", h: 100 },
  { genre: "tete", sectionId: "B", ouverte: false, h: 56 },
  { genre: "tete", sectionId: "C", ouverte: true, h: 56 },
  { genre: "vide", sectionId: "C", h: 72 },
];

test("glisser une routine : places possibles, place visée sous le doigt, écart des voisines", () => {
  const c = ciblesRoutine(LISTE, 1); // c1 tenue
  assert.deepEqual(c.map((x) => x.cible), [
    { sectionId: "A", rang: 0, ecart: true },
    { sectionId: "A", rang: 1, ecart: true },
    { sectionId: "B", rang: 0, ecart: false },
    { sectionId: "C", rang: 0, ecart: false },
  ]);
  // Sans bouger, c1 reste à sa place (milieu 56 + 50).
  assert.deepEqual(ciblePlusProche(c, 106)!.cible, { sectionId: "A", rang: 0, ecart: true });
  // Descendue d'une carte : après c2 ; c2 remonte pour lui laisser la place.
  const apres = ciblePlusProche(c, 206)!;
  assert.deepEqual(apres.cible, { sectionId: "A", rang: 1, ecart: true });
  assert.deepEqual(decalagesRoutine(LISTE, 1, apres), [0, 0, -100, 0, 0, 0]);
  // Sur l'en-tête de B, repliée : rien ne s'écarte, tout ce qui suit c1 remonte de sa hauteur.
  const surB = ciblePlusProche(c, 56 + 100 + 28)!;
  assert.deepEqual(surB.cible, { sectionId: "B", rang: 0, ecart: false });
  assert.deepEqual(decalagesRoutine(LISTE, 1, surB), [0, 0, -100, -100, -100, -100]);
  // Tout en bas : le cadre de C, section vide.
  assert.deepEqual(ciblePlusProche(c, 1000)!.cible, { sectionId: "C", rang: 0, ecart: false });
  // c2 tenue remontée au-dessus de c1 : c1 descend.
  const c2 = ciblesRoutine(LISTE, 2);
  const haut = ciblePlusProche(c2, 56 + 50)!;
  assert.deepEqual(haut.cible, { sectionId: "A", rang: 0, ecart: true });
  assert.deepEqual(decalagesRoutine(LISTE, 2, haut), [0, 100, 0, 0, 0, 0]);
});

test("balayer une routine : même suppression qu'ailleurs, synchronisée ; l'ordre restant ne bouge pas", async () => {
  const { db } = await baseDeTest(true);
  const b = await creerSection(db, "B");
  await creerRoutine(db, "R1", []);
  const r2 = await creerRoutine(db, "R2", []);
  await creerRoutine(db, "R3", []);
  await creerRoutine(db, "R4", [], b);
  const ex = await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices LIMIT 1", []);
  await ajouterExerciceARoutine(db, r2, ex!.id);
  await db.runAsync("INSERT INTO seances (id, debut, maj_le, routine_id) VALUES ('s1', 1, 1, ?)", [r2]);
  await supprimerRoutine(db, r2);
  assert.deepEqual(await vue(db), [["Routines", ["R1", "R3"]], ["B", ["R4"]]]);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM routine_exercices WHERE routine_id = ?", [r2]))?.n, 0);
  assert.equal((await db.getFirstAsync<{ r: string | null }>("SELECT routine_id AS r FROM seances WHERE id = 's1'", []))?.r, null);
  assert.equal((await db.getFirstAsync<{ s: number }>("SELECT supprime AS s FROM sync_journal WHERE tab = 'routines' AND cle = ?", [r2]))?.s, 1);
  // Un glisser après la suppression reste juste.
  const r4 = (await listerRoutines(db)).find((r) => r.nom === "R4")!.id;
  await rangerRoutine(db, r4, SECTION_ROUTINES, 1);
  assert.deepEqual(await vue(db), [["Routines", ["R1", "R4", "R3"]], ["B", []]]);
});

test("balayer ou réordonner : un geste qui lance le balayage a déjà annulé l'appui long", () => {
  assert.ok(APPUI_LONG_MS > 0);
  for (let dx = -40; dx <= 0; dx++) {
    for (let dy = -30; dy <= 30; dy++) {
      if (demarreBalayer(dx, dy)) assert.ok(Math.hypot(dx, dy) > TOLERANCE_PX, `${dx},${dy}`);
    }
  }
  // Un appui long qui bouge à peine ne balaie pas.
  assert.equal(demarreBalayer(-TOLERANCE_PX, 0), false);
});
