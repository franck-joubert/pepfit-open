// Lot L8 de la revue finale (30/10) : profil, compte, réglages. Composants natifs retirés,
// couleur de partie, point « à faire », tutoiement, profil public sans nom, rayons et marges, lien du volet.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

test("n° 49 : plus de boîte d'alerte ni de rond d'attente natifs dans les réglages", () => {
  for (const f of ["app/settings/connexions.tsx", "app/settings/data.tsx", "app/settings/fitatu.tsx", "app/whoop.tsx"]) {
    const s = lire(f);
    assert.doesNotMatch(s, /Alert\.alert|ActivityIndicator/, f);
  }
  assert.match(lire("app/settings/connexions.tsx"), /<Option premier danger libelle=\{t\("reglages\.whoopDeconnecter"\)\}/);
});

test("n° 38 : curseurs de Lieux et de la feuille des salles à la couleur de la partie", () => {
  for (const f of ["ecrans/Lieux.tsx", "ecrans/FeuilleSalle.tsx"]) {
    const s = lire(f);
    assert.doesNotMatch(s, /(cursorColor|selectionColor)=\{couleurs\.action\}/, f);
    assert.match(s, /cursorColor=\{accent\}/, f);
  }
});

test("n° 39 : point « à faire » en bleu info (D9)", () => {
  assert.match(lire("ecrans/Reglage.tsx"), /attention \? \{ backgroundColor: couleurs\.info \}/);
});

test("n° 5 : « Mensurations » du volet ouvre Santé › Poids sur ses tours, à une décimale (D2)", () => {
  const s = lire("ecrans/Profil.tsx");
  assert.match(s, /aller\(\{ pathname: "\/sante\/poids", params: \{ section: "tours" \} \}\)/);
  assert.doesNotMatch(s, /\/sante\/composition/);
  assert.match(s, /fixe\(versUnite\(lu\.kg, reglages\.unite\), 1\)/);
});
