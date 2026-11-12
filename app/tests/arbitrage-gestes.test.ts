// Arbitrage des glissés (option A) : ligne ou jour, décidé au départ du doigt ; ligne qui révèle « Supprimer » sans supprimer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOUTON_SUPPRIMER, decalageLigne, departGeste, horizontal, ouvreAuLacher, quiPrend } from "../src/ui/arbitrage-gestes.ts";
import { prendGlisse } from "../src/ui/glisser-jour.ts";

test("seuil de direction : horizontal net seulement", () => {
  assert.equal(horizontal(20, 0), true);
  assert.equal(horizontal(-20, 10), true);
  assert.equal(horizontal(10, 0), false); // en deçà du déclenchement : un appui
  assert.equal(horizontal(30, 25), false); // trop oblique : le défilement garde la main
  assert.equal(horizontal(5, 80), false); // vertical
  // Le jour et la ligne ont le même seuil : pas de fenêtre où l'un prend avant l'autre.
  for (const [dx, dy] of [[15, 0], [-15, 9], [40, 26], [-40, 27], [13, 0]] as const) assert.equal(prendGlisse(dx, dy), horizontal(dx, dy));
});

test("qui prend : la ligne si le doigt en est parti, sinon le jour ; jamais les deux", () => {
  assert.equal(quiPrend(true, -40, 3), "ligne");
  assert.equal(quiPrend(true, 40, 3), "ligne"); // vers la droite aussi : sur une ligne, pas de changement de jour
  assert.equal(quiPrend(false, -40, 3), "jour");
  assert.equal(quiPrend(false, 40, 3), "jour");
  assert.equal(quiPrend(true, 8, 60), null);
  assert.equal(quiPrend(false, 8, 60), null);
});

test("départ du doigt : la zone du jour efface, la ligne marque", () => {
  departGeste.toucher();
  assert.equal(departGeste.surLigne(), false);
  departGeste.ligne();
  assert.equal(departGeste.surLigne(), true);
  departGeste.toucher(); // toucher suivant, hors ligne
  assert.equal(departGeste.surLigne(), false);
});

test("ligne : suit le doigt vers la gauche, bornée à droite, élastique au-delà du bouton", () => {
  assert.equal(decalageLigne(30), 0);
  assert.equal(decalageLigne(-50), -50);
  assert.equal(decalageLigne(-BOUTON_SUPPRIMER), -BOUTON_SUPPRIMER);
  assert.ok(Math.abs(decalageLigne(-BOUTON_SUPPRIMER - 100) - (-BOUTON_SUPPRIMER - 30)) < 1e-9);
  // Même tirée sur toute la largeur, la ligne reste loin d'en sortir : rien n'est supprimé au glissé.
  assert.ok(decalageLigne(-400) > -200);
});

test("ligne au lâcher : ouverte ou refermée, jamais supprimée", () => {
  assert.equal(ouvreAuLacher(-60, 0), true); // au-delà de la moitié du bouton
  assert.equal(ouvreAuLacher(-30, 0), false);
  assert.equal(ouvreAuLacher(-20, -0.8), true); // vif vers la gauche
  assert.equal(ouvreAuLacher(-90, 0.8), false); // vif vers la droite : referme
  assert.equal(ouvreAuLacher(0, -0.8), false); // pas bougé
  assert.equal(ouvreAuLacher(-300, 0), true); // tirée très loin : seulement ouverte
});
