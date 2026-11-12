// Clavier de pepfit partout où une case chiffrée s'édite hors séance active (docs/CLAVIER-PARTOUT.md) : l'éditeur de routine
// et la séance passée prennent le même clavier, le même comportement de champ et la même logique d'écran que la séance.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chiffresTemps } from "../src/ecrans/format.ts";
import { caseSuivante, clavierSeance, ordreCase, type CaseActive } from "../src/ecrans/clavier-seance.ts";

const lire = (s: string) => readFileSync(new URL(`../src/${s}`, import.meta.url), "utf8");

test("éditeur de routine : les cases de cible sont au clavier de pepfit, sans clavier du téléphone dupliqué", () => {
  const routine = lire("app/routine/[id].tsx");
  assert.match(routine, /<ClavierPerso\.Provider value>/);
  assert.match(routine, /<ClavierSeance \/>/);
  assert.match(routine, /<SousLeClavier>/);
  assert.match(routine, /useClavierEcran\(glisser\.defilement\)/);
  assert.match(routine, /useChampChiffre\(/);
  // Le champ de cible n'a plus sa propre gestion du clavier du téléphone.
  assert.doesNotMatch(routine, /Keyboard\.addListener|selectTextOnFocus|saisieDecimale/);
  // Les cinq cases (kg, répétitions et plage, distance, durée) ont leur nature et leur ordre.
  for (const champ of ["kg", "reps", "distance_m", "duree_s"]) assert.match(routine, new RegExp(`champ="${champ}"`));
  assert.equal((routine.match(/<ChampCible/g) ?? []).length, 6);
  assert.equal((routine.match(/ordre=\{ordreCase\(/g) ?? []).length, 6);
});

test("séance passée : même clavier, même zone vide, bas de page effacé tant que le clavier est là", () => {
  const edition = lire("app/history/edit/[id].tsx");
  assert.match(edition, /<ClavierPerso\.Provider value>/);
  assert.match(edition, /<ClavierSeance \/>/);
  assert.match(edition, /useClavierEcran\(defilement\)/);
  assert.match(edition, /<View \{\.\.\.zoneVide\}>/);
  assert.match(edition, /<SousLeClavier>[\s\S]*styles\.dock[\s\S]*<\/SousLeClavier>/);
});

test("un seul comportement de champ : la case de séance et la cible de routine passent par useChampChiffre", () => {
  const ligne = lire("ui/LigneSerie.tsx");
  assert.match(ligne, /useChampChiffre\(/);
  assert.doesNotMatch(ligne, /clavierSeance\.ouvrir/);
  const champ = lire("ui/useChampChiffre.ts");
  assert.match(champ, /clavierSeance\.ouvrir\(/);
  assert.match(champ, /showSoftInputOnFocus: !perso/);
  // Perf (audit M5) : le champ ne s'abonne pas au clavier ; il écrit, l'écran n'est pas redessiné.
  assert.doesNotMatch(champ, /useCaseActive|useCaseClavier|useClavierOuvert|useClavierAffiche/);
});

test("Valider dans une routine : poids → répétitions → série suivante, dans l'ordre affiché", () => {
  const cases = new Map<string, { ordre: number }>([
    ["s0:kg", { ordre: ordreCase(0, 0) }],
    ["s0:reps", { ordre: ordreCase(0, 1) }],
    ["s1:kg", { ordre: ordreCase(1, 0) }],
    ["s1:reps", { ordre: ordreCase(1, 1) }],
  ]);
  assert.equal(caseSuivante(cases, "s0:kg"), "s0:reps");
  assert.equal(caseSuivante(cases, "s0:reps"), "s1:kg");
  assert.equal(caseSuivante(cases, "s1:reps"), null);
});

test("cible de routine : le clavier écrit dans la case, le temps garde son masque et les chiffres", () => {
  const ecrits: string[] = [];
  const c: CaseActive = { cle: "r:duree_s", champ: "duree_s", decimal: false, temps: true, unite: "kg", paliers: null, saisie: { texte: "", remplacer: true }, ecrire: (t) => ecrits.push(t) };
  clavierSeance.ouvrir(c);
  for (const k of ["1", "2", "7"] as const) clavierSeance.toucher(k);
  assert.equal(chiffresTemps(ecrits.at(-1)!), "127");
  clavierSeance.fermer("r:duree_s");
  const kg: CaseActive = { cle: "r:kg", champ: "kg", decimal: true, temps: false, unite: "kg", paliers: null, saisie: { texte: "", remplacer: true }, ecrire: (t) => ecrits.push(t) };
  clavierSeance.ouvrir(kg);
  for (const k of ["6", "2", "decimal", "5"] as const) clavierSeance.toucher(k);
  assert.match(ecrits.at(-1)!, /^62[.,]5$/);
  clavierSeance.fermer("r:kg");
});
