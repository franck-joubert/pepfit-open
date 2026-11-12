// Veille de la signature de l'Âge pepfit (src/ui/signature-age/veille.ts) : elle se calme sans jamais se figer à l'écran, et
// se réveille au retour de l'arrière-plan (30/10 : « elle s'arrête parfois au bout d'un certain temps »).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { VEILLE, veilleSignature } from "../src/ui/signature-age/veille.ts";

function banc() {
  const journal: string[] = [];
  let images = false;
  let elan = 1;
  const v = veilleSignature(
    {
      elan: (vers, ms) => {
        elan = vers;
        journal.push(`elan ${vers} ${ms}`);
      },
      images: (oui) => {
        images = oui;
        journal.push(`images ${oui}`);
      },
    },
    { setTimeout, clearTimeout } as never,
  );
  return { v, journal, etat: () => ({ images, elan }) };
}

test("page laissée ouverte : calme au bout de 20 s, jamais figée (10 min)", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const b = banc();
    b.v.demarrer(true);
    assert.deepEqual(b.etat(), { images: true, elan: 1 });
    mock.timers.tick(VEILLE.calmeApresMs - 1);
    assert.equal(b.etat().elan, 1);
    mock.timers.tick(1);
    assert.deepEqual(b.etat(), { images: true, elan: VEILLE.elanCalme });
    mock.timers.tick(10 * 60_000);
    assert.deepEqual(b.etat(), { images: true, elan: VEILLE.elanCalme });
    assert.ok(VEILLE.elanCalme > 0, "le calme garde du mouvement");
    assert.ok(!b.journal.includes("images false"), "jamais d'arrêt des images à l'écran");
  } finally {
    mock.timers.reset();
  }
});

test("arrière-plan ou écran éteint : plus d'image ni de compte ; au retour, réveil en pleine amplitude", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const b = banc();
    b.v.demarrer(true);
    mock.timers.tick(5_000);
    b.v.etatAppli("background");
    assert.equal(b.etat().images, false);
    // 5 min dehors : le calme ne tombe pas pendant l'absence (le compte est suspendu)
    mock.timers.tick(5 * 60_000);
    assert.equal(b.etat().elan, 1);
    b.v.etatAppli("active");
    assert.deepEqual(b.etat(), { images: true, elan: 1 });
    // le compte repart du retour : 20 s pleines avant le calme
    mock.timers.tick(VEILLE.calmeApresMs - 1);
    assert.equal(b.etat().elan, 1);
    mock.timers.tick(1);
    assert.equal(b.etat().elan, VEILLE.elanCalme);
    // revenue après le calme : réveillée aussi
    b.v.etatAppli("background");
    b.v.etatAppli("active");
    assert.deepEqual(b.etat(), { images: true, elan: 1 });
  } finally {
    mock.timers.reset();
  }
});

test("ouverte appli en arrière-plan : rien ne tourne jusqu'au retour ; quitter la page coupe tout", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const b = banc();
    b.v.demarrer(false);
    assert.equal(b.etat().images, false);
    mock.timers.tick(60_000);
    assert.equal(b.etat().images, false);
    b.v.etatAppli("active");
    assert.equal(b.etat().images, true);
    b.v.arreter();
    assert.equal(b.etat().images, false);
    mock.timers.tick(VEILLE.calmeApresMs);
    assert.equal(b.etat().elan, 1, "plus de minuteur après l'arrêt");
  } finally {
    mock.timers.reset();
  }
});
