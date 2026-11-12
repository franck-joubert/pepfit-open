// Noms d'exercices bilingues : affichage selon la langue, recherche dans les deux langues, perso, import, complétion, bilan du catalogue.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { bilanNoms } from "../src/db/audit-noms.ts";
import { completerNoms } from "../src/db/depots/noms.ts";
import { creerExercice, creerVariante, lireExercice, listerExercices, modifierExercice, rechercherExercices } from "../src/db/depots/exercices.ts";
import { creerRoutine, lireRoutine } from "../src/db/depots/routines.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { exporterCsv } from "../src/sync/export.ts";
import { indicesLangue, langueProbable, nomAffiche } from "../src/db/noms.ts";
import { definirActif } from "../src/i18n/index.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { baseDeTest, catalogue } from "./aide.ts";

const langue = (l: "fr" | "en") => definirActif({ langue: l, fuseau: "Europe/Paris", poids: "kg", distance: "km" });
afterEach(() => langue("fr"));

const noms = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"], texte: string) => (await rechercherExercices(db, { texte })).map((e) => e.id);

test("recherche : « bench press » trouve Développé couché en appli française, « développé couché » en appli anglaise", async () => {
  const { db } = await baseDeTest(true);
  for (const l of ["fr", "en"] as const) {
    langue(l);
    assert.ok((await noms(db, "bench press")).includes("cat:couche"), `bench press en ${l}`);
    assert.ok((await noms(db, "Bench  PRESS barbell")).includes("cat:couche"), `casse et mots en ${l}`);
    assert.ok((await noms(db, "développé couché")).includes("cat:couche"), `développé couché en ${l}`);
    assert.ok((await noms(db, "DEVELOPPE couche barre")).includes("cat:couche"), `sans accents en ${l}`);
    assert.ok((await noms(db, "push-up")).length > 0, `ponctuation en ${l}`);
  }
});

test("affichage : le nom suit la langue active dans les listes, la lecture, la séance, la routine et l'export", async () => {
  const { db } = await baseDeTest(true);
  const s = await demarrerSeance(db, null, "Test");
  await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: "cat:couche", kg: 60, reps: 8 }), true);
  await terminerSeance(db, s);
  const r = await creerRoutine(db, "R", [{ exerciceId: "cat:couche" }]);
  const lire = async () => ({
    lu: (await lireExercice(db, "cat:couche"))!.nom,
    liste: (await listerExercices(db)).find((e) => e.id === "cat:couche")!.nom,
    recherche: (await rechercherExercices(db, { texte: "couche" })).find((e) => e.id === "cat:couche")!.nom,
    seance: (await lireSeance(db, s))!.exercices[0]!.exercice.nom,
    routine: (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.exercice.nom,
    csv: (await exporterCsv(db)).split("\n")[1]!.split(",")[4],
  });
  langue("fr");
  for (const v of Object.values(await lire())) assert.equal(v, "Développé couché (Barre)");
  langue("en");
  for (const v of Object.values(await lire())) assert.equal(v, "Barbell Bench Press - Medium Grip");
});

test("affichage : repli sur l'autre langue quand un nom est vide", async () => {
  const { db, raw } = await baseDeTest(true);
  raw.prepare("UPDATE exercices SET nom_en = NULL WHERE id = 'cat:couche'").run();
  raw.prepare("UPDATE exercices SET nom = '' WHERE id = 'cat:squat'").run();
  langue("en");
  assert.equal((await lireExercice(db, "cat:couche"))!.nom, "Développé couché (Barre)");
  assert.equal((await lireExercice(db, "cat:squat"))!.nom, "Barbell Squat");
  langue("fr");
  assert.equal((await lireExercice(db, "cat:squat"))!.nom, "Barbell Squat");
  assert.equal(nomAffiche({ nom: "Squat", nom_en: null }), "Squat");
});

test("perso créé en français : nom seul ; créé en anglais : nom et nom_en ; retrouvé dans les deux langues", async () => {
  const { db, raw } = await baseDeTest(true);
  langue("fr");
  const a = await creerExercice(db, { nom: "Tirage maison" });
  langue("en");
  const b = await creerExercice(db, { nom: "Home Row" });
  const ligne = (id: string) => raw.prepare("SELECT nom, nom_en, nom_en_norm FROM exercices WHERE id = ?").get(id) as { nom: string; nom_en: string | null; nom_en_norm: string | null };
  assert.deepEqual({ ...ligne(a) }, { nom: "Tirage maison", nom_en: null, nom_en_norm: null });
  assert.deepEqual({ ...ligne(b) }, { nom: "Home Row", nom_en: "Home Row", nom_en_norm: "home row" });
  assert.equal(await creerExercice(db, { nom: "home row" }), b);
  assert.equal(await creerExercice(db, { nom: "barbell bench press medium grip" }), "cat:couche");
  langue("fr");
  assert.ok((await noms(db, "home row")).includes(b));
  assert.equal(await creerExercice(db, { nom: "Développé couché (Barre)" }), "cat:couche");
});

test("édition : le nom s'écrit dans le champ de la langue active", async () => {
  const { db, raw } = await baseDeTest(true);
  langue("en");
  const b = await creerExercice(db, { nom: "Home Row" });
  await modifierExercice(db, b, { nom: "Home Cable Row" });
  const ligne = (id: string) => ({ ...(raw.prepare("SELECT nom, nom_en, nom_norm, nom_en_norm FROM exercices WHERE id = ?").get(id) as Record<string, string | null>) });
  assert.deepEqual(ligne(b), { nom: "Home Cable Row", nom_en: "Home Cable Row", nom_norm: "home cable row", nom_en_norm: "home cable row" });
  langue("fr");
  await modifierExercice(db, b, { nom: "Rowing maison" });
  assert.deepEqual(ligne(b), { nom: "Rowing maison", nom_en: "Home Cable Row", nom_norm: "rowing maison", nom_en_norm: "home cable row" });
  assert.equal((await lireExercice(db, b))!.nom, "Rowing maison");
  langue("en");
  assert.equal((await lireExercice(db, b))!.nom, "Home Cable Row");
  await modifierExercice(db, "cat:couche", { nom: "Flat Bench" });
  assert.deepEqual(ligne("cat:couche").nom, "Développé couché (Barre)");
  assert.deepEqual(ligne("cat:couche").nom_en, "Flat Bench");
  await modifierExercice(db, b, { muscle: "Dos" });
  assert.equal(ligne(b).nom_en, "Home Cable Row");
  assert.ok((await creerVariante(db, b, "reps"))!);
  assert.equal(raw.prepare("SELECT nom_en FROM exercices WHERE perso = 1 AND nom_en LIKE '%(%'").all().length, 1);
});

test("import Hevy : un exercice perso au nom anglais reçoit nom_en, un nom français non", async () => {
  const { db, raw } = await baseDeTest(true);
  const csv = [
    '"title","start_time","end_time","exercise_title","set_index","set_type","weight_kg","reps"',
    '"S","20 Oct 2026, 18:00","20 Oct 2026, 19:00","Seated Dumbbell Fly (Machine)","0","normal","10","10"',
    '"S","20 Oct 2026, 18:00","20 Oct 2026, 19:00","Écarté assis maison","0","normal","10","10"',
    '"S","20 Oct 2026, 18:00","20 Oct 2026, 19:00","Push Up","0","normal","","10"',
  ].join("\n");
  await importerHevyTexte(db, csv);
  const l = (nom: string) => raw.prepare("SELECT nom_en, nom_en_norm FROM exercices WHERE nom = ?").get(nom) as { nom_en: string | null; nom_en_norm: string | null } | undefined;
  assert.deepEqual({ ...l("Seated Dumbbell Fly (Machine)") }, { nom_en: "Seated Dumbbell Fly (Machine)", nom_en_norm: "seated dumbbell fly machine" });
  assert.deepEqual({ ...l("Écarté assis maison") }, { nom_en: null, nom_en_norm: null });
  langue("fr");
  assert.ok((await noms(db, "seated dumbbell fly")).length >= 1);
});

test("completerNoms : remplit nom_en_norm et nom_en des perso anglais, laisse le reste, idempotent", async () => {
  const { db, raw } = await baseDeTest(true);
  const ins = raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES (?,?,?,1,'poids_reps',1,1)");
  ins.run("p1", "Cable Lateral Raise Single", "cable lateral raise single");
  ins.run("p2", "Curl marteau maison", "curl marteau maison");
  ins.run("p3", "Burpee", "burpee");
  raw.prepare("UPDATE exercices SET nom_en_norm = NULL").run();
  const n = await completerNoms(db);
  assert.equal(n, catalogue().exercices.length + 1);
  const ligne = (id: string) => ({ ...(raw.prepare("SELECT nom_en, nom_en_norm FROM exercices WHERE id = ?").get(id) as Record<string, string | null>) });
  assert.deepEqual(ligne("p1"), { nom_en: "Cable Lateral Raise Single", nom_en_norm: "cable lateral raise single" });
  assert.deepEqual(ligne("p2"), { nom_en: null, nom_en_norm: null });
  assert.deepEqual(ligne("p3"), { nom_en: null, nom_en_norm: null });
  assert.equal(ligne("cat:couche").nom_en_norm, "barbell bench press medium grip");
  assert.equal(await completerNoms(db), 0);
});

test("langueProbable et indicesLangue", () => {
  assert.equal(langueProbable("Barbell Bench Press"), "en");
  assert.equal(langueProbable("Développé couché incliné (Haltère)"), "fr");
  assert.equal(langueProbable("Incline Dumbbell Press"), "en");
  assert.equal(langueProbable("Burpee"), null);
  assert.equal(langueProbable("Curl marteau (Haltère)"), "fr");
  assert.deepEqual(indicesLangue("Dips (Machine)"), { fr: 0, en: 0 });
});

test("catalogue : chaque exercice a un nom français et un nom anglais, et l'écart se mesure (npm run noms)", () => {
  const b = bilanNoms(catalogue().exercices);
  assert.equal(b.total, 959);
  assert.deepEqual(b.sansNomFr, []);
  assert.deepEqual(b.sansNomEn, []);
  assert.deepEqual(b.enVisiblementFrancais, ["barre-fitness"]);
  assert.ok(b.frVisiblementAnglais.length <= 6, b.frVisiblementAnglais.join(", "));
  assert.deepEqual(bilanNoms([{ slug: "a", nom: "", nom_en: "Squat" }, { slug: "b", nom: "Squat", nom_en: " " }]).sansNomFr, ["a"]);
});
