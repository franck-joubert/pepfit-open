import assert from "node:assert/strict";
import { test } from "node:test";
import { listerRoutines, lireRoutine } from "../src/db/depots/routines.ts";
import { ErreurImport } from "../src/import/hevy-csv.ts";
import { lireRoutinesHevy } from "../src/import/hevy-routines.ts";
import { importerHevyTexte, importerRoutinesHevyTexte } from "../src/import/importer.ts";
import { baseDeTest } from "./aide.ts";

// Données inventées, au format de l'API Hevy v1.
const serie = (type: string, kg: number | null, reps: number | null, autre: Record<string, unknown> = {}) => ({
  index: 0,
  type,
  weight_kg: kg,
  reps,
  distance_meters: null,
  duration_seconds: null,
  custom_metric: null,
  ...autre,
});
const indexer = <T extends { index: number }>(l: T[]) => l.map((x, index) => ({ ...x, index }));
const exo = (title: string, sets: ReturnType<typeof serie>[], autre: Record<string, unknown> = {}) => ({
  index: 0,
  title,
  notes: null,
  exercise_template_id: "TPL",
  superset_id: null,
  rest_seconds: 90,
  sets: indexer(sets),
  ...autre,
});
const ROUTINES = {
  dossiers: [
    { id: 22, index: 1, title: "Mobilité" },
    { id: 11, index: 0, title: "Force" },
  ],
  routines: [
    {
      id: "r-sans-dossier",
      title: "Bricolage",
      folder_id: null,
      notes: null,
      exercises: indexer([exo("Gainage Fantaisie", [serie("normal", null, null, { duration_seconds: 45 })])]),
    },
    {
      id: "r-mobi",
      title: "Souplesse du matin",
      folder_id: 22,
      notes: "Doucement",
      exercises: indexer([
        exo("Étirement Imaginaire", [serie("normal", null, null, { duration_seconds: 30 }), serie("normal", null, null, { duration_seconds: 30 })], { rest_seconds: null }),
        exo("Rameur Inventé", [serie("normal", null, null, { distance_meters: 500, duration_seconds: 120 })]),
      ]),
    },
    {
      id: "r-force",
      title: "Haut du corps",
      folder_id: 11,
      notes: null,
      exercises: indexer([
        exo("Pull Up", [serie("warmup", null, 5), serie("normal", 0, 8)], { superset_id: 3, rest_seconds: 45, notes: "Lent" }),
        exo("Lat Pulldown (Cable)", [serie("normal", 60, null, { rep_range: { start: 8, end: 12 } }), serie("dropset", 50, 12)], { superset_id: 3, rest_seconds: 75 }),
        exo("Bench Press (Smith Machine)", [serie("warmup", 40, 15)], { rest_seconds: 120, notes: "Échauffement" }),
        exo("Bench Press (Smith Machine)", [serie("normal", 70, 8), serie("failure", 70, 6)], { rest_seconds: 0, notes: "Lourd" }),
        exo("Chin Up", [serie("normal", null, 10)], { superset_id: 9 }),
        exo("Push Up - Close Grip", [serie("normal", null, 12)]),
      ]),
    },
  ],
};
const JSON_ROUTINES = JSON.stringify(ROUTINES);

test("lecture des routines : dossiers dans l'ordre Hevy, sans dossier à la fin, séries, plages, supersets, doublons fusionnés", () => {
  const { routines, erreurs } = lireRoutinesHevy(JSON_ROUTINES);
  assert.deepEqual(erreurs, []);
  assert.deepEqual(routines.map((r) => [r.titre, r.dossier]), [
    ["Haut du corps", "Force"],
    ["Souplesse du matin", "Mobilité"],
    ["Bricolage", null],
  ]);
  const force = routines[0]!;
  assert.equal(force.ref, "hevy-routine:r-force");
  assert.deepEqual(force.exercices.map((e) => e.nom), ["Pull Up", "Lat Pulldown (Cable)", "Bench Press (Smith Machine)", "Chin Up", "Push Up - Close Grip"]);
  // Superset : repos du tour sur le dernier exercice ; superset d'un seul exercice dissous.
  assert.deepEqual(force.exercices.map((e) => [e.groupeSuperset, e.reposS]), [[3, 0], [3, 75], [null, 120], [null, 90], [null, 90]]);
  assert.deepEqual(force.exercices[1]!.series[0], { type: "normale", kg: 60, reps: 8, repsMax: 12, dureeS: null, distanceM: null });
  assert.equal(force.exercices[1]!.series[1]!.type, "degressive");
  const banc = force.exercices[2]!;
  assert.deepEqual(banc.series.map((x) => x.type), ["echauffement", "normale", "rate"]);
  assert.equal(banc.note, "Échauffement\nLourd");
  assert.equal(routines[1]!.exercices[0]!.reposS, 0);
  assert.equal(routines[1]!.note, "Doucement");
});

test("lecture des routines : fichier qui n'en est pas", () => {
  assert.throws(() => lireRoutinesHevy("pas du json"), ErreurImport);
  assert.throws(() => lireRoutinesHevy('{"workouts": []}'), ErreurImport);
  assert.equal(lireRoutinesHevy(JSON.stringify(ROUTINES.routines)).routines.length, 3);
});

test("import des routines : fidèle, mêmes exercices que l'historique, idempotent", async () => {
  const { db } = await baseDeTest(true);
  // L'historique a connu ces exercices sous leur nom français.
  await importerHevyTexte(
    db,
    [
      '"title","start_time","end_time","exercise_title","set_index","set_type","weight_kg","reps"',
      '"A","1 Jan 2026, 10:00","1 Jan 2026, 11:00","Pompes - Prisé Serrée","0","normal","","10"',
      '"A","1 Jan 2026, 10:00","1 Jan 2026, 11:00","Tractions Supination","0","normal","","8"',
    ].join("\n"),
  );
  const avant = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM exercices", []);

  const r = await importerRoutinesHevyTexte(db, JSON_ROUTINES);
  assert.equal(r.routinesImportees, 3);
  assert.equal(r.seriesImportees, 13);
  assert.deepEqual(r.exercicesNonReconnus.sort(), ["Gainage Fantaisie", "Rameur Inventé", "Étirement Imaginaire"]);
  const apres = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM exercices", []);
  assert.equal(apres!.n - avant!.n, 3);

  const liste = await listerRoutines(db);
  assert.deepEqual(liste.map((x) => x.nom), ["Haut du corps", "Souplesse du matin", "Bricolage"]);
  const haut = (await lireRoutine(db, liste[0]!.id))!;
  const lignes = haut.blocs.flatMap((b) => b.lignes);
  // Mêmes exercices que l'historique : synonyme (pompes) et table (chin up).
  const pompes = await db.getFirstAsync<{ exercice_id: string }>("SELECT exercice_id FROM exercice_alias WHERE nom_norm = 'pompes prise serree'", []);
  assert.equal(lignes[4]!.exercice.id, pompes!.exercice_id);
  assert.equal(lignes[3]!.exercice.slug, "chin-up");
  assert.equal(lignes[0]!.exercice.slug, "pullups");
  assert.equal(haut.blocs.length, 4);
  assert.deepEqual(haut.blocs[0]!.lignes.map((l) => l.exercice.slug), ["pullups", "wide-grip-lat-pulldown"]);
  assert.equal(haut.blocs[0]!.reposS, 75);
  assert.deepEqual(lignes[0]!.notes.map((n) => n.texte), ["Lent"]);
  assert.deepEqual(lignes[0]!.cibles.map((c) => [c.type, c.kg, c.reps]), [["echauffement", null, 5], ["normale", 0, 8]]);
  assert.equal(lignes[1]!.plage_reps, 1);
  assert.deepEqual(lignes[1]!.cibles[0], { kg: 60, reps: 8, duree_s: null, distance_m: null, type: "normale", reps_max: 12 });
  assert.equal(lignes[2]!.nb_series, 3);
  const souplesse = (await lireRoutine(db, liste[1]!.id))!;
  assert.equal(souplesse.note, "Doucement");
  const rameur = souplesse.blocs[1]!.lignes[0]!;
  assert.deepEqual([rameur.cibles[0]!.distance_m, rameur.cibles[0]!.duree_s], [500, 120]);
  assert.equal(rameur.exercice.nature, "distance_duree");
  assert.equal(souplesse.blocs[0]!.lignes[0]!.exercice.nature, "duree");

  // Réimport : rien de nouveau.
  const encore = await importerRoutinesHevyTexte(db, JSON_ROUTINES);
  assert.equal(encore.routinesImportees, 0);
  assert.equal(encore.routinesDejaPresentes, 3);
  assert.equal((await listerRoutines(db)).length, 3);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM exercices", []))!.n, apres!.n);
});
