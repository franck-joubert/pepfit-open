import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterNote } from "../src/db/depots/notes.ts";
import {
  creerRoutine,
  creerSuperset,
  definirCibleSerie,
  definirTypeSerie,
  dupliquerRoutine,
  lireExercicesDeRoutine,
  lireRoutine,
  listerRoutines,
  modifierLigneRoutine,
  modifierRoutine,
  supprimerRoutine,
} from "../src/db/depots/routines.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lirePrecedent, terminerSeance } from "../src/db/depots/seances.ts";
import { seriesLecture } from "../src/ecrans/routine-lecture.ts";
import { nbSeancesRoutine, progressionRoutine } from "../src/db/stats.ts";
import { baseDeTest, jour } from "./aide.ts";

type Db = Awaited<ReturnType<typeof baseDeTest>>["db"];

/** Une séance terminée avec une routine : séries (kg, reps, type) d'un exercice, durée en minutes. */
async function seanceRoutine(db: Db, routineId: string | null, exo: string, debut: number, minutes: number, series: [number, number, string?][]) {
  const id = await demarrerSeance(db, routineId, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [debut, id]);
  for (const [kg, reps, type] of series) {
    const sid = await ajouterSerie(db, { seanceId: id, exerciceId: exo, kg, reps, type: (type ?? "normale") as never });
    await cocherSerie(db, sid, true);
  }
  await terminerSeance(db, id, debut + minutes * 60_000);
  return id;
}

test("progression d'une routine : volume, réps et durée par séance terminée, échauffements exclus, période", async () => {
  const { db } = await baseDeTest();
  const squat = await creerExercice(db, { nom: "Squat" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: squat }]);
  const autre = await creerRoutine(db, "Haut", [{ exerciceId: squat }]);
  await seanceRoutine(db, r, squat, jour(2026, 3, 1), 50, [[40, 10, "echauffement"], [100, 5], [100, 5]]);
  await seanceRoutine(db, r, squat, jour(2026, 6, 1), 45, [[110, 5], [110, 6]]);
  await seanceRoutine(db, autre, squat, jour(2026, 6, 2), 30, [[200, 5]]);
  // Séance en cours : pas comptée.
  await demarrerSeance(db, r, "En cours");

  const vol = await progressionRoutine(db, r, "volume");
  assert.deepEqual(vol.points.map((p) => p.valeur), [1000, 1210]);
  assert.equal(vol.gain, 210);
  assert.deepEqual((await progressionRoutine(db, r, "reps")).points.map((p) => p.valeur), [10, 11]);
  const duree = await progressionRoutine(db, r, "duree");
  assert.deepEqual(duree.points.map((p) => p.valeur), [50, 45]);
  assert.equal(duree.gain, -5);

  const recent = await progressionRoutine(db, r, "volume", jour(2026, 5, 1));
  assert.equal(recent.points.length, 1);
  assert.equal(recent.gain, 0);
  assert.equal(await nbSeancesRoutine(db, r), 2);
  assert.deepEqual((await progressionRoutine(db, "inconnue", "volume")).points, []);
});

test("dupliquer : copie fidèle (supersets, repos, notes, plages, cibles, types), placée juste après, l'original intact", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Développé couché" });
  const b = await creerExercice(db, { nom: "Rowing" });
  const c = await creerExercice(db, { nom: "Tirage" });
  const r1 = await creerRoutine(db, "Push", [{ exerciceId: a, nbSeries: 4, reposS: 150 }, { exerciceId: b }, { exerciceId: c }]);
  const r2 = await creerRoutine(db, "Pull", []);
  await modifierRoutine(db, r1, { note: "Lent en excentrique" });
  const [la, lb, lc] = await lireExercicesDeRoutine(db, r1);
  await modifierLigneRoutine(db, la!.id, { plageReps: true });
  await ajouterNote(db, { exerciceId: a, ligneId: la!.id }, "routine", "prise serrée");
  await ajouterNote(db, { exerciceId: a, ligneId: la!.id }, "routine", "deuxième note");
  await definirTypeSerie(db, la!.id, 0, "echauffement");
  await definirCibleSerie(db, la!.id, 1, { kg: 80, reps: 8, repsMax: 10 });
  await creerSuperset(db, r1, [lb!.id, lc!.id], 90);

  const copie = (await dupliquerRoutine(db, r1))!;
  const o = (await lireRoutine(db, r1))!;
  const d = (await lireRoutine(db, copie))!;
  assert.equal(d.nom, "Push (copie)");
  assert.equal(d.note, "Lent en excentrique");
  const sans = (x: typeof o) => x.blocs.map((bl) => ({ ...bl, lignes: bl.lignes.map(({ id: _i, routine_id: _r, notes, notesExercice, ...l }) => ({ ...l, notes: notes.map((n) => n.texte), notesExercice: notesExercice.map((n) => n.texte) })) }));
  assert.deepEqual(sans(d), sans(o));
  assert.deepEqual(d.blocs[0]!.lignes[0]!.notes.map((n) => n.texte), ["prise serrée", "deuxième note"]);
  assert.equal(d.blocs[1]!.groupeSuperset !== null && d.blocs[1]!.lignes.length, 2);
  assert.equal(d.blocs[1]!.reposS, 90);
  assert.equal(d.blocs[0]!.lignes[0]!.cibles[1]!.reps_max, 10);

  assert.deepEqual((await listerRoutines(db)).map((x) => x.nom), ["Push", "Push (copie)", "Pull"]);
  void r2;

  // Les lignes sont bien distinctes : modifier la copie ne touche pas l'original.
  await modifierLigneRoutine(db, d.blocs[0]!.lignes[0]!.id, { nbSeries: 1 });
  assert.equal((await lireRoutine(db, r1))!.blocs[0]!.lignes[0]!.nb_series, 4);
  assert.equal(await dupliquerRoutine(db, "inconnue"), null);
});

test("supprimer une routine : ses séances restent dans l'historique, sans routine", async () => {
  const { db } = await baseDeTest();
  const squat = await creerExercice(db, { nom: "Squat" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: squat }]);
  const s = await seanceRoutine(db, r, squat, jour(2026, 6, 1), 40, [[100, 5]]);
  await supprimerRoutine(db, r);
  const l = await db.getFirstAsync<{ routine_id: string | null }>("SELECT routine_id FROM seances WHERE id = ?", [s]);
  assert.equal(l!.routine_id, null);
  assert.equal(await lireRoutine(db, r), null);
});

test("séries en lecture : précédent apparié hors échauffement, cible réglée sinon reprise du précédent, plage « 8–10 »", async () => {
  const { db } = await baseDeTest();
  const dc = await creerExercice(db, { nom: "Développé couché" });
  const r = await creerRoutine(db, "Push", [{ exerciceId: dc, nbSeries: 3 }]);
  const [l] = await lireExercicesDeRoutine(db, r);
  await definirTypeSerie(db, l!.id, 0, "echauffement");
  await definirCibleSerie(db, l!.id, 0, { kg: 40, reps: 12 });
  await definirCibleSerie(db, l!.id, 2, { kg: 82.5 });
  await seanceRoutine(db, r, dc, jour(2026, 6, 1), 40, [[80, 8], [80, 7]]);
  const ligne = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!;
  const prec = await lirePrecedent(db, dc);
  const s = seriesLecture(ligne, prec, ["kg", "reps"], "kg");
  assert.deepEqual(s.map((x) => x.type), ["echauffement", "normale", "normale"]);
  assert.deepEqual(s.map((x) => x.precedent), ["–", "80 kg × 8", "80 kg × 7"]);
  assert.deepEqual(s.map((x) => x.cases.map((c) => `${c.texte}${c.vise ? "" : "*"}`)), [["40", "12"], ["80*", "8*"], ["82,5", "7*"]]);

  await modifierLigneRoutine(db, l!.id, { plageReps: true });
  await definirCibleSerie(db, l!.id, 1, { reps: 8, repsMax: 10 });
  const plage = seriesLecture((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!, [], ["kg", "reps"], "kg");
  assert.equal(plage[1]!.cases[1]!.texte, "8–10");
  assert.equal(plage[1]!.precedent, "–");
  assert.deepEqual(plage[1]!.cases[0], { champ: "kg", texte: "–", vise: false });
});
