// Perf B (docs/PERF-B.md, M10) : index de la migration 54, recherches qui s'en servent (EXPLAIN QUERY PLAN), dédoublonnage
// Whoop par bornes de date (mêmes mesures que l'ancien ABS), réglages de la connexion.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ajouterMesures, derniereMesure, historiqueMesure } from "../src/db/depots/mesures.ts";
import { migrer, temoinPresent, VERSION_COURANTE } from "../src/db/migrations.ts";

const plan = (raw: import("node:sqlite").DatabaseSync, sql: string, ...p: (string | number)[]) =>
  (raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...p) as { detail: string }[]).map((x) => x.detail).join(" | ");

test("migration 54 : les index de l'audit existent, et son témoin est un index", async () => {
  const { raw, brute } = await baseDeTest();
  const index = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((x) => x.name);
  for (const n of ["idx_seances_routine", "idx_seances_salle", "idx_seance_exercices_exercice", "idx_series_exercice_faite", "idx_consommations_repas_date"]) {
    assert.ok(index.includes(n), n);
  }
  assert.equal(await temoinPresent(brute, "idx_seances_routine"), true);
  assert.equal(await temoinPresent(brute, "idx_absent"), false);
  // rejouée (numéro pris par une autre branche, témoin absent) : IF NOT EXISTS, rien ne casse
  raw.exec("DROP INDEX idx_seances_routine; PRAGMA user_version = 54");
  assert.equal(await migrer(brute), VERSION_COURANTE);
  assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_seances_routine'").get());
});

test("les recherches de l'audit passent par un index (EXPLAIN QUERY PLAN)", async () => {
  const { raw } = await baseDeTest();
  // dernière séance d'une routine (listerRoutines), séances d'une salle, séances d'un exercice
  assert.match(plan(raw, "SELECT MAX(debut) FROM seances WHERE routine_id = ?", "r"), /USING COVERING INDEX idx_seances_routine/);
  assert.match(plan(raw, "SELECT id FROM seances WHERE salle_id = ? ORDER BY debut DESC", "s"), /USING (COVERING )?INDEX idx_seances_salle/);
  assert.match(plan(raw, "SELECT seance_id FROM seance_exercices WHERE exercice_id = ?", "e"), /USING COVERING INDEX idx_seance_exercices_exercice/);
  // précédent d'un exercice : ses séries faites
  assert.match(plan(raw, "SELECT seance_id FROM series WHERE exercice_id = ? AND faite = 1", "e"), /USING COVERING INDEX idx_series_exercice_faite/);
  // récents d'un repas sur 90 jours
  assert.match(plan(raw, "SELECT produit_id FROM consommations WHERE repas_id = ? AND date >= ?", "repas:diner", "2026-08-01"), /USING INDEX idx_consommations_repas_date/);
  // doublon Whoop : recherche bornée dans l'index (type, date, source), plus un parcours du type par mesure
  const sql = `SELECT 1 FROM mesure_corps m WHERE m.type = 'vfc' AND EXISTS (SELECT 1 FROM mesure_corps w WHERE w.type = m.type
    AND w.date > m.date - 43200000 AND w.date < m.date + 43200000 AND w.source = 'whoop')`;
  assert.match(plan(raw, sql), /SEARCH w (EXISTS )?USING (COVERING )?INDEX idx_mesure_corps \(type=\? AND date>\? AND date<\?\)/);
});

test("dédoublonnage Whoop par bornes : les mêmes mesures que l'ancien ABS(…) < 12 h", async () => {
  const { db, raw } = await baseDeTest();
  const H = 3_600_000;
  const t0 = new Date(2026, 9, 1, 7).getTime();
  // VFC : Whoop chaque nuit, Santé Connect aussi (doublons à ±11 h, à 12 h pile et à 13 h), Withings pour le gras
  for (let i = 0; i < 40; i++) {
    const j = t0 + i * 24 * H;
    await ajouterMesures(db, "vfc", [{ valeur: 60 + i, date: j }], "whoop");
    await ajouterMesures(db, "vfc", [{ valeur: 70 + i, date: j + [-11, 11, 12, 13, -12, 5][i % 6]! * H }], "sante_connect");
    await ajouterMesures(db, "gras", [{ valeur: 15, date: j }], "withings");
    await ajouterMesures(db, "gras", [{ valeur: 16, date: j + (i % 2 ? 11 : 12) * H }], "sante_connect");
  }
  const ancien = (type: string) =>
    raw
      .prepare(
        `SELECT id FROM mesure_corps WHERE type = ? AND date >= 0
         AND NOT (source <> 'whoop' AND EXISTS (SELECT 1 FROM mesure_corps w WHERE w.type = mesure_corps.type AND w.source = 'whoop' AND ABS(w.date - mesure_corps.date) < 43200000))
         AND NOT (source = 'sante_connect' AND EXISTS (SELECT 1 FROM mesure_corps w WHERE w.type = mesure_corps.type AND w.source = 'withings' AND ABS(w.date - mesure_corps.date) < 43200000))
         ORDER BY date DESC`,
      )
      .all(type)
      .map((x) => (x as { id: string }).id);
  for (const type of ["vfc", "gras"] as const) {
    const nouveau = (await historiqueMesure(db, type)).map((m) => m.id);
    assert.deepEqual(nouveau, ancien(type), type);
    assert.ok(nouveau.length < 80 && nouveau.length > 40, `${type} : des doublons écartés, d'autres gardés (${nouveau.length})`);
  }
  // la dernière mesure à une date : celle qu'aurait rendue l'ancienne requête
  for (let i = 0; i < 40; i += 7) {
    const t = t0 + i * 24 * H + 6 * H;
    const d = await derniereMesure(db, "vfc", t);
    assert.equal(d?.id, ancien("vfc").map((id) => raw.prepare("SELECT id, date FROM mesure_corps WHERE id = ?").get(id) as { id: string; date: number }).find((x) => x.date <= t)?.id);
  }
});
