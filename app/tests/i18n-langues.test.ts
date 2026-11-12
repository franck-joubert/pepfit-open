// Allemand et espagnol : chaque clé du français existe en de et en es, de la même forme (texte ou pluriel), avec les mêmes {x} ;
// la détection, la locale, le repli et les minuscules qui gardent les noms allemands.
import assert from "node:assert/strict";
import { test } from "node:test";
import { de, definirActif, detecter, es, fr, LANGUES, langueDuCode, locale, minuscule, minusculeInitiale, t, tp } from "../src/i18n/index.ts";

const ph = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().filter((x, i, a) => a.indexOf(x) === i);
const actif = (langue: (typeof LANGUES)[number]) => definirActif({ langue, fuseau: "Europe/Paris", poids: "kg", distance: "km" });

for (const [nom, dico] of [["de", de], ["es", es]] as const) {
  test(`${nom} : toutes les clés du français, même forme, mêmes paramètres, rien de vide ni de point médian`, () => {
    const d = dico as Record<string, unknown>;
    assert.deepEqual(Object.keys(d).sort(), Object.keys(fr).sort());
    for (const [k, v] of Object.entries(fr)) {
      const x = d[k];
      assert.equal(typeof x, typeof v, k);
      if (typeof v === "string") assert.notEqual((x as string).trim(), "", k);
      else assert.deepEqual(Object.keys(x as object).sort(), ["one", "other"], k);
      assert.deepEqual(ph(x), ph(v), k);
      assert.ok(!JSON.stringify(x).includes("·"), `point médian : ${k}`);
    }
  });
}

test("quatre langues, détectées d'après le téléphone ; une autre langue → anglais", () => {
  assert.deepEqual([...LANGUES], ["fr", "en", "de", "es"]);
  assert.equal(langueDuCode("de-AT"), "de");
  assert.equal(langueDuCode("es_MX"), "es");
  assert.equal(langueDuCode("it-IT"), "en");
  assert.equal(langueDuCode(""), "en");
  assert.equal(detecter({ codeLangue: "es", region: "ES", systeme: "metric", fuseau: "Europe/Madrid" }).langue, "es");
});

test("locale et textes de chaque langue", () => {
  actif("de");
  assert.equal(locale(), "de-DE");
  assert.equal(t("ui.onglet.accueil"), de["ui.onglet.accueil"]);
  actif("es");
  assert.equal(locale(), "es-ES");
  actif("fr");
});

test("pluriels : le singulier pour n = 1 seulement en de et es (1,5 est un pluriel, pas comme en français)", () => {
  actif("de");
  assert.equal(tp("communs.serie", 1, { n: 1 }), "1 Satz");
  assert.equal(tp("communs.serie", 3, { n: 3 }), "3 Sätze");
  assert.equal(tp("communs.serie", 1.5, { n: "1,5" }), "1,5 Sätze");
  actif("fr");
  assert.equal(tp("communs.serie", 1.5, { n: "1,5" }), (fr["communs.serie"] as { one: string }).one.replace("{n}", "1,5"));
});

test("minuscules : l'allemand garde ses majuscules, les autres langues passent en minuscules", () => {
  actif("de");
  assert.equal(minuscule("Frühstück"), "Frühstück");
  assert.equal(minusculeInitiale("Montag 18 Uhr"), "Montag 18 Uhr");
  actif("es");
  assert.equal(minuscule("Desayuno"), "desayuno");
  actif("fr");
  assert.equal(minusculeInitiale("Lundi 18 h"), "lundi 18 h");
});
