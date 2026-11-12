import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blocResteVisible, resteDe, resteDuJour } from "../src/nutrition/reste.ts";

// Bloc « Il reste » (planche du 08/11, variante A avec les corrections d'Alex).
const OBJECTIF = { proteines: 150, glucides: 220, lipides: 75, sucres: 60 };
const total = (kcal: number, proteines: number, glucides: number, lipides: number, sucres = 0) => ({ kcal, proteines, glucides, lipides, sucres });
const bloc = readFileSync(new URL("../src/ecrans/nutrition/BlocReste.tsx", import.meta.url), "utf8");
const journal = readFileSync(new URL("../src/ecrans/nutrition/Journal.tsx", import.meta.url), "utf8");

test("reste positif : objectif moins consommé, arrondi", () => {
  assert.deepEqual(resteDe(1180.4, 2155), { reste: 975, atteint: false });
  assert.deepEqual(resteDe(2110, 2155), { reste: 45, atteint: false });
});

test("objectif rempli ou franchi : 0 et atteint, jamais de négatif", () => {
  assert.deepEqual(resteDe(2155, 2155), { reste: 0, atteint: true });
  assert.deepEqual(resteDe(2390, 2155), { reste: 0, atteint: true });
  assert.deepEqual(resteDe(214.6, 215), { reste: 0, atteint: true }, "arrondi avant de comparer");
});

test("le jour : kcal depuis les macros de l'objectif (4 P + 4 G + 9 L), macros à 0 quand atteintes, sucre absent", () => {
  const r = resteDuJour(total(1180, 70, 140, 38, 22), OBJECTIF);
  assert.deepEqual(r.kcal, { reste: 2155 - 1180, atteint: false });
  assert.deepEqual(r.macros, { proteines: 80, glucides: 80, lipides: 37 });
  const depasse = resteDuJour(total(2390, 168, 205, 91, 74), OBJECTIF);
  assert.deepEqual(depasse.kcal, { reste: 0, atteint: true });
  assert.deepEqual(depasse.macros, { proteines: 0, glucides: 15, lipides: 0 });
  assert.ok(!("sucres" in depasse.macros));
});

test("visible aujourd'hui seulement, ni jour passé ni jour à venir ; pas sans objectif ni sans chiffres", () => {
  const base = { aujourdhui: "2026-11-06", objectif: OBJECTIF, chiffres: true };
  assert.equal(blocResteVisible({ ...base, jour: "2026-11-06" }), true);
  assert.equal(blocResteVisible({ ...base, jour: "2026-11-07" }), false);
  assert.equal(blocResteVisible({ ...base, jour: "2027-01-01" }), false);
  assert.equal(blocResteVisible({ ...base, jour: "2026-11-05" }), false);
  assert.equal(blocResteVisible({ ...base, jour: "2026-11-06", objectif: null }), false);
  assert.equal(blocResteVisible({ ...base, jour: "2026-11-06", chiffres: false }), false);
});

test("le bloc pose ses valeurs dans la même Rangee que les repas, « kcal » sur la ligne du chiffre, sans ligne d'unités, avec un fond propre", () => {
  const code = bloc.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(bloc, /import \{ MACROS, MARGE_CARTE, Rangee, useCouleursMacros, valeurTexte \} from "\.\/commun"/);
  assert.ok(!/CelluleResume/.test(code), "plus de cellule du haut de page : pas de ligne d'unités sous les chiffres");
  assert.match(code, /valeurTexte\(r\.kcal\.reste, total\.approx\)[\s\S]*?t\("nutrition\.kcal"\)/, "« 140 kcal » sur une ligne");
  assert.match(code, /t\(x\.court\)/, "la lettre colorée devant le chiffre");
  assert.match(bloc, /\$\{t\("nutrition\.objectifAtteint"\)\} 👌/);
  assert.match(bloc, /accessibilityLabel=\{t\("nutrition\.objectifAtteint"\)\}/, "le lecteur d'écran lit le texte sans l'emoji");
  assert.match(code, /backgroundColor: couleurs\.resteFond/, "fond propre, pas celui des cartes de repas");
  assert.ok(!/sucres|Jauge/.test(code), "ni sucre ni jauge");
  assert.match(journal, /blocResteVisible\(/, "la règle d'affichage vient du module testé");
});

test("titre en étiquette de section, chiffres au même corps que les repas, même marge que les cartes", () => {
  assert.match(bloc, /variante="entete" couleur="t3"/);
  assert.ok(!/titreBarre/.test(bloc.replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.match(bloc, /marginHorizontal: MARGE_CARTE/);
  assert.ok(!/fontSize: 15/.test(bloc), "même corps (14) que la ligne de repas");
});
