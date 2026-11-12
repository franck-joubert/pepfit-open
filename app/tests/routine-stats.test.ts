import assert from "node:assert/strict";
import { test } from "node:test";
import { nombre } from "../src/ecrans/format.ts";
import { statsRoutine, volumeCourt } from "../src/ecrans/routine-stats.ts";

test("statistiques de routine : rien si jamais faite, sinon séances, dernière et volume moyen", () => {
  assert.equal(statsRoutine([], "kg"), null);
  const s = statsRoutine(
    [
      { date: new Date(2026, 9, 2).getTime(), valeur: 9000 },
      { date: new Date(2026, 9, 23).getTime(), valeur: 10600 },
    ],
    "kg",
  );
  assert.deepEqual(s, [
    { valeur: "2", legende: "séances" },
    { valeur: "23 oct.", legende: "dernière" },
    { valeur: "9,8 t", legende: "volume moyen" },
  ]);
  assert.equal(statsRoutine([{ date: new Date(2026, 0, 5).getTime(), valeur: 800 }], "kg")![0]!.legende, "séance");
});

test("volume court : tonnes dès 1 000 kg, kg en dessous, lbs arrondis", () => {
  assert.equal(volumeCourt(850, "kg"), "850 kg");
  assert.equal(volumeCourt(1000, "kg"), "1 t");
  assert.equal(volumeCourt(12340, "kg"), "12,3 t");
  assert.equal(volumeCourt(1000, "lbs"), `${nombre(2205, 0)} lbs`);
});
