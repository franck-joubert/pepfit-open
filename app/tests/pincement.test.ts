// Photo en grand zoomée à deux doigts (retour du 29/10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { pincement, ZOOM_MAX } from "../src/ui/pincement.ts";

const centre = { x: 200, y: 400 };
const proche = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("pincement : les doigts qui s'écartent grossissent la photo autour du point pris entre eux", () => {
  // doigts au centre, écart doublé : × 2, sans décalage
  const p = pincement([{ x: 150, y: 400 }, { x: 250, y: 400 }], [{ x: 100, y: 400 }, { x: 300, y: 400 }], centre);
  assert.equal(p.echelle, 2);
  proche(p.x, 0);
  proche(p.y, 0);
  // hors du centre : le point de départ (100, 300) reste entre les doigts : centre + T + s (p − centre) = p
  const debut = [{ x: 80, y: 300 }, { x: 120, y: 300 }] as const;
  const q = pincement(debut, [{ x: 60, y: 300 }, { x: 140, y: 300 }], centre);
  assert.equal(q.echelle, 2);
  proche(centre.x + q.x + q.echelle * (100 - centre.x), 100);
  proche(centre.y + q.y + q.echelle * (300 - centre.y), 300);
});

test("pincement : le point suit le milieu des doigts qui glissent ; jamais sous la taille d'origine ni au-delà de 4 fois", () => {
  const r = pincement([{ x: 150, y: 400 }, { x: 250, y: 400 }], [{ x: 180, y: 450 }, { x: 280, y: 450 }], centre);
  assert.equal(r.echelle, 1);
  proche(r.x, 30);
  proche(r.y, 50);
  assert.equal(pincement([{ x: 100, y: 400 }, { x: 300, y: 400 }], [{ x: 190, y: 400 }, { x: 210, y: 400 }], centre).echelle, 1);
  assert.equal(pincement([{ x: 195, y: 400 }, { x: 205, y: 400 }], [{ x: 0, y: 400 }, { x: 400, y: 400 }], centre).echelle, ZOOM_MAX);
  // doigts posés au même point : pas de division par zéro
  assert.equal(pincement([{ x: 200, y: 400 }, { x: 200, y: 400 }], [{ x: 150, y: 400 }, { x: 250, y: 400 }], centre).echelle, 1);
});
