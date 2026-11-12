// Circuits, lot C2 : la carte en plein écran (planche Circuits, « La carte en plein écran »). Le cadrage du tracé entier, la position
// absente ou hors zone, le zoom limité, le cercle de précision, l'échelle, l'épaisseur du tracé et le geste de « Ma position ».
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARRETS_EPAISSEUR,
  cadrerBbox,
  cerclePrecision,
  echelle,
  epaisseurTrace,
  estVueCircuit,
  gesteMaPosition,
  limiterZoom,
  metresParDp,
  peutDezoomer,
  peutZoomer,
  positionDansLaZone,
  rayonPrecision,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomMoins,
  zoomPlus,
  type Bbox,
} from "../src/circuits/carte.ts";
import { haversineM } from "../src/circuits/geo.ts";

// La boucle du plateau de la démo (sud, ouest, nord, est).
const PLATEAU: Bbox = [48.772, 5.6497, 48.816, 5.7167];
const L = 390;
const H = 844;
const MARGES = { haut: 100, bas: 220, gauche: 24, droite: 24 };

// Mercator, comme MapLibre : où tombe un point à l'écran quand la caméra est sur `vue`.
const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
function ecran(vue: { centre: [number, number]; zoom: number }, lat: number, lon: number) {
  const monde = 512 * 2 ** vue.zoom;
  return { x: L / 2 + (mercX(lon) - mercX(vue.centre[0])) * monde, y: H / 2 + (mercY(lat) - mercY(vue.centre[1])) * monde };
}

test("cadrage : tout le tracé tient dans ce que les marges laissent, et touche le bord au zoom le plus grand", () => {
  const vue = cadrerBbox(PLATEAU, L, H, MARGES);
  const [s, o, n, e] = PLATEAU;
  const coins = [ecran(vue, n, o), ecran(vue, n, e), ecran(vue, s, o), ecran(vue, s, e)];
  const xs = coins.map((c) => c.x);
  const ys = coins.map((c) => c.y);
  const tolerance = 0.5;
  assert.ok(Math.min(...xs) >= MARGES.gauche - tolerance && Math.max(...xs) <= L - MARGES.droite + tolerance, "dans la largeur libre");
  assert.ok(Math.min(...ys) >= MARGES.haut - tolerance && Math.max(...ys) <= H - MARGES.bas + tolerance, "dans la hauteur libre");
  // Au zoom le plus grand qui tient : un des deux axes remplit l'espace libre.
  const remplitL = Math.max(...xs) - Math.min(...xs);
  const remplitH = Math.max(...ys) - Math.min(...ys);
  const libreL = L - MARGES.gauche - MARGES.droite;
  const libreH = H - MARGES.haut - MARGES.bas;
  assert.ok(Math.abs(remplitL - libreL) < 1 || Math.abs(remplitH - libreH) < 1, `un axe remplit : ${remplitL}/${libreL}, ${remplitH}/${libreH}`);
});

test("cadrage : le centre du tracé tombe au centre de l'espace libre, pas de l'écran", () => {
  const vue = cadrerBbox(PLATEAU, L, H, MARGES);
  const [s, o, n, e] = PLATEAU;
  const c = ecran(vue, (s + n) / 2, (o + e) / 2);
  // Mercator : le milieu en latitude n'est pas exactement le milieu à l'écran ; on compare au milieu des deux bords projetés.
  const haut = ecran(vue, n, o).y;
  const bas = ecran(vue, s, o).y;
  assert.ok(Math.abs((haut + bas) / 2 - (MARGES.haut + (H - MARGES.bas)) / 2) < 1, "milieu vertical de l'espace libre");
  assert.ok(Math.abs(c.x - (MARGES.gauche + (L - MARGES.droite)) / 2) < 1, "milieu horizontal de l'espace libre");
});

test("cadrage : sans marges, la même vue que l'écran entier ; des marges plus grandes dézooment", () => {
  const plein = cadrerBbox(PLATEAU, L, H, { haut: 0, bas: 0, gauche: 0, droite: 0 });
  const serre = cadrerBbox(PLATEAU, L, H, MARGES);
  assert.ok(plein.zoom > serre.zoom);
  assert.ok(Math.abs(plein.centre[0] - (PLATEAU[1] + PLATEAU[3]) / 2) < 1e-9, "centré sur la bbox sans marges");
});

test("zoom limité : un point seul ne zoome pas à l'infini, un continent ne dézoome pas sous le minimum", () => {
  const point = cadrerBbox([48.8, 5.6537, 48.8, 5.6537], L, H, MARGES);
  assert.equal(point.zoom, ZOOM_MAX);
  const monde = cadrerBbox([-60, -170, 70, 170], L, H, MARGES);
  assert.equal(monde.zoom, ZOOM_MIN);
  assert.equal(limiterZoom(Number.NaN), ZOOM_MIN);
  assert.equal(limiterZoom(25), ZOOM_MAX);
  assert.equal(limiterZoom(2), ZOOM_MIN);
  assert.equal(limiterZoom(12.5), 12.5);
});

test("boutons « + » et « − » : un niveau, jamais au-delà des bouts, et grisés au bout", () => {
  assert.equal(zoomPlus(12.4), 13.4);
  assert.equal(zoomMoins(12.4), 11.4);
  assert.equal(zoomPlus(ZOOM_MAX - 0.3), ZOOM_MAX);
  assert.equal(zoomMoins(ZOOM_MIN + 0.3), ZOOM_MIN);
  assert.equal(peutZoomer(ZOOM_MAX), false);
  assert.equal(peutZoomer(ZOOM_MAX - 0.5), true);
  assert.equal(peutDezoomer(ZOOM_MIN), false);
  assert.equal(peutDezoomer(ZOOM_MIN + 0.5), true);
});

test("« Voir tout le circuit » : absent sur la vue du tracé entier, présent dès qu'on a zoomé ou déplacé", () => {
  const cadre = cadrerBbox(PLATEAU, L, H, MARGES);
  assert.equal(estVueCircuit(cadre, cadre), true);
  assert.equal(estVueCircuit({ ...cadre, zoom: cadre.zoom + 0.1 }, cadre), true, "un quart de niveau ne compte pas");
  assert.equal(estVueCircuit({ ...cadre, zoom: cadre.zoom + 1 }, cadre), false, "zoomé");
  // Déplacé de 200 dp vers l'est au même zoom.
  const dLon = (200 / (512 * 2 ** cadre.zoom)) * 360;
  assert.equal(estVueCircuit({ centre: [cadre.centre[0] + dLon, cadre.centre[1]], zoom: cadre.zoom }, cadre), false, "déplacé");
  const peu = (5 / (512 * 2 ** cadre.zoom)) * 360;
  assert.equal(estVueCircuit({ centre: [cadre.centre[0] + peu, cadre.centre[1]], zoom: cadre.zoom }, cadre), true, "5 dp : même vue");
});

test("position : absente ou illisible, rien ; près du circuit, oui ; à des centaines de kilomètres, hors zone", () => {
  assert.equal(positionDansLaZone(null, PLATEAU), false);
  assert.equal(positionDansLaZone({ lat: Number.NaN, lon: 5.6537 }, PLATEAU), false);
  assert.equal(positionDansLaZone({ lat: 48.79, lon: 5.6837 }, PLATEAU), true, "dans la bbox");
  assert.equal(positionDansLaZone({ lat: 48.8, lon: 5.5537 }, PLATEAU), true, "à 8 km à l'ouest : dans la marge");
  assert.equal(positionDansLaZone({ lat: 45.76, lon: 4.83 }, PLATEAU), false, "Lyon");
  assert.equal(positionDansLaZone({ lat: 48.8, lon: 5.5537 }, PLATEAU, 1000), false, "la marge se règle");
});

test("cercle de précision : un anneau fermé au bon rayon, jamais plus petit que le point ni plus grand que 500 m", () => {
  const p = { lat: 48.8, lon: 5.6537, precisionM: 80 };
  const anneau = cerclePrecision(p);
  assert.deepEqual(anneau[0], anneau[anneau.length - 1], "fermé");
  assert.equal(anneau.length, 49);
  for (const [lon, lat] of anneau) {
    const d = haversineM({ lat: p.lat, lon: p.lon }, { lat, lon });
    assert.ok(Math.abs(d - 80) < 1.5, `rayon ${d}`);
  }
  assert.equal(rayonPrecision(2), 10);
  assert.equal(rayonPrecision(3000), 500);
  assert.equal(rayonPrecision(null), 10);
  assert.equal(rayonPrecision(undefined), 10);
  assert.equal(rayonPrecision(Number.NaN), 10);
});

test("tracé : il s'épaissit avec le zoom, sans dépasser ses bouts", () => {
  assert.equal(epaisseurTrace(5), ARRETS_EPAISSEUR[0]![1]);
  assert.equal(epaisseurTrace(22), ARRETS_EPAISSEUR[ARRETS_EPAISSEUR.length - 1]![1]);
  let avant = 0;
  for (let z = ZOOM_MIN; z <= ZOOM_MAX; z += 0.5) {
    const e = epaisseurTrace(z);
    assert.ok(e >= avant, `croissante à ${z}`);
    avant = e;
  }
  assert.equal(epaisseurTrace(12), 4, "entre 3 (zoom 10) et 5 (zoom 14)");
});

test("échelle : une valeur ronde dont la barre tient dans la largeur, en km ou en miles", () => {
  for (const z of [8, 10.3, 12, 14.7, 16, 18]) {
    for (const miles of [false, true]) {
      const e = echelle(z, 48.8, 96, miles);
      assert.ok(e.largeurDp <= 96 + 1e-9 && e.largeurDp > 96 / 5.5, `z${z}${miles ? " mi" : ""} : ${e.largeurDp}`);
      const lisible = [1, 2, 5].includes(Number(e.valeur.toExponential().split("e")[0]));
      assert.ok(lisible, `valeur ronde : ${e.valeur}`);
    }
  }
  const e = echelle(14, 48.8, 96, false);
  assert.equal(e.unite, "m");
  assert.ok(echelle(10, 48.8, 96, false).unite === "km");
  assert.equal(echelle(10, 48.8, 96, true).unite, "mi");
  assert.equal(echelle(16, 48.8, 96, true).unite, "ft");
  // Plus on zoome, plus la distance est petite.
  assert.ok(echelle(16, 48.8, 96, false).valeur <= echelle(14, 48.8, 96, false).valeur);
  assert.ok(metresParDp(15, 48.8) < metresParDp(14, 48.8));
});

test("« Ma position » : demander l'autorisation, dire le refus, chercher, centrer, ou dire qu'on est loin", () => {
  const ici = { lat: 48.79, lon: 5.6837 };
  assert.equal(gesteMaPosition("demandable", null, PLATEAU), "demander");
  assert.equal(gesteMaPosition("demandable", ici, PLATEAU), "demander");
  assert.equal(gesteMaPosition("refusee", ici, PLATEAU), "refuse");
  assert.equal(gesteMaPosition("accordee", null, PLATEAU), "chercher");
  assert.equal(gesteMaPosition("accordee", ici, PLATEAU), "centrer");
  assert.equal(gesteMaPosition("accordee", { lat: 45.76, lon: 4.83 }, PLATEAU), "loin");
});
