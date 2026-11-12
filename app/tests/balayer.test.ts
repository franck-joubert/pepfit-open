// Glisser une série à gauche pour la supprimer : démarrage et seuil.
import assert from "node:assert/strict";
import { test } from "node:test";
import { degrades } from "../src/theme/effets.ts";
import { auDelaDuSeuil, courseLancer, decalageBalayer, demarreBalayer, couchesFond, progresseFond, teinteClaire, supprimeAuLacher } from "../src/ecrans/balayer.ts";

test("démarre sur un mouvement nettement horizontal, vers la gauche", () => {
  assert.equal(demarreBalayer(-13, 0), true);
  assert.equal(demarreBalayer(-12, 0), false);
  assert.equal(demarreBalayer(-30, 19), true);
  assert.equal(demarreBalayer(-30, 20), false);
  assert.equal(demarreBalayer(30, 0), false);
  assert.equal(demarreBalayer(-5, -40), false);
});

test("la ligne ne part pas à droite", () => {
  assert.equal(decalageBalayer(25), 0);
  assert.equal(decalageBalayer(-25), -25);
});

test("seuil à 40 % de la largeur, ou lancer rapide", () => {
  assert.equal(auDelaDuSeuil(-160, 400), true);
  assert.equal(auDelaDuSeuil(-159, 400), false);
  assert.equal(supprimeAuLacher(-100, -0.2, 400), false);
  assert.equal(supprimeAuLacher(-100, -0.6, 400), true);
  assert.equal(supprimeAuLacher(-170, 0.3, 400), true);
  assert.equal(supprimeAuLacher(10, -1, 400), false);
  assert.equal(auDelaDuSeuil(-10, 0), false);
});

test("fin de course au lâcher : la ligne continue à gauche avec l'élan, en 150 à 220 ms", () => {
  // Lâchée à −200 sur 400, doigt à −1 px/ms : reste 140 px, 280 ms à l'élan pur → bornée à 220.
  assert.deepEqual(courseLancer(-200, -1, 400), { vers: -340, duree: 200 });
  // Lancer rapide : 2 · 140 / 1,6 = 175 ms.
  assert.deepEqual(courseLancer(-200, -1.6, 400), { vers: -340, duree: 175 });
  // Très rapide : jamais sous 150 ms.
  assert.equal(courseLancer(-200, -5, 400).duree, 150);
  // Doigt arrêté ou revenu vers la droite : durée la plus longue, toujours vers la gauche.
  assert.deepEqual(courseLancer(-200, 0.3, 400), { vers: -340, duree: 200 });
  // Déjà plus loin que la fin de course : la ligne ne revient pas en arrière.
  assert.equal(courseLancer(-380, -1, 400).vers, -380);
});

test("le fond passe du rouge à l'orange sur toute la largeur de la ligne", () => {
  assert.equal(progresseFond(0, 400), 0);
  assert.equal(progresseFond(20, 400), 0);
  assert.equal(progresseFond(-100, 400), 0.25);
  assert.equal(progresseFond(-160, 400), 0.4);
  assert.equal(progresseFond(-400, 400), 1);
  assert.equal(progresseFond(-500, 400), 1);
  assert.equal(progresseFond(-50, 0), 0);
  assert.deepEqual(couchesFond(0), { degrade: 0, claire: 0 });
  assert.deepEqual(couchesFond(0.6), { degrade: 1, claire: 0 });
  assert.deepEqual(couchesFond(1), { degrade: 1, claire: 1 });
  // Au seuil de suppression (40 %), l'orange n'est pas atteint.
  assert.ok(couchesFond(0.4).degrade < 1 && couchesFond(0.4).claire === 0);
});

test("la couleur finale est la teinte la plus claire du dégradé orange", () => {
  assert.equal(teinteClaire(degrades.entrainement.arrets), "#ff8a1f");
  assert.equal(teinteClaire([{ couleur: "#102030" }, { couleur: "#ffffff" }, { couleur: "#808080" }]), "#ffffff");
});
