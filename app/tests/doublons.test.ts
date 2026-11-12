// Doublons d'exercices : un perso au nom d'un exercice du catalogue est fusionné dans celui-ci, sans perdre l'historique.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { fusionnerDoublons } from "../src/db/depots/doublons.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { baseDeTest } from "./aide.ts";

async function persoPadel(raw: Awaited<ReturnType<typeof baseDeTest>>["raw"], id = "perso-padel", nom = "Padel") {
  raw
    .prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le, note) VALUES (?,?,?,1,'duree',1,1,'ma note')")
    .run(id, nom, nom.toLowerCase());
  raw.prepare("INSERT INTO exercice_alias (nom_norm, exercice_id, source) VALUES (?,?,'hevy')").run(nom.toLowerCase(), id);
  return id;
}

const nbPadel = (raw: Awaited<ReturnType<typeof baseDeTest>>["raw"]) =>
  (raw.prepare("SELECT COUNT(*) AS n FROM exercices WHERE nom_norm = 'padel'").get() as { n: number }).n;

test("perso « Padel » fusionné dans cat:padel : historique, record, routine et note gardés", async () => {
  const { raw, db } = await baseDeTest(true);
  const perso = await persoPadel(raw);
  assert.equal(nbPadel(raw), 2);
  const s = await demarrerSeance(db, null, "Sortie");
  await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: perso, dureeS: 3600 }), true);
  await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: perso, dureeS: 1800 }), true);
  await terminerSeance(db, s);
  await creerRoutine(db, "Week-end", [{ exerciceId: perso }]);
  const avant = raw.prepare("SELECT SUM(duree_s) AS d, COUNT(*) AS n FROM series WHERE exercice_id = ?").get(perso) as { d: number; n: number };
  const volAvant = (raw.prepare("SELECT volume_kg FROM seances WHERE id = ?").get(s) as { volume_kg: number }).volume_kg;
  assert.ok((raw.prepare("SELECT COUNT(*) AS n FROM records WHERE exercice_id = ?").get(perso) as { n: number }).n > 0);

  assert.equal(await fusionnerDoublons(db), 1);

  assert.equal(nbPadel(raw), 1);
  assert.equal(raw.prepare("SELECT id FROM exercices WHERE id = ?").get(perso), undefined);
  assert.deepEqual({ ...(raw.prepare("SELECT SUM(duree_s) AS d, COUNT(*) AS n FROM series WHERE exercice_id = 'cat:padel'").get() as object) }, { ...avant });
  assert.equal((raw.prepare("SELECT volume_kg FROM seances WHERE id = ?").get(s) as { volume_kg: number }).volume_kg, volAvant);
  // Records recalculés sous la règle du catalogue : le padel (sports et cours) n'a pas de meilleur temps (revue finale, D4).
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM records WHERE exercice_id IN (?, 'cat:padel')").get(perso) as { n: number }).n, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM routine_exercices WHERE exercice_id = 'cat:padel'").get() as { n: number }).n, 1);
  assert.equal((raw.prepare("SELECT note FROM exercices WHERE id = 'cat:padel'").get() as { note: string }).note, "ma note");
  assert.equal((raw.prepare("SELECT exercice_id FROM exercice_alias WHERE nom_norm = 'padel'").get() as { exercice_id: string }).exercice_id, "cat:padel");
  assert.equal((await lireSeance(db, s))?.exercices.length, 1);
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("notes (table notes) du perso : rattachées au catalogue, pas effacées", async () => {
  const { raw, db } = await baseDeTest(true);
  const perso = await persoPadel(raw);
  const s = await demarrerSeance(db, null, "Notes");
  await ajouterSerie(db, { seanceId: s, exerciceId: perso, dureeS: 900 });
  raw.prepare("INSERT INTO notes (id, type, exercice_id, seance_id, texte, position, cree_le, maj_le) VALUES ('n1','exercice',?,NULL,'raquette',0,1,1)").run(perso);
  raw.prepare("INSERT INTO notes (id, type, exercice_id, seance_id, texte, position, cree_le, maj_le) VALUES ('n2','seance',?,?,'genou',0,1,1)").run(perso, s);
  await fusionnerDoublons(db);
  const notes = raw.prepare("SELECT id, exercice_id FROM notes ORDER BY id").all() as { id: string; exercice_id: string }[];
  assert.deepEqual(notes.map((n) => ({ ...n })), [{ id: "n1", exercice_id: "cat:padel" }, { id: "n2", exercice_id: "cat:padel" }]);
});

test("idempotence : une seconde fusion ne fait rien", async () => {
  const { raw, db } = await baseDeTest(true);
  await persoPadel(raw);
  assert.equal(await fusionnerDoublons(db), 1);
  const etat = JSON.stringify(raw.prepare("SELECT * FROM sync_journal ORDER BY tab, cle").all());
  assert.equal(await fusionnerDoublons(db), 0);
  assert.equal(JSON.stringify(raw.prepare("SELECT * FROM sync_journal ORDER BY tab, cle").all()), etat);
});

test("séance contenant les deux : séries déplacées, une seule ligne d'exercice, note gardée", async () => {
  const { raw, db } = await baseDeTest(true);
  const perso = await persoPadel(raw);
  const s = await demarrerSeance(db, null, "Double");
  await ajouterSerie(db, { seanceId: s, exerciceId: "cat:padel", dureeS: 600 });
  await ajouterSerie(db, { seanceId: s, exerciceId: perso, dureeS: 900 });
  raw.prepare("UPDATE seance_exercices SET note = 'note perso' WHERE seance_id = ? AND exercice_id = ?").run(s, perso);
  await fusionnerDoublons(db);
  const lignes = raw.prepare("SELECT exercice_id, note FROM seance_exercices WHERE seance_id = ?").all(s) as { exercice_id: string; note: string | null }[];
  assert.deepEqual(lignes.map((l) => ({ ...l })), [{ exercice_id: "cat:padel", note: "note perso" }]);
  assert.equal((raw.prepare("SELECT SUM(duree_s) AS d FROM series WHERE exercice_id = 'cat:padel'").get() as { d: number }).d, 1500);
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("perso de nature différente avec séries : laissé tel quel ; alias seul suffit à rapprocher", async () => {
  const { raw, db } = await baseDeTest(true);
  raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES ('p1','Padel loisir','padel loisir',1,'poids_reps',1,1)").run();
  raw.prepare("INSERT INTO exercice_alias (nom_norm, exercice_id) VALUES ('padel','p1')").run();
  const s = await demarrerSeance(db, null, "x");
  await ajouterSerie(db, { seanceId: s, exerciceId: "p1", kg: 10, reps: 5 });
  assert.equal(await fusionnerDoublons(db), 0);
  raw.prepare("DELETE FROM series").run();
  assert.equal(await fusionnerDoublons(db), 1);
  assert.equal(raw.prepare("SELECT id FROM exercices WHERE id = 'p1'").get(), undefined);
});

test("création refusée d'un doublon : l'exercice existant est renvoyé", async () => {
  const { raw, db } = await baseDeTest(true);
  assert.equal(await creerExercice(db, { nom: "Padel" }), "cat:padel");
  const a = await creerExercice(db, { nom: "Mon exercice" });
  assert.equal(await creerExercice(db, { nom: "mon  EXERCICE" }), a);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM exercices WHERE perso = 1").get() as { n: number }).n, 1);
});

test("synchro : le journal contient la suppression du perso et de ses lignes à clé composée", async () => {
  const { raw, db } = await baseDeTest(true);
  const perso = await persoPadel(raw);
  const s = await demarrerSeance(db, null, "Sortie");
  await ajouterSerie(db, { seanceId: s, exerciceId: perso, dureeS: 600 });
  raw.exec("DELETE FROM sync_journal");
  await fusionnerDoublons(db);
  const j = raw.prepare("SELECT tab, cle, supprime FROM sync_journal").all().map((x) => ({ ...x }));
  const a = (tab: string, cle: string, supprime: number) => assert.ok(j.some((x) => x.tab === tab && x.cle === cle && x.supprime === supprime), `${tab} ${cle}`);
  a("exercices", perso, 1);
  a("seance_exercices", `${s}|${perso}`, 1);
  a("seance_exercices", `${s}|cat:padel`, 0);
  assert.ok(j.some((x) => x.tab === "series" && x.supprime === 0));
});
