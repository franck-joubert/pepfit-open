// Roue de repos : format fixe, zéros atténués, minutes pile, lecture, interpolation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { valeursRepos } from "../src/ecrans/format.ts";
import { decoupeRoue, dureeLue, ECHELLES, interpolationLigne, minutePile } from "../src/ecrans/roue.ts";

const texte = (d: { attenue: string; plein: string }) => d.attenue + d.plein;

test("format fixe « M min SS s »", () => {
  assert.equal(texte(decoupeRoue(5)), "0 min 05 s");
  assert.equal(texte(decoupeRoue(240)), "4 min 00 s");
  assert.equal(texte(decoupeRoue(600)), "10 min 00 s");
  assert.equal(texte(decoupeRoue(245)), "4 min 05 s");
});

test("zéros de tête atténués, le reste plein", () => {
  assert.deepEqual(decoupeRoue(5), { attenue: "0 min 0", plein: "5 s" });
  assert.deepEqual(decoupeRoue(30), { attenue: "0 min ", plein: "30 s" });
  assert.deepEqual(decoupeRoue(0), { attenue: "0 min 0", plein: "0 s" });
  assert.deepEqual(decoupeRoue(240), { attenue: "", plein: "4 min 00 s" });
});

test("pas de zéro devant les minutes", () => {
  for (const s of valeursRepos()) assert.doesNotMatch(texte(decoupeRoue(s)), /^0\d/);
  assert.equal(texte(decoupeRoue(115)), "1 min 55 s");
});

test("repère sur les minutes pile seulement", () => {
  assert.equal(minutePile(0), false);
  assert.equal(minutePile(60), true);
  assert.equal(minutePile(600), true);
  assert.equal(minutePile(90), false);
  assert.equal(valeursRepos().filter(minutePile).length, 10);
});

test("valeur lue en toutes lettres", () => {
  assert.equal(dureeLue(240), "4 minutes");
  assert.equal(dureeLue(60), "1 minute");
  assert.equal(dureeLue(90), "1 minute 30 secondes");
  assert.equal(dureeLue(5), "5 secondes");
  assert.equal(dureeLue(0), "0 seconde");
});

test("interpolation continue autour de la ligne, symétrique", () => {
  const { inputRange, outputRange } = interpolationLigne(5, 44, ECHELLES);
  assert.deepEqual(inputRange, [88, 132, 176, 220, 264, 308, 352]);
  assert.deepEqual(outputRange, [0.7, 0.75, 0.85, 1, 0.85, 0.75, 0.7]);
});

test("roues silencieuses : aucune vibration au cran (records et erreurs seulement)", () => {
  const source = readFileSync(new URL("../src/ui/RoueDuree.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /haptique|Haptics|Vibration/);
});

test("D6 : menu du bas et segmentés silencieux au glisser (la Molette du parcours garde son cran)", () => {
  for (const f of ["MenuFlottant.tsx", "Segmente.tsx"]) {
    const source = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /haptique\.|Haptics|Vibration/, f);
  }
  assert.match(readFileSync(new URL("../src/ui/Molette.tsx", import.meta.url), "utf8"), /haptique\.cran\(\)/);
});
