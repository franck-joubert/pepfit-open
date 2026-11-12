// Records des nouvelles familles (revue finale du 30/10, n° 2, D4) : la première séance d'un exercice pose la référence sans
// record (ni médaille, ni compte, ni « Nouveau record » de l'Accueil) ; pas de « meilleur temps » pour un sport et cours ni
// une récupération ; la référence reste la meilleure valeur et « l'ancien record » des cartes de fin.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { recalculerSiEnAttente, serieDeReference, tempsEstUnRecord } from "../src/db/depots/recalcul.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { recordsExercice, recordsRecents, statsProfil } from "../src/db/stats.ts";
import { baseDeTest, jour } from "./aide.ts";

type Db = Awaited<ReturnType<typeof baseDeTest>>["db"];

/** Une séance terminée : séries (kg, réps) ou (durée en s) d'un exercice. */
async function seance(db: Db, exo: string, debut: number, series: { kg?: number; reps?: number; dureeS?: number }[]) {
  const id = await demarrerSeance(db, null, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [debut, id]);
  const ids: string[] = [];
  for (const s of series) {
    const sid = await ajouterSerie(db, { seanceId: id, exerciceId: exo, ...s });
    await cocherSerie(db, sid, true);
    ids.push(sid);
  }
  await terminerSeance(db, id, debut + 3_600_000);
  return { id, ids };
}

test("première séance d'un exercice : la référence, sans record ni médaille", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Squat" });
  const a = await seance(db, e, jour(2026, 1, 5), [{ kg: 100, reps: 5 }, { kg: 105, reps: 3 }]);
  const lue = await lireSeance(db, a.id);
  assert.ok(lue!.exercices.every((x) => x.series.every((s) => s.records.length === 0)), "aucune médaille");
  assert.equal((await statsProfil(db)).nbRecords, 0);
  assert.equal((await recordsRecents(db)).length, 0);
  // La meilleure valeur de la séance reste la référence (une seule ligne par type).
  const r = await recordsExercice(db, e);
  assert.equal(r.actuels.charge?.valeur, 105);
  assert.equal(r.actuels.charge?.serie_id, null);
  assert.deepEqual(r.historique.filter((x) => x.type === "charge").map((x) => x.valeur), [105]);
  assert.equal(await serieDeReference(db, r.actuels.charge!), a.ids[1]);
});

test("deuxième séance : un record battu a sa médaille et compte ; l'ancien record est la référence", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Développé" });
  await seance(db, e, jour(2026, 1, 5), [{ kg: 80, reps: 8 }]);
  const b = await seance(db, e, jour(2026, 1, 12), [{ kg: 85, reps: 8 }]);
  const lue = await lireSeance(db, b.id);
  assert.ok(lue!.exercices[0]!.series[0]!.records.includes("charge"));
  assert.equal((await statsProfil(db)).nbRecords, 1);
  const r = await recordsExercice(db, e);
  assert.equal(r.actuels.charge?.serie_id, b.ids[0]);
  const avant = r.historique.find((x) => x.type === "charge" && x.seance_id !== b.id);
  assert.equal(avant?.valeur, 80);
});

test("sports et cours, récupération, activité de musculation : pas de meilleur temps ; gainage et endurance : oui", async () => {
  assert.equal(tempsEstUnRecord("padel"), false);
  assert.equal(tempsEstUnRecord("etirements"), false);
  assert.equal(tempsEstUnRecord("musculation"), false);
  assert.equal(tempsEstUnRecord("rope-jumping"), true);
  assert.equal(tempsEstUnRecord("course"), true);
  assert.equal(tempsEstUnRecord("plank"), true);
  assert.equal(tempsEstUnRecord(null), true);

  const { db } = await baseDeTest(true);
  await seance(db, "cat:padel", jour(2026, 1, 5), [{ dureeS: 43 }]);
  await seance(db, "cat:padel", jour(2026, 1, 12), [{ dureeS: 3600 }]);
  assert.equal((await recordsExercice(db, "cat:padel")).historique.length, 0);
  assert.equal((await statsProfil(db)).nbRecords, 0);
});

test("la règle change : un seul recalcul de l'historique, puis plus rien", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Rowing" });
  await seance(db, e, jour(2026, 1, 5), [{ kg: 60, reps: 10 }]);
  // Ancienne règle : la première valeur était un record à série.
  await db.runAsync("UPDATE records SET serie_id = (SELECT id FROM series LIMIT 1)", []);
  await db.runAsync("DELETE FROM reglages WHERE cle = 'records_version'", []);
  assert.equal(await recalculerSiEnAttente(db), true);
  assert.equal((await statsProfil(db)).nbRecords, 0);
  assert.equal(await recalculerSiEnAttente(db), false);
});
