import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterNote } from "../src/db/depots/notes.ts";
import { creerRoutine, definirCibleSerie, definirTypeSerie, disposerRoutine, lireExercicesDeRoutine, lireRoutine, modifierLigneRoutine, restaurerSerieRoutine, supprimerSerieRoutine } from "../src/db/depots/routines.ts";
import { deplacerExercice } from "../src/ecrans/glisser.ts";
import { demarrerSeanceDepuisRoutine, lireSeance } from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { libelleSuperset, plageTexte } from "../src/ecrans/format.ts";
import { adapter, baseDeTest } from "./aide.ts";

test("libelleSuperset : Superset (2 exercices), Circuit (3 et plus), lexique du 29/10", () => {
  assert.equal(libelleSuperset(2), "Superset");
  assert.equal(libelleSuperset(3), "Circuit");
  assert.equal(libelleSuperset(4), "Circuit");
  assert.equal(libelleSuperset(7), "Circuit");
});

test("migration 5 : base v4 remplie, les cibles gardées, type 'normale' par défaut", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 4);
  raw.exec(`INSERT INTO exercices (id,nom,nom_norm,cree_le,maj_le) VALUES ('e','Squat','squat',1,1);
    INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r','R',0,1,1);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,nb_series,repos_s) VALUES ('l','r','e',0,3,90);
    INSERT INTO routine_series (ligne_id,rang,kg,reps) VALUES ('l',0,60,8),('l',1,70,5);`);
  assert.equal(await migrer(db, 5), 5);
  const lignes = raw.prepare("SELECT rang, kg, reps, type FROM routine_series ORDER BY rang").all();
  assert.deepEqual(lignes.map((x) => ({ ...x })), [
    { rang: 0, kg: 60, reps: 8, type: "normale" },
    { rang: 1, kg: 70, reps: 5, type: "normale" },
  ]);
  assert.equal(await migrer(db, 5), 5);
});

test("type de série de routine : conservé sans cible, effacé quand on revient à normale, recopié dans la séance avec la note", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Presse" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: a, nbSeries: 3 }]);
  const [l] = await lireExercicesDeRoutine(db, r);
  await ajouterNote(db, { exerciceId: a, ligneId: l!.id }, "routine", "siège cran 4");
  await definirTypeSerie(db, l!.id, 0, "echauffement");
  await definirTypeSerie(db, l!.id, 2, "degressive");
  await definirCibleSerie(db, l!.id, 2, { kg: 40 });
  await definirCibleSerie(db, l!.id, 0, { kg: null });
  let det = (await lireRoutine(db, r))!;
  assert.deepEqual(det.blocs[0]!.lignes[0]!.cibles.map((c) => c.type), ["echauffement", "normale", "degressive"]);
  assert.deepEqual(det.blocs[0]!.lignes[0]!.notes.map((n) => n.texte), ["siège cran 4"]);

  const sid = await demarrerSeanceDepuisRoutine(db, r);
  const s = (await lireSeance(db, sid))!;
  assert.deepEqual(s.exercices[0]!.series.map((x) => x.type), ["echauffement", "normale", "degressive"]);
  assert.equal(s.exercices[0]!.series[2]!.kg, 40);
  assert.deepEqual(s.exercices[0]!.notesRoutine.map((n) => n.texte), ["siège cran 4"]);
  assert.deepEqual(s.exercices[0]!.notes, []);

  await definirTypeSerie(db, l!.id, 0, "normale");
  det = (await lireRoutine(db, r))!;
  assert.equal(det.blocs[0]!.lignes[0]!.cibles[0]!.type, "normale");
  assert.equal(
    (await db.getAllAsync<{ rang: number }>("SELECT rang FROM routine_series WHERE ligne_id = ?", [l!.id])).length,
    1,
  );
});

test("roue de repos : 0 à 5 min par 5 s, puis 30 s jusqu'à 10 min ; valeur la plus proche", async () => {
  const { valeursRepos, indiceRepos, dureeRepos } = await import("../src/ecrans/format.ts");
  const v = valeursRepos();
  assert.equal(v[0], 0);
  assert.equal(v[1], 5);
  assert.equal(v[60], 300);
  assert.equal(v[61], 330);
  assert.equal(v[v.length - 1], 600);
  assert.equal(v.length, 61 + 10);
  assert.equal(v[indiceRepos(92, v)], 90);
  assert.equal(v[indiceRepos(318, v)], 330);
  assert.equal(v[indiceRepos(9999, v)], 600);
  assert.deepEqual([0, 5, 115, 300, 330, 600].map(dureeRepos), ["0 s", "5 s", "1 min 55 s", "5 min", "5 min 30 s", "10 min"]);
});

test("migration 5 : colonnes de plage de répétitions ajoutées, mode répétitions par défaut", async () => {
  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db, 4);
  raw.exec(`INSERT INTO exercices (id,nom,nom_norm,cree_le,maj_le) VALUES ('e','Squat','squat',1,1);
    INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r','R',0,1,1);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,nb_series,repos_s) VALUES ('l','r','e',0,3,90);`);
  await migrer(db);
  assert.equal((raw.prepare("SELECT plage_reps FROM routine_exercices").get() as { plage_reps: number }).plage_reps, 0);
  raw.prepare("SELECT reps_max FROM routine_series").all();
  raw.prepare("SELECT plage_min, plage_max FROM series").all();
});

test("plage de répétitions : indication en séance, reps vide, effacée au retour en mode répétitions", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Curl" });
  const r = await creerRoutine(db, "Bras", [{ exerciceId: a, nbSeries: 2 }]);
  const [l] = await lireExercicesDeRoutine(db, r);
  await modifierLigneRoutine(db, l!.id, { plageReps: true });
  await definirCibleSerie(db, l!.id, 0, { reps: 8, repsMax: 12 });
  await definirCibleSerie(db, l!.id, 1, { reps: 10 });
  let det = (await lireRoutine(db, r))!;
  assert.equal(det.blocs[0]!.lignes[0]!.plage_reps, 1);
  assert.deepEqual(det.blocs[0]!.lignes[0]!.cibles.map((c) => [c.reps, c.reps_max]), [[8, 12], [10, null]]);

  const sid = await demarrerSeanceDepuisRoutine(db, r, false);
  const s = (await lireSeance(db, sid))!;
  assert.deepEqual(s.exercices[0]!.series.map((x) => [x.reps, x.plage_min, x.plage_max]), [[null, 8, 12], [null, 10, null]]);
  assert.equal(plageTexte(8, 12), "8-12");
  assert.equal(plageTexte(10, null), "10");
  assert.equal(plageTexte(null, null), null);

  await modifierLigneRoutine(db, l!.id, { plageReps: false });
  det = (await lireRoutine(db, r))!;
  assert.equal(det.blocs[0]!.lignes[0]!.plage_reps, 0);
  assert.deepEqual(det.blocs[0]!.lignes[0]!.cibles.map((c) => [c.reps, c.reps_max]), [[8, null], [10, null]]);
  const s2 = (await lireSeance(db, await demarrerSeanceDepuisRoutine(db, r, false)))!;
  assert.deepEqual(s2.exercices[0]!.series.map((x) => [x.reps, x.plage_min]), [[8, null], [10, null]]);
});

test("glisser un exercice hors d'un biset : écrit en base, le biset est dissous et les repos suivent", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Développé" });
  const b = await creerExercice(db, { nom: "Tirage" });
  const c = await creerExercice(db, { nom: "Gainage" });
  const r = await creerRoutine(db, "Haut", [
    { exerciceId: a, groupeSuperset: 1, reposS: 0 },
    { exerciceId: b, groupeSuperset: 1, reposS: 90 },
    { exerciceId: c, reposS: 60 },
  ]);
  const avant = await lireExercicesDeRoutine(db, r);
  const dispo = deplacerExercice(avant.map((l) => ({ id: l.id, groupe: l.groupe_superset, repos: l.repos_s })), avant[0]!.id, null, null, 120);
  await disposerRoutine(db, r, dispo);
  const d = (await lireRoutine(db, r))!;
  assert.deepEqual(
    d.blocs.map((x) => [x.groupeSuperset, x.lignes.map((l) => `${l.exercice.nom}:${l.repos_s}`).join(",")]),
    [
      [null, "Tirage:90"],
      [null, "Gainage:60"],
      [null, "Développé:120"],
    ],
  );
});

test("supprimer une série de routine : les suivantes remontent avec leurs cibles, la dernière reste", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Presse" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: a, nbSeries: 4 }]);
  const [l] = await lireExercicesDeRoutine(db, r);
  await definirTypeSerie(db, l!.id, 0, "echauffement");
  await definirCibleSerie(db, l!.id, 1, { kg: 60 });
  await definirCibleSerie(db, l!.id, 2, { kg: 70 });
  await definirCibleSerie(db, l!.id, 3, { kg: 80 });
  const retiree = await supprimerSerieRoutine(db, l!.id, 1);
  let c = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles;
  assert.deepEqual(c.map((x) => [x.type, x.kg]), [["echauffement", null], ["normale", 70], ["normale", 80]]);
  // « Annuler » : la série revient à son rang avec sa cible, les suivantes reculent.
  await restaurerSerieRoutine(db, retiree!);
  c = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles;
  assert.deepEqual(c.map((x) => [x.type, x.kg]), [["echauffement", null], ["normale", 60], ["normale", 70], ["normale", 80]]);
  await supprimerSerieRoutine(db, l!.id, 1);
  await supprimerSerieRoutine(db, l!.id, 0);
  await supprimerSerieRoutine(db, l!.id, 1);
  c = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles;
  assert.deepEqual(c.map((x) => x.kg), [70]);
  await supprimerSerieRoutine(db, l!.id, 0);
  assert.equal((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles.length, 1);
});

test("ajouter une série à une ligne de routine : une cible de plus, les autres gardées", async () => {
  const { db } = await baseDeTest();
  const ex = await creerExercice(db, { nom: "Rowing" });
  const r = await creerRoutine(db, "R", [{ exerciceId: ex, nbSeries: 2 }]);
  const l = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!;
  await definirCibleSerie(db, l.id, 1, { kg: 50 });
  await modifierLigneRoutine(db, l.id, { nbSeries: l.nb_series + 1 });
  const c = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles;
  assert.deepEqual(c.map((x) => x.kg), [null, 50, null]);
});
