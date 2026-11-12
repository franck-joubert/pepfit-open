// Lot 3 de la planche seance-duree (fins de séance) : titre sans lettre ni chiffre ramené au nom par défaut, et une course
// reprise depuis son résumé met à jour la même séance au lieu d'en créer une seconde.
import assert from "node:assert/strict";
import { test } from "node:test";
import { titreFinal, titreValable } from "../src/ecrans/edition-seance.ts";
import { enregistrerSuivi, lireSuivi, remplacerSuivi, type SuiviAEnregistrer } from "../src/db/depots/suivi-gps.ts";
import { lireSeance } from "../src/db/depots/seances.ts";
import { baseDeTest } from "./aide.ts";

test("titre « - » (fin de course d'Alex) : sans lettre ni chiffre, il vaut un titre vide et le nom par défaut revient", () => {
  for (const x of ["-", " – ", "—", "", "  ", "·"]) assert.equal(titreFinal(x), null, JSON.stringify(x));
  assert.equal(titreValable("-"), null);
  assert.equal(titreValable(null), null);
  assert.equal(titreFinal("  Fractionné   6 × 1 km "), "Fractionné 6 × 1 km");
  assert.equal(titreValable("5 km"), "5 km");
});

const T0 = Date.UTC(2026, 9, 29, 10, 0, 0);
function course(secondes: number, metres: number): SuiviAEnregistrer {
  const points = Array.from({ length: secondes + 1 }, (_, s) => ({ t: T0 + s * 1000, s: s * 1000, lat: 48.85 + (metres * s) / secondes / 111320, lon: 5.8037, altBaro: null, altGps: 35, precision: 4, vitesse: metres / secondes }));
  const fc = Array.from({ length: secondes }, (_, s) => ({ t: T0 + s * 1000, s: s * 1000, bpm: 120 + (s % 20) }));
  return { exerciceId: "cat:course", titre: "Course à pied", salleId: null, mode: "course", debut: T0, fin: T0 + secondes * 1000, dureeS: secondes, distanceM: metres, denivelePlusM: 0, deniveleMoinsM: 0, barometre: false, points, fc, tours: [] };
}

test("reprise depuis le résumé : la nouvelle fin met à jour la même séance (durée, distance, tracé, FC), titre gardé", async () => {
  const { db, raw } = await baseDeTest(true);
  const id = await enregistrerSuivi(db, course(120, 400));
  await db.runAsync("UPDATE seances SET titre = ? WHERE id = ?", ["Footing du matin", id]);
  await remplacerSuivi(db, id, course(300, 1000));
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM seances").get() as { n: number }).n, 1);
  const s = (await lireSeance(db, id))!;
  assert.equal(s.seance.titre, "Footing du matin");
  assert.equal(s.seance.fin, T0 + 300 * 1000);
  const serie = s.exercices[0]!.series[0]!;
  assert.deepEqual([serie.duree_s, serie.distance_m, serie.faite], [300, 1000, 1]);
  const su = (await lireSuivi(db, id))!;
  assert.equal(su.points.length, 301);
  assert.equal(su.fc.length, 300);
});
