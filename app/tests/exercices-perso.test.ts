// Exercices perso (planche exercices-perso, v3) : migration 70, photo et machine de l'exercice, nom en double, ressenti visé
// de la ligne de routine et de la séance, persos allumés, puces des muscles.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice, exerciceDuNom, lireExercice, modifierExercice } from "../src/db/depots/exercices.ts";
import { rirPourSeance, rirVise, SANS_RIR_SEANCE } from "../src/db/depots/effort.ts";
import { cheminsPhotosConnus, fichiersAEffacer } from "../src/db/depots/photos.ts";
import { creerRoutine, definirRirLigne, lireRoutine, routinesDeLExercice } from "../src/db/depots/routines.ts";
import { definirRirSeance, demarrerSeanceDepuisRoutine, lireSeance } from "../src/db/depots/seances.ts";
import { allumage, musclesAllumes, toucherMuscle } from "../src/ui/persos-calc.ts";
import { baseDeTest } from "./aide.ts";

const photo = (p: string) => ({ photo: `photos/${p}.webp`, vignette: `photos/${p}-v.webp` });

test("migration 70 : photo, vignette, photo envoyée et machine sur l'exercice ; rir de la séance", async () => {
  const { raw } = await baseDeTest();
  const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ["photo", "photo_vignette", "photo_distante", "machine_id"]) assert.ok(cols("exercices").includes(c), c);
  assert.ok(cols("seance_exercices").includes("rir"));
});

test("créer un exercice perso avec photo, machine et secondaires ; le nom en double se trouve, sauf l'exercice lui-même", async () => {
  const { db } = await baseDeTest();
  const id = await creerExercice(db, { nom: "Tirage divergent", muscle: "Grand dorsal", secondaires: ["Biceps", "Milieu du dos"], equipement: "machine", photo: photo("a"), machineId: "chest-press" });
  const e = (await lireExercice(db, id))!;
  assert.equal(e.photo, "photos/a.webp");
  assert.equal(e.photo_vignette, "photos/a-v.webp");
  assert.equal(e.photo_distante, null);
  assert.equal(e.machine_id, "chest-press");
  assert.equal(e.secondaires, "Biceps|Milieu du dos");
  assert.equal(await exerciceDuNom(db, "tirage DIVERGENT"), id);
  assert.equal(await exerciceDuNom(db, "Tirage divergent", id), null);
  assert.equal(await exerciceDuNom(db, "Tirage vertical"), null);
  assert.ok((await cheminsPhotosConnus(db)).has("photos/a.webp"));
});

test("changer la photo : l'ancienne est rendue (à effacer) ; déjà envoyée, son fichier distant part dans la file", async () => {
  const { db, raw } = await baseDeTest();
  const id = await creerExercice(db, { nom: "Gainage Copenhague", photo: photo("a") });
  // Même photo : rien ne change, photo_distante reste.
  raw.prepare("UPDATE exercices SET photo_distante = 'srv-a' WHERE id = ?").run(id);
  assert.equal(await modifierExercice(db, id, { photo: photo("a") }), null);
  assert.equal((await lireExercice(db, id))!.photo_distante, "srv-a");
  const avant = await fichiersAEffacer(db);
  const ancienne = await modifierExercice(db, id, { photo: photo("b") });
  assert.deepEqual(ancienne, photo("a"));
  const e = (await lireExercice(db, id))!;
  assert.equal(e.photo, "photos/b.webp");
  assert.equal(e.photo_distante, null);
  assert.ok((await fichiersAEffacer(db)).length > avant.length);
  // Retirée : null.
  assert.deepEqual(await modifierExercice(db, id, { photo: null }), photo("b"));
  assert.equal((await lireExercice(db, id))!.photo, null);
  // Machine : null = « Sans précision ».
  await modifierExercice(db, id, { machineId: "hack-squat" });
  assert.equal((await lireExercice(db, id))!.machine_id, "hack-squat");
  await modifierExercice(db, id, { machineId: null });
  assert.equal((await lireExercice(db, id))!.machine_id, null);
});

test("ressenti visé : la séance suit la routine, sauf si on le change en séance ; « Aucun » vaut pour la séance", () => {
  assert.equal(rirVise(null, 1), 1);
  assert.equal(rirVise(null, null), null);
  assert.equal(rirVise(2, 1), 2);
  assert.equal(rirVise(SANS_RIR_SEANCE, 1), null);
  assert.equal(rirPourSeance(1, 1), null);
  assert.equal(rirPourSeance(null, 1), SANS_RIR_SEANCE);
  assert.equal(rirPourSeance(null, null), null);
  assert.equal(rirPourSeance(0, 1), 0);
});

test("ressenti visé sur la ligne de routine, relu en séance ; changé en séance, la routine garde le sien", async () => {
  const { db } = await baseDeTest();
  const ex = await creerExercice(db, { nom: "Tirage divergent" });
  const rid = await creerRoutine(db, "Pull A", [{ exerciceId: ex, nbSeries: 3, reposS: 120, groupeSuperset: null }]);
  const ligne = (await lireRoutine(db, rid))!.blocs[0]!.lignes[0]!;
  await definirRirLigne(db, ligne.id, 1);
  const sid = await demarrerSeanceDepuisRoutine(db, rid);
  let e = (await lireSeance(db, sid))!.exercices[0]!;
  assert.equal(e.rirRoutine, 1);
  assert.equal(e.rirVise, 1);
  await definirRirSeance(db, sid, ex, 2, e.rirRoutine);
  e = (await lireSeance(db, sid))!.exercices[0]!;
  assert.equal(e.rirVise, 2);
  await definirRirSeance(db, sid, ex, null, e.rirRoutine);
  e = (await lireSeance(db, sid))!.exercices[0]!;
  assert.equal(e.rirVise, null);
  await definirRirSeance(db, sid, ex, 1, e.rirRoutine);
  assert.equal((await lireSeance(db, sid))!.exercices[0]!.rirVise, 1);
  assert.equal((await lireRoutine(db, rid))!.blocs[0]!.lignes[0]!.rir, 1);
});

test("persos : le principal l'emporte sur un secondaire qui allume le même muscle ; noms sans doublon", () => {
  const a = allumage("Grand dorsal", ["Milieu du dos", "Biceps"]);
  assert.equal(a.get("grand_dorsal"), "p");
  assert.equal(a.get("grand_rond"), "p");
  assert.equal(a.get("biceps"), "s");
  assert.equal(allumage(null, []).size, 0);
  assert.deepEqual(musclesAllumes("Grand dorsal", ["Biceps", "Grand dorsal", "Biceps"]), ["Grand dorsal", "Biceps"]);
  assert.deepEqual(musclesAllumes(null, ["Biceps"]), ["Biceps"]);
});

test("puces des muscles : « Principal » remplace le principal, « Secondaires » ajoute ou retire ; jamais les deux à la fois", () => {
  let r = toucherMuscle("Grand dorsal", "principal", null, []);
  assert.deepEqual(r, { principal: "Grand dorsal", secondaires: [] });
  r = toucherMuscle("Biceps", "secondaires", r.principal, r.secondaires);
  assert.deepEqual(r, { principal: "Grand dorsal", secondaires: ["Biceps"] });
  r = toucherMuscle("Biceps", "principal", r.principal, r.secondaires);
  assert.deepEqual(r, { principal: "Biceps", secondaires: [] });
  r = toucherMuscle("Biceps", "secondaires", r.principal, r.secondaires);
  assert.deepEqual(r, { principal: null, secondaires: ["Biceps"] });
  r = toucherMuscle("Biceps", "secondaires", r.principal, r.secondaires);
  assert.deepEqual(r, { principal: null, secondaires: [] });
  r = toucherMuscle("Cou", "principal", "Cou", []);
  assert.equal(r.principal, null);
});

test("fiche : les routines où l'exercice sert", async () => {
  const { db } = await baseDeTest();
  const ex = await creerExercice(db, { nom: "Tirage divergent" });
  const autre = await creerExercice(db, { nom: "Gainage Copenhague" });
  const ligne = (exerciceId: string) => ({ exerciceId, nbSeries: 3, reposS: 120, groupeSuperset: null });
  await creerRoutine(db, "Pull A", [ligne(ex)]);
  await creerRoutine(db, "Jambes B", [ligne(autre)]);
  await creerRoutine(db, "Pull B", [ligne(autre), ligne(ex)]);
  assert.deepEqual((await routinesDeLExercice(db, ex)).map((r) => r.nom), ["Pull A", "Pull B"]);
  assert.deepEqual(await routinesDeLExercice(db, "inconnu"), []);
});
