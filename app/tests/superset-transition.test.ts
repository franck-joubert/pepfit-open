// Superset « entre les exercices » (planche idee-plein-ecran, lot 1) : migration 31, feuille du repos, séance qui l'applique.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { creerRoutine, definirReposSuperset, dupliquerRoutine, lireRoutine } from "../src/db/depots/routines.ts";
import { changerReposSupersetSeance, cocherSerie, demarrerSeanceDepuisRoutine, lireSeance, lireSeries, reposApresSerie } from "../src/db/depots/seances.ts";
import { MIGRATIONS, migrer, temoinPresent } from "../src/db/migrations.ts";
import { dureeRoueCourte, enchainementNoms, nomCourt, nomMachine } from "../src/ecrans/format.ts";
import { ordreExecution, serieAffichee } from "../src/ecrans/ordre-seance.ts";
import { adapter, baseDeTest } from "./aide.ts";
import { DatabaseSync } from "node:sqlite";

async function bisetTriset() {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Leg Extension (Machine)" });
  const b = await creerExercice(db, { nom: "Leg Curl Assis (Machine)" });
  const c = await creerExercice(db, { nom: "Squat Hack (Machine)" });
  const r = await creerRoutine(db, "Jambes", [
    { exerciceId: a, nbSeries: 2, reposS: 0, groupeSuperset: 1 },
    { exerciceId: b, nbSeries: 2, reposS: 120, groupeSuperset: 1 },
    { exerciceId: c, nbSeries: 1, reposS: 90 },
  ]);
  return { db, a, b, c, r };
}

test("migration 31 : témoin seance_exercices.repos_transition_s, 0 par défaut", async () => {
  const m = MIGRATIONS.find((x) => x.version === 31)!;
  assert.equal(m.temoin, "seance_exercices.repos_transition_s");
  const { db, r } = await bisetTriset();
  assert.ok(await temoinPresent(db, "seance_exercices.repos_transition_s"));
  assert.ok(await temoinPresent(db, "routine_exercices.repos_transition_s"));
  const routine = (await lireRoutine(db, r))!;
  assert.equal(routine.blocs[0]!.reposTransitionS, 0);
});

test("migration 31 : numéro déjà passé sur une base d'une autre branche, les colonnes sont quand même créées", async () => {
  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db, 29);
  // Une autre branche a déjà porté la base en 31 sans cette migration.
  raw.exec("PRAGMA user_version = 31");
  await migrer(db);
  assert.ok(await temoinPresent(db, "seance_exercices.repos_transition_s"));
  assert.ok(await temoinPresent(db, "routine_exercices.repos_transition_s"));
});

test("D8 : sans temps entre les exercices, on enchaîne comme avant", async () => {
  const { db, r } = await bisetTriset();
  const id = await demarrerSeanceDepuisRoutine(db, r);
  const s = await lireSeries(db, id);
  await cocherSerie(db, s[0]!.id, true);
  assert.equal(await reposApresSerie(db, s[0]!.id), null);
  assert.deepEqual(await reposApresSerie(db, s[1]!.id), { s: 120, suivant: null });
});

test("routine → séance : le temps entre les exercices est copié et lance « Machine suivante »", async () => {
  const { db, a, b, c, r } = await bisetTriset();
  await definirReposSuperset(db, r, 1, 120, 10);
  const routine = (await lireRoutine(db, r))!;
  assert.equal(routine.blocs[0]!.reposTransitionS, 10);
  assert.equal(routine.blocs[0]!.reposS, 120);
  assert.equal(routine.blocs[1]!.reposTransitionS, 0);

  const id = await demarrerSeanceDepuisRoutine(db, r);
  const det = (await lireSeance(db, id))!;
  assert.equal(det.blocs[0]!.reposTransitionS, 10);
  assert.equal(det.blocs[1]!.reposTransitionS, 0);
  const s = await lireSeries(db, id);
  assert.deepEqual(s.map((x) => x.exercice_id), [a, b, a, b, c]);
  // Tour 1 : après A, 10 s pour changer de machine (vers B) ; après B, le repos du tour.
  assert.deepEqual(await reposApresSerie(db, s[0]!.id), { s: 10, suivant: { id: b, nom: "Leg Curl Assis (Machine)" } });
  assert.deepEqual(await reposApresSerie(db, s[1]!.id), { s: 120, suivant: null });
  // Exercice seul : son repos, jamais de transition.
  assert.deepEqual(await reposApresSerie(db, s[4]!.id), { s: 90, suivant: null });

  // Copie de la routine : le temps suit.
  const copie = (await dupliquerRoutine(db, r))!;
  assert.equal((await lireRoutine(db, copie))!.blocs[0]!.reposTransitionS, 10);
});

test("feuille du repos en séance : les deux temps s'appliquent au superset", async () => {
  const { db, a, r } = await bisetTriset();
  const id = await demarrerSeanceDepuisRoutine(db, r);
  await changerReposSupersetSeance(db, id, 1, 15, 105);
  const det = (await lireSeance(db, id))!;
  assert.equal(det.blocs[0]!.reposTransitionS, 15);
  assert.equal(det.blocs[0]!.reposS, 105);
  assert.ok(det.exercices.filter((e) => e.groupeSuperset === 1).every((e) => e.reposTransitionS === 15));
  const s = await lireSeries(db, id);
  assert.equal(s[0]!.exercice_id, a);
  assert.equal((await reposApresSerie(db, s[0]!.id))?.s, 15);
  // Remis à 0 : on enchaîne de nouveau.
  await changerReposSupersetSeance(db, id, 1, 0, 105);
  assert.equal(await reposApresSerie(db, s[0]!.id), null);
});

test("libellés : nom court, enchaînement des noms, durées de la roue", () => {
  assert.equal(nomCourt("Leg Curl Assis (Machine)"), "Leg Curl Assis");
  assert.equal(nomCourt("Squat"), "Squat");
  assert.equal(enchainementNoms(["Leg Extension (Machine)", "Leg Curl (Machine)"]), "Leg extension, puis leg curl");
  // Aucune feuille ouverte : liste vide, pas de plantage (l'écran de la séance tombait au premier rendu).
  assert.equal(enchainementNoms([]), "");
  assert.equal(enchainementNoms(["A", "B", "C"]), "A, puis b, puis c");
  assert.equal(dureeRoueCourte(10), "10 s");
  assert.equal(dureeRoueCourte(120), "2 min");
  assert.equal(dureeRoueCourte(90), "1 min 30");
});

test("plein écran : enchaînement du superset tour par tour, série affichée et ses voisines", async () => {
  const { db, a, b, c, r } = await bisetTriset();
  const id = await demarrerSeanceDepuisRoutine(db, r);
  const det = (await lireSeance(db, id))!;
  const ordre = ordreExecution(det);
  assert.deepEqual(ordre.map((x) => x.exercice_id), [a, b, a, b, c]);
  assert.equal(serieAffichee(ordre, 0)!.id, ordre[0]!.id);
  assert.equal(serieAffichee(ordre, -3)!.id, ordre[0]!.id);
  assert.equal(serieAffichee(ordre, 1)!.exercice_id, b);
  await cocherSerie(db, ordre[0]!.id, true);
  const apres = ordreExecution((await lireSeance(db, id))!);
  // A1 faite : la série affichée passe à B1 (machine suivante), puis A2 au tour 2.
  assert.equal(serieAffichee(apres, 0)!.exercice_id, b);
  assert.equal(serieAffichee(apres, 1)!.exercice_id, a);
  assert.equal(serieAffichee(apres, 99)!.exercice_id, c);
  assert.equal(serieAffichee([], 0), null);
});

test("barre de repos : le nom de la machine suivante tient en deux mots", () => {
  assert.equal(nomMachine("Leg curl assis (Machine)"), "Leg curl");
  assert.equal(nomMachine("Squat"), "Squat");
});
