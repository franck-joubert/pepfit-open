// Barre des zones de FC de la fin de course (retour du 29/10) : chaque étiquette sous SON segment, alignée à
// gauche ; une zone vide garde une petite largeur (celle de son étiquette et une marge) ; jamais de chevauchement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { repartitionZones, SEUIL_ZONE_S } from "../src/ecrans/effort-vue.ts";

const ECART = 2;
const somme = (l: readonly { l: number }[]) => l.reduce((a, g) => a + g.l, 0);
const proche = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} ≠ ${b}`);

test("exemple d'Alex (Z1 5:06, Z2 1:02, Z3 à Z5 vides) : trois mini-barres collées à droite, Z2 sous le bleu", () => {
  const mins = [30, 30, 18, 18, 18];
  const g = repartitionZones([306, 62, 0, 0, 0], 360, mins, ECART);
  assert.deepEqual(g.map((x) => x.vide), [false, false, true, true, true]);
  // Les vides gardent leur minimum et finissent la barre, dans l'ordre.
  for (const i of [2, 3, 4]) proche(g[i]!.l, 18);
  proche(g[4]!.x + g[4]!.l, 360, "fin de barre");
  proche(g[3]!.x, g[2]!.x + 18 + ECART);
  // Z1 et Z2 se partagent le reste au prorata de leur temps.
  const reste = 360 - 4 * ECART - 3 * 18;
  proche(g[0]!.l, (reste * 306) / 368);
  proche(g[1]!.l, (reste * 62) / 368);
  proche(g[1]!.x, g[0]!.l + ECART, "Z2 commence juste après Z1");
});

test("chaque segment tient son étiquette : largeur ≥ minimum, segments dans l'ordre, sans chevauchement, largeur totale", () => {
  const cas: [number[], number, number[]][] = [
    [[1200, 600, 300, 60, 31], 360, [32, 32, 32, 32, 32]],
    [[3000, 40, 35, 0, 0], 360, [36, 30, 30, 18, 18]],
    [[0, 0, 0, 0, 900], 300, [18, 18, 18, 18, 40]],
    [[50, 50, 50, 50, 50], 200, [30, 30, 30, 30, 30]],
  ];
  for (const [s, largeur, mins] of cas) {
    const g = repartitionZones(s, largeur, mins, ECART);
    g.forEach((x, i) => {
      assert.ok(x.l >= mins[i]! - 1e-6, `zone ${i + 1} : ${x.l} < ${mins[i]}`);
      if (i) proche(x.x, g[i - 1]!.x + g[i - 1]!.l + ECART, `zone ${i + 1} collée à la précédente`);
    });
    proche(g[0]!.x, 0);
    proche(somme(g) + ECART * (g.length - 1), largeur, "largeur totale");
  }
});

test("au-dessus des minimums, les largeurs restent proportionnelles au temps", () => {
  const g = repartitionZones([600, 1200, 1800, 600, 600], 410, [20, 20, 20, 20, 20], ECART);
  const utile = 410 - 4 * ECART;
  [600, 1200, 1800, 600, 600].forEach((s, i) => proche(g[i]!.l, (utile * s) / 4800));
});

test("une zone sous le seuil de 30 s compte comme vide (« — » sous l'étiquette, mini-barre), une zone remplie jamais", () => {
  assert.equal(SEUIL_ZONE_S, 30);
  const g = repartitionZones([500, 29, 30, 0, 0], 360, [24, 24, 24, 18, 18], ECART);
  assert.deepEqual(g.map((x) => x.vide), [false, true, false, true, true]);
  proche(g[1]!.l, 24);
  assert.ok(g[2]!.l >= 24);
});

test("cas limites : aucun temps (toutes vides, à gauche), minimums plus larges que la barre (réduits au prorata)", () => {
  const vides = repartitionZones([0, 0, 0, 0, 0], 360, [18, 18, 18, 18, 18], ECART);
  assert.ok(vides.every((x) => x.vide));
  vides.forEach((x, i) => proche(x.x, i * (18 + ECART)));
  const serre = repartitionZones([100, 100, 0, 0, 0], 100, [40, 40, 40, 40, 40], ECART);
  proche(somme(serre) + 4 * ECART, 100);
  serre.forEach((x) => proche(x.l, (100 - 4 * ECART) / 5));
});
