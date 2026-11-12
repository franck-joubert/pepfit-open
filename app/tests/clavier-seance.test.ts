// Clavier de séance (planche clavier-seance, validée le 29/10) : saisie au pavé, touche décimale selon la langue et selon
// la case, temps rempli de droite à gauche, molette au pas de la case, case suivante dans l'ordre de la séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { caseSuivante, clavierSeance, ordreCase, separateur, texteMolette, toucher, valeursMolette, type Saisie } from "../src/ecrans/clavier-seance.ts";
import { definirActif } from "../src/i18n/index.ts";

const fr = () => definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
const taper = (depart: Saisie, touches: string[], o: { decimal: boolean; temps: boolean; sep?: string }) =>
  touches.reduce((s, t) => toucher(s, t as Parameters<typeof toucher>[1], o), depart);

test("pavé : la première touche remplace la valeur, puis les chiffres s'ajoutent ; effacer retire le dernier", () => {
  const kg = { decimal: true, temps: false, sep: "," };
  assert.equal(taper({ texte: "62,5", remplacer: true }, ["6", "5"], kg).texte, "65");
  assert.equal(taper({ texte: "62,5", remplacer: false }, ["effacer"], kg).texte, "62,");
  assert.equal(taper({ texte: "", remplacer: true }, ["0", "7"], kg).texte, "7");
  assert.equal(taper({ texte: "123456", remplacer: false }, ["7"], kg).texte, "123456");
});

test("touche décimale : « , » en français, « . » en anglais ; une seule ; refusée pour les répétitions", () => {
  fr();
  assert.equal(separateur(), ",");
  assert.equal(taper({ texte: "65", remplacer: true }, ["6", "5", "decimal", "5"], { decimal: true, temps: false }).texte, "65,5");
  assert.equal(taper({ texte: "", remplacer: true }, ["decimal", "5"], { decimal: true, temps: false }).texte, "0,5");
  assert.equal(taper({ texte: "65,5", remplacer: false }, ["decimal"], { decimal: true, temps: false }).texte, "65,5");
  assert.equal(taper({ texte: "10", remplacer: true }, ["9", "decimal"], { decimal: false, temps: false }).texte, "9");
  definirActif({ langue: "en", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  assert.equal(separateur(), ".");
  assert.equal(taper({ texte: "", remplacer: true }, ["6", "5", "decimal", "5"], { decimal: true, temps: false }).texte, "65.5");
  fr();
});

test("temps : les chiffres remplissent le masque de droite à gauche, comme la saisie d'avant", () => {
  const t = { decimal: false, temps: true };
  const s = taper({ texte: "1:00", remplacer: true }, ["1", "2", "7"], t);
  assert.equal(s.texte.replace(/ /g, " "), "  : 1:27");
  assert.equal(taper(s, ["effacer"], t).texte.replace(/ /g, " "), "  :  :12");
  assert.equal(taper(s, ["decimal"], t).texte, s.texte);
});

test("molette : au pas de la case, centrée sur la valeur", () => {
  fr();
  const kg = valeursMolette("kg", 62.5);
  assert.equal(kg.valeurs[1], 2.5);
  assert.equal(kg.valeurs[kg.indice], 62.5);
  // Paliers de l'appareil : ce sont eux, le plus proche au centre.
  const m = valeursMolette("kg", 33, { paliers: [10, 20, 30, 40] });
  assert.deepEqual(m, { valeurs: [10, 20, 30, 40], indice: 2 });
  assert.equal(valeursMolette("kg", 100, { unite: "lbs" }).valeurs[1], 5);
  const reps = valeursMolette("reps", 9);
  assert.equal(reps.valeurs[reps.indice], 9);
  assert.equal(reps.valeurs[1], 1);
  const d = valeursMolette("duree_s", null);
  assert.equal(d.valeurs[d.indice], 60);
  assert.equal(d.valeurs[1], 5);
  assert.equal(valeursMolette("kg", null).valeurs[valeursMolette("kg", null).indice], 20);
  assert.equal(texteMolette("kg", 62.5), "62,5");
  assert.equal(texteMolette("reps", 10), "10");
  assert.equal(texteMolette("duree_s", 90), "1:30");
});

test("case suivante : poids → répétitions → série suivante ; rien après la dernière", () => {
  const cases = new Map([
    ["s1-kg", { ordre: ordreCase(0, 0) }],
    ["s1-reps", { ordre: ordreCase(0, 1) }],
    ["s2-kg", { ordre: ordreCase(1, 0) }],
    ["s2-reps", { ordre: ordreCase(1, 1) }],
  ]);
  assert.equal(caseSuivante(cases, "s1-kg"), "s1-reps");
  assert.equal(caseSuivante(cases, "s1-reps"), "s2-kg");
  assert.equal(caseSuivante(cases, "s2-reps"), null);
  assert.equal(caseSuivante(cases, "inconnue"), null);
});

test("état partagé : le pavé et la molette écrivent dans la case active ; seules les touches comptent une frappe", () => {
  fr();
  let ecrit = "";
  clavierSeance.ouvrir({
    cle: "s1-kg", champ: "kg", decimal: true, temps: false, unite: "kg", paliers: null, saisie: { texte: "20", remplacer: true },
    ecrire: (t) => (ecrit = t),
  });
  for (const k of ["5", "2", "decimal", "5"] as const) clavierSeance.toucher(k);
  assert.equal(ecrit, "52,5");
  clavierSeance.molette(55);
  assert.equal(ecrit, "55");
  clavierSeance.fermer("s1-kg");
});

test("limites (31/10) : 3 chiffres en répétitions, 9 999,5 kg, 999 999 m, temps 99:59:59 ; la 4e touche est refusée", () => {
  fr();
  const reps = { decimal: false, temps: false, champ: "reps" as const };
  const s = taper({ texte: "", remplacer: true }, ["1", "2", "3"], reps);
  assert.equal(s.texte, "123");
  assert.equal(toucher(s, "4", reps), s, "4e chiffre : la saisie est rendue telle quelle");
  assert.equal(taper({ texte: "999", remplacer: true }, ["8", "5"], reps).texte, "85", "la première touche remplace toujours");
  const kg = { decimal: true, temps: false, champ: "kg" as const };
  assert.equal(taper({ texte: "", remplacer: true }, ["9", "9", "9", "9", "9", "decimal", "5", "5"], kg).texte, "9999,5");
  const dist = { decimal: true, temps: false, champ: "distance_m" as const };
  assert.equal(taper({ texte: "", remplacer: true }, "12345678".split(""), dist).texte, "123456");
  const temps = { decimal: false, temps: true, champ: "duree_s" as const };
  assert.equal(taper({ texte: "", remplacer: true }, "1234567".split(""), temps).texte.replace(/\D/g, ""), "123456");

  // Le clavier dit la touche refusée (l'écran fait le retour haptique) et ne réécrit pas la case.
  const ecrits: string[] = [];
  clavierSeance.ouvrir({ cle: "s-reps", champ: "reps", decimal: false, temps: false, unite: "kg", paliers: null, saisie: { texte: "", remplacer: true }, ecrire: (t) => void ecrits.push(t) });
  try {
    assert.deepEqual(["9", "9", "9", "9"].map((k) => clavierSeance.toucher(k as "9")), [true, true, true, false]);
    assert.deepEqual(ecrits, ["9", "99", "999"]);
    assert.equal(clavierSeance.toucher("effacer"), true);
  } finally {
    clavierSeance.fermer("s-reps");
  }
});

test("molette : la même liste d'un chiffre à l'autre, deux étendues au plus, jamais plus de 1 000 lignes en répétitions", () => {
  // 1, 12, 123 : deux listes en tout (0-100, puis 0-999), et la même à 123, 456 ou 999 999.
  const listes = new Set([1, 12, 123, 456, 999, 999_999].map((v) => valeursMolette("reps", v).valeurs));
  assert.equal(listes.size, 2);
  assert.equal(valeursMolette("reps", 5).valeurs, valeursMolette("reps", 99).valeurs, "même objet : rien n'est refait");
  assert.equal(valeursMolette("reps", 999_999).valeurs.length, 1000);
  const r = valeursMolette("reps", 456);
  assert.equal(r.valeurs[r.indice], 456);
  // Au-delà de la grande étendue, la molette reste sur sa dernière ligne.
  const g = valeursMolette("kg", 9999.5);
  assert.equal(g.indice, g.valeurs.length - 1);
  for (const [champ, max] of [["kg", 401], ["duree_s", 2881], ["distance_m", 2001]] as const) {
    assert.ok(valeursMolette(champ, 9_999_999).valeurs.length <= max, `${champ} : ${max} lignes au plus`);
    assert.equal(valeursMolette(champ, 1).valeurs, valeursMolette(champ, 2).valeurs, `${champ} : même liste`);
  }
});
