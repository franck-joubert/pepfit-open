// Repos d'un superset coché dans le désordre : le repos de la série la plus avancée continue (docs/CODE-REPOS-SUPERSET.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { demarrerSeanceDepuisRoutine, lireSeance } from "../src/db/depots/seances.ts";
import { cocherOptimiste, type Coche } from "../src/ecrans/coche-optimiste.ts";
import { garderReposEnCours, rangDeSerie, type RangRepos } from "../src/ecrans/rang-repos.ts";
import { ajusterRepos, poserRangRepos } from "../src/ecrans/repos.ts";
import { minuteur } from "../src/natif/minuteur/index.ts";
import { baseDeTest } from "./aide.ts";

const r = (tour: number, pos: number, chaine = "s:1"): RangRepos => ({ chaine, tour, pos });

test("garderReposEnCours : en arrière dans la chaîne = garde ; même rang, en avant, autre chaîne, hors superset = remplace", () => {
  assert.equal(garderReposEnCours(r(0, 1), r(0, 0)), true, "exercice précédent du même tour");
  assert.equal(garderReposEnCours(r(1, 0), r(0, 2)), true, "tour précédent, même après dans le bloc");
  assert.equal(garderReposEnCours(r(0, 1), r(0, 1)), false, "même rang (recoché)");
  assert.equal(garderReposEnCours(r(0, 1), r(0, 2)), false, "en avant");
  assert.equal(garderReposEnCours(r(0, 1), r(1, 0)), false, "tour suivant");
  assert.equal(garderReposEnCours(r(0, 2, "s:1"), r(0, 0, "s:2")), false, "autre superset");
  assert.equal(garderReposEnCours(r(0, 2), null), false, "exercice normal");
  assert.equal(garderReposEnCours(null, r(0, 0)), false, "aucun repos lancé par un superset");
});

/** Squat seul (120 s), triset Curl → Dips → Tirage (15 s entre, 90 après le tour, 2 tours), superset Pompes → Rowing (10 s entre, 60 après). */
async function seance() {
  const { db } = await baseDeTest();
  const ex = async (nom: string) => creerExercice(db, { nom });
  const [squat, curl, dips, tirage, pompes, rowing] = [await ex("Squat"), await ex("Curl"), await ex("Dips"), await ex("Tirage"), await ex("Pompes"), await ex("Rowing")];
  const id = await demarrerSeanceDepuisRoutine(
    db,
    await creerRoutine(db, "Upper", [
      { exerciceId: squat, nbSeries: 2, reposS: 120 },
      { exerciceId: curl, nbSeries: 2, reposS: 0, groupeSuperset: 1 },
      { exerciceId: dips, nbSeries: 2, reposS: 0, groupeSuperset: 1 },
      { exerciceId: tirage, nbSeries: 2, reposS: 90, groupeSuperset: 1 },
      { exerciceId: pompes, nbSeries: 2, reposS: 0, groupeSuperset: 2 },
      { exerciceId: rowing, nbSeries: 2, reposS: 60, groupeSuperset: 2 },
    ]),
    false,
  );
  await db.runAsync("UPDATE seance_exercices SET repos_transition_s = 15 WHERE seance_id = ? AND groupe_superset = 1", [id]);
  await db.runAsync("UPDATE seance_exercices SET repos_transition_s = 10 WHERE seance_id = ? AND groupe_superset = 2", [id]);
  const s = (await lireSeance(db, id))!;
  const serie = (nom: string, tour = 0) => s.exercices.find((e) => e.exercice.nom === nom)!.series[tour]!;
  const cocher = async (nom: string, tour = 0) => {
    const file = { current: Promise.resolve() as Promise<unknown> };
    await cocherOptimiste({ db, seance: s, serie: serie(nom, tour), faite: true, file, apres: (f) => f(), poser: (_c: Coche) => {}, retirer: () => {}, erreur: (e) => assert.fail(String(e)) });
  };
  minuteur.passer();
  poserRangRepos(null);
  return { db, s, serie, cocher };
}

const etat = () => ({ actif: minuteur.etat().actif, total: minuteur.etat().totalS, fin: minuteur.echeance() });

test("rang d'une série : tour, position dans le bloc ; null hors superset", async () => {
  const { s, serie } = await seance();
  assert.equal(rangDeSerie(s, serie("Squat").id), null);
  const a = rangDeSerie(s, serie("Tirage", 1).id)!;
  assert.deepEqual([a.tour, a.pos], [1, 2]);
  assert.notEqual(a.chaine, rangDeSerie(s, serie("Pompes").id)!.chaine);
});

test("triset coché dans l'ordre normal : chaque cochage remplace le repos (inchangé)", async () => {
  const { cocher } = await seance();
  await cocher("Curl");
  assert.equal(etat().total, 15);
  await cocher("Dips");
  assert.equal(etat().total, 15);
  await cocher("Tirage");
  assert.equal(etat().total, 90, "fin de tour : repos du tour");
  minuteur.passer();
});

test("triset du dernier au premier : le repos du tour (90 s) reste, intact", async () => {
  const { cocher } = await seance();
  await cocher("Tirage");
  const avant = etat();
  assert.equal(avant.total, 90);
  await cocher("Dips");
  assert.deepEqual(etat(), avant, "Dips (15 s) ne remplace pas");
  await cocher("Curl");
  assert.deepEqual(etat(), avant, "Curl non plus");
  minuteur.passer();
});

test("triset 2 puis 1 puis 3 : le 1 garde les 15 s du 2, le 3 lance le repos du tour", async () => {
  const { cocher } = await seance();
  await cocher("Dips");
  const avant = etat();
  assert.equal(avant.total, 15);
  await cocher("Curl");
  assert.deepEqual(etat(), avant, "le minuteur continue, ni remis à 15 s ni prolongé");
  await cocher("Tirage");
  assert.equal(etat().total, 90);
  minuteur.passer();
});

test("tour d'après coché avant la fin du tour d'avant : le tour d'avant ne remplace pas", async () => {
  const { cocher } = await seance();
  await cocher("Dips", 1);
  const avant = etat();
  await cocher("Tirage", 0);
  assert.deepEqual(etat(), avant);
  minuteur.passer();
});

test("exercice normal : chaque cochage remplace, rang oublié", async () => {
  const { cocher } = await seance();
  await cocher("Tirage");
  await cocher("Squat");
  assert.equal(etat().total, 120);
  await cocher("Curl");
  assert.equal(etat().total, 15, "le superset après un exercice normal repart");
  minuteur.passer();
});

test("repos ajusté de −/+15 : conservé tel qu'ajusté par un cochage en arrière", async () => {
  const { db, cocher } = await seance();
  await cocher("Tirage");
  await ajusterRepos(db, 15);
  const avant = etat();
  await cocher("Dips");
  assert.deepEqual(etat(), avant, "le +15 n'est pas perdu");
  minuteur.passer();
});

test("repos déjà terminé : le cochage en arrière n'en relance pas un nouveau", async () => {
  const { cocher } = await seance();
  await cocher("Tirage");
  minuteur.passer(); // fini (ou passé)
  await cocher("Dips");
  assert.equal(etat().actif, false, "série rattrapée : pas de repos inutile");
  await cocher("Dips", 1);
  assert.equal(etat().total, 15, "le tour suivant repart normalement");
  minuteur.passer();
});

test("deux supersets différents : le second remplace le premier", async () => {
  const { cocher } = await seance();
  await cocher("Tirage");
  await cocher("Pompes");
  assert.equal(etat().total, 10);
  await cocher("Rowing");
  assert.equal(etat().total, 60);
  await cocher("Pompes", 1);
  assert.equal(etat().total, 10, "Pompes tour 2 est en avant de Rowing tour 1 : remplace");
  minuteur.passer();
});
