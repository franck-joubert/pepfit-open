// Fond de carte sous le tracé d'une séance (fin et séance passée) : la vue de MapLibre retombe sur la projection du tracé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { projeter, vueProjection } from "../src/ecrans/suivi-direct-vue.ts";

/** Web Mercator de MapLibre (tuiles de 512 dp) : position à l'écran d'un point, pour une vue et un cadre l × h. */
function mercator(p: { lat: number; lon: number }, v: { centre: [number, number]; zoom: number }, l: number, h: number) {
  const monde = 512 * 2 ** v.zoom;
  const X = (lon: number) => ((lon + 180) / 360) * monde;
  const Y = (lat: number) => ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * monde;
  return { x: X(p.lon) - X(v.centre[0]) + l / 2, y: Y(p.lat) - Y(v.centre[1]) + h / 2 };
}

test("sortie de 8 km sur les quais : le fond tombe sous le tracé à moins d'un dp", () => {
  const pts = [
    { lat: 48.8443, lon: 5.8239 },
    { lat: 48.8531, lon: 5.8139 },
    { lat: 48.8578, lon: 5.7935 },
    { lat: 48.8635, lon: 5.7812 },
    { lat: 48.8589, lon: 5.7838 },
    { lat: 48.8462, lon: 5.8192 },
  ];
  for (const [l, h, marge, haut] of [[380, 220, 18, 18], [380, 228, 28, 24], [700, 228, 28, 24]] as const) {
    const xy = projeter(pts, l, h, marge, haut);
    const v = vueProjection(pts, l, h, marge, haut)!;
    pts.forEach((p, i) => {
      const m = mercator(p, v, l, h);
      assert.ok(Math.abs(m.x - xy[i]!.x) < 1 && Math.abs(m.y - xy[i]!.y) < 1, `${l}×${h} point ${i} : ${JSON.stringify(m)} / ${JSON.stringify(xy[i])}`);
    });
  }
});

test("course courte (500 m) : zoom de rue ; un seul point : zoom 16 sur lui ; rien : null", () => {
  const pts = [
    { lat: 48.8402, lon: 5.6938 },
    { lat: 48.8381, lon: 5.6956 },
    { lat: 48.8361, lon: 5.6979 },
  ];
  const v = vueProjection(pts, 380, 220, 18, 18)!;
  assert.ok(v.zoom > 13.5 && v.zoom < 15, String(v.zoom)); // ≈ 2,7 m par dp
  assert.deepEqual(vueProjection([pts[0]!, pts[0]!], 380, 220, 18, 18), { centre: [5.6938, 48.8402], zoom: 16 });
  assert.equal(vueProjection([], 380, 220), null);
  assert.equal(vueProjection(pts, 0, 220), null);
});
