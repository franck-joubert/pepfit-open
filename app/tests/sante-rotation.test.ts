// Santé : rotation du personnage au doigt (verre.ts) et shaders du verre (relief, zones) sans GL.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avancerRotation, lancer, prendRotation, ROTATION_DOIGT, rotationRepos } from "../src/ui/3d/verre.ts";
import { FRAG_PICK, FRAG_ZONES, VERT_ZONES } from "../src/ui/3d/verre-zones.ts";

test("rotation : glissé horizontal pris, vertical laissé à la page", () => {
  assert.ok(prendRotation(20, 4));
  assert.ok(!prendRotation(6, 0), "un appui");
  assert.ok(!prendRotation(12, 30), "défilement");
});

test("rotation : inertie qui s'éteint, attente, puis retour face à l'écran par le plus court chemin", () => {
  const r = rotationRepos();
  r.angle = 1;
  r.vitesse = lancer(1, false); // 1 dp/ms
  assert.ok(r.vitesse > 0 && r.vitesse <= ROTATION_DOIGT.vitesseMax);
  let t = 0;
  while (r.vitesse !== 0 && t < 10_000) {
    avancerRotation(r, 1 / 60, (t += 1000 / 60), false);
  }
  assert.ok(t < 3000, "l'élan s'arrête en moins de 3 s");
  const fin = r.angle;
  assert.ok(fin > 1);
  // pendant l'attente : rien ne bouge, rien à dessiner
  assert.equal(avancerRotation(r, 1 / 60, t + 1000, false), false);
  assert.equal(r.angle, fin);
  // après l'attente : retour vers 0 sans faire de tour complet
  for (let k = 0; k < 600; k++) avancerRotation(r, 1 / 60, t + ROTATION_DOIGT.retourApresMs + k * 16, false);
  assert.equal(r.angle, 0);
});

test("rotation : tenu, rien ne bouge ; mouvement réduit, ni élan ni glissement du retour", () => {
  const r = rotationRepos();
  r.tenu = true;
  r.angle = 0.5;
  assert.ok(avancerRotation(r, 0.1, 99_999, false));
  assert.equal(r.angle, 0.5);
  assert.equal(lancer(2, true), 0);
  r.tenu = false;
  r.lache = 0;
  avancerRotation(r, 0.016, ROTATION_DOIGT.retourApresMs + 1, true);
  assert.equal(r.angle, 0);
});

test("verre : relief et zones déclarent chaque variable une seule fois", () => {
  const compte = (src: string, motif: RegExp) => (src.match(motif) ?? []).length;
  for (const [nom, src] of [["sommet", VERT_ZONES], ["fragment", FRAG_ZONES], ["identifiants", FRAG_PICK]] as const) {
    assert.equal(compte(src, /varying vec2 vUv;/g), 1, `${nom} : vUv`);
    assert.equal(compte(src, /varying float vX;/g), 1, `${nom} : vX`);
  }
  assert.match(FRAG_ZONES, /uniform sampler2D uRelief;/);
  assert.match(FRAG_ZONES, /N = relief\(N\)/);
});
