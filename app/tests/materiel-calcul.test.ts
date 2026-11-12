// Calcul des charges du matériel (lot L1) : les neuf cas de planches/materiel/outils/calcul.test.mjs, sur src/db/materiel.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { apercu, barreChargee, chargement, etendue, halteresReglables, pile, plage, plusProche, resumer, sommesCote, trier } from "../src/db/materiel.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const MAISON = {
  halteres: [4, 8, 20, 30],
  disques: [{ kg: 20, paires: 1 }, { kg: 15, paires: 1 }, { kg: 10, paires: 1 }, { kg: 5, paires: 1 }, { kg: 2.5, paires: 1 }, { kg: 1.25, paires: 1 }],
};
const KIT_REGLABLES = { poignee: 2, poignees: 2, disques: [{ kg: 2, paires: 2 }, { kg: 1, paires: 4 }] };
const LOFTING = {
  halteres: trier([...plage(1, 10, 1), ...plage(12, 40, 2)]),
  disques: [{ kg: 25, paires: 4 }, { kg: 20, paires: 6 }, { kg: 15, paires: 4 }, { kg: 10, paires: 8 }, { kg: 5, paires: 8 }, { kg: 2.5, paires: 8 }, { kg: 1.25, paires: 8 }],
  disquesLesMills: [{ kg: 5, paires: 60 }, { kg: 2.5, paires: 60 }, { kg: 1, paires: 60 }],
};

test("plage : 2 à 40 par 2 donne 20 poids", () => {
  assert.equal(plage(2, 40, 2).length, 20);
  assert.deepEqual(plage(2, 3, 0), []);
});

test("barre de 20 kg et une paire de 1,25 à 20 kg : 20 à 127,5 par 2,5", () => {
  const c = barreChargee(20, MAISON.disques);
  assert.equal(c[0], 20);
  assert.equal(c[c.length - 1], 127.5);
  assert.equal(c.length, 44);
  assert.equal(etendue(c), "20 à 127,5 kg par 2,5");
});

test("chargement : 62,5 kg sur la barre de 20 kg, de chaque côté 20 et 1,25", () => {
  assert.deepEqual(chargement(62.5, 20, MAISON.disques), [20, 1.25]);
  assert.equal(chargement(21, 20, MAISON.disques), null);
});

test("haltères réglables du kit Corength : deux haltères de 2 à 10 par 2, un seul jusqu'à 18", () => {
  const r = halteresReglables(KIT_REGLABLES);
  assert.deepEqual(r.deux, [2, 4, 6, 8, 10]);
  assert.equal(r.un[r.un.length - 1], 18);
  assert.equal(etendue(r.un), "2 à 18 kg par 2");
});

test("Les Mills : 3 disques par côté au plus", () => {
  const s = sommesCote(LOFTING.disquesLesMills, 3);
  assert.equal(s[s.length - 1], 15);
  const c = barreChargee(2.6, LOFTING.disquesLesMills, 3);
  assert.equal(c[c.length - 1], 32.6);
  assert.equal(apercu(c), "2,6 à 32,6 kg, 16 poids");
});

test("charge maximale de la barre : 300 kg à Lofting", () => {
  const c = barreChargee(20, LOFTING.disques, Infinity, 300);
  assert.equal(etendue(c), "20 à 300 kg par 2,5");
});

test("plus proche : 12 kg avec 4, 8, 20 et 30 donne 8 ; 6 kg, à égalité, la plus légère ; 35 kg, la plus lourde", () => {
  assert.equal(plusProche(MAISON.halteres, 12)!.kg, 8);
  const e = plusProche(MAISON.halteres, 6)!;
  assert.equal(e.kg, 4);
  assert.equal(e.egalite, true);
  const l = plusProche(MAISON.halteres, 35)!;
  assert.equal(l.kg, 30);
  assert.equal(l.plusLourd, true);
});

test("pile : 5 à 100 par 5, avec une petite masse de 2,5 kg", () => {
  assert.equal(pile({ premiere: 5, pas: 5, max: 100 }).length, 20);
  const p = pile({ premiere: 5, pas: 5, max: 100, appoint: [2.5] });
  assert.equal(p.length, 40);
  assert.equal(etendue(p), "5 à 102,5 kg par 2,5");
});

test("résumés", () => {
  assert.equal(resumer(MAISON.halteres), "4, 8, 20 et 30 kg");
  assert.equal(resumer(LOFTING.halteres), "1 à 10 par 1, 12 à 40 par 2 kg");
});
