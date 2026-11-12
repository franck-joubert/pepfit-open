import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice, lireExercice, modifierExercice } from "../src/db/depots/exercices.ts";
import { creerRoutine, creerRoutineDepuisSeance, definirCibleSerie, dupliquerRoutine, lireRoutine, modifierLigneRoutine, creerSuperset, lireExercicesDeRoutine } from "../src/db/depots/routines.ts";
import { cocherSerie, definirTempoSeance, demarrerSeance, demarrerSeanceDepuisRoutine, lireSeance } from "../src/db/depots/seances.ts";
import { dureeEstimee, dureeSerie } from "../src/ecrans/donnees.ts";
import { dureeCourte } from "../src/ecrans/format.ts";
import { dureeRepDefaut, dureeTempo, lireTempo, tempoActif, tempoApplicable, tempoDe, tempoDefautExercice, tempoJoue, tempoTexte, TEMPO_OFF, TEMPOS_USINE } from "../src/ecrans/tempo.ts";
import { NATURES } from "../src/db/natures.ts";
import { baseDeTest } from "./aide.ts";

const ex = (nom: string, slug: string | null = null, muscle: string | null = null) => ({ nom, slug, muscle });

test("durée d'une répétition par défaut : 4 s lourd, 3 s isolation", () => {
  assert.equal(dureeRepDefaut(ex("Développé couché", "bench-press", "Pectoraux")), 4);
  assert.equal(dureeRepDefaut(ex("Squat", "squat", "Quadriceps")), 4);
  assert.equal(dureeRepDefaut(ex("Soulevé de terre", "deadlift", "Lombaires")), 4);
  assert.equal(dureeRepDefaut(ex("Tractions", "pull-up", "Grand dorsal")), 4);
  assert.equal(dureeRepDefaut(ex("Rowing barre", "barbell-row", "Milieu du dos")), 4);
  assert.equal(dureeRepDefaut(ex("Développé militaire", "overhead-press", "Épaules")), 4);
  assert.equal(dureeRepDefaut(ex("Curl biceps", "dumbbell-curl", "Biceps")), 3);
  assert.equal(dureeRepDefaut(ex("Élévations latérales", "lateral-raise", "Épaules")), 3);
  assert.equal(dureeRepDefaut(ex("Extension triceps", "triceps-extension", "Triceps")), 3);
  assert.equal(dureeRepDefaut(ex("Écarté couché", "dumbbell-fly", "Pectoraux")), 3);
  assert.equal(dureeRepDefaut(ex("Mollets debout", null, "Mollets")), 3);
  assert.equal(dureeRepDefaut(ex("Exercice perso", null, null)), 4);
});

test("tempo : notation, lecture et durée", () => {
  assert.equal(tempoTexte([3, 1, 1, 0]), "3-1-1-0");
  assert.deepEqual(lireTempo("3-1-1-0"), [3, 1, 1, 0]);
  assert.equal(dureeTempo([3, 1, 1, 0]), 5);
  for (const mauvais of [null, "", "0-0-0-0", "3-1-1", "3-1-1-11", "a-b-c-d", "3-1-1-0-2"]) assert.equal(lireTempo(mauvais), null);
});

async function routineDe(lignes: { nom: string; slug?: string; muscle?: string; nb?: number; repos?: number; groupe?: number }[]) {
  const { db } = await baseDeTest();
  const ids: string[] = [];
  for (const l of lignes) ids.push(await creerExercice(db, { nom: l.nom, muscle: l.muscle ?? null, nature: "poids_reps" } as never));
  const rid = await creerRoutine(db, "R", ids.map((exerciceId, i) => ({ exerciceId, nbSeries: lignes[i]!.nb ?? 1, reposS: lignes[i]!.repos ?? 0, groupeSuperset: lignes[i]!.groupe ?? null })));
  const lire = async () => (await lireRoutine(db, rid))!;
  const ligne = async (i: number) => (await lire()).blocs.flatMap((b) => b.lignes)[i]!;
  return { db, rid, lire, ligne };
}

test("dureeEstimee : série chronométrée de 30 min, 5 h, sans cible", async () => {
  const { db, lire, ligne } = await routineDe([{ nom: "Gainage", nb: 2, repos: 60 }]);
  assert.equal(dureeEstimee(await lire()), 2 * 60 + 60, "sans cible : 60 s par série, un repos entre les deux (pas après la dernière)");
  const l = await ligne(0);
  await definirCibleSerie(db, l.id, 0, { dureeS: 30 * 60 });
  assert.equal(dureeEstimee(await lire()), 30 * 60 + 60 + 60);
  await definirCibleSerie(db, l.id, 1, { dureeS: 5 * 3600 });
  const r = await lire();
  assert.equal(dureeEstimee(r), 30 * 60 + 5 * 3600 + 60);
  assert.equal(dureeCourte(5 * 3600 + 20 * 60), "5 h 20");
});

test("dureeEstimee : répétitions, 1000 reps, tempo", async () => {
  const { db, lire, ligne } = await routineDe([{ nom: "Tractions", nb: 1, repos: 0 }]);
  const l = await ligne(0);
  await definirCibleSerie(db, l.id, 0, { reps: 10 });
  assert.equal(dureeEstimee(await lire()), 10 * 4 + 15);
  await definirCibleSerie(db, l.id, 0, { reps: 1000 });
  assert.equal(dureeEstimee(await lire()), 4015);
  await modifierLigneRoutine(db, l.id, { tempo: "3-1-1-0" });
  assert.equal(dureeEstimee(await lire()), 1000 * 5 + 15);
  await modifierLigneRoutine(db, l.id, { tempo: null });
  assert.equal(dureeEstimee(await lire()), 4015);
});

test("dureeEstimee : un superset ne prend qu'un repos par tour", async () => {
  const { db, rid, lire } = await routineDe([{ nom: "Curl biceps", muscle: "Biceps", nb: 2 }, { nom: "Développé couché", nb: 2 }]);
  const ids = (await lireExercicesDeRoutine(db, rid)).map((x) => x.id);
  await creerSuperset(db, rid, ids, 90);
  let r = await lire();
  for (const l of r.blocs[0]!.lignes) for (const rang of [0, 1]) await definirCibleSerie(db, l.id, rang, { reps: 10 });
  r = await lire();
  assert.equal(dureeSerie(r.blocs[0]!.lignes[0]!, 0), 10 * 3 + 15);
  assert.equal(dureeSerie(r.blocs[0]!.lignes[1]!, 0), 10 * 4 + 15);
  assert.equal(dureeEstimee(r), 2 * (45 + 55) + 90, "deux tours, un repos entre les deux (pas après le dernier tour)");
});

test("tempo : enregistré, dupliqué et visible dans la séance de la routine", async () => {
  const { db, rid, ligne } = await routineDe([{ nom: "Squat" }]);
  const l = await ligne(0);
  await modifierLigneRoutine(db, l.id, { tempo: "3-1-1-0" });
  assert.equal((await ligne(0)).tempo, "3-1-1-0");
  const copie = await dupliquerRoutine(db, rid);
  assert.equal((await lireRoutine(db, copie!))!.blocs[0]!.lignes[0]!.tempo, "3-1-1-0");
  const sid = await demarrerSeanceDepuisRoutine(db, rid);
  assert.equal((await lireSeance(db, sid))!.exercices[0]!.tempo, "3-1-1-0");
  const libre = await demarrerSeance(db, null, "Libre");
  assert.equal((await lireSeance(db, libre))!.exercices.length, 0);
});

test("tempo de séance : prioritaire sur la routine, retirable même s'il vient de la routine, repris par « Enregistrer comme routine »", async () => {
  const { db, rid, ligne } = await routineDe([{ nom: "Squat" }, { nom: "Curl" }]);
  await modifierLigneRoutine(db, (await ligne(0)).id, { tempo: "3-1-1-0" });
  const sid = await demarrerSeanceDepuisRoutine(db, rid);
  const lire = async () => (await lireSeance(db, sid))!.exercices;
  const [a, b] = await lire();
  assert.equal(a!.tempo, "3-1-1-0");
  assert.equal(b!.tempo, null);

  await definirTempoSeance(db, sid, a!.exercice.id, "4-0-1-0");
  await definirTempoSeance(db, sid, b!.exercice.id, "2-0-2-0");
  assert.deepEqual((await lire()).map((e) => e.tempo), ["4-0-1-0", "2-0-2-0"]);
  assert.equal((await lireRoutine(db, rid))!.blocs[0]!.lignes[0]!.tempo, "3-1-1-0");

  for (const e of await lire()) await cocherSerie(db, e.series[0]!.id, true);
  const copie = await creerRoutineDepuisSeance(db, sid);
  assert.deepEqual((await lireRoutine(db, copie!))!.blocs.flatMap((x) => x.lignes.map((l) => l.tempo)), ["4-0-1-0", "2-0-2-0"]);

  await definirTempoSeance(db, sid, a!.exercice.id, null);
  await definirTempoSeance(db, sid, b!.exercice.id, null);
  assert.deepEqual((await lire()).map((e) => e.tempo), [null, null]);
  const sans = await creerRoutineDepuisSeance(db, sid);
  assert.deepEqual((await lireRoutine(db, sans!))!.blocs.flatMap((x) => x.lignes.map((l) => l.tempo)), [null, null]);
});

test("tempoApplicable : vrai pour les 4 natures à répétitions, faux pour les 4 en durée ou distance (29/10)", () => {
  const attendu = { poids_reps: true, reps: true, leste: true, assiste: true, duree: false, duree_poids: false, distance_duree: false, poids_distance: false };
  assert.deepEqual(Object.fromEntries(NATURES.map((n) => [n, tempoApplicable(n)])), attendu);
});

test("tempo enregistré sur un exercice en durée : ignoré à la lecture, sans être effacé", () => {
  assert.deepEqual(tempoDe("3-1-1-0", { nature: "poids_reps" }), [3, 1, 1, 0]);
  assert.equal(tempoDe("3-1-1-0", { nature: "duree" }), null);
  assert.equal(tempoDe("3-1-1-0", { nature: "distance_duree" }), null);
});

test("plein écran : tempo propre, sinon défaut de la famille ; rien pour un gainage ou une course", () => {
  const ex = (nature: (typeof NATURES)[number], nom = "Développé couché") => ({ nom, slug: null, muscle: "pectoraux", nature });
  assert.deepEqual(tempoJoue({ tempo: "2-0-2-0", exercice: ex("poids_reps") }), [2, 0, 2, 0]);
  assert.deepEqual(tempoJoue({ tempo: null, exercice: ex("poids_reps") }), lireTempo(TEMPOS_USINE.poly));
  assert.deepEqual(tempoJoue({ tempo: null, exercice: ex("assiste", "Tractions") }), lireTempo(TEMPOS_USINE.poly));
  assert.equal(tempoJoue({ tempo: null, exercice: ex("duree", "Gainage") }), null);
  assert.equal(tempoJoue({ tempo: "3-1-1-0", exercice: ex("duree", "Gainage") }), null);
  assert.equal(tempoJoue({ tempo: null, exercice: ex("distance_duree", "Course") }), null);
  assert.equal(tempoJoue({ tempo: null, exercice: ex("duree_poids", "Farmer walk") }), null);
});

test("priorité du tempo : ligne > exercice > famille ; « off » coupe tout", () => {
  const ex = (tempo: string | null) => ({ nom: "Développé couché", slug: null, muscle: "pectoraux", nature: "poids_reps" as const, tempo });
  const famille = lireTempo(TEMPOS_USINE.poly);
  assert.deepEqual(tempoJoue({ tempo: "2-0-2-0", exercice: ex("3-0-1-0") }), [2, 0, 2, 0]);
  assert.deepEqual(tempoJoue({ tempo: null, exercice: ex("3-0-1-0") }), [3, 0, 1, 0]);
  assert.deepEqual(tempoJoue({ tempo: null, exercice: ex(null) }), famille);
  // Réglage de la famille (Guidage) : sert seulement quand ni la ligne ni l'exercice n'ont de tempo.
  assert.deepEqual(tempoJoue({ tempo: null, exercice: ex(null) }, { poly: "5-0-1-0" }), [5, 0, 1, 0]);
  assert.deepEqual(tempoJoue({ tempo: null, exercice: ex("3-0-1-0") }, { poly: "5-0-1-0" }), [3, 0, 1, 0]);
  // « off » : rien, même avec un tempo sur la ligne ; l'option des menus disparaît, le tempo de ligne est ignoré à l'affichage.
  assert.equal(tempoJoue({ tempo: "2-0-2-0", exercice: ex(TEMPO_OFF) }), null);
  assert.equal(tempoActif(ex(TEMPO_OFF)), false);
  assert.equal(tempoActif(ex(null)), true);
  assert.equal(tempoDe("2-0-2-0", ex(TEMPO_OFF)), null);
  // Défaut proposé par la feuille du tempo : celui de l'exercice, sinon de la famille.
  assert.equal(tempoDefautExercice(ex("3-0-1-0")), "3-0-1-0");
  assert.equal(tempoDefautExercice(ex(null)), TEMPOS_USINE.poly);
  assert.equal(tempoDefautExercice(ex(TEMPO_OFF)), TEMPOS_USINE.poly);
});

test("tempo de l'exercice : enregistré, lu par la routine et la séance, « off » gardé", async () => {
  const { db } = await baseDeTest();
  const id = await creerExercice(db, { nom: "Curl test tempo", nature: "poids_reps", tempo: "3-0-1-0" });
  const rid = await creerRoutine(db, "R tempo", [{ exerciceId: id, nbSeries: 1, reposS: 0, groupeSuperset: null }]);
  assert.equal((await lireRoutine(db, rid))!.blocs[0]!.lignes[0]!.exercice.tempo, "3-0-1-0");
  await modifierExercice(db, id, { tempo: TEMPO_OFF });
  assert.equal((await lireExercice(db, id))!.tempo, TEMPO_OFF);
  const sid = await demarrerSeanceDepuisRoutine(db, rid);
  assert.equal((await lireSeance(db, sid))!.exercices[0]!.exercice.tempo, TEMPO_OFF);
  await modifierExercice(db, id, { nom: "Curl test tempo 2" });
  assert.equal((await lireExercice(db, id))!.tempo, TEMPO_OFF, "un autre changement garde le tempo");
  await modifierExercice(db, id, { tempo: null });
  assert.equal((await lireExercice(db, id))!.tempo, null);
});

test("dureeEstimee : une séance d'une série de 120 min dure 120 min, sans repos après la dernière série (padel, 04/11)", async () => {
  const { db, lire, ligne } = await routineDe([{ nom: "Gainage", nb: 1, repos: 120 }]);
  await definirCibleSerie(db, (await ligne(0)).id, 0, { dureeS: 120 * 60 });
  assert.equal(dureeEstimee(await lire()), 120 * 60);
});
