// Toucher une carte ouvre le lieu dans Google Maps : construction du lien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lienGoogleMaps } from "../src/ecrans/lien-maps.ts";

const BASE = "https://www.google.com/maps/search/?api=1&query=";

test("sans adresse : le point exact, 6 décimales au plus", () => {
  assert.equal(lienGoogleMaps({ lat: 48.8590123456, lon: 5.8297 }), `${BASE}48.859012%2C5.8297`);
  assert.equal(lienGoogleMaps({ lat: -33.5, lon: -70.25, nom: "Box Faubourg" }), `${BASE}-33.5%2C-70.25`);
});

test("nom et adresse : la fiche du lieu, encodée", () => {
  assert.equal(
    lienGoogleMaps({ lat: 48.84, lon: 5.6937, nom: "Salle Voltaire", adresse: "251 bd Jean Jaurès, 55300 Valmont-sur-Meuse" }),
    `${BASE}Salle%20Voltaire%2C%20251%20bd%20Jean%20Jaur%C3%A8s%2C%2055300%20Valmont-sur-Meuse`,
  );
  assert.equal(lienGoogleMaps({ lat: 48.84, lon: 5.6937, nom: "A&B #1", adresse: "1 rue X?" }), `${BASE}A%26B%20%231%2C%201%20rue%20X%3F`);
});

test("nom ou adresse vides : le point", () => {
  assert.equal(lienGoogleMaps({ lat: 1, lon: 2, nom: "  ", adresse: "1 rue X" }), `${BASE}1%2C2`);
  assert.equal(lienGoogleMaps({ lat: 1, lon: 2, nom: "Salle", adresse: null }), `${BASE}1%2C2`);
});

test("sans position utilisable : null", () => {
  assert.equal(lienGoogleMaps(null), null);
  assert.equal(lienGoogleMaps(undefined), null);
  assert.equal(lienGoogleMaps({ lat: 0, lon: 0 }), null);
  assert.equal(lienGoogleMaps({ lat: Number.NaN, lon: 2 }), null);
  assert.equal(lienGoogleMaps({ lat: 91, lon: 2 }), null);
  assert.equal(lienGoogleMaps({ lat: 45, lon: 181 }), null);
});
