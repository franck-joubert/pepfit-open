// Bascule kg / lbs : les nombres affichés restent, la charge en base (kg) suit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { charge, relireCharge } from "../src/ecrans/format.ts";

test("kg → lbs : 50 affichés restent 50, soit 22,68 kg en base", () => {
  const kg = relireCharge(50, "kg", "lbs");
  assert.equal(kg, 22.68);
  assert.equal(charge(kg, "lbs"), "50");
});

test("lbs → kg : 50 lbs affichés deviennent 50 kg", () => {
  assert.equal(relireCharge(22.68, "lbs", "kg"), 50);
});

test("le nombre relu est celui de l'écran, arrondi au dixième", () => {
  // 72,46 kg s'affiche « 72,5 » : c'est 72,5 lbs qui est enregistré.
  assert.equal(charge(72.46, "kg"), "72,5");
  const kg = relireCharge(72.46, "kg", "lbs");
  assert.equal(kg, Math.round((72.5 / 2.20462) * 1000) / 1000);
  assert.equal(charge(kg, "lbs"), "72,5");
});

test("aller-retour : l'affichage ne bouge pas", () => {
  for (const v of [0, 2.5, 20, 47.5, 100, 142.5, 227]) {
    const lbs = relireCharge(v, "kg", "lbs");
    assert.equal(charge(lbs, "lbs"), charge(v, "kg"));
    assert.equal(relireCharge(lbs, "lbs", "kg"), v);
  }
});

test("charge vide : rien à relire", () => {
  assert.equal(relireCharge(null, "kg", "lbs"), null);
});
