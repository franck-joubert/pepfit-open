// Saisie d'un temps : chiffres lus de droite à gauche (ss, puis mm, puis h).
import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresTemps, lireTemps, masqueTemps, tempsTexte, titreRepos } from "../src/ecrans/format.ts";

test("chiffres seuls : secondes, minutes, heures depuis la droite", () => {
  assert.equal(lireTemps("45"), 45);
  assert.equal(lireTemps("656"), 6 * 60 + 56);
  assert.equal(lireTemps("1000"), 10 * 60);
  assert.equal(lireTemps("45555"), 4 * 3600 + 55 * 60 + 55);
  assert.equal(lireTemps("0"), 0);
});

test("avec deux-points", () => {
  assert.equal(lireTemps("1:30"), 90);
  assert.equal(lireTemps("4:55:55"), 4 * 3600 + 55 * 60 + 55);
  assert.equal(lireTemps(""), null);
  assert.equal(lireTemps("abc"), null);
});

test("affichage : m:ss sous l'heure, h:mm:ss au-delà", () => {
  assert.equal(tempsTexte(416), "6:56");
  assert.equal(tempsTexte(4 * 3600 + 55 * 60 + 55), "4:55:55");
  assert.equal(tempsTexte(3600), "1:00:00");
});

test("titre du repos : série, superset, circuit (lexique du 29/10)", () => {
  assert.equal(titreRepos(null), "Repos après chaque série");
  assert.equal(titreRepos(2), "Repos après chaque superset");
  assert.equal(titreRepos(3), "Repos après chaque circuit");
});

test("masque de saisie du temps, rempli de droite à gauche", () => {
  const v = " ";
  assert.equal(masqueTemps(""), "");
  assert.equal(masqueTemps("1"), `${v}${v}:${v}${v}:${v}1`);
  assert.equal(masqueTemps("12"), `${v}${v}:${v}${v}:12`);
  assert.equal(masqueTemps("127"), `${v}${v}:${v}1:27`);
  assert.equal(masqueTemps("45555"), `${v}4:55:55`);
  assert.equal(chiffresTemps(masqueTemps("127") + "5"), "1275");
  assert.equal(chiffresTemps("1234567"), "123456");
  assert.equal(lireTemps(chiffresTemps(masqueTemps("127"))), 87);
});
