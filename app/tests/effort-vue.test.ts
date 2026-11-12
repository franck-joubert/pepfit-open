// Suivi GPS, lot 3 (planches suivi-gps « Fin » et Lieux « Effort ») : résumé, tours, par km, zones, altitude, fusion des tours.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerSuivi, fusionnerTourSeance, lireSuivi } from "../src/db/depots/suivi-gps.ts";
import {
  decimer, distanceA, dureeZone, fcSur, graduationsKm, graduationsMinutes, melange, vueEffort, zoneDominante, zonesTrace,
  type DonneesSuivi,
} from "../src/ecrans/effort-vue.ts";
import { baseDeTest } from "./aide.ts";

// Course de 2,5 km vers le nord à 3,2 m/s (un point par seconde), FC qui monte de 100 à 170, altitude en bosse.
const M_PAR_DEG = 111_195;
function course(): DonneesSuivi {
  const n = Math.round(2500 / 3.2);
  const points = Array.from({ length: n + 1 }, (_, i) => ({
    t: 1_000_000 + i * 1000, s: i * 1000, lat: 48.85 + (i * 3.2) / M_PAR_DEG, lon: 5.8037,
    altBaro: 30 + 10 * Math.sin((Math.PI * i) / n), altGps: null, precision: 5, vitesse: 3.2,
  }));
  const fc = points.map((p, i) => ({ s: p.s, bpm: Math.round(100 + (70 * i) / n) }));
  return { points, fc, bornes: [{ s: 300_000, d: 950 }, { s: 600_000, d: 1900 }], denivelePlusM: null, barometre: true };
}

test("résumé : durée, distance, allure, FC moyenne et max, zones, altitude", () => {
  const v = vueEffort(course(), 781, 181);
  assert.ok(Math.abs(v.distanceM - 2499.2) < 5, `${v.distanceM}`);
  assert.ok(Math.abs(v.allure! - 312.5) < 1, `${v.allure}`);
  assert.equal(v.fcMax, 170);
  assert.ok(Math.abs(v.fcMoy! - 135) <= 1, `${v.fcMoy}`);
  const total = v.zonesS!.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 782) < 1, `${total}`);
  assert.equal(v.zonesS![0], 0);
  assert.ok(v.zonesS![5] > 0);
  assert.ok(v.altitude && Math.abs(v.altitude.max - 40) < 0.5 && Math.abs(v.altitude.min - 30) < 0.5);
  assert.ok(Math.abs(v.altitude!.plus - 10) < 1.5, `${v.altitude!.plus}`);
  assert.equal(v.altitude!.approx, false);
  assert.ok(v.trace.length <= 400 && v.trace.at(-1)!.s === 781);
});

test("tours : bornes du toucher, distance recalculée, FC, zone dominante, D+", () => {
  const v = vueEffort(course(), 781, 181);
  assert.equal(v.tours.length, 3);
  const [a, b, c] = v.tours;
  assert.equal(a!.dureeS, 300);
  assert.ok(Math.abs(a!.distanceM - 960) < 2, `${a!.distanceM}`);
  assert.ok(Math.abs(a!.allure! - 312.5) < 1);
  assert.equal(c!.finS, 781);
  assert.ok(a!.fcMoy! < b!.fcMoy! && b!.fcMoy! < c!.fcMoy!);
  assert.equal(a!.zone, 2);
  assert.ok(a!.dPlus! >= 5 && c!.dPlus === 0, `${a!.dPlus} ${c!.dPlus}`);
  assert.deepEqual(v.reperes.map((r) => r.s), [300, 600]);
  // sans toucher : pas de tableau des tours
  assert.equal(vueEffort({ ...course(), bornes: [] }, 781, 181).tours.length, 0);
});

test("par km : deux km entiers, le reste partiel ramené au km, barre de vitesse, zone de la FC moyenne", () => {
  const v = vueEffort(course(), 781, 181);
  assert.equal(v.km.length, 3);
  assert.deepEqual(v.km.map((k) => k.partiel), [false, false, true]);
  assert.ok(Math.abs(v.km[2]!.distanceM - 499) < 5);
  for (const k of v.km) assert.ok(Math.abs(k.allure! - 312.5) < 1.5, `${k.allure}`);
  assert.ok(v.km.every((k) => k.vitesse > 0.98 && k.vitesse <= 1));
  assert.ok(v.km[0]!.zone < v.km[2]!.zone);
});

test("sans FC : ni zones ni FC ; sans altitude : pas de profil", () => {
  const d = course();
  const v = vueEffort({ ...d, fc: [], points: d.points.map((p) => ({ ...p, altBaro: null })) }, 781, 181);
  assert.equal(v.zonesS, null);
  assert.equal(v.fcMoy, null);
  assert.equal(v.altitude, null);
  assert.equal(v.serieAlt.length, 0);
  assert.equal(v.km[0]!.zone, 0);
  assert.ok(v.trace.every((p) => p.zone === 0));
});

test("altitude plate : dénivelé gardé, pas de profil", () => {
  const d = course();
  const v = vueEffort({ ...d, points: d.points.map((p) => ({ ...p, altBaro: 0 })) }, 781, 181);
  assert.equal(v.altitude!.plus, 0);
  assert.equal(v.serieAlt.length, 0);
});

test("FC : un trou de diffusion ne compte que 10 s, zones et dominante", () => {
  const f = fcSur([{ s: 0, bpm: 150 }, { s: 60_000, bpm: 100 }], 181);
  assert.equal(f.temps, 11);
  assert.equal(f.zones[4], 10);
  assert.equal(f.zones[1], 1);
  assert.equal(zoneDominante([30, 20, 40, 0, 0, 0]), 1);
  assert.equal(zoneDominante([0, 0, 0, 0, 0, 0]), null);
  assert.deepEqual(zonesTrace([{ s: 0 }, { s: 5000 }, { s: 30_000 }], [{ s: 0, bpm: 60 }, { s: 4000, bpm: 170 }], 181), [1, 5, 0]);
});

test("aides : décimation, distance interpolée, couleurs, durées, graduations, calories", () => {
  const l = Array.from({ length: 1000 }, (_, i) => i);
  const d = decimer(l, 10);
  assert.equal(d.length, 10);
  assert.equal(d[0], 0);
  assert.equal(d.at(-1), 999);
  assert.equal(distanceA([{ s: 0 }, { s: 1000 }], [0, 10], 500), 5);
  assert.equal(distanceA([{ s: 0 }, { s: 1000 }], [0, 10], 5000), 10);
  assert.equal(melange("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(melange("#4fd8c4", "#facc15", 2), "#facc15");
  assert.deepEqual(dureeZone(125), { n: 2, unite: "min" });
  assert.deepEqual(dureeZone(35), { n: 35, unite: "s" });
  assert.deepEqual(dureeZone(0), { n: 0, unite: "min" });
  assert.deepEqual(graduationsMinutes(42 * 60), [0, 10, 20, 30, 40]);
  assert.deepEqual(graduationsMinutes(83 * 60), [0, 20, 40, 60, 80]);
  assert.deepEqual(graduationsKm(8200), [0, 2, 4, 6, 8]);
});

test("base : lecture du suivi d'une séance, fusion d'un tour avec le précédent", async () => {
  const { db } = await baseDeTest(true);
  const c = course();
  const id = await enregistrerSuivi(db, {
    exerciceId: "cat:course", titre: "Course à pied", salleId: null, mode: "course", debut: 1_000_000, fin: 1_800_000, dureeS: 781,
    distanceM: 2500, denivelePlusM: 10, deniveleMoinsM: 10, barometre: true, points: c.points,
    fc: c.fc.map((f) => ({ ...f, t: 1_000_000 + f.s })),
    tours: [{ s: 300_000, d: 950 }, { s: 600_000, d: 1900 }, { s: 700_000, d: 2200 }],
  });
  const s = (await lireSuivi(db, id))!;
  assert.equal(s.points.length, c.points.length);
  assert.equal(s.fc.length, c.fc.length);
  assert.deepEqual(s.bornes.map((b) => b.s), [300_000, 600_000, 700_000]);
  assert.equal(s.denivelePlusM, 10);
  assert.equal(s.barometre, true);
  await fusionnerTourSeance(db, id, 3);
  assert.deepEqual((await lireSuivi(db, id))!.bornes.map((b) => b.s), [300_000, 700_000]);
  const v = vueEffort((await lireSuivi(db, id))!, 781, 181);
  assert.equal(v.tours.length, 3);
  assert.equal(v.tours[1]!.dureeS, 400);
  await fusionnerTourSeance(db, id, 1);
  assert.equal((await lireSuivi(db, id))!.bornes.length, 2);
  assert.equal(await lireSuivi(db, "inconnue"), null);
});
