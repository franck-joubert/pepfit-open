// Onglets (29/10) : arrivé d'un autre onglet par le menu, la page repart d'en haut ; pas au retour d'un écran poussé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { abonnerArrivee, signalerChemin } from "../src/ui/onglet-quitte.ts";

test("arrivée sur un onglet : prévenue en venant d'un autre onglet, pas en revenant d'un écran poussé", () => {
  const vus: string[] = [];
  const fins = ["/", "/food", "/train", "/health"].map((c) => abonnerArrivee(c, () => vus.push(c)));
  try {
    signalerChemin("/train", true);
    vus.length = 0; // premier onglet de la suite : rien d'attendu
    signalerChemin("/food", true);
    assert.deepEqual(vus, ["/food"]);
    // Écran poussé par-dessus (fiche d'un aliment), puis retour : pas une arrivée.
    signalerChemin("/nutrition/produit", false);
    signalerChemin("/food", true);
    assert.deepEqual(vus, ["/food"]);
    signalerChemin("/train", true);
    signalerChemin("/", true);
    signalerChemin("/health", true);
    assert.deepEqual(vus, ["/food", "/train", "/", "/health"]);
  } finally {
    fins.forEach((f) => f());
  }
});
