// Volet du profil : largeur, prise du geste au bord gauche, fermeture vers la gauche, décision au lâcher, cartes de record.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bordOuvreVolet, dureeLacher, largeurCarte, largeurVolet, prendBord, prendFermeture, progresFermeture, progresOuverture, resteOuvert, VOLET } from "../src/ui/volet.ts";
import { courbe, duree } from "../src/theme/mouvement.ts";

test("largeur : 372 au plus, 40 px de la page restent visibles sur l'écran du Fold (412)", () => {
  assert.equal(largeurVolet(412), 372);
  assert.equal(largeurVolet(360), 320);
  assert.equal(largeurVolet(800), VOLET.largeurMax);
  assert.equal(largeurVolet(20), 0);
});

test("prise au bord : bande de 40 dp (après le Retour par geste d'Android), vers la droite, plus horizontal que vertical", () => {
  assert.ok(prendBord(10, 30, 5));
  assert.ok(prendBord(32, 30, 0), "après les ~24 dp du système");
  assert.ok(prendBord(40, 11, 0));
  assert.ok(!prendBord(41, 30, 0), "hors de la bande");
  assert.ok(!prendBord(200, 80, 0), "glissé au milieu de l'écran : au contenu");
  assert.ok(!prendBord(Infinity, 80, 0), "départ inconnu : jamais");
  assert.ok(!prendBord(10, 8, 0), "un appui, pas un glissé");
  assert.ok(!prendBord(10, 20, 30), "défilement vertical");
  assert.ok(!prendBord(10, -30, 0), "vers la gauche");
});

test("bord gauche : seulement sur l'Accueil (retours du 28/10, b)", () => {
  assert.ok(bordOuvreVolet("/health"));
  for (const c of ["/", "/food", "/train", "/session", "/suivi/depart"]) assert.ok(!bordOuvreVolet(c), c);
});

test("fermeture : glissé vers la gauche, n'importe où", () => {
  assert.ok(prendFermeture(-30, 5));
  assert.ok(!prendFermeture(30, 0));
  assert.ok(!prendFermeture(-20, 40), "défilement vertical du volet");
  assert.ok(!prendFermeture(-5, 0));
});

test("le volet suit le doigt, borné entre fermé et ouvert", () => {
  assert.equal(progresOuverture(186, 372), 0.5);
  assert.equal(progresOuverture(500, 372), 1);
  assert.equal(progresOuverture(-10, 372), 0);
  assert.equal(progresFermeture(-93, 372), 0.75);
  assert.equal(progresFermeture(40, 372), 1);
  assert.equal(progresFermeture(-500, 372), 0);
});

test("au lâcher : au-delà de la moitié ou geste vif", () => {
  assert.equal(resteOuvert(0.6, 0), true);
  assert.equal(resteOuvert(0.4, 0), false);
  assert.equal(resteOuvert(0.2, 0.8), true, "lancé vers la droite");
  assert.equal(resteOuvert(0.9, -0.8), false, "lancé vers la gauche");
});

test("cartes de record : deux visibles à la fois", () => {
  const l = largeurCarte(372, 20, 8);
  assert.equal(l, 162);
  assert.ok(2 * l + 8 <= 372 - 40);
});

test("mouvement : entrée 280 ms (courbe feuille), sortie 220 ms", () => {
  assert.equal(duree.feuille, 280);
  assert.equal(duree.feuilleSortie, 220);
  assert.deepEqual(courbe.feuille, [0.32, 0.72, 0, 1]);
});

test("lâcher : le volet garde l'élan du doigt, jamais plus long qu'un trajet entier ni plus court que 120 ms", () => {
  // Lâché à 90 % sans élan : 10 % de la durée pleine (plancher 120), pas 280 ms.
  assert.equal(dureeLacher(0.9, 1, 372, 0, duree.feuille), 120);
  assert.equal(dureeLacher(0.2, 1, 372, 0, duree.feuille), Math.round(0.8 * duree.feuille));
  // Lancé vif (2 px/ms) depuis la moitié : 186 px en 93 ms, ramené au plancher.
  assert.equal(dureeLacher(0.5, 0, 372, -2, duree.feuilleSortie), 120);
  // Lent (0,6 px/ms) depuis 70 % : 260 px à cette vitesse dépasseraient la durée pleine, bornée à 220.
  assert.equal(dureeLacher(0.7, 0, 372, -0.6, duree.feuilleSortie), duree.feuilleSortie);
  assert.equal(dureeLacher(0.7, 0, 372, -1.5, duree.feuilleSortie), Math.round((0.7 * 372) / 1.5));
});
