// Circuits, lot G : « Crédits des données » (planche Circuits, k1 ; docs/CODE-CIRCUITS.md). L'adresse de la page, et ce que la planche
// interdit : un © hors des crédits, un point médian, une clé sans traduction.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { LIEN_COPYRIGHT_OSM } from "../src/circuits/credits.ts";
import { en } from "../src/i18n/dico-en/circuits.ts";
import { fr } from "../src/i18n/dico-fr/circuits.ts";

test("adresses : la fondation OpenStreetMap", () => {
  assert.equal(LIEN_COPYRIGHT_OSM, "https://www.openstreetmap.org/copyright");
});

test("textes : chaque clé existe dans les deux langues, aucune ne reste vide", () => {
  const cles = Object.keys(fr);
  assert.deepEqual(Object.keys(en).sort(), cles.slice().sort(), "mêmes clés en français et en anglais");
  for (const c of cles) {
    for (const d of [fr, en] as Record<string, unknown>[]) {
      const v = d[c];
      assert.ok(typeof v === "string" ? v.trim().length > 0 : Object.keys(v as object).length > 0, c);
    }
  }
});

test("textes : le symbole © n'est que sur la page des crédits, et le point médian nulle part", () => {
  for (const d of [fr, en] as Record<string, unknown>[]) {
    for (const [c, v] of Object.entries(d)) {
      const texte = typeof v === "string" ? v : JSON.stringify(v);
      if (texte.includes("©")) assert.match(c, /^circuit\.credits\./, `© hors des crédits : ${c}`);
      assert.ok(!texte.includes("·") && !texte.includes("•"), `point médian : ${c}`);
    }
  }
});

test("textes : les crédits disent ce que la planche dit, sans compteur ni nom d'auteur", () => {
  assert.equal(fr["circuit.credits.titre"], "Crédits des données");
  assert.equal(fr["circuit.credits.osmTexte"], "Lieux et fond de carte. © les contributeurs d'OpenStreetMap, base sous licence ODbL.");
  assert.equal(fr["circuit.credits.carteTexte"], "Le fond de carte. © OpenFreeMap © OpenMapTiles, d'après OpenStreetMap.");
  assert.ok(!Object.keys(fr).some((c) => c.startsWith("circuit.credits.nombre")), "pas de compteur de circuits");
});

test("accès : la route existe, la ligne est dans Réglages (section Aide) et dans la recherche des réglages", () => {
  const racine = new URL("../src/", import.meta.url);
  assert.ok(existsSync(new URL("app/settings/aide/credits.tsx", racine)));
  const reglages = readFileSync(new URL("app/settings/index.tsx", racine), "utf8");
  assert.match(reglages, /circuit\.credits\.ligne[\s\S]{0,200}\/settings\/aide\/credits/);
  const inventaire = readFileSync(new URL("ecrans/reglages/inventaire.ts", racine), "utf8");
  assert.match(inventaire, /id: "credits"[^\n]*route: "\/settings\/aide\/credits"/);
  const piedDePage = readFileSync(new URL("ecrans/circuit/PageCircuit.tsx", racine), "utf8");
  assert.match(piedDePage, /router\.push\("\/settings\/aide\/credits"\)/, "la ligne de source du circuit mène à la page");
});
