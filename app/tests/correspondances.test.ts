// Correspondances Hevy -> catalogue (noms génériques d'Hevy, aucune donnée perso) et fusion d'exercices.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fusionnerDoublons, fusionnerExercices, verifierFusion } from "../src/db/depots/doublons.ts";
import { demarrerSeance, ajouterSerie, cocherSerie, terminerSeance } from "../src/db/depots/seances.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { CORRESPONDANCES_HEVY, PROBABLES_HEVY } from "../src/import/correspondances.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { normaliser } from "../src/db/normaliser.ts";
import { baseDeTest } from "./aide.ts";

const EN_TETE = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
const ligne = (nom: string) => `"S","20 Oct 2026, 18:00","20 Oct 2026, 19:00","","${nom}","","","0","normal","40","10","","",""`;
type Raw = Awaited<ReturnType<typeof baseDeTest>>["raw"];
const nb = (raw: Raw, sql: string, ...p: string[]) => (raw.prepare(sql).get(...p) as { n: number }).n;

test("import : « Front Raise (Cable) » et « Machine Dips Assis » vont au catalogue, sans perso", async () => {
  const { raw, db } = await baseDeTest(true);
  const r = await importerHevyTexte(db, [EN_TETE, ligne("Front Raise (Cable)"), ligne("Machine Dips Assis")].join("\n"));
  assert.deepEqual(r.exercicesNonReconnus, []);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM exercices WHERE perso = 1"), 0);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM series WHERE exercice_id IN ('cat:front-cable-raise','cat:dip-machine')"), 2);
});

test("les équivalences « probables » ne sont pas branchées", () => {
  for (const [nom] of PROBABLES_HEVY) assert.equal(CORRESPONDANCES_HEVY.has(normaliser(nom)), false, nom);
});

test("démarrage : un perso déjà créé sous un nom de la table est fusionné, historique gardé ; idempotent", async () => {
  const { raw, db } = await baseDeTest(true);
  const natureCat = (raw.prepare("SELECT nature FROM exercices WHERE id = 'cat:front-cable-raise'").get() as { nature: string }).nature;
  raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES ('p1','Front Raise (Cable)',?,1,?,1,1)").run(normaliser("Front Raise (Cable)"), natureCat);
  raw.prepare("INSERT INTO exercice_alias (nom_norm, exercice_id, source) VALUES (?, 'p1', 'hevy')").run(normaliser("Front Raise (Cable)"));
  const s = await demarrerSeance(db, null, "x");
  await ajouterSerie(db, { seanceId: s, exerciceId: "p1", kg: 10, reps: 12 });
  raw.prepare("INSERT INTO notes (id, type, exercice_id, seance_id, texte, position, cree_le, maj_le) VALUES ('n1','exercice','p1',NULL,'ma note',0,1,1)").run();
  assert.equal(await fusionnerDoublons(db), 1);
  assert.equal(raw.prepare("SELECT id FROM exercices WHERE id = 'p1'").get(), undefined);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM series WHERE exercice_id = 'cat:front-cable-raise'"), 1);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM notes WHERE exercice_id = 'cat:front-cable-raise'"), 1);
  assert.equal(await fusionnerDoublons(db), 0);
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("démarrage : un perso d'une autre nature avec séries n'est pas fusionné par la table", async () => {
  const { raw, db } = await baseDeTest(true);
  const natureCat = (raw.prepare("SELECT nature FROM exercices WHERE id = 'cat:front-cable-raise'").get() as { nature: string }).nature;
  const autre = natureCat === "duree" ? "poids_reps" : "duree";
  raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES ('p1','Front Raise (Cable)',?,1,?,1,1)").run(normaliser("Front Raise (Cable)"), autre);
  const s = await demarrerSeance(db, null, "x");
  await ajouterSerie(db, { seanceId: s, exerciceId: "p1", dureeS: 30, kg: 5, reps: 5 });
  assert.equal(await fusionnerDoublons(db), 0);
});

async function deuxPersos(raw: Raw, db: Awaited<ReturnType<typeof baseDeTest>>["db"]) {
  raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES ('a','Mon A','mon a',1,'poids_reps',1,1)").run();
  raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES ('b','Mon B','mon b',1,'poids_reps',1,1)").run();
  const s = await demarrerSeance(db, null, "S");
  await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: "a", kg: 50, reps: 10 }), true);
  await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: "b", kg: 40, reps: 8 }), true);
  await terminerSeance(db, s);
  await creerRoutine(db, "R", [{ exerciceId: "a" }]);
  raw.prepare("INSERT INTO notes (id, type, exercice_id, seance_id, texte, position, cree_le, maj_le) VALUES ('n1','exercice','a',NULL,'note A',0,1,1)").run();
  return s;
}

test("fusionnerExercices : séries, routine, notes, alias, records ; source supprimée", async () => {
  const { raw, db } = await baseDeTest(true);
  await deuxPersos(raw, db);
  const v = await verifierFusion(db, "a", "b");
  assert.deepEqual(v, { ok: true, seances: 1, series: 1 });
  await fusionnerExercices(db, "a", "b");
  assert.equal(raw.prepare("SELECT id FROM exercices WHERE id = 'a'").get(), undefined);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM series WHERE exercice_id = 'b'"), 2);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM routine_exercices WHERE exercice_id = 'b'"), 1);
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM notes WHERE exercice_id = 'b'"), 1);
  assert.equal((raw.prepare("SELECT exercice_id FROM exercice_alias WHERE nom_norm = 'mon a'").get() as { exercice_id: string }).exercice_id, "b");
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM seance_exercices WHERE exercice_id = 'b'"), 1);
  const rec = raw.prepare("SELECT valeur FROM records WHERE exercice_id = 'b' AND type = 'charge'").get() as { valeur: number } | undefined;
  assert.equal(rec?.valeur, 50);
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("fusionnerExercices : refus (même exercice, non perso, natures différentes avec séries)", async () => {
  const { raw, db } = await baseDeTest(true);
  await deuxPersos(raw, db);
  assert.equal((await verifierFusion(db, "a", "a")).ok, false);
  await assert.rejects(fusionnerExercices(db, "a", "a"));
  assert.equal((await verifierFusion(db, "cat:padel", "a")).ok, false);
  raw.prepare("UPDATE exercices SET nature = 'duree' WHERE id = 'b'").run();
  assert.equal((await verifierFusion(db, "a", "b")).ok, false);
  await assert.rejects(fusionnerExercices(db, "a", "b"));
  assert.equal(nb(raw, "SELECT COUNT(*) AS n FROM exercices WHERE id = 'a'"), 1);
});
