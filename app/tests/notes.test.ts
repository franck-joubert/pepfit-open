import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { creerExercice, lireExercice } from "../src/db/depots/exercices.ts";
import { ajouterNote, changerTypeNote, listerNotes, modifierNote, supprimerNote } from "../src/db/depots/notes.ts";
import { creerRoutine, creerRoutineDepuisSeance, dupliquerRoutine, lireExercicesDeRoutine, lireRoutine } from "../src/db/depots/routines.ts";
import { ajouterExerciceASeance, cocherSerie, demarrerSeance, demarrerSeanceDepuisRoutine, lireSeance, modifierSeance, retirerExerciceDeSeance, supprimerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { adapter, baseDeTest } from "./aide.ts";

async function preparer() {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Presse" });
  const b = await creerExercice(db, { nom: "Leg curl" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: a }, { exerciceId: b }]);
  const [la] = await lireExercicesDeRoutine(db, r);
  return { db, a, b, r, la: la!.id };
}

const textes = async (db: Parameters<typeof listerNotes>[0], ou: Parameters<typeof listerNotes>[1], type: Parameters<typeof listerNotes>[2]) =>
  (await listerNotes(db, ou, type)).map((n) => n.texte);

test("notes : les trois types, plusieurs par type, lus en séance ; la note de routine n'est pas recopiée dans la séance", async () => {
  const { db, a, r, la } = await preparer();
  await ajouterNote(db, { exerciceId: a }, "exercice", "  siège cran 4 ");
  await ajouterNote(db, { exerciceId: a }, "exercice", "dos plaqué");
  await ajouterNote(db, { exerciceId: a, ligneId: la }, "routine", "lent en descente");
  const sid = await demarrerSeanceDepuisRoutine(db, r);
  await ajouterNote(db, { exerciceId: a, seanceId: sid }, "seance", "genou sensible");
  await ajouterNote(db, { exerciceId: a, seanceId: sid }, "seance", "pause en bas");
  const e = (await lireSeance(db, sid))!.exercices[0]!;
  assert.deepEqual(e.notesExercice.map((n) => n.texte), ["siège cran 4", "dos plaqué"]);
  assert.deepEqual(e.notesRoutine.map((n) => n.texte), ["lent en descente"]);
  assert.equal(e.ligneRoutineId, la);
  assert.deepEqual(e.notes.map((n) => n.texte), ["genou sensible", "pause en bas"]);
  assert.deepEqual((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.notesExercice.map((n) => n.texte), ["siège cran 4", "dos plaqué"]);

  // Séance libre : les notes d'exercice suivent, pas celles de routine.
  const libre = await demarrerSeance(db, null);
  await ajouterExerciceASeance(db, libre, a, { nbSeries: 1 });
  const f = (await lireSeance(db, libre))!.exercices[0]!;
  assert.equal(f.notesExercice.length, 2);
  assert.deepEqual(f.notesRoutine, []);
  assert.equal(f.ligneRoutineId, null);
  assert.deepEqual(f.notes, []);

  // Texte vide : rien d'ajouté ; une note vidée disparaît.
  assert.equal(await ajouterNote(db, { exerciceId: a, seanceId: sid }, "seance", "  "), null);
  await assert.rejects(ajouterNote(db, { exerciceId: a }, "routine", "x"));
  const [n1, n2] = e.notes;
  await modifierNote(db, n1!.id, "  ");
  assert.deepEqual(await textes(db, { exerciceId: a, seanceId: sid }, "seance"), ["pause en bas"]);
  await modifierNote(db, n2!.id, "pause 2 s en bas");
  assert.deepEqual(await textes(db, { exerciceId: a, seanceId: sid }, "seance"), ["pause 2 s en bas"]);
});

test("notes : changer le type ou supprimer n'agit que sur la note touchée", async () => {
  const { db, a, r, la } = await preparer();
  const sid = await demarrerSeanceDepuisRoutine(db, r);
  const ou = { exerciceId: a, seanceId: sid, ligneId: la };
  const x = (await ajouterNote(db, ou, "seance", "prise serrée"))!;
  const y = (await ajouterNote(db, ou, "seance", "coudes rentrés"))!;
  const z = (await ajouterNote(db, ou, "seance", "respirer"))!;

  await changerTypeNote(db, ou, y, "exercice");
  assert.deepEqual(await textes(db, ou, "seance"), ["prise serrée", "respirer"]);
  assert.deepEqual(await textes(db, ou, "exercice"), ["coudes rentrés"]);

  await changerTypeNote(db, ou, x, "exercice");
  assert.deepEqual(await textes(db, ou, "exercice"), ["coudes rentrés", "prise serrée"]);

  await changerTypeNote(db, ou, x, "routine");
  assert.deepEqual(await textes(db, ou, "routine"), ["prise serrée"]);
  assert.deepEqual(await textes(db, ou, "exercice"), ["coudes rentrés"]);

  await supprimerNote(db, z);
  assert.deepEqual(await textes(db, ou, "seance"), []);
  assert.deepEqual(await textes(db, ou, "routine"), ["prise serrée"]);
  await changerTypeNote(db, ou, "inconnue", "seance");
  assert.deepEqual(await textes(db, ou, "seance"), []);
});

test("notes : retirer l'exercice ou supprimer la séance emporte ses notes de séance, pas les autres", async () => {
  const { db, a, b, r } = await preparer();
  const sid = await demarrerSeanceDepuisRoutine(db, r);
  await ajouterNote(db, { exerciceId: a, seanceId: sid }, "seance", "A");
  await ajouterNote(db, { exerciceId: b, seanceId: sid }, "seance", "B");
  await ajouterNote(db, { exerciceId: a }, "exercice", "épinglée");
  await retirerExerciceDeSeance(db, sid, a);
  assert.deepEqual(await textes(db, { exerciceId: a, seanceId: sid }, "seance"), []);
  assert.deepEqual(await textes(db, { exerciceId: b, seanceId: sid }, "seance"), ["B"]);
  await supprimerSeance(db, sid);
  assert.deepEqual(await textes(db, { exerciceId: b, seanceId: sid }, "seance"), []);
  assert.deepEqual(await textes(db, { exerciceId: a }, "exercice"), ["épinglée"]);
});

test("notes : le champ de séance reprend les notes de séance de la séance précédente de l'exercice en placeholder", async () => {
  const { db, a, b, r } = await preparer();
  const s1 = await demarrerSeanceDepuisRoutine(db, r);
  await modifierSeance(db, s1, { debut: 1_000 });
  await ajouterNote(db, { exerciceId: a, seanceId: s1 }, "seance", "15 kg de trop");
  await ajouterNote(db, { exerciceId: a, seanceId: s1 }, "seance", "puis genou");
  await terminerSeance(db, s1, 2_000);
  const s2 = await demarrerSeanceDepuisRoutine(db, r);
  const d = (await lireSeance(db, s2))!;
  assert.equal(d.exercices[0]!.notePrecedente, "15 kg de trop\npuis genou");
  assert.deepEqual(d.exercices[0]!.notes, []);
  assert.equal(d.exercices.find((e) => e.exercice.id === b)!.notePrecedente, null);
  // La séance passée elle-même n'a pas de précédent ; une note d'exercice ou de routine n'est jamais « précédente ».
  assert.equal((await lireSeance(db, s1))!.exercices[0]!.notePrecedente, null);
  await ajouterNote(db, { exerciceId: b, seanceId: s1 }, "exercice", "épinglée");
  assert.equal((await lireSeance(db, s2))!.exercices.find((e) => e.exercice.id === b)!.notePrecedente, null);
});

test("dupliquer une routine copie toutes ses notes de routine ; les notes d'exercice restent sur l'exercice", async () => {
  const { db, a, r, la } = await preparer();
  await ajouterNote(db, { exerciceId: a, ligneId: la }, "routine", "lent");
  await ajouterNote(db, { exerciceId: a, ligneId: la }, "routine", "pause");
  await ajouterNote(db, { exerciceId: a }, "exercice", "cran 4");
  const copie = (await dupliquerRoutine(db, r))!;
  const l = (await lireRoutine(db, copie))!.blocs[0]!.lignes[0]!;
  assert.deepEqual(l.notes.map((n) => n.texte), ["lent", "pause"]);
  assert.notEqual(l.notes[0]!.id, (await listerNotes(db, { exerciceId: a, ligneId: la }, "routine"))[0]!.id);
  assert.deepEqual(l.notesExercice.map((n) => n.texte), ["cran 4"]);
});

test("enregistrer une séance comme routine garde les notes de routine de la routine d'origine", async () => {
  const { db, a, r, la } = await preparer();
  await ajouterNote(db, { exerciceId: a, ligneId: la }, "routine", "lent");
  await ajouterNote(db, { exerciceId: a, ligneId: la }, "routine", "pause");
  const sid = await demarrerSeanceDepuisRoutine(db, r);
  await ajouterNote(db, { exerciceId: a, seanceId: sid }, "seance", "ne passe pas");
  const x = (await lireSeance(db, sid))!.exercices[0]!.series[0]!;
  await cocherSerie(db, x.id, true);
  const nouvelle = (await creerRoutineDepuisSeance(db, sid))!;
  const l = (await lireRoutine(db, nouvelle))!.blocs[0]!.lignes[0]!;
  assert.deepEqual(l.notes.map((n) => n.texte), ["lent", "pause"]);
});

test("import Hevy : les notes d'exercice deviennent des notes de séance", async () => {
  const { db, a } = await preparer();
  void a;
  const csv = [
    '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
    '"Push","25 Oct 2026, 10:00","25 Oct 2026, 11:00","","Bench Press (Barbell)","","Prise large","0","normal","60","8","","",""',
  ].join("\n");
  await importerHevyTexte(db, csv);
  const s = (await db.getFirstAsync<{ id: string }>("SELECT id FROM seances WHERE source_ref IS NOT NULL", []))!;
  const d = (await lireSeance(db, s.id))!;
  assert.deepEqual(d.exercices[0]!.notes.map((n) => n.texte), ["Prise large"]);
  assert.deepEqual(d.exercices[0]!.notesExercice, []);
});

test("migration 16 : les notes des trois colonnes sont recopiées (ids stables), les colonnes gardées, le journal de synchro suit la table", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 15);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le,note) VALUES ('e1','Presse',0,1,1,'cran 4'),('e2','Curl',0,1,1,NULL),('e3','Row',0,1,1,'  ');
    INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r','R',0,1,5);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,note) VALUES ('l1','r','e1',0,'lent'),('l2','r','e2',1,NULL);
    INSERT INTO seances (id,routine_id,debut,fin,maj_le) VALUES ('s1','r',1,2,7);
    INSERT INTO seance_exercices (seance_id,exercice_id,position,note) VALUES ('s1','e1',0,'genou'),('s1','e2',1,'');`);
  assert.equal(await migrer(db, 16), 16);
  const notes = raw.prepare("SELECT id, type, exercice_id, ligne_id, seance_id, texte FROM notes ORDER BY id").all().map((x) => ({ ...x }));
  assert.deepEqual(notes, [
    { id: "n:exercice:e1", type: "exercice", exercice_id: "e1", ligne_id: null, seance_id: null, texte: "cran 4" },
    { id: "n:routine:l1", type: "routine", exercice_id: "e1", ligne_id: "l1", seance_id: null, texte: "lent" },
    { id: "n:seance:s1:e1", type: "seance", exercice_id: "e1", ligne_id: null, seance_id: "s1", texte: "genou" },
  ]);
  // Colonnes d'origine intactes.
  assert.equal((raw.prepare("SELECT note FROM exercices WHERE id = 'e1'").get() as { note: string }).note, "cran 4");
  assert.equal((raw.prepare("SELECT note FROM routine_exercices WHERE id = 'l1'").get() as { note: string }).note, "lent");
  // Journal : les trois lignes recopiées y sont, puis une écriture ultérieure aussi.
  const journal = () => raw.prepare("SELECT cle, supprime FROM sync_journal WHERE tab = 'notes' ORDER BY cle").all().map((x) => ({ ...x }));
  assert.equal(journal().length, 3);
  await supprimerNote(db, "n:routine:l1");
  assert.deepEqual(journal().find((j) => j.cle === "n:routine:l1"), { cle: "n:routine:l1", supprime: 1 });
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
  // La lecture se fait sur la table (lireSeance lit le schéma courant).
  await migrer(db);
  assert.deepEqual((await lireSeance(db, "s1"))!.exercices[0]!.notes.map((n) => n.texte), ["genou"]);
});

test("migration 9 : aucune note perdue ; la copie de la note de routine dans la séance est vidée", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 8);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('e1','Presse',0,1,1),('e2','Curl',0,1,1);
    INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r','R',0,1,1);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,note) VALUES ('l1','r','e1',0,'cran 4'),('l2','r','e2',1,'lent');
    INSERT INTO seances (id,routine_id,debut,fin,maj_le) VALUES ('s1','r',1,2,1),('s2',NULL,3,4,1);
    INSERT INTO seance_exercices (seance_id,exercice_id,position,note) VALUES
      ('s1','e1',0,'cran 4'),('s1','e2',1,'lent, puis genou'),('s2','e1',0,'cran 4');`);
  await migrer(db, 15);
  const notes = raw.prepare("SELECT seance_id, exercice_id, note FROM seance_exercices ORDER BY seance_id, exercice_id").all().map((x) => ({ ...x }));
  assert.deepEqual(notes, [
    { seance_id: "s1", exercice_id: "e1", note: null },
    { seance_id: "s1", exercice_id: "e2", note: "lent, puis genou" },
    { seance_id: "s2", exercice_id: "e1", note: "cran 4" },
  ]);
  const routine = raw.prepare("SELECT id, note FROM routine_exercices ORDER BY id").all().map((x) => ({ ...x }));
  assert.deepEqual(routine, [{ id: "l1", note: "cran 4" }, { id: "l2", note: "lent" }]);
  assert.equal((raw.prepare("SELECT note FROM exercices WHERE id = 'e1'").get() as { note: string | null }).note, null);
  await migrer(db);
  assert.deepEqual(raw.prepare("SELECT texte FROM notes WHERE seance_id IS NULL AND ligne_id IS NULL").all().length, 0);
});
