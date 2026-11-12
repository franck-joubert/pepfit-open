// Suivi GPS et FC (planches/suivi-gps) : distance, lissage, allure, dénivelé, km, tours, zones, lecture 0x2A37.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allureSParKm, allureTexte, altitudeBaroM, denivele, distancesCumulees, fusionnerTour, haversineM, lireFrequence, lisser,
  parKm, tours, vitesseKmH, zoneFc,
} from "../src/natif/suivi/logique.ts";
import type { Point } from "../src/natif/suivi/types.ts";

const proche = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} ± ${tol}`);

/** Points vers le nord, `pas` m par seconde, précision 5 m. 1° de latitude ≈ 111 195 m. */
function ligne(n: number, pas: number, debutS = 0): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    t: 1_000_000 + (debutS + i) * 1000, s: (debutS + i) * 1000, lat: 48.85 + (i * pas) / 111_195, lon: 5.8037,
    altBaro: null, altGps: null, precision: 5, vitesse: pas,
  }));
}

test("haversine : Lyon-Marseille et un degré de latitude", () => {
  proche(haversineM({ lat: 45.764, lon: 4.8357 }, { lat: 43.2965, lon: 5.3698 }), 277_600, 1500);
  proche(haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111_195, 5);
  assert.equal(haversineM({ lat: 10, lon: 10 }, { lat: 10, lon: 10 }), 0);
});

test("distance cumulée : points imprécis et sauts ignorés", () => {
  const p = ligne(11, 3);
  proche(distancesCumulees(p)[10]!, 30, 0.1);
  const flou = p.map((x, i) => (i === 5 ? { ...x, precision: 80 } : x));
  proche(distancesCumulees(flou)[10]!, 30, 0.1);
  const saut = p.map((x, i) => (i === 5 ? { ...x, lat: x.lat + 0.01 } : x));
  const d = distancesCumulees(saut);
  proche(d[5]!, d[4]!, 0.01);
  proche(d[10]!, 30, 0.1);
  assert.deepEqual(distancesCumulees([]), []);
});

test("distance cumulée : premier fix périmé et vrai saut réancrés, sans compter le saut", () => {
  // premier point à ~500 m (dernière position connue), puis une ligne de 5 m/s : le saut n'est jamais compté
  const p = ligne(31, 5);
  const perime = [{ ...p[0]!, lat: p[0]!.lat - 0.0045 }, ...p.slice(1)];
  const d = distancesCumulees(perime);
  proche(d[30]! - d[29]!, 5, 0.1);
  assert.ok(d[30]! < 150, `saut compté : ${d[30]}`);
});

test("distance cumulée : pas de pont par-dessus une pause (t avance, s non)", () => {
  // 10 points, pause de 60 s pendant laquelle on a marché 300 m, puis 10 points
  const avant = ligne(10, 3);
  const apres = ligne(10, 3, 10).map((x) => ({ ...x, t: x.t + 60_000, lat: x.lat + 300 / 111_195 }));
  const d = distancesCumulees([...avant, ...apres]);
  proche(d[19]!, 9 * 3 + 9 * 3, 0.5);
});

test("lissage : moyenne glissante, null conservés", () => {
  assert.deepEqual(lisser([1, 2, 3, 4, 5], 3), [1.5, 2, 3, 4, 4.5]);
  assert.deepEqual(lisser([1, null, 3, 5], 3), [1, null, 4, 4]);
  assert.deepEqual(lisser([7], 5), [7]);
});

test("allure et vitesse", () => {
  assert.equal(allureSParKm(1000, 300), 300);
  assert.equal(allureSParKm(5, 30), null);
  assert.equal(allureTexte(312), "5'12\"");
  assert.equal(allureTexte(null), "—");
  proche(vitesseKmH(1000, 120) ?? 0, 30, 1e-9);
  assert.equal(vitesseKmH(1000, 0), null);
});

test("altitude barométrique : niveau de la mer et 1 hPa ≈ 8 m", () => {
  proche(altitudeBaroM(1013.25), 0, 1e-9);
  proche(altitudeBaroM(1012.25) - altitudeBaroM(1013.25), 8.3, 0.3);
});

test("dénivelé : le bruit sous le seuil ne compte pas", () => {
  assert.deepEqual(denivele([100, 101, 100, 101.5, 100, 101], 3), { plus: 0, moins: 0 });
  assert.deepEqual(denivele([100, 104, 108, 103, 98], 3), { plus: 8, moins: 10 });
  assert.deepEqual(denivele([null, 100, null, 110], 3), { plus: 10, moins: 0 });
  // montée lente de 0,5 m par point : comptée par paliers de 3 m
  assert.equal(denivele(Array.from({ length: 21 }, (_, i) => 100 + i * 0.5), 3).plus, 9);
});

test("par km : temps de passage interpolé, dernier morceau partiel", () => {
  // 2,5 km à 4 m/s : 1 km en 250 s
  const m = parKm(ligne(626, 4));
  assert.equal(m.length, 3);
  proche(m[0]!.dureeS, 250, 0.5);
  proche(m[1]!.finS, 500, 0.5);
  assert.equal(m[2]!.partiel, true);
  proche(m[2]!.distanceM, 500, 1);
  proche(m[2]!.allure ?? 0, 250, 1);
  assert.deepEqual(parKm([]), []);
});

test("tours : Tour 1 couvre tout avant le premier toucher, fusion d'une borne", () => {
  const seul = tours([], { s: 600_000, d: 2000 });
  assert.equal(seul.length, 1);
  assert.equal(seul[0]!.enCours, true);
  assert.equal(seul[0]!.allure, 300);
  const b = [{ s: 400_000, d: 1600 }, { s: 200_000, d: 800 }];
  const t = tours(b, { s: 700_000, d: 2600 });
  assert.deepEqual(t.map((x) => [x.n, x.dureeS, x.distanceM, x.enCours]), [[1, 200, 800, false], [2, 200, 800, false], [3, 300, 1000, true]]);
  const f = fusionnerTour(b, 2);
  assert.deepEqual(f, [{ s: 400_000, d: 1600 }]);
  assert.equal(tours(f, { s: 700_000, d: 2600 })[0]!.dureeS, 400);
  assert.deepEqual(fusionnerTour(b, 1), b);
});

test("zones : tranches de 10 % de la FC max (181)", () => {
  assert.equal(zoneFc(80, 181), 0);
  assert.equal(zoneFc(100, 181), 1);
  assert.equal(zoneFc(120, 181), 2);
  assert.equal(zoneFc(140, 181), 3);
  assert.equal(zoneFc(150, 181), 4);
  assert.equal(zoneFc(170, 181), 5);
});

test("0x2A37 : FC sur 8 et 16 bits, contact, énergie et RR", () => {
  assert.deepEqual(lireFrequence([0x00, 72]), { bpm: 72, contact: null, rr: [] });
  assert.deepEqual(lireFrequence([0x01, 0x2c, 0x01]), { bpm: 300, contact: null, rr: [] });
  assert.equal(lireFrequence([0x06, 90])?.contact, true);
  assert.equal(lireFrequence([0x04, 90])?.contact, false);
  // énergie (2 octets) puis un RR de 1024/1024 s
  assert.deepEqual(lireFrequence([0x18, 60, 0x10, 0x00, 0x00, 0x04]), { bpm: 60, contact: null, rr: [1000] });
  assert.equal(lireFrequence([0x01, 5]), null);
});

test("audit n° 44 : 0,00 km sur l'émulateur = positions simulées trop rapides (sauts), pas une panne du filtre", () => {
  // 150 m vers le nord par pas (≈ 0,00135° de latitude).
  const pas = (n: number, dtS: number): Point[] =>
    Array.from({ length: n }, (_, i) => ({ t: 1_000_000 + i * dtS * 1000, s: i * dtS * 1000, lat: 48.85 + i * 0.00135, lon: 5.8037, precision: 5 }) as Point);
  // Une position par seconde, 150 m d'écart (≈ 150 m/s) : chaque pas est un saut, rien ne compte (scénario de l'audit).
  assert.equal(distancesCumulees(pas(10, 1)).at(-1), 0);
  // Même parcours à allure de course (150 m en 40 s ≈ 3,75 m/s) : la distance s'accumule.
  const d = distancesCumulees(pas(10, 40)).at(-1)!;
  assert.ok(d > 1300 && d < 1400, `distance ${d}`);
});
