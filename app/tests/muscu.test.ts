import assert from "node:assert/strict";
import { test } from "node:test";
import { e1rmEpley, volumeSerie } from "../src/db/calculs.ts";
import { creerExercice, lireExercice, rechercherExercices } from "../src/db/depots/exercices.ts";
import {
  creerRoutine, creerSuperset, deplacerLigne, lireRoutine, lireExercicesDeRoutine, listerRoutines,
  retirerDuSuperset, retirerLigneDeRoutine,
} from "../src/db/depots/routines.ts";
import {
  ajouterSerie, demarrerSeance, demarrerSeanceDepuisRoutine, lirePrecedent, lireSeance, modifierSerie,
  reposApresSerie, supprimerSeance, terminerSeance, cocherSerie, lireSeries,
} from "../src/db/depots/seances.ts";
import { MIGRATIONS, migrer } from "../src/db/migrations.ts";
import { dernieresSeancesExercice, historiqueSeances, progressionExercice, recordsExercice, statsAccueil, statsProfil } from "../src/db/stats.ts";
import { adapter, baseDeTest, jour } from "./aide.ts";
import { DatabaseSync } from "node:sqlite";

/** Une séance terminée avec ses séries (kg, reps, type) pour un exercice. */
async function seanceFaite(db: Awaited<ReturnType<typeof baseDeTest>>["db"], exo: string, debut: number, series: [number | null, number, string?][]) {
  const id = await demarrerSeance(db, null, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [debut, id]);
  const ids: string[] = [];
  for (const [kg, reps, type] of series) {
    const sid = await ajouterSerie(db, { seanceId: id, exerciceId: exo, kg: kg ?? undefined, reps, type: (type ?? "normale") as never });
    await cocherSerie(db, sid, true);
    ids.push(sid);
  }
  await terminerSeance(db, id, debut + 3_600_000);
  return { id, ids };
}

test("migration 2 : une base en version 1 avec des données est migrée sans perte", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(MIGRATIONS[0]!.sql);
  raw.exec("PRAGMA user_version = 1");
  raw.exec(`INSERT INTO exercices VALUES ('e1','Tirage',NULL,NULL,0,1,1); INSERT INTO seances VALUES ('s1',NULL,1,2,NULL,NULL,1);
    INSERT INTO series (id,seance_id,exercice_id,position,kg,reps,faite) VALUES ('a','s1','e1',0,50,10,1)`);
  await migrer(adapter(raw));
  const s = raw.prepare("SELECT kg, reps, volume, e1rm FROM series WHERE id='a'").get() as { kg: number; reps: number; volume: number };
  assert.equal(s.kg, 50);
  assert.equal(s.volume, 0);
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  for (const t of ["records", "seance_exercices", "exercice_alias"]) assert.ok(tables.includes(t), t);
});

test("calculs : Epley et volume", () => {
  assert.equal(e1rmEpley(79, 10), 105.33);
  assert.equal(e1rmEpley(100, 1), 100);
  assert.equal(e1rmEpley(null, 10), null);
  assert.equal(volumeSerie(79, 10), 790);
  assert.equal(volumeSerie(null, 12), 0);
});

test("recherche d'exercices : sans accent ni casse, filtres muscle et matériel", async () => {
  const { db } = await baseDeTest();
  await creerExercice(db, { nom: "Développé couché", muscle: "Pectoraux", secondaires: ["Triceps"], equipement: "barre" });
  await creerExercice(db, { nom: "Extension triceps", muscle: "Triceps", equipement: "poulie" });
  assert.equal((await rechercherExercices(db, { texte: "DEVELOPPE couche" })).length, 1);
  assert.equal((await rechercherExercices(db, { muscles: ["Triceps"], secondaires: true })).length, 2);
  assert.equal((await rechercherExercices(db, { muscles: ["Triceps"], secondaires: true, equipements: ["poulie"] })).length, 1);
});

test("records : charge, 1RM, volume de série et de séance ; échauffement exclu ; égalité n'est pas un record", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Squat" });
  await seanceFaite(db, e, jour(2026, 1, 5), [[40, 10, "echauffement"], [100, 5], [100, 5]]);
  await seanceFaite(db, e, jour(2026, 1, 12), [[100, 5], [105, 3]]);
  await seanceFaite(db, e, jour(2026, 1, 19), [[100, 8], [100, 5]]);
  const r = await recordsExercice(db, e);
  assert.equal(r.actuels.charge?.valeur, 105);
  assert.equal(r.actuels.e1rm?.valeur, e1rmEpley(100, 8));
  assert.equal(r.actuels.volume_serie?.valeur, 800);
  assert.equal(r.actuels.volume_seance?.valeur, 1300);
  const charge = r.historique.filter((x) => x.type === "charge").map((x) => x.valeur).sort((a, b) => a - b);
  assert.deepEqual(charge, [100, 105]);
  const p = await progressionExercice(db, e, "charge");
  assert.deepEqual(p.points.map((x) => x.valeur), [100, 105, 100]);
  assert.equal(p.gain, 0);
});

test("« précédent » : série de même rang dans la dernière séance antérieure, échauffements à part", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Rowing" });
  await seanceFaite(db, e, jour(2026, 2, 2), [[20, 10, "echauffement"], [60, 10], [60, 8]]);
  const b = await seanceFaite(db, e, jour(2026, 2, 9), [[20, 10, "echauffement"], [65, 10], [65, 8], [65, 6]]);
  const s = await lireSeries(db, b.id);
  assert.deepEqual(s.map((x) => [x.precedent_kg, x.precedent_reps]), [[20, 10], [60, 10], [60, 8], [null, null]]);
  const prec = await lirePrecedent(db, e, jour(2026, 2, 9));
  assert.deepEqual(prec.map((x) => x.kg), [60, 60]);
});

test("E1 : modifier une série passée recalcule volume, records et précédent des séances suivantes", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Développé" });
  const a = await seanceFaite(db, e, jour(2026, 3, 1), [[80, 10], [80, 10]]);
  const b = await seanceFaite(db, e, jour(2026, 3, 8), [[82, 10], [82, 8]]);
  const c = await seanceFaite(db, e, jour(2026, 3, 15), [[85, 5]]);
  assert.equal((await lireSeance(db, a.id))!.seance.volume_kg, 1600);
  assert.equal((await recordsExercice(db, e)).actuels.charge?.valeur, 85);

  // Erreur de saisie corrigée a posteriori sur une série cochée d'une séance terminée : 80 -> 90 kg.
  await modifierSerie(db, a.ids[0]!, { kg: 90 });
  assert.equal((await lireSeance(db, a.id))!.seance.volume_kg, 1700);
  const rec = await recordsExercice(db, e);
  assert.equal(rec.actuels.charge?.valeur, 90);
  assert.equal(rec.actuels.charge?.seance_id, a.id);
  // 82 puis 85 ne sont plus des records de charge : seule la série à 90 reste.
  assert.deepEqual(rec.historique.filter((x) => x.type === "charge").map((x) => x.valeur), [90]);
  const sb = await lireSeries(db, b.id);
  assert.deepEqual([sb[0]!.precedent_kg, sb[1]!.precedent_kg], [90, 80]);
  const sc = await lireSeries(db, c.id);
  assert.equal(sc[0]!.precedent_kg, 82);

  // Reps et poids modifiables aussi sur une série décochée, puis recochée.
  await modifierSerie(db, b.ids[1]!, { faite: false });
  assert.equal((await lireSeance(db, b.id))!.seance.volume_kg, 820);
  assert.equal((await lireSeries(db, c.id))[0]!.precedent_kg, 82);
  await modifierSerie(db, b.ids[1]!, { reps: 12, faite: true });
  assert.equal((await lireSeance(db, b.id))!.seance.volume_kg, 820 + 984);

  // Supprimer une séance : les suivantes retrouvent leur précédent.
  await supprimerSeance(db, b.id);
  assert.equal((await lireSeries(db, c.id))[0]!.precedent_kg, 90);
  assert.equal((await recordsExercice(db, e)).actuels.charge?.valeur, 90);
});

test("E1 : la modification est possible sur une séance en cours, exercice terminé ou non", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Curl" });
  const id = await demarrerSeance(db, null);
  const s1 = await ajouterSerie(db, { seanceId: id, exerciceId: e, kg: 20, reps: 10 });
  await cocherSerie(db, s1, true);
  await modifierSerie(db, s1, { kg: 22.5 });
  const [s] = await lireSeries(db, id);
  assert.equal(s!.faite, 1);
  assert.equal(s!.volume, 225);
  assert.equal((await lireSeance(db, id))!.seance.volume_kg, 225);
});

test("supersets de routine : contigus, repos unique sur la dernière ligne, dissolution", async () => {
  const { db } = await baseDeTest();
  const [a, b, c, d] = [await creerExercice(db, { nom: "A" }), await creerExercice(db, { nom: "B" }), await creerExercice(db, { nom: "C" }), await creerExercice(db, { nom: "D" })];
  const r = await creerRoutine(db, "Pull", [a, b, c, d].map((x) => ({ exerciceId: x, nbSeries: 3, reposS: 120 })));
  const l = await lireExercicesDeRoutine(db, r);
  const groupe = await creerSuperset(db, r, [l[0]!.id, l[2]!.id], 90);
  const det = (await lireRoutine(db, r))!;
  assert.deepEqual(det.blocs.map((x) => x.lignes.map((y) => y.exercice.nom)), [["A", "C"], ["B"], ["D"]]);
  assert.equal(det.blocs[0]!.groupeSuperset, groupe);
  assert.equal(det.blocs[0]!.reposS, 90);
  assert.deepEqual(det.blocs[0]!.lignes.map((x) => x.repos_s), [0, 90]);
  assert.equal(det.blocs[0]!.nbTours, 3);
  await deplacerLigne(db, l[0]!.id, 1);
  assert.deepEqual((await lireRoutine(db, r))!.blocs.map((x) => x.lignes.map((y) => y.exercice.nom)), [["B"], ["A", "C"], ["D"]]);
  await retirerDuSuperset(db, l[2]!.id, 100);
  const apres = (await lireRoutine(db, r))!;
  assert.ok(apres.blocs.every((x) => x.groupeSuperset === null));
  assert.equal(apres.blocs.flatMap((x) => x.lignes).find((x) => x.exercice.nom === "C")!.repos_s, 100);
  await creerSuperset(db, r, [l[0]!.id, l[1]!.id]);
  await retirerLigneDeRoutine(db, l[1]!.id);
  assert.ok((await lireRoutine(db, r))!.blocs.every((x) => x.groupeSuperset === null));
  assert.equal((await listerRoutines(db))[0]!.nbExercices, 3);
  await assert.rejects(creerSuperset(db, r, [l[0]!.id]));
});

test("supersets de séance : séries entrelacées tour par tour, un seul repos en fin de tour, préremplissage du précédent", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Tirage" });
  const b = await creerExercice(db, { nom: "Pompes lestées" });
  const c = await creerExercice(db, { nom: "Curl" });
  const r = await creerRoutine(db, "Haut", [
    { exerciceId: a, nbSeries: 2, reposS: 0, groupeSuperset: 1 },
    { exerciceId: b, nbSeries: 2, reposS: 75, groupeSuperset: 1 },
    { exerciceId: c, nbSeries: 1, reposS: 60 },
  ]);
  const ancienne = await seanceFaite(db, a, jour(2026, 4, 1), [[50, 10], [50, 9]]);
  void ancienne;
  const id = await demarrerSeanceDepuisRoutine(db, r);
  const det = (await lireSeance(db, id))!;
  assert.equal(det.routineNom, "Haut");
  assert.equal(det.blocs.length, 2);
  assert.equal(det.blocs[0]!.reposS, 75);
  const series = await lireSeries(db, id);
  assert.deepEqual(series.map((s) => s.exercice_id), [a, b, a, b, c]);
  assert.deepEqual(series.filter((s) => s.exercice_id === a).map((s) => [s.kg, s.reps]), [[50, 10], [50, 9]]);
  // Tour 1 : après A, on enchaîne ; après B, repos de 75 s.
  assert.equal(await reposApresSerie(db, series[0]!.id), null);
  assert.equal((await reposApresSerie(db, series[1]!.id))?.s, 75);
  assert.equal((await reposApresSerie(db, series[4]!.id))?.s, 60);
});

test("stats : accueil (semaine du lundi), historique, profil, dernières séances", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Squat" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: e }]);
  await creerRoutine(db, "Haut", [{ exerciceId: e }]);
  // Une routine vide n'est jamais « à suivre » (rien à démarrer), même jamais faite.
  await creerRoutine(db, "Vide", []);
  // Dimanche 25/10/2026 : la semaine va du lundi 19 au dimanche 25.
  const s1 = await seanceFaite(db, e, jour(2026, 10, 19), [[100, 5]]);
  await db.runAsync("UPDATE seances SET routine_id = ? WHERE id = ?", [r, s1.id]);
  await seanceFaite(db, e, jour(2026, 10, 25, 10), [[110, 5], [110, 4]]);
  await seanceFaite(db, e, jour(2026, 10, 18), [[90, 5]]);
  const a = await statsAccueil(db, jour(2026, 10, 25, 20));
  assert.equal(a.semaine.jours.length, 7);
  assert.deepEqual(a.semaine.jours.map((j) => j.fait), [true, false, false, false, false, false, true]);
  assert.equal(a.semaine.nbSeances, 2);
  assert.equal(a.semaine.volumeKg, 500 + 990);
  assert.equal(a.aSuivre?.nom, "Haut");
  assert.equal(a.derniereSeance?.meilleuresSeries[0]?.kg, 110);
  assert.equal((await historiqueSeances(db)).length, 3);
  assert.equal((await historiqueSeances(db, { limite: 1 }))[0]!.debut, jour(2026, 10, 25, 10));
  const p = await statsProfil(db);
  assert.equal(p.nbSeances, 3);
  // Par exercice et par séance (fin de séance, historique) : un seul exercice, trois séances, dont la première pose la
  // référence sans record (revue finale du 30/10, D4) : deux séances à record.
  assert.equal(p.nbRecords, 2);
  assert.equal((await historiqueSeances(db, { limite: 1 }))[0]!.nbRecords, 1);
  assert.equal((await dernieresSeancesExercice(db, e, 2)).length, 2);
});

test("types de série : échauffement, normale, dégressive et échec comptent comme prévu", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Presse" });
  const s = await seanceFaite(db, e, jour(2026, 5, 1), [[30, 15, "echauffement"], [100, 8], [80, 10, "degressive"], [60, 12, "rate"]]);
  const d = (await lireSeance(db, s.id))!;
  assert.equal(d.seance.volume_kg, 800 + 800 + 720);
  assert.equal(d.seance.nb_series, 3);
  assert.equal((await lireExercice(db, e))!.nom, "Presse");
});
