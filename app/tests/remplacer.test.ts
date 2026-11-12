// Remplacer l'exercice et Alternative : migration 18, séries gardées ou déplacées, routine, tri déjà faits / jamais faits.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { alternativesPour, remplacerExercice, resumeRemplacement } from "../src/db/depots/remplacement.ts";
import { creerRoutine, lireRoutine } from "../src/db/depots/routines.ts";
import { creerSalle } from "../src/db/depots/salles.ts";
import { ajouterExerciceASeance, cocherSerie, demarrerSeance, demarrerSeanceDepuisRoutine, lireSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { adapter, baseDeTest } from "./aide.ts";

async function monde() {
  const { raw, db } = await baseDeTest();
  const exo = async (nom: string, equipement: "barre" | "halteres" | "machine" | "smith" = "barre", muscle = "Pectoraux") => {
    const id = await creerExercice(db, { nom, muscle, equipement });
    raw.prepare("UPDATE exercices SET categorie = 'Force' WHERE id = ?").run(id);
    return id;
  };
  return { raw, db, exo };
}

test("migration 18 : colonnes remplace_id et raison_alternative sur une base v17", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 17);
  raw.exec(`INSERT INTO seances (id,debut,maj_le) VALUES ('s',1,1);
    INSERT INTO exercices (id,nom,nom_norm,equipement,cree_le,maj_le) VALUES ('e','E','e','barre',1,1);
    INSERT INTO seance_exercices (seance_id,exercice_id,position) VALUES ('s','e',0);`);
  assert.equal(await migrer(db, 18), 18);
  const l = raw.prepare("SELECT remplace_id, raison_alternative FROM seance_exercices").get() as Record<string, unknown>;
  assert.deepEqual({ ...l }, { remplace_id: null, raison_alternative: null });
  assert.throws(() => raw.exec("UPDATE seance_exercices SET raison_alternative = 'autre'"));
});

test("remplacer sans série validée : l'ancien disparaît, le nouveau reprend ses séries vides et sa place", async () => {
  const { db, exo } = await monde();
  const a = await exo("Développé couché");
  const b = await exo("Développé couché haltères", "halteres");
  const c = await exo("Tirage");
  const s = await demarrerSeance(db, null);
  await ajouterExerciceASeance(db, s, a, { nbSeries: 3, prefill: false });
  await ajouterExerciceASeance(db, s, c, { nbSeries: 1, prefill: false });
  await remplacerExercice(db, s, a, b);
  const d = (await lireSeance(db, s))!;
  assert.deepEqual(d.exercices.map((e) => e.exercice.id), [b, c]);
  assert.equal(d.exercices[0]!.series.length, 3);
  assert.equal(d.exercices[0]!.remplace?.id, a);
  assert.equal(d.exercices[0]!.remplace?.nom, "Développé couché");
  assert.equal(d.exercices[0]!.remplacePar, null);
  assert.equal(d.exercices[1]!.series.length, 1);
});

test("remplacer en gardant les séries faites : l'ancien garde les validées, le nouveau prend les autres", async () => {
  const { db, exo } = await monde();
  const a = await exo("Développé couché");
  const b = await exo("Développé couché haltères", "halteres");
  const s = await demarrerSeance(db, null);
  const ids = await ajouterExerciceASeance(db, s, a, { nbSeries: 3, prefill: false });
  await cocherSerie(db, ids[0]!, true);
  await cocherSerie(db, ids[1]!, true);
  assert.equal((await resumeRemplacement(db, s, a)).nbValidees, 2);
  await remplacerExercice(db, s, a, b, { garderSeries: true });
  const d = (await lireSeance(db, s))!;
  assert.deepEqual(d.exercices.map((e) => e.exercice.id), [a, b]);
  assert.deepEqual(d.exercices[0]!.series.map((x) => x.faite), [1, 1]);
  assert.equal(d.exercices[0]!.remplacePar?.nom, "Développé couché haltères");
  assert.equal(d.exercices[1]!.series.length, 1);
  assert.equal(d.exercices[1]!.series[0]!.faite, 0);
  assert.equal(d.exercices[1]!.remplace?.id, a);
});

test("remplacer sans garder : les séries validées passent au nouvel exercice, les autres sont refaites vides", async () => {
  const { db, exo } = await monde();
  const a = await exo("Développé couché");
  const b = await exo("Développé couché haltères", "halteres");
  const s = await demarrerSeance(db, null);
  const ids = await ajouterExerciceASeance(db, s, a, { nbSeries: 3, prefill: false });
  await cocherSerie(db, ids[0]!, true);
  await remplacerExercice(db, s, a, b, { garderSeries: false });
  const d = (await lireSeance(db, s))!;
  assert.deepEqual(d.exercices.map((e) => e.exercice.id), [b]);
  assert.equal(d.exercices[0]!.series.length, 3);
  assert.equal(d.exercices[0]!.series.filter((x) => x.faite === 1).length, 1);
  assert.equal(d.exercices[0]!.series.find((x) => x.id === ids[0])?.exercice_id, b);
});

test("raison de l'alternative enregistrée ; exercice déjà dans la séance refusé", async () => {
  const { db, exo } = await monde();
  const a = await exo("Développé couché");
  const b = await exo("Développé couché haltères", "halteres");
  const s = await demarrerSeance(db, null);
  await ajouterExerciceASeance(db, s, a, { nbSeries: 1, prefill: false });
  await ajouterExerciceASeance(db, s, b, { nbSeries: 1, prefill: false });
  await assert.rejects(remplacerExercice(db, s, a, b));
  const c = await exo("Développé incliné", "halteres");
  await remplacerExercice(db, s, a, c, { raison: "manquant" });
  const d = (await lireSeance(db, s))!;
  assert.equal(d.exercices.find((e) => e.exercice.id === c)?.remplace?.raison, "manquant");
});

test("aussi dans la routine : la ligne de la routine change seulement si demandé", async () => {
  const { db, exo } = await monde();
  const a = await exo("Développé couché");
  const b = await exo("Développé couché haltères", "halteres");
  const r = await creerRoutine(db, "Haut du corps", [{ exerciceId: a, nbSeries: 3, reposS: 90 }]);
  const s1 = await demarrerSeanceDepuisRoutine(db, r, false);
  assert.equal((await resumeRemplacement(db, s1, a)).routineNom, "Haut du corps");
  await remplacerExercice(db, s1, a, b, { routine: false });
  assert.equal((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.exercice_id, a);
  const s2 = await demarrerSeanceDepuisRoutine(db, r, false);
  await remplacerExercice(db, s2, a, b, { routine: true });
  assert.equal((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.exercice_id, b);
  assert.equal((await lireSeance(db, s2))!.exercices[0]!.ligneRoutineId, (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.id);
});

test("alternatives : même muscle et même catégorie, salle de la séance, déjà faits par date puis jamais faits", async () => {
  const { raw, db, exo } = await monde();
  const a = await exo("Développé couché");
  const haltere = await exo("Développé couché haltères", "halteres");
  const smith = await exo("Développé couché Smith", "smith");
  const incline = await exo("Développé incliné haltères", "halteres");
  const machine = await exo("Développé décliné machine", "machine");
  const dos = await exo("Tirage", "machine", "Dos");
  const autre = await exo("Pompes lestées", "halteres");
  raw.prepare("UPDATE exercices SET categorie = 'Cardio' WHERE id = ?").run(autre);
  const salle = await creerSalle(db, "Lofting", ["barre", "halteres", "smith", "machine"]);
  const hors = await creerExercice(db, { nom: "Développé kettlebell", muscle: "Pectoraux", equipement: "kettlebell" });
  raw.prepare("UPDATE exercices SET categorie = 'Force' WHERE id = ?").run(hors);

  const fait = async (id: string, jour: number) => {
    const sid = await demarrerSeance(db, null);
    const [x] = await ajouterExerciceASeance(db, sid, id, { nbSeries: 1, prefill: false });
    raw.prepare("UPDATE series SET kg = 34, reps = 6 WHERE id = ?").run(x!);
    await cocherSerie(db, x!, true);
    await terminerSeance(db, sid, jour + 1000);
    raw.prepare("UPDATE seances SET debut = ? WHERE id = ?").run(jour, sid);
  };
  await fait(smith, 1_000_000);
  await fait(haltere, 2_000_000);

  const s = await demarrerSeance(db, null);
  raw.prepare("UPDATE seances SET salle_id = ? WHERE id = ?").run(salle, s);
  await ajouterExerciceASeance(db, s, a, { nbSeries: 1, prefill: false });
  const { faits, jamais } = await alternativesPour(db, s, a);
  assert.deepEqual(faits.map((x) => x.exercice.id), [haltere, smith]);
  assert.equal(faits[0]!.derniere?.kg, 34);
  assert.equal(faits[0]!.derniere?.reps, 6);
  assert.deepEqual(jamais.map((x) => x.exercice.id).sort(), [incline, machine].sort());
  const tous = [...faits, ...jamais].map((x) => x.exercice.id);
  for (const absent of [a, dos, autre, hors]) assert.ok(!tous.includes(absent));
});
