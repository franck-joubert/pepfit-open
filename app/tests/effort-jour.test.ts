// Minutes de FC par zone (l'entrée de la charge d'Edwards) et « ma journée » lue en base : l'Effort pepfit du jour, jamais
// le score de Whoop, même connecté et noté ; la FC au repos de Whoop d'abord.
import assert from "node:assert/strict";
import { test } from "node:test";
import { minutesParZone } from "../src/ecrans/effort-jour.ts";
import { scoreEffort } from "../src/ecrans/effort-pepfit.ts";

/** FC constante `bpm` pendant `min` minutes, un échantillon par seconde. */
const fcConstante = (bpm: number, min: number) => Array.from({ length: min * 60 }, (_, i) => ({ s: i * 1000, bpm }));

test("minutes par zone : échantillons à la seconde, trous plafonnés à 10 s, rien sous Z1", () => {
  // FC max 190 : Z1 ≥ 95, Z3 ≥ 133
  assert.deepEqual(minutesParZone(fcConstante(140, 30), 190).map((x) => Math.round(x)), [0, 0, 30, 0, 0]);
  assert.deepEqual(minutesParZone(fcConstante(80, 30), 190), [0, 0, 0, 0, 0]);
  const trou = [{ s: 0, bpm: 140 }, { s: 600_000, bpm: 140 }];
  assert.ok(minutesParZone(trou, 190)[2] < 0.2, "10 min sans signal ne comptent pas");
});

test("lireJournee : course avec FC → l'Effort pepfit ; Whoop connecté et noté n'y change rien ; FC repos de Whoop d'abord", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { enregistrerSuivi } = await import("../src/db/depots/suivi-gps.ts");
  const { ecrireReglage } = await import("../src/db/depots/reglages.ts");
  const { lireJournee } = await import("../src/ecrans/journee-donnees.ts");
  const { db, raw } = await baseDeTest(true);
  const minuit = new Date(2026, 9, 28).getTime();
  const debut = minuit + 9 * 3_600_000;
  const fc = Array.from({ length: 40 * 60 }, (_, i) => ({ t: debut + i * 1000, s: i * 1000, bpm: 150 }));
  await enregistrerSuivi(db, {
    exerciceId: "cat:course", titre: "Course à pied", salleId: null, mode: "course", debut, fin: debut + 40 * 60_000, dureeS: 2400,
    distanceM: 7000, denivelePlusM: 0, deniveleMoinsM: 0, barometre: false, points: [], fc, tours: [],
  });
  const sans = await lireJournee(db, minuit);
  assert.equal(sans.effort!.seances, 1);
  assert.equal(sans.effort!.estime, false);
  // FC max 190 : 150 bpm en Z3, 40 min × 3
  assert.ok(Math.abs(sans.effort!.charge - 120) < 1, String(sans.effort!.charge));
  assert.equal(sans.effort!.score, scoreEffort(sans.effort!.charge));
  assert.equal(sans.whoop.connecte, false);
  assert.equal((await lireJournee(db, minuit + 86_400_000)).effort, null, "jour sans séance");

  raw.prepare("INSERT INTO whoop_jour (jour, strain, recup, fc_repos, maj_le) VALUES (?, ?, ?, ?, 0)").run(minuit, 13.4, 87, 52);
  await ecrireReglage(db, "whoop_connecte", "1");
  const w = await lireJournee(db, minuit);
  assert.equal(w.effort!.charge, sans.effort!.charge, "le score de Whoop n'entre jamais dans l'Effort");
  assert.notEqual(w.effort!.score, 13.4);
  assert.deepEqual(w.fcRepos, { bpm: 52, source: "whoop" });
  assert.equal("recup" in w.whoop, false, "le score de Récupération de Whoop n'est plus lu");
});
