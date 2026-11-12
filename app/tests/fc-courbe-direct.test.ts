// Courbe des 5 dernières minutes de la bande de séance : fenêtre, trous visibles (jamais reliés), FC perdue en cours, 0 du
// capteur, minimum et maximum.
import assert from "node:assert/strict";
import { test } from "node:test";
import { courbeDirecte, FENETRE_DIRECT_MS, POINTS_DIRECT } from "../src/ecrans/fc-courbe-direct.ts";
import { morceauxCourbe } from "../src/ecrans/fc-trous.ts";

const S = 1000;
const MAINTENANT = Date.UTC(2026, 9, 31, 18, 0);

/** Une mesure par seconde pendant `duree` jusqu'à maintenant, sauf dans `sans` (secondes avant maintenant, [de, a[). */
function fc(duree: number, sans: [number, number][] = [], bpm = (x: number) => 120 + (x % 40)) {
  const l: { t: number; bpm: number }[] = [];
  for (let x = duree; x >= 0; x--) if (!sans.some(([de, a]) => x <= de && x > a)) l.push({ t: MAINTENANT - x * S, bpm: bpm(x) });
  return l;
}

test("fenêtre : seules les 5 dernières minutes, temps en secondes de 0 à 300, décimées", () => {
  const c = courbeDirecte(fc(600), MAINTENANT);
  assert.equal(c.finS, FENETRE_DIRECT_MS / S);
  assert.ok(c.serie[0]!.s >= 0 && c.serie.at(-1)!.s === 300);
  assert.ok(c.serie.length <= POINTS_DIRECT + 2);
  assert.deepEqual(c.trous, []);
  assert.equal(morceauxCourbe(c.serie).length, 1);
});

test("coupure de 40 s il y a 2 min : un trou dans la ligne (deux morceaux), jamais une droite qui relie", () => {
  const c = courbeDirecte(fc(300, [[150, 110]]), MAINTENANT);
  assert.deepEqual(c.trous, [{ a: 149, b: 190 }]);
  const m = morceauxCourbe(c.serie);
  assert.equal(m.length, 2);
  assert.ok(m[0]!.points.at(-1)!.s <= 149 && m[1]!.points[0]!.s >= 190);
  assert.ok(m[1]!.points[0]!.coupe);
});

test("un silence de 5 s ne coupe pas, au-delà oui", () => {
  assert.deepEqual(courbeDirecte(fc(300, [[100, 96]]), MAINTENANT).trous, []);
  assert.equal(courbeDirecte(fc(300, [[100, 94]]), MAINTENANT).trous.length, 1);
});

test("FC perdue en cours : le dernier trou va jusqu'à maintenant", () => {
  const c = courbeDirecte(fc(300, [[30, -1]]), MAINTENANT);
  assert.deepEqual(c.trous, [{ a: 269, b: 300 }]);
  assert.equal(c.serie.at(-1)!.s, 269);
});

test("un 0 du capteur (contact perdu) est un trou, pas un point à 0", () => {
  const c = courbeDirecte(fc(300, [], (x) => (x <= 80 && x > 60 ? 0 : 130)), MAINTENANT);
  assert.ok(c.serie.every((p) => p.bpm >= 25));
  assert.deepEqual(c.trous, [{ a: 219, b: 240 }]);
});

test("minimum et maximum gardés malgré la décimation", () => {
  const c = courbeDirecte(fc(300, [], (x) => (x === 77 ? 181 : x === 201 ? 64 : 120 + (x % 7))), MAINTENANT);
  assert.equal(c.max!.bpm, 181);
  assert.equal(c.max!.s, 223);
  assert.equal(c.min!.bpm, 64);
});

test("rien dans la fenêtre : courbe vide, ni trou ni repère", () => {
  const c = courbeDirecte(fc(60).map((f) => ({ ...f, t: f.t - 10 * 60 * S })), MAINTENANT);
  assert.deepEqual([c.serie, c.trous, c.min, c.max], [[], [], null, null]);
});
