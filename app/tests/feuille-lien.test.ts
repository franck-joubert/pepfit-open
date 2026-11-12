// Feuille de confirmation du rattachement (FeuilleLien) : le picto et le mouvement 3D côte à côte, avec le composant 3D de la fiche
// exercice et de la séance en cours (un seul composant par objet affiché), et les variantes à égalité « Plutôt : … ».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { en, fr } from "../src/i18n/index.ts";
import { coteDesCases, MINI, PLAFOND } from "../src/ecrans/feuille-lien-taille.ts";
import { AZIMUT_TROIS_QUARTS } from "../src/ui/3d/orbite.ts";

const lire = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const feuille = lire("../src/ecrans/FeuilleLien.tsx");

test("la feuille utilise le composant 3D partagé, chargé à la demande, avec le cadrage de la séance en cours", () => {
  assert.match(feuille, /lazy\(\(\) => import\("\.\.\/ui\/3d\/Vue3D"\)\)/);
  assert.match(feuille, /cle3D\(/);
  assert.match(feuille, /AZIMUT_TROIS_QUARTS/);
  assert.match(lire("../src/ecrans/PleinEcran.tsx"), /AZIMUT_TROIS_QUARTS/);
  assert.ok(AZIMUT_TROIS_QUARTS < 0);
  // plus de picto minuscule (56 dp) : la taille vient de la largeur utile, plafonnée
  assert.doesNotMatch(feuille, /taille=\{56\}/);
  assert.match(feuille, /coteDesCases\(/);
});

// Mesures de la recette du 09/11 : téléphone de 390 dp (colonne utile de 350 dp, fenêtre de 1055 dp), Fold déplié (820 dp de haut).
test("cases de la feuille : sur téléphone la largeur décide (160 à 175 dp), au Fold la hauteur garde les boutons visibles", () => {
  assert.equal(coteDesCases(350, 1055, 6, true, 12), 169); // « Hip thrust » et deux « Plutôt », 3D à droite
  assert.equal(coteDesCases(350, 1055, 4, false, 12), 244); // picto seul, centré : 70 % de la largeur
  assert.equal(coteDesCases(600, 820, 4, false, 12), 241); // Fold, sans clip : plus petit que le plafond, « Annuler » visible
  assert.equal(coteDesCases(600, 820, 6, true, 12), 129); // Fold, deux « Plutôt » : la hauteur compte
  assert.equal(coteDesCases(600, 1800, 4, true, 12), PLAFOND); // tablette : plafond
  assert.equal(coteDesCases(600, 300, 8, true, 12), MINI); // jamais sous le plancher
});

test("la 3D de la feuille est muette, hors du toucher, et respecte « réduire les animations »", () => {
  assert.match(feuille, /pointerEvents="none"/);
  assert.match(feuille, /lecture=\{!reduit\}/);
  assert.match(feuille, /useReduit/);
});

test("« Plutôt : … » existe en français et en anglais, avec le nom de l'exercice", () => {
  assert.equal(fr["exercices.lien.plutot"], "Plutôt : {nom}");
  assert.equal(en["exercices.lien.plutot"], "Rather: {nom}");
});
