// Retour depuis une séance lancée (06/11) : Back depuis la séance revient à l'ORIGINE du lancement, jamais sur l'écran de
// lancement (/seance-recap, le noir de SuiviDepart : sports au suivi, musculation, routine, programme) ni sur le départ GPS restés
// empilés dessous. Pile simulée (push / replace / dismiss comme expo-router), un cas par chemin de lancement.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ouvrirDepuisLancement, type Routeur } from "../src/ecrans/pile-lancement.ts";
import { garderDemarrage, type OutilsGarde } from "../src/ecrans/garde-demarrage.ts";

/** Une pile d'écrans qui se comporte comme celle d'expo-router : Back dépile l'écran du dessus. */
function pile(...ecrans: string[]) {
  const e = [...ecrans];
  const r: Routeur<string> = {
    push: (h) => void e.push(h),
    replace: (h) => void e.splice(e.length - 1, 1, h),
    dismiss: (n) => void e.splice(Math.max(1, e.length - n), n),
  };
  return { e, r, back: () => (e.pop(), e[e.length - 1]) };
}

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("1. Effort, Démarrer une séance, séance vide : Back revient sur l'onglet Sport", () => {
  const p = pile("tabs/train", "seance-recap"); // la feuille du sport est une couche, déjà fermée ; l'écran de lancement noir est empilé
  ouvrirDepuisLancement(p.r, "session", 1);
  assert.deepEqual(p.e, ["tabs/train", "session"]);
  assert.equal(p.back(), "tabs/train");
});

test("2a. un sport au suivi GPS (course) : l'écran de lancement est le départ du suivi, Back depuis le direct revient sur l'onglet Sport", () => {
  const p = pile("tabs/train", "seance-recap"); // un seul écran de lancement (06/11) : la page héberge le départ du suivi
  ouvrirDepuisLancement(p.r, "suivi/direct", 1);
  assert.deepEqual(p.e, ["tabs/train", "suivi/direct"]);
  assert.equal(p.back(), "tabs/train");
});

test("2b. départ GPS sans récap dessous (fiche d'une routine de course) : retour sur la fiche", () => {
  const p = pile("tabs/train", "routine/view", "suivi/depart");
  ouvrirDepuisLancement(p.r, "suivi/direct", 1 + 0);
  assert.deepEqual(p.e, ["tabs/train", "routine/view", "suivi/direct"]);
  assert.equal(p.back(), "routine/view");
});

test("2c. un sport sans suivi GPS (séance au chrono, Tapis) part de l'écran de départ : même retrait", () => {
  const p = pile("tabs/train", "seance-recap");
  ouvrirDepuisLancement(p.r, "session", 1);
  assert.deepEqual(p.e, ["tabs/train", "session"]);
  assert.equal(p.back(), "tabs/train");
});

test("3. Routines, lancer une routine (musculation) depuis l'écran noir : Back revient sur la page Routines", () => {
  const p = pile("tabs/train", "routines", "seance-recap");
  ouvrirDepuisLancement(p.r, "session", 1);
  assert.deepEqual(p.e, ["tabs/train", "routines", "session"]);
  assert.equal(p.back(), "routines");
});

test("4. Programmes, séance du jour d'un programme de force depuis l'écran noir : Back revient sur la fiche du programme", () => {
  const p = pile("tabs/train", "programmes", "seance-recap");
  ouvrirDepuisLancement(p.r, "session", 1);
  assert.equal(p.back(), "programmes");
});

test("5. reprise par la bulle ou le bandeau : la séance s'empile sur l'écran courant, Back y revient", () => {
  const p = pile("tabs/train");
  ouvrirDepuisLancement(p.r, "session?reprise=1", 0);
  assert.deepEqual(p.e, ["tabs/train", "session?reprise=1"]);
  assert.equal(p.back(), "tabs/train");
});

test("5b. « Reprendre la séance en cours » du garde, depuis l'écran de lancement (musculation ou sport) : il part aussi", async () => {
  const p = pile("tabs/train", "seance-recap");
  const o: OutilsGarde = {
    enCours: async () => ({ genre: "seance", id: "s1", titre: "Séance libre" }),
    demander: async () => "reprendre",
    reprendre: (_e, retirer) => ouvrirDepuisLancement(p.r, "session?reprise=1", retirer),
    terminer: async () => {},
    abandonner: async () => {},
  };
  assert.equal(await garderDemarrage(o, async () => {}, 1), "reprise");
  assert.deepEqual(p.e, ["tabs/train", "session?reprise=1"]);
  assert.equal(p.back(), "tabs/train");
});

test("6. lien pepfitopen://train?lanceur=1 : la feuille et l'écran de lancement sont retirés comme au chemin 1", () => {
  const p = pile("tabs/train", "seance-recap");
  ouvrirDepuisLancement(p.r, "session", 1);
  assert.equal(p.back(), "tabs/train");
});

test("une fiche de routine lance sa séance depuis elle-même : elle reste l'origine (retirer 0)", () => {
  const p = pile("tabs/train", "routines", "routine/view");
  ouvrirDepuisLancement(p.r, "session", 0);
  assert.equal(p.back(), "routine/view");
});

test("lien froid sur l'écran de lancement (pile d'un seul écran) : la séance le remplace, pas de pile vide", () => {
  const p = pile("seance-recap");
  ouvrirDepuisLancement(p.r, "session", 1);
  assert.deepEqual(p.e, ["session"]);
});

test("le Back de fin de séance ne change pas : done.tsx reprend par canGoBack/back, sinon replace", () => {
  assert.match(src("app/done.tsx"), /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\("\/session"\)/);
});

test("câblage : plus aucun départ ne pousse la séance par-dessus un écran de lancement", () => {
  const commencer = src("ecrans/commencer.ts");
  assert.equal(/router\.push\("\/session"\)/.test(commencer), false);
  assert.equal((commencer.match(/ouvrirSeance\("\/session", retirer\)/g) ?? []).length, 2);
  // L'écran de lancement est un écran à lui seul (/seance-recap l'héberge, ou /suivi/depart) : il se retire lui-même au Démarrer.
  const depart = src("ecrans/SuiviDepart.tsx");
  assert.equal(/router\.replace\(/.test(depart), false);
  assert.match(depart, /const RETIRER = 1;/);
  assert.match(depart, /ouvrirSeance\("\/suivi\/direct", RETIRER\)/);
  assert.match(depart, /ouvrirSeance\(\{ pathname: "\/session"[^)]*RETIRER\)/);
  const recap = src("ecrans/recap/gestes-recap.ts");
  assert.match(recap, /commencer\(db, r\.routineId, salleId, undefined, 1\)/);
  assert.match(recap, /retirer: 1/);
  // La musculation (séance vide, routine, programme de force) part de ce même écran noir par le même geste : un seul écran retiré.
  assert.match(depart, /await demarrerDepuisRecap\(db, \{ \.\.\.s, lieu: /);
  assert.equal(/pathname: "\/seance-recap"|\/seance-recap"/.test(depart), false, "SuiviDepart ne pousse aucun autre écran de lancement");
  assert.match(src("ecrans/recap/CarteSeance.tsx"), /router\.replace\(\{ pathname: "\/seance-recap"/, "« La faire » remplace l'écran, il ne l'empile pas");
  assert.match(src("ecrans/demarrer-seance.tsx"), /ouvrirSeance\(e\.genre === "seance"/);
  assert.equal(/dessous/.test(src("app/suivi/depart.tsx")), false);
});
