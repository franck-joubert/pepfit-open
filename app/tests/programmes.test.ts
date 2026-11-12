// Programmes par sport (planche idee-programmes, 28/10) : migration 30, vocabulaire par type, formats, tri du catalogue,
// sous-page rangée par type.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  creerRoutine, creerRoutineDepuisSeance, dupliquerRoutine, listerRoutines, lireRoutine, modifierTypeRoutine, rangerProgramme,
} from "../src/db/depots/routines.ts";
import { migrer, MIGRATIONS, VERSION_COURANTE } from "../src/db/migrations.ts";
import {
  dansGroupe, grouperParType, lireFormat, lireType, ordreTypes, sectionsCatalogue, TYPES, typeDeSport, vocabulaire, type GroupeCatalogue,
} from "../src/db/programmes.ts";
import { rechercherExercices } from "../src/db/depots/exercices.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";
import { definirActif } from "../src/i18n/index.ts";
import { importerRoutinesHevyTexte } from "../src/import/importer.ts";
import { adapter, baseDeTest } from "./aide.ts";

test("migration 30 : témoin routines.type ; les routines existantes deviennent de la musculation, intactes", async () => {
  const m = MIGRATIONS.find((x) => x.version === 30)!;
  assert.equal(m.temoin, "routines.type");
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 29);
  raw.exec(`INSERT INTO routines (id,nom,note,ordre,cree_le,maj_le) VALUES ('r1','Push','n',0,1,5),('r2','Pull',NULL,1,2,6);`);
  const avant = raw.prepare("SELECT * FROM routines ORDER BY id").all().map((r) => ({ ...r }));
  await migrer(db);
  const apres = raw.prepare("SELECT * FROM routines ORDER BY id").all().map((r) => ({ ...r })) as Record<string, unknown>[];
  assert.deepEqual(
    apres.map(({ type: _t, format: _f, format_valeur: _v, plan_id: _p, visible: _vi, origine: _o, version_origine: _vo, modifie_par: _mp, modifie_le: _ml, ...reste }) => reste),
    avant,
  );
  assert.deepEqual(apres.map((r) => [r.type, r.format, r.format_valeur]), [["muscu", null, null], ["muscu", null, null]]);
  // Relancer ne refait rien (le témoin existe).
  await migrer(db);
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);
});

test("migration 30 : un téléphone qui l'a reçue sous un autre numéro la saute sans planter", async () => {
  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db, 29);
  raw.exec("ALTER TABLE routines ADD COLUMN type TEXT NOT NULL DEFAULT 'muscu'; ALTER TABLE routines ADD COLUMN format TEXT; ALTER TABLE routines ADD COLUMN format_valeur INTEGER;");
  raw.exec("PRAGMA user_version = 28");
  await migrer(db);
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);
});

test("routines importées de Hevy : de la musculation", async () => {
  const { db } = await baseDeTest();
  const json = JSON.stringify({
    routines: [{ id: "h1", title: "Haut", folder_id: null, notes: null, exercises: [{ index: 0, title: "Pull Up", notes: null, exercise_template_id: "T", superset_id: null, rest_seconds: 90, sets: [{ index: 0, type: "normal", weight_kg: null, reps: 8, distance_meters: null, duration_seconds: null, custom_metric: null }] }] }],
    dossiers: [],
  });
  await importerRoutinesHevyTexte(db, json);
  const l = await listerRoutines(db);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.type, "muscu");
  assert.equal(l[0]!.format, null);
});

test("type et format : création, lecture, changement, copie, « Enregistrer comme programme »", async () => {
  const { db, raw } = await baseDeTest();
  const id = await creerRoutine(db, "Nouveau WOD", [], undefined, { type: "cross", format: "amrap", formatValeur: 720 });
  const d = await lireRoutine(db, id);
  assert.deepEqual([d!.type, d!.format, d!.formatValeur], ["cross", "amrap", 720]);
  await modifierTypeRoutine(db, id, { format: "rounds", formatValeur: 5 });
  assert.deepEqual((await listerRoutines(db)).map((r) => [r.type, r.format, r.formatValeur]), [["cross", "rounds", 5]]);
  const copie = (await dupliquerRoutine(db, id))!;
  const c = await lireRoutine(db, copie);
  assert.deepEqual([c!.type, c!.format, c!.formatValeur], ["cross", "rounds", 5]);
  // Une séance tirée d'un WOD redevient un WOD.
  raw.exec(`INSERT INTO seances (id, debut, maj_le, routine_id) VALUES ('s1', 1, 1, '${id}')`);
  const depuis = (await creerRoutineDepuisSeance(db, "s1"))!;
  assert.equal((await lireRoutine(db, depuis))!.type, "cross");
  // Valeur inconnue en base (type venu d'une version plus récente) : lue comme « autre », sans planter.
  raw.exec(`UPDATE routines SET type = 'escalade', format = 'tabata' WHERE id = '${id}'`);
  const x = await lireRoutine(db, id);
  assert.deepEqual([x!.type, x!.format], ["autre", null]);
});

test("rangerProgramme : rang dans le type, changement de type par glisser, les autres types gardent leur ordre", async () => {
  const { db } = await baseDeTest();
  const a = await creerRoutine(db, "A", []);
  const w1 = await creerRoutine(db, "W1", [], undefined, { type: "cross" });
  const b = await creerRoutine(db, "B", []);
  const w2 = await creerRoutine(db, "W2", [], undefined, { type: "cross" });
  const vue = async () => grouperParType(await listerRoutines(db)).map((g) => [g.type, g.routines.map((r) => r.nom)]);
  assert.deepEqual(await vue(), [["muscu", ["A", "B"]], ["cross", ["W1", "W2"]]]);
  await rangerProgramme(db, b, "muscu", 0);
  assert.deepEqual(await vue(), [["muscu", ["B", "A"]], ["cross", ["W1", "W2"]]]);
  await rangerProgramme(db, a, "cross", 1);
  assert.deepEqual(await vue(), [["muscu", ["B"]], ["cross", ["W1", "A", "W2"]]]);
  await rangerProgramme(db, w2, "course", 0);
  assert.deepEqual(await vue(), [["muscu", ["B"]], ["cross", ["W1", "A"]], ["course", ["W2"]]]);
  assert.ok([w1].length);
});

test("ordre des types : celui enregistré, puis les manquants ; types vides absents ; valeurs inconnues ignorées", () => {
  assert.deepEqual(ordreTypes(["cross", "x", "cross", "muscu"]).slice(0, 3), ["cross", "muscu", "course"]);
  assert.equal(ordreTypes([]).length, TYPES.length);
  const g = grouperParType([{ type: "muscu" as const }, { type: "course" as const }], ["course", "muscu"]);
  assert.deepEqual(g.map((x) => x.type), ["course", "muscu"]);
  assert.equal(lireType(null), "autre");
  assert.equal(lireType("velo"), "velo");
  assert.equal(lireFormat("emom"), "emom");
  assert.equal(lireFormat(""), null);
});

test("vocabulaire par type (NOTES § 2) : modèle, nom par défaut, catalogue, feuille, en français et en anglais", () => {
  const f = (k: keyof typeof fr) => fr[k] as string;
  const e = (k: keyof typeof en) => en[k] as string;
  const v = vocabulaire("cross");
  assert.deepEqual([f(v.modele), f(v.nomDefaut), f(v.ajouterAu), f(v.contenu), f(v.ajouterContenu), f(v.demarrer), f(v.liste), f(v.tous), f(v.libre)], [
    "WOD", "Nouveau WOD", "Ajouter au WOD", "Mouvements", "Ajouter un mouvement", "Démarrer le WOD", "WOD", "Tous les WOD", "WOD libre",
  ]);
  assert.deepEqual([e(v.modele), e(v.nomDefaut), e(v.ajouterAu)], ["WOD", "New WOD", "Add to WOD"]);
  const m = vocabulaire("muscu");
  assert.deepEqual([f(m.modele), f(m.nomDefaut), f(m.ajouterAu), f(m.demarrer), f(m.libre)], ["Routine", "Nouvelle routine", "Ajouter à la routine", "Démarrer la séance", "Séance libre"]);
  assert.deepEqual([e(m.modele), e(m.nomDefaut)], ["Routine", "New routine"]);
  const c = vocabulaire("course");
  assert.deepEqual([f(c.modele), f(c.nomDefaut), e(c.modele), e(c.nomDefaut), f(c.demarrer)], ["Routine", "Nouvelle routine de course", "Routine", "New running routine", "Démarrer"]);
  assert.deepEqual([f(vocabulaire("velo").nomDefaut), f(vocabulaire("natation").nomDefaut)], ["Nouvelle routine de vélo", "Nouvelle routine de natation"]);
  assert.deepEqual([f(vocabulaire("mobilite").modele), f(vocabulaire("mobilite").nomDefaut), e(vocabulaire("mobilite").modele)], ["Enchaînement", "Nouvel enchaînement", "Flow"]);
  // Toutes les clés existent, dans les deux langues, pour chaque type.
  for (const t of TYPES) for (const k of Object.values(vocabulaire(t))) assert.ok(k in fr && k in en, `${t} : ${k}`);
});

// Le lexique du 29/10 (docs/LEXIQUE.md) remplace la règle du 28/10 « jamais routine à l'écran » : une liste d'exercices
// réutilisable s'appelle « Routine » ; les anciens mots sont refusés par tests/lexique.test.ts.
test("une routine s'appelle « Routine » à l'écran (lexique du 29/10)", () => {
  assert.deepEqual([fr["programmes.titre"], fr["programmes.nouveau"], en["programmes.titre"], en["programmes.nouveau"]], ["Routines", "Nouvelle routine", "Routines", "New routine"]);
});

test("sport du lanceur → type de programme", () => {
  assert.equal(typeDeSport("cat:musculation"), "muscu");
  assert.equal(typeDeSport("cat:cross-training"), "cross");
  assert.equal(typeDeSport("cat:course"), "course");
  assert.equal(typeDeSport("cat:bicycling"), "velo");
  assert.equal(typeDeSport("cat:padel"), null);
  assert.equal(typeDeSport(null), null);
});

test("appartenance : slugs, catégories, kettlebell, perso ; un exercice peut être de plusieurs groupes", () => {
  const ex = (slug: string | null, categorie: string | null, equipement: string | null = null, perso = 0) => ({ slug, categorie, equipement, perso });
  assert.ok(dansGroupe(ex("one-arm-kettlebell-swings", "Force", "kettlebell"), "cross"));
  assert.ok(dansGroupe(ex("one-arm-kettlebell-swings", "Force", "kettlebell"), "muscu"));
  assert.ok(dansGroupe(ex("front-box-jump", "Pliométrie"), "cross"));
  assert.ok(dansGroupe(ex("rope-jumping", "Cardio"), "cross") && dansGroupe(ex("rope-jumping", "Cardio"), "cardio"));
  assert.ok(!dansGroupe(ex("barbell-bench-press", "Force", "barre"), "cross"));
  assert.ok(dansGroupe(ex(null, null, "autre", 1), "muscu"));
  assert.ok(dansGroupe(ex("yoga", "Bien-être"), "mobilite"));
  assert.ok(dansGroupe(ex("padel", "Sport de raquette"), "sports"));
});

test("catalogue trié : le type d'abord, puis tout ; puce = filtre ; recherche en deux groupes ; rien de masqué", async () => {
  const { db } = await baseDeTest(true);
  const tous = await rechercherExercices(db, { limite: 2000 });
  const n = tous.length;
  const s = sectionsCatalogue(tous, { tete: "cross", filtre: null, recherche: false });
  assert.deepEqual(s.map((x) => x.titre), ["programmes.groupe.cross", "exercices.choix.tous"]);
  assert.ok(s[0]!.exercices.length > 30, `cross : ${s[0]!.exercices.length}`);
  assert.equal(s[1]!.exercices.length, n);
  assert.ok(s[0]!.exercices.some((e) => e.slug === "one-arm-kettlebell-swings"));
  assert.ok(!s[0]!.exercices.some((e) => e.slug === "barbell-bench-press"));
  // Depuis la muscu : autre groupe en tête, même liste complète dessous.
  const m = sectionsCatalogue(tous, { tete: "muscu", filtre: null, recherche: false });
  assert.equal(m[0]!.titre, "programmes.groupe.muscu");
  assert.equal(m[1]!.exercices.length, n);
  // Puce Cardio : ce groupe seul.
  const c = sectionsCatalogue(tous, { tete: "muscu", filtre: "cardio", recherche: false });
  assert.equal(c.length, 1);
  assert.ok(c[0]!.exercices.every((e) => e.categorie === "Cardio"));
  assert.equal(c[0]!.exercices.length, 24);
  // Recherche « squat » : le type d'abord, puis les autres, sans doublon ni perte.
  const sq = await rechercherExercices(db, { texte: "squat", limite: 2000 });
  const r = sectionsCatalogue(sq, { tete: "cross", filtre: null, recherche: true });
  assert.deepEqual(r.map((x) => x.titre), ["programmes.groupe.cross", "programmes.autres"]);
  assert.equal(r[0]!.exercices.length + r[1]!.exercices.length, sq.length);
  // Sans type (séance, autre sport) : comme avant.
  assert.deepEqual(sectionsCatalogue(tous, { tete: null, filtre: null, recherche: false }).map((x) => [x.titre, x.exercices.length]), [["exercices.choix.tous", n]]);
  // Chaque groupe a des exercices, et ses clés de titre existent.
  for (const g of ["cross", "muscu", "cardio", "mobilite", "sports"] as GroupeCatalogue[]) {
    assert.ok(tous.some((e) => dansGroupe(e, g)), g);
    assert.ok(`programmes.groupe.${g}` in fr && `programmes.groupe.${g}` in en);
  }
});

test("textes des cartes : format du WOD, durée estimée sinon, détail dans les mots du type ; création sous le nom par défaut", async () => {
  const { resumeFormat, metaCarte, detailCarte, creerProgramme } = await import("../src/ecrans/programmes-vue.ts");
  assert.equal(resumeFormat("amrap", 720), "AMRAP 12 min");
  assert.equal(resumeFormat("emom", null), "EMOM 10 min");
  assert.equal(resumeFormat("fortime", 1800), "For time, 30 min max");
  assert.equal(resumeFormat("rounds", 5), "5 rounds");
  assert.equal(resumeFormat(null, null), null);
  assert.equal(metaCarte({ format: null, formatValeur: null, dureeS: 2700 }), "45 min");
  assert.equal(metaCarte({ format: "amrap", formatValeur: 720, dureeS: 2700 }), "AMRAP 12 min");
  const exos = [{ nom: "Swing" }, { nom: "Saut sur box" }];
  assert.equal(detailCarte({ type: "cross", series: 2, exercices: exos }), "2 mouvements, Swing, Saut sur box");
  assert.equal(detailCarte({ type: "muscu", series: 18, exercices: exos }), "18 séries, Swing, Saut sur box");
  const { db } = await baseDeTest();
  const id = await creerProgramme(db, "cross");
  const d = await lireRoutine(db, id);
  assert.deepEqual([d!.nom, d!.type, d!.format, d!.formatValeur], ["Nouveau WOD", "cross", "amrap", 720]);
  const m = await lireRoutine(db, await creerProgramme(db, "muscu"));
  assert.deepEqual([m!.nom, m!.type, m!.format], ["Nouvelle routine", "muscu", null]);
});

test("« Enregistrer comme programme » d'une séance libre : nom dans la langue du moment, jamais un « Séance libre » d'avant", async () => {
  const { db, raw } = await baseDeTest();
  raw.exec(`INSERT INTO seances (id, debut, maj_le, titre) VALUES ('s1', 1, 1, NULL), ('s2', 2, 2, 'Séance libre')`);
  definirActif({ langue: "en", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  try {
    assert.equal((await lireRoutine(db, (await creerRoutineDepuisSeance(db, "s1"))!))!.nom, en["seance.seance.titreDefaut"]);
    assert.equal((await lireRoutine(db, (await creerRoutineDepuisSeance(db, "s2"))!))!.nom, en["seance.seance.titreDefaut"]);
  } finally {
    definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  }
  assert.equal((await lireRoutine(db, (await creerRoutineDepuisSeance(db, "s1"))!))!.nom, fr["seance.seance.titreDefaut"]);
});
