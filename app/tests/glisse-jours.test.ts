// Glissé entre les jours (carrousel de pages) : position en jours, suivi du doigt, accroche, pastille et semaine voisine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { accrocheJour, casePastille, dureeAccroche, indexJour, jourDeIndex, joursRendus, semaineVoisineDe, suivreDoigt } from "../src/ui/glisser-jour.ts";

test("rang d'un jour : continu, aller-retour, à travers mois, années et heure d'été", () => {
  const i = indexJour("2026-10-28");
  assert.equal(jourDeIndex(i), "2026-10-28");
  assert.equal(indexJour("2026-10-25") - indexJour("2026-10-24"), 1); // passage à l'heure d'hiver
  assert.equal(indexJour("2026-11-01") - indexJour("2026-10-31"), 1);
  assert.equal(indexJour("2027-01-01") - indexJour("2026-12-31"), 1);
  assert.equal(jourDeIndex(indexJour("2028-02-28") + 1), "2028-02-29");
});

test("jours rendus : veille, jour, lendemain", () => {
  assert.deepEqual(joursRendus("2026-11-01"), ["2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("suivi du doigt : continu, borné aux voisins", () => {
  assert.equal(suivreDoigt(100, -100, 400, 100), 100.25);
  assert.equal(suivreDoigt(100, 200, 400, 100), 99.5);
  assert.equal(suivreDoigt(100, -900, 400, 100), 101);
  assert.equal(suivreDoigt(100, 900, 400, 100), 99);
  // Repris en cours d'accroche : on part de la position atteinte.
  assert.equal(suivreDoigt(100.75, -40, 400, 100), 100.85);
});

test("accroche : au-delà du quart, ou geste vif, sinon retour", () => {
  assert.equal(accrocheJour(100, 100.3, 0, 400), 101);
  assert.equal(accrocheJour(100, 99.7, 0, 400), 99);
  assert.equal(accrocheJour(100, 100.2, 0, 400), 100);
  assert.equal(accrocheJour(100, 100.1, -0.9, 400), 101); // vif vers la gauche
  assert.equal(accrocheJour(100, 100.1, 0.9, 400), 100); // vif mais à rebours : retour
  assert.equal(accrocheJour(100, 100.05, -2, 400), 100); // trop court pour un geste vif
});

test("accroche : un geste vif pris au dernier mouvement compte (déplacement total du doigt)", () => {
  // La page n'a presque pas bougé (prise tardive), mais le doigt a parcouru 300 px vite.
  assert.equal(accrocheJour(100, 100.01, -1.5, 400, -300), 101);
  assert.equal(accrocheJour(100, 99.99, 1.5, 400, 300), 99);
  // Lent et court : retour, comme sans le déplacement du doigt.
  assert.equal(accrocheJour(100, 100.01, -0.1, 400, -60), 100);
});

test("durée de l'accroche : proportionnelle au reste, bornée", () => {
  assert.equal(dureeAccroche(1), 220);
  assert.equal(dureeAccroche(0.5), 120);
  assert.equal(dureeAccroche(0.75), 165);
  assert.equal(dureeAccroche(3), 220);
});

test("pastille : suit la position entre deux cases, bornée à la semaine affichée", () => {
  const lundi = indexJour("2026-10-26");
  assert.equal(casePastille(indexJour("2026-10-28"), lundi), 2);
  assert.ok(Math.abs(casePastille(indexJour("2026-10-28") + 0.4, lundi) - 2.4) < 1e-9);
  // Dimanche → lundi suivant : la pastille reste sur dimanche, la semaine change au changement de jour.
  assert.equal(casePastille(indexJour("2026-11-01") + 0.6, lundi), 6);
  assert.equal(casePastille(lundi - 0.3, lundi), 0);
});

test("semaine voisine : seulement d'une semaine exactement", () => {
  assert.equal(semaineVoisineDe("2026-10-26", "2026-11-02"), 1);
  assert.equal(semaineVoisineDe("2026-10-26", "2026-10-19"), -1);
  assert.equal(semaineVoisineDe("2026-10-26", "2026-10-26"), 0);
  assert.equal(semaineVoisineDe("2026-10-26", "2026-11-09"), 0);
});
