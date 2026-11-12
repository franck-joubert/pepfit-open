// Carte du suivi en direct : zoom de départ et cadrage qui s'élargit avec le tracé (retour du 29/10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { haversineM } from "../src/natif/suivi/logique.ts";
import { cadrage, RAYON_DEPART_M, RAYON_MAX_M, rayonCadrage, zoomPourRayon } from "../src/ecrans/cadrage-carte.ts";

const depart = { lat: 48.8566, lon: 5.8059 };
/** Point à `m` mètres au nord. */
const nord = (m: number) => ({ lat: depart.lat + m / 111_195, lon: depart.lon });

/** Mètres montrés de part et d'autre du centre, sur le petit côté, au zoom donné. */
const rayonVu = (zoom: number, cote: number) => ((40_075_016.686 * Math.cos((depart.lat * Math.PI) / 180)) / (512 * 2 ** zoom)) * (cote / 2);

test("départ : environ 500 m autour de la position ; zoom 14 à 15 selon la taille de la carte (Fold plié, déplié)", () => {
  assert.equal(rayonCadrage(depart, []), RAYON_DEPART_M);
  const plie = zoomPourRayon(500, depart.lat, 380, 368);
  const deplie = zoomPourRayon(500, depart.lat, 690, 520);
  assert.equal(plie, 14);
  assert.equal(deplie, 14.5);
  // arrondi au quart inférieur : on voit au moins les 500 m, au plus 19 % de plus
  for (const [z, cote] of [[plie, 368], [deplie, 520]] as const) {
    assert.ok(rayonVu(z, cote) >= 500 && rayonVu(z, cote) < 500 * 1.19, `${z} : ${rayonVu(z, cote)} m`);
  }
});

test("le cadrage s'élargit pour garder tout le tracé, jusqu'à 3 km de rayon", () => {
  assert.ok(Math.abs(haversineM(depart, nord(1000)) - 1000) < 1);
  assert.equal(rayonCadrage(depart, [nord(200), nord(400)]), RAYON_DEPART_M, "tracé court : 500 m");
  assert.ok(Math.abs(rayonCadrage(depart, [nord(200), nord(1500)]) - 1650) < 1, "le point le plus loin, 10 % d'air");
  assert.equal(rayonCadrage(depart, [nord(8000)]), RAYON_MAX_M, "pas au-delà de 3 km");
  // le zoom baisse quand le tracé grandit, jamais sous celui de 3 km
  const z = (m: number) => cadrage(depart, [nord(m)], 380, 368).zoom;
  assert.ok(z(300) > z(1500) && z(1500) > z(2500));
  assert.equal(z(8000), z(20_000));
  assert.ok(rayonVu(z(1500), 368) >= 1650);
  assert.deepEqual(cadrage(depart, [], 380, 368).centre, [depart.lon, depart.lat], "la vue reste centrée sur la position");
});
