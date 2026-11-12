// Cadre vert de focus (planche plats, `.champ.focus`) : toutes les saisies de la Nutrition passent par SaisieNutrition
// (ecrans/nutrition/commun.tsx), seule à poser un TextInput ; le liseré vient d'un seul endroit.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DOSSIER = new URL("../src/ecrans/nutrition/", import.meta.url).pathname;

test("Nutrition : un seul TextInput, celui de SaisieNutrition, qui pose le liseré de focus", () => {
  const avec = readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => /<TextInput\s/.test(readFileSync(join(DOSSIER, f), "utf8")));
  assert.deepEqual(avec, ["commun.tsx"]);
  const commun = readFileSync(join(DOSSIER, "commun.tsx"), "utf8");
  assert.equal(commun.split(/<TextInput\s/).length - 1, 1);
  const saisie = commun.slice(commun.indexOf("export function SaisieNutrition"), commun.indexOf("export function ChampTexte"));
  assert.match(saisie, /setFocus\(true\)/);
  assert.match(saisie, /borderColor: couleurs\.partieNutrition/);
  assert.match(commun, /focus: \{ borderWidth: 1\.5 \}/);
  assert.match(commun.slice(commun.indexOf("export function ChampTexte")), /^[^]*?<SaisieNutrition/);
});
