// Revue finale du 30/10, lot L10 (parcours de bienvenue) : poids dans l'unité des réglages, « ~ » par approx(), marges de
// 16, barre de progression en scaleX, erreurs plus avalées.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { definirActif, t } from "../src/i18n/index.ts";
import { fr } from "../src/i18n/dico-fr/parcours.ts";
import { en } from "../src/i18n/dico-en/parcours.ts";
import { approx, depuisUnite, nombre } from "../src/ecrans/format.ts";
import { POIDS_MOLETTE, RYTHMES } from "../src/ecrans/parcours-calc.ts";
import { crans, poidsTexte } from "../src/ecrans/parcours-unite.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const FICHIERS = ["app/welcome.tsx", "ecrans/parcours-ui.tsx"];

test("n° 45 : en kg, les molettes et les rythmes de toujours", () => {
  const c = crans("kg");
  assert.equal(c.poids, POIDS_MOLETTE);
  assert.deepEqual(c.rythmes, [...RYTHMES]);
  assert.equal(poidsTexte(70.5, "kg"), "70,5");
});

test("n° 45 : en livres, une livre par cran de 66 à 551 lb, enregistrée en kg, et 0,5, 1, 1,5 lb par semaine", () => {
  const c = crans("lbs");
  const affiches = c.poids.map((kg) => poidsTexte(kg, "lbs"));
  assert.equal(affiches[0], "66");
  assert.equal(affiches.at(-1), "551");
  affiches.forEach((s, i) => assert.equal(s, String(66 + i), `cran ${i}`));
  // Les crans restent dans les bornes des molettes en kg et croissent (indiceProche les suppose triés).
  assert.ok(c.poids[0]! >= 29.9 && c.poids.at(-1)! <= 250);
  for (let i = 1; i < c.poids.length; i++) assert.ok(c.poids[i]! > c.poids[i - 1]!);
  assert.ok(Math.abs(c.poids[155 - 66]! - depuisUnite(155, "lbs")) < 0.001);
  assert.deepEqual(
    c.rythmes.map((kg) => poidsTexte(kg, "lbs")),
    ["0,5", "1", "1,5"],
  );
});

test("n° 45 : plus de « kg » écrit en dur dans le parcours", () => {
  const w = lire("app/welcome.tsx");
  assert.doesNotMatch(w, /unite="kg"/);
  assert.doesNotMatch(w, /\} kg`/);
  assert.match(w, /unite=\{u\}/);
  for (const d of [fr, en]) {
    assert.doesNotMatch(d["parcours.cible.depuis"], /kg/);
    assert.match(d["parcours.parSemaine"], /^\{u\} \/ /);
  }
  assert.equal(t("parcours.parSemaine", { u: "lbs" }), "lbs / semaine");
  assert.equal(t("parcours.cible.depuis", { poids: "170 lbs" }), " depuis 170 lbs");
});

test("n° 42 : ni « ~ » ni « ≈ » dans les textes du parcours ; valeurs approchées par approx(), qui les rend telles quelles", () => {
  for (const d of [fr, en]) {
    for (const [cle, v] of Object.entries(d)) assert.doesNotMatch(v, /[~≈]/, cle);
  }
  const w = lire("app/welcome.tsx");
  assert.match(w, /approx\(formater\(date/);
  assert.match(w, /kcal: approx\(kcal\(o\.moyenne\)\)/);
  assert.match(w, /n: approx\(kcal\(fin\.kcal\)\)/);
  assert.equal(t("parcours.maintienDetail", { kcal: approx(nombre(2050, 0)) }).slice(0, 7), "2 050 k");
});

test("n° 40 : marges de 16 dans le parcours (ni 20, ni 24, ni 32)", () => {
  for (const f of FICHIERS) assert.doesNotMatch(lire(f), /(margin|padding)(Horizontal|Left|Right): (20|24|32)\b/, f);
});

test("n° 61 : la barre de progression s'étire en scaleX depuis la gauche, sans animer sa largeur", () => {
  const ui = lire("ecrans/parcours-ui.tsx");
  assert.match(ui, /transform: \[\{ scaleX: p\.value \}\]/);
  assert.match(ui, /rempli: \{[^}]*transformOrigin: "left"/);
  assert.doesNotMatch(ui, /width: `\$\{p\.value/);
  // Courbe : le jeton partagé, plus de copie locale.
  for (const f of FICHIERS) assert.doesNotMatch(lire(f), /Easing\.bezier/, f);
});

test("n° 16 : aucune erreur avalée dans le parcours", () => {
  for (const f of FICHIERS) assert.doesNotMatch(lire(f), /\.catch\(\(\) => \{\}\)/, f);
});
