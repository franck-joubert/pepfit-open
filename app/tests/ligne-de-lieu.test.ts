// Les lignes de lieu (08/11) : un seul composant (LigneDeLieu), aucun tag texte, et UNE règle de sous-titre : l'adresse courte, le sport en secours, sinon rien.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adresseCourte, sousLieu } from "../src/salles/sous-titre-lieu.ts";

const source = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("adresse courte : sans code postal, rue et ville", () => {
  assert.equal(adresseCourte("251 bd Jean Jaurès, 55300 Valmont-sur-Meuse"), "251 bd Jean Jaurès, Valmont-sur-Meuse");
  assert.equal(adresseCourte("55300 Valmont-sur-Meuse"), "Valmont-sur-Meuse");
  assert.equal(adresseCourte("12 rue de la Paix"), "12 rue de la Paix");
  assert.equal(adresseCourte("  "), null);
  assert.equal(adresseCourte(null), null);
  assert.equal(adresseCourte("75011"), null);
});

test("sous-titre : l'adresse, la ville ajoutée si elle manque, le sport en secours, sinon rien", () => {
  assert.equal(sousLieu({ adresse: "4 rue Haute, 55300 Valmont-sur-Meuse", secours: "Padel" }), "4 rue Haute, Valmont-sur-Meuse");
  assert.equal(sousLieu({ adresse: "4 rue Haute", ville: "Valmont-sur-Meuse", secours: "Padel" }), "4 rue Haute, Valmont-sur-Meuse");
  // la ville déjà dite par l'adresse n'est pas répétée, arrondissement compris
  assert.equal(sousLieu({ adresse: "8 rue Gerland, 69007 Lyon", ville: "Lyon 7e" }), "8 rue Gerland, Lyon");
  assert.equal(sousLieu({ ville: "Nice", secours: "Salle de sport" }), "Nice");
  assert.equal(sousLieu({ adresse: null, secours: "Hockey sur glace" }), "Hockey sur glace");
  assert.equal(sousLieu({ adresse: "", ville: " ", secours: "" }), null);
  assert.equal(sousLieu({}), null);
});

test("sélecteur, Mes lieux, séance prévue : la même ligne, aucun tag", () => {
  assert.doesNotMatch(source("ecrans/LigneDeLieu.tsx"), /etab\.officiel\b|PastilleOfficiel|PastillePepfit/);
  for (const f of ["ecrans/FeuilleSalle.tsx", "app/gyms.tsx", "ecrans/SuiviDepart.tsx"]) {
    const s = source(f);
    assert.match(s, /<LigneDeLieu/, f);
    assert.doesNotMatch(s, /PastilleOfficiel|PastillePepfit|<LigneSalle|<LigneLieu/, f);
  }
  assert.match(source("ecrans/SuiviDepart.tsx"), /avatar=\{!!lieu\}/, "l'avatar du lieu choisi, pas l'icône générique");
  for (const f of ["ecrans/FeuilleSalle.tsx", "ecrans/Lieux.tsx", "ecrans/SuiviDepart.tsx"]) assert.match(source(f), /sousLieu|sousTitreLieu/, f);
});
