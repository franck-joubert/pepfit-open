import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { chargerCatalogue } from "../src/db/catalogue.ts";
import { rechercherExercices } from "../src/db/depots/exercices.ts";
import { lireSeance } from "../src/db/depots/seances.ts";
import { compter, recordsExercice } from "../src/db/stats.ts";
import { dateHevy, ErreurImport, lireExportHevy } from "../src/import/hevy-csv.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { baseDeTest, catalogue } from "./aide.ts";

const EN_TETE = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
const CSV = [
  EN_TETE,
  '"Pull A","20 Oct 2026, 18:00","20 Oct 2026, 19:05","Séance, avec ""virgule""","Tractions","","","0","warmup","","5","","",""',
  '"Pull A","20 Oct 2026, 18:00","20 Oct 2026, 19:05","Séance, avec ""virgule""","Tractions","","","1","normal","","10","","",""',
  '"Pull A","20 Oct 2026, 18:00","20 Oct 2026, 19:05","","Tirage Poitrine (Poulie)","0","Note\nsur deux lignes","0","normal","60","10","","","8"',
  '"Pull A","20 Oct 2026, 18:00","20 Oct 2026, 19:05","","Tirage Poitrine (Poulie)","0","","1","dropset","50","12","","",""',
  '"Pull A","20 Oct 2026, 18:00","20 Oct 2026, 19:05","","Curl Biceps (Barre)","0","","0","failure","30","7","","",""',
  '"Pull A","20 Oct 2026, 18:00","20 Oct 2026, 19:05","","Exercice Maison","","","0","normal","12,5","15","","",""',
  '"Cardio","22 Oct 2026, 07:30","22 Oct 2026, 08:00","","Pétanque","","","0","normal","","","","1800",""',
  '"Pull A","27 Oct 2026, 18:00","27 Oct 2026, 19:00","","Tractions","","","0","normal","","12","","",""',
].join("\n");

test("dateHevy : format d'export en heure locale", () => {
  assert.equal(dateHevy("25 Oct 2026, 10:58"), new Date(2026, 9, 25, 10, 58).getTime());
  assert.equal(dateHevy("1 Jan 2022, 07:05"), new Date(2022, 0, 1, 7, 5).getTime());
  assert.equal(dateHevy("n'importe quoi"), null);
});

test("dateHevy : export d'un Hevy en français (mois abrégés, points, accents)", () => {
  const mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  mois.forEach((m, i) => assert.equal(dateHevy(`3 ${m} 2025, 18:30`), new Date(2025, i, 3, 18, 30).getTime(), m));
  assert.equal(dateHevy("3 juin 2025 à 18:30"), new Date(2025, 5, 3, 18, 30).getTime());
  assert.equal(dateHevy("3 Jun 2025, 18:30"), new Date(2025, 5, 3, 18, 30).getTime());
  assert.equal(dateHevy("3 Jul 2025, 18:30"), new Date(2025, 6, 3, 18, 30).getTime());
  assert.equal(dateHevy("3 truc 2025, 18:30"), null);
});

test("lecture CSV : guillemets, virgules, sauts de ligne, kg décimal, types, supersets d'un seul exercice dissous", () => {
  const { seances, erreurs } = lireExportHevy(CSV);
  assert.deepEqual(erreurs, []);
  assert.equal(seances.length, 3);
  const s = seances[0]!;
  assert.equal(s.description, 'Séance, avec "virgule"');
  assert.deepEqual(s.exercices.map((e) => e.nom), ["Tractions", "Tirage Poitrine (Poulie)", "Curl Biceps (Barre)", "Exercice Maison"]);
  assert.deepEqual(s.exercices[0]!.series.map((x) => x.type), ["echauffement", "normale"]);
  assert.deepEqual(s.exercices[1]!.series.map((x) => x.type), ["normale", "degressive"]);
  assert.equal(s.exercices[1]!.note, "Note\nsur deux lignes");
  assert.equal(s.exercices[2]!.series[0]!.type, "rate");
  assert.equal(s.exercices[3]!.series[0]!.kg, 12.5);
  // superset_id « 0 » porté par deux exercices : un vrai superset ; le Curl, seul dans son groupe 0 ? non : groupe 0 = Tirage + Curl
  assert.equal(s.exercices[1]!.groupeSuperset, 0);
  assert.equal(s.exercices[2]!.groupeSuperset, 0);
  assert.equal(seances[1]!.exercices[0]!.series[0]!.dureeS, 1800);
});

test("lecture CSV : fichier qui n'est pas un export Hevy, date illisible, lbs et miles", () => {
  assert.throws(() => lireExportHevy("a,b\n1,2"), ErreurImport);
  const mauvais = lireExportHevy(`${EN_TETE}\n"X","pas une date","","","Squat","","","0","normal","50","5","","",""`);
  assert.equal(mauvais.seances.length, 0);
  assert.equal(mauvais.erreurs.length, 1);
  const imperial = lireExportHevy(
    '"title","start_time","end_time","exercise_title","set_index","set_type","weight_lbs","reps","distance_miles"\n"X","1 Jan 2026, 10:00","1 Jan 2026, 11:00","Squat","0","normal","225","5",""',
  );
  assert.equal(imperial.seances[0]!.exercices[0]!.series[0]!.kg, 102.06);
});

test("catalogue : 959 exercices (878 + 81 activités Whoop), chargé une fois, upsert sans doublon, picto, recherche", async () => {
  const { db, raw } = await baseDeTest();
  const cat = catalogue();
  assert.equal(await chargerCatalogue(db, cat), cat.exercices.length);
  assert.equal(await chargerCatalogue(db, cat), 0);
  assert.equal((await compter(db))["exercices"], cat.exercices.length);
  assert.equal(cat.exercices.length, 959);
  await chargerCatalogue(db, { ...cat, version: cat.version + 1 });
  assert.equal((await compter(db))["exercices"], 959);
  const squat = (await rechercherExercices(db, { texte: "squat barre" }))[0];
  assert.ok(squat);
  const e = raw.prepare("SELECT slug, picto, muscle, secondaires FROM exercices WHERE slug = 'squat'").get() as { picto: string; muscle: string };
  const present = existsSync(new URL("../assets/pictos/squat-512.webp", import.meta.url));
  assert.equal(e.picto, present ? "assets/pictos/squat-512.webp" : "assets/pictos/neutre-512.webp");
  assert.equal(e.muscle, "Quadriceps");
  const sauna = raw.prepare("SELECT picto FROM exercices WHERE slug = 'sauna'").get() as { picto: string }; // longtemps au picto neutre ; picto d'activité depuis les 50 sports (sports50.py)
  assert.equal(sauna.picto, "assets/pictos/sauna-512.webp");
  assert.ok(cat.exercices.every((x) => /^assets\/pictos\/[a-z0-9-]+-512\.webp$/.test(x.picto)));
  assert.ok(cat.exercices.every((x) => x.nom && x.slug && x.materiel));
});

test("import : rapport, correspondance, exercices perso, supersets, idempotence", async () => {
  const { db, raw } = await baseDeTest(true);
  const r = await importerHevyTexte(db, CSV);
  assert.equal(r.seancesLues, 3);
  assert.equal(r.seancesImportees, 3);
  assert.equal(r.seriesImportees, 8);
  assert.deepEqual(r.exercicesNonReconnus.sort(), ["Exercice Maison", "Pétanque"]);
  assert.equal(r.exercicesReconnus, 3);
  assert.deepEqual(r.erreurs, []);

  const perso = raw.prepare("SELECT nom, nature, a_verifier FROM exercices WHERE perso = 1 ORDER BY nom").all() as { nom: string; nature: string; a_verifier: number }[];
  assert.deepEqual(perso.map((p) => [p.nom, p.nature, p.a_verifier]), [["Exercice Maison", "poids_reps", 1], ["Pétanque", "duree", 0]]);
  assert.deepEqual(r.exercicesAVerifier, ["Exercice Maison"]);
  const seance = raw.prepare("SELECT id FROM seances WHERE titre = 'Pull A' ORDER BY debut LIMIT 1").get() as { id: string };
  const d = (await lireSeance(db, seance.id))!;
  assert.equal(d.exercices[1]!.exercice.slug, "wide-grip-lat-pulldown");
  assert.equal(d.blocs.length, 3);
  assert.deepEqual(d.blocs[1]!.exercices.map((e) => e.exercice.nom.slice(0, 5)), ["Tirag", "Curl "]);
  assert.equal(d.seance.volume_kg, 600 + 600 + 210 + 187.5);
  const tractions = d.exercices[0]!;
  assert.equal(tractions.series[1]!.precedent_reps, null);
  assert.equal(d.seance.note, 'Séance, avec "virgule"');

  // La séance du 27/10 retrouve son précédent (séance du 20/10), échauffement exclu.
  const suivante = raw.prepare("SELECT id FROM seances WHERE debut > ? AND titre = 'Pull A'").get(new Date(2026, 9, 21).getTime()) as { id: string };
  const s2 = (await lireSeance(db, suivante.id))!;
  assert.equal(s2.exercices[0]!.series[0]!.precedent_reps, 10);
  const rec = await recordsExercice(db, tractions.exercice.id);
  assert.equal(rec.actuels.reps?.valeur, 12);

  const avant = await compter(db);
  const r2 = await importerHevyTexte(db, CSV);
  assert.equal(r2.seancesImportees, 0);
  assert.equal(r2.seancesDejaPresentes, 3);
  assert.deepEqual(r2.exercicesNonReconnus, []);
  assert.deepEqual(await compter(db), avant);
});

test("import : tout ou rien si une erreur survient en cours de route", async () => {
  const { db } = await baseDeTest(true);
  await db.execAsync("CREATE TRIGGER casse BEFORE INSERT ON series WHEN NEW.reps = 12 BEGIN SELECT RAISE(ABORT, 'boum'); END");
  await assert.rejects(importerHevyTexte(db, CSV));
  const n = await compter(db);
  assert.equal(n["seances"], 0);
  assert.equal(n["series"], 0);
});

// --- Historique réel d'Alex (données personnelles, hors git) ---
const REEL = new URL("../donnees-perso/hevy-export.csv", import.meta.url);
const API = new URL("../donnees-perso/hevy-api.json", import.meta.url);

interface SerieApi { type: string; weight_kg: number | null; reps: number | null }
interface SeanceApi { title: string; start_time: string; exercises: { title: string; sets: SerieApi[] }[] }

test("import réel : tout l'historique, zéro erreur, records vérifiés contre l'API", { skip: !existsSync(REEL) || !existsSync(API) }, async () => {
  const api = JSON.parse(readFileSync(API, "utf8")) as SeanceApi[];
  const { db, raw } = await baseDeTest(true);
  const t0 = performance.now();
  const r = await importerHevyTexte(db, readFileSync(REEL, "utf8"));
  const ms = Math.round(performance.now() - t0);
  const nbSeries = api.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  console.log(`# import réel : ${r.seancesImportees} séances, ${r.seriesImportees} séries, ${r.exercicesReconnus} exercices reconnus, ${r.exercicesNonReconnus.length} non reconnus, ${ms} ms`);
  console.log(`# non reconnus : ${r.exercicesNonReconnus.join(" | ")}`);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.seancesLues, api.length);
  assert.equal(r.seancesImportees, api.length);
  assert.equal(r.seriesImportees, nbSeries);

  const r2 = await importerHevyTexte(db, readFileSync(REEL, "utf8"));
  assert.equal(r2.seancesImportees, 0);
  assert.equal((await compter(db))["seances"], api.length);

  // Volume total : calculé ici directement depuis l'API, sans le code de l'appli.
  let volumeApi = 0;
  for (const s of api) for (const e of s.exercises) for (const x of e.sets) if (x.type !== "warmup") volumeApi += (x.weight_kg ?? 0) * (x.reps ?? 0);
  const v = raw.prepare("SELECT SUM(volume_kg) AS v FROM seances").get() as { v: number };
  assert.ok(Math.abs(v.v - volumeApi) < 1, `volume ${v.v} vs ${volumeApi}`);

  // Trois exercices : meilleures valeurs recalculées à la main depuis l'API.
  const trois: [string, string[]][] = [
    ["smith-machine-bench-press", ["Développé Couché (Machine Smith)", "Bench Press (Smith Machine)"]],
    ["wide-grip-lat-pulldown", ["Tirage Poitrine (Poulie)", "Lat Pulldown (Cable)", "Tirage Poitrine (Machine)"]],
    ["barbell-curl", ["Curl Biceps (Barre)"]],
  ];
  for (const [slug, titres] of trois) {
    let charge = 0, e1 = 0, volSerie = 0, volSeance = 0;
    for (const s of api) {
      let vs = 0;
      for (const e of s.exercises) {
        if (!titres.includes(e.title)) continue;
        for (const x of e.sets) {
          if (x.type === "warmup" || !x.weight_kg || !x.reps) continue;
          charge = Math.max(charge, x.weight_kg);
          e1 = Math.max(e1, x.reps === 1 ? x.weight_kg : Math.round(x.weight_kg * (1 + x.reps / 30) * 100) / 100);
          volSerie = Math.max(volSerie, Math.round(x.weight_kg * x.reps * 100) / 100);
          vs += x.weight_kg * x.reps;
        }
      }
      volSeance = Math.max(volSeance, vs);
    }
    const id = (raw.prepare("SELECT id FROM exercices WHERE slug = ?").get(slug) as { id: string }).id;
    const rec = await recordsExercice(db, id);
    console.log(`# ${slug} : charge ${rec.actuels.charge?.valeur} kg, 1RM ${rec.actuels.e1rm?.valeur}, série ${rec.actuels.volume_serie?.valeur}, séance ${rec.actuels.volume_seance?.valeur} (${rec.historique.length} records battus)`);
    assert.ok(charge > 0);
    assert.equal(rec.actuels.charge?.valeur, charge, `${slug} charge`);
    assert.equal(rec.actuels.e1rm?.valeur, e1, `${slug} 1RM`);
    assert.equal(rec.actuels.volume_serie?.valeur, volSerie, `${slug} volume série`);
    assert.ok(Math.abs((rec.actuels.volume_seance?.valeur ?? 0) - volSeance) < 0.01, `${slug} volume séance`);
  }
});
