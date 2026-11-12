// Règles pures du récap commun : ligne du quand, provenance, actions du ⋯.
import assert from "node:assert/strict";
import { test } from "node:test";
import { actionsMenu, annulerDemandeSerie, origineRecap, sousRecap } from "../src/ecrans/recap/recap-calc.ts";

const jourTexte = (j: string) => (j === "2026-11-05" ? "Jeu. 5 nov." : j);
const heureTexte = (h: string) => h;

test("sous-ligne : jour, heure et durée séparés par des virgules, jamais de point médian", () => {
  const s = sousRecap({ jour: "2026-11-05", heure: "18:00", dureeMin: 90 }, "2026-11-04", jourTexte, heureTexte);
  assert.equal(s, "Jeu. 5 nov., 18:00, 1 h 30");
  assert.ok(!s.includes("·"));
});

test("sous-ligne : « Aujourd'hui » seul sans heure, durée connue seulement", () => {
  assert.equal(sousRecap({ jour: "2026-11-04", heure: null, dureeMin: null }, "2026-11-04", jourTexte, heureTexte), "Aujourd'hui");
  assert.equal(sousRecap({ jour: "2026-11-04", heure: null, dureeMin: 45 }, "2026-11-04", jourTexte, heureTexte), "Aujourd'hui, 45 min");
  assert.equal(sousRecap({ jour: "2026-11-05", heure: "18:00", dureeMin: 0 }, "2026-11-04", jourTexte, heureTexte), "Jeu. 5 nov., 18:00");
});

test("provenance : coach, IA, retouchée par soi, rien pour une séance à soi", () => {
  assert.equal(origineRecap("moi", null), null);
  assert.equal(origineRecap("coach", null), "proposée par ton coach");
  assert.equal(origineRecap("ia", null), "proposée par ton coach IA");
  assert.equal(origineRecap("coach", "moi"), "modifiée par toi");
});

test("⋯ : Modifier et Annuler pour une séance prévue, Ajouter à mes routines si contenu propre, rien sinon", () => {
  assert.deepEqual(actionsMenu({ prevue: true, contenuPropre: false }), ["modifier", "annuler"]);
  assert.deepEqual(actionsMenu({ prevue: true, contenuPropre: true }), ["modifier", "ajouterRoutines", "annuler"]);
  assert.deepEqual(actionsMenu({ prevue: false, contenuPropre: true }), []);
  assert.equal(annulerDemandeSerie({ repetee: true }), true);
  assert.equal(annulerDemandeSerie({ repetee: false }), false);
});
