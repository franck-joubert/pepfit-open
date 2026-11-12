// D5 (audit global, 29/10) : le poids soulevé se dit « poids », jamais « charge » (« Poids max », « Poids de départ »,
// « Poids inhabituel ») ; en anglais « weight », jamais « load ». Vaut pour les dictionnaires et les textes des programmes.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { en, fr } from "../src/i18n/index.ts";

const textes = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(textes) : []);
const PROGRAMMES = new URL("../assets/catalogue/programmes/", import.meta.url);
const CHARGE = /\bcharges?\b/i;
// « deload » (semaine allégée) n'est pas visé : \b exige un mot entier.
const LOAD = /\bloads?\b/i;

test("aucune « charge » dans les textes français", () => {
  const fautes = Object.entries(fr).filter(([, v]) => textes(v).some((s) => CHARGE.test(s)));
  assert.deepEqual(fautes, []);
});

test("aucun « load » dans les textes anglais", () => {
  const fautes = Object.entries(en).filter(([, v]) => textes(v).some((s) => LOAD.test(s)));
  assert.deepEqual(fautes, []);
});

test("les programmes disent « poids » / « weight »", () => {
  for (const f of readdirSync(PROGRAMMES).filter((n) => n.endsWith(".json"))) {
    const tout = textes(JSON.parse(readFileSync(new URL(f, PROGRAMMES), "utf8")));
    assert.deepEqual(tout.filter((s) => CHARGE.test(s) || LOAD.test(s)), [], f);
  }
});

test("les libellés retenus par Alex", () => {
  assert.equal(fr["seance.record.charge"], "Poids max");
  assert.equal(fr["boutique.d.charges"], "Poids de départ");
  assert.equal(fr["seance.reperes.chargeTitre"], "Poids inhabituel");
  assert.equal(en["seance.record.charge"], "Max weight");
});
