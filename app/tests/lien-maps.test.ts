// Toucher une carte ouvre le lieu dans une appli de cartes : construction du lien (geo: sur Android, Google Maps sur iPhone).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lienCarte } from "../src/ecrans/lien-maps.ts";

const BASE = "https://www.google.com/maps/search/?api=1&query=";

test("Android : un lien geo:, le point exact, 6 décimales au plus", () => {
  assert.equal(lienCarte({ lat: 48.8590123456, lon: 5.8297 }, "android"), "geo:48.859012,5.8297?q=48.859012,5.8297");
  assert.equal(lienCarte({ lat: -33.5, lon: -70.25, nom: "  " }, "android"), "geo:-33.5,-70.25?q=-33.5,-70.25");
});

test("Android : le nom en étiquette, encodé, sans parenthèses ; jamais de recherche par adresse", () => {
  assert.equal(
    lienCarte({ lat: 48.84, lon: 5.6937, nom: "Salle Voltaire", adresse: "251 bd Jean Jaurès, 55300 Valmont-sur-Meuse" }, "android"),
    "geo:48.84,5.6937?q=48.84,5.6937(Salle%20Voltaire)",
  );
  assert.equal(lienCarte({ lat: 1, lon: 2, nom: "Box (centre) A&B #1" }, "android"), "geo:1,2?q=1,2(Box%20centre%20A%26B%20%231)");
});

test("iPhone, sans adresse : le point exact", () => {
  assert.equal(lienCarte({ lat: 48.8590123456, lon: 5.8297 }, "ios"), `${BASE}48.859012%2C5.8297`);
  assert.equal(lienCarte({ lat: -33.5, lon: -70.25, nom: "Box Faubourg" }, "ios"), `${BASE}-33.5%2C-70.25`);
});

test("iPhone, nom et adresse : la fiche du lieu, encodée", () => {
  assert.equal(
    lienCarte({ lat: 48.84, lon: 5.6937, nom: "Salle Voltaire", adresse: "251 bd Jean Jaurès, 55300 Valmont-sur-Meuse" }, "ios"),
    `${BASE}Salle%20Voltaire%2C%20251%20bd%20Jean%20Jaur%C3%A8s%2C%2055300%20Valmont-sur-Meuse`,
  );
  assert.equal(lienCarte({ lat: 48.84, lon: 5.6937, nom: "A&B #1", adresse: "1 rue X?" }, "ios"), `${BASE}A%26B%20%231%2C%201%20rue%20X%3F`);
});

test("iPhone, nom ou adresse vides : le point", () => {
  assert.equal(lienCarte({ lat: 1, lon: 2, nom: "  ", adresse: "1 rue X" }, "ios"), `${BASE}1%2C2`);
  assert.equal(lienCarte({ lat: 1, lon: 2, nom: "Salle", adresse: null }, "ios"), `${BASE}1%2C2`);
});

test("sans position utilisable : null", () => {
  for (const os of ["android", "ios"]) {
    assert.equal(lienCarte(null, os), null);
    assert.equal(lienCarte(undefined, os), null);
    assert.equal(lienCarte({ lat: 0, lon: 0 }, os), null);
    assert.equal(lienCarte({ lat: Number.NaN, lon: 2 }, os), null);
    assert.equal(lienCarte({ lat: 91, lon: 2 }, os), null);
    assert.equal(lienCarte({ lat: 45, lon: 181 }, os), null);
  }
});
