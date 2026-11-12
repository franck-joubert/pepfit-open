// Parcours de bout en bout, dans l'ordre des gestes à l'écran, sur une base fichier :
// routine avec superset, séance, coche, correction après coche (E1), repos mémorisé,
// fermeture de l'appli (base rouverte), reprise, fin de séance, correction sur la séance passée.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { lireReglage, ecrireReglage } from "../src/db/depots/reglages.ts";
import {
  ajouterExerciceARoutine, creerRoutine, creerSuperset, lireRoutine, modifierLigneRoutine,
} from "../src/db/depots/routines.ts";
import {
  cocherSerie, demarrerSeanceDepuisRoutine, lireSeance, lireSeries, modifierSerie, reposApresSerie,
  seanceEnCours, terminerSeance,
} from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { historiqueSeances, recordsExercice } from "../src/db/stats.ts";
import { adapter } from "./aide.ts";

async function ouvrir(chemin: string) {
  const raw = new DatabaseSync(chemin);
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db);
  return { raw, db };
}

test("parcours : superset, correction après coche, repos et séance qui survivent à la fermeture", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "fonte-parcours-"));
  const chemin = join(dossier, "fonte.db");
  try {
    let { raw, db } = await ouvrir(chemin);

    // Routine : « + », deux exercices, superset avec le suivant, 3 séries chacun.
    const tirage = await creerExercice(db, { nom: "Tirage vertical" });
    const pompes = await creerExercice(db, { nom: "Pompes" });
    const r = await creerRoutine(db, "Nouvelle routine", []);
    const l1 = await ajouterExerciceARoutine(db, r, tirage);
    const l2 = await ajouterExerciceARoutine(db, r, pompes);
    await modifierLigneRoutine(db, l1, { nbSeries: 3 });
    await modifierLigneRoutine(db, l2, { nbSeries: 3 });
    await creerSuperset(db, r, [l1, l2], 90);
    const routine = (await lireRoutine(db, r))!;
    assert.equal(routine.blocs.length, 1);
    assert.equal(routine.blocs[0]!.nbTours, 3);

    // Séance : séries entrelacées A1 B1 A2 B2 A3 B3.
    const id = await demarrerSeanceDepuisRoutine(db, r);
    let series = await lireSeries(db, id);
    assert.deepEqual(series.map((s) => s.exercice_id), [tirage, pompes, tirage, pompes, tirage, pompes]);

    // Tour 1 : A1 cochée → on enchaîne ; B1 cochée → repos du tour.
    await modifierSerie(db, series[0]!.id, { kg: 60, reps: 10 });
    await cocherSerie(db, series[0]!.id, true);
    assert.equal(await reposApresSerie(db, series[0]!.id), null);
    await modifierSerie(db, series[1]!.id, { kg: 0, reps: 15 });
    await cocherSerie(db, series[1]!.id, true);
    assert.equal((await reposApresSerie(db, series[1]!.id))?.s, 90);
    const finRepos = Date.now() + 90_000;
    await ecrireReglage(db, "repos_fin", String(finRepos));

    // E1 : A1 corrigée après coche, sans la décocher.
    await modifierSerie(db, series[0]!.id, { kg: 62.5, reps: 9 });
    series = await lireSeries(db, id);
    assert.equal(series[0]!.faite, 1);
    assert.deepEqual([series[0]!.kg, series[0]!.reps], [62.5, 9]);

    // Fermeture de l'appli : la base est fermée puis rouverte.
    raw.close();
    ({ raw, db } = await ouvrir(chemin));
    const reprise = await seanceEnCours(db);
    assert.equal(reprise?.id, id);
    series = await lireSeries(db, id);
    assert.deepEqual(series.map((s) => s.faite), [1, 1, 0, 0, 0, 0]);
    assert.deepEqual([series[0]!.kg, series[0]!.reps], [62.5, 9]);
    assert.equal(Number(await lireReglage(db, "repos_fin")), finRepos);

    // Fin de séance : plus de séance en cours, volume des séries faites.
    for (const s of series.slice(2)) {
      await modifierSerie(db, s.id, { kg: s.exercice_id === tirage ? 60 : 0, reps: 10 });
      await cocherSerie(db, s.id, true);
    }
    await terminerSeance(db, id);
    assert.equal(await seanceEnCours(db), null);
    const [resume] = await historiqueSeances(db);
    assert.equal(resume!.id, id);
    assert.equal(resume!.volumeKg, 62.5 * 9 + 60 * 10 * 2);

    // Séance passée : correction de A2, volume et records recalculés.
    await modifierSerie(db, series[2]!.id, { kg: 70 });
    assert.equal((await historiqueSeances(db))[0]!.volumeKg, 62.5 * 9 + 70 * 10 + 60 * 10);
    assert.equal((await recordsExercice(db, tirage)).actuels.charge?.valeur, 70);
    assert.equal((await lireSeance(db, id))!.seance.fin !== null, true);
    raw.close();
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
