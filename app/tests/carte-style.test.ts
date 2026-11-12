// Fond de carte de la course guidée (planche seance-duree § 3) : Positron recoloré aux jetons, libellés gênants retirés,
// tracé sous les noms de rues, cône de direction.
import assert from "node:assert/strict";
import { test } from "node:test";
import { coneDirection, distanceM, PALETTES_CARTE, premiereCoucheLibelles, recolorer, type StyleCarte } from "../src/ecrans/carte-style.ts";

const STYLE: StyleCarte = {
  version: 8,
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fff" } },
    { id: "water", type: "fill", paint: { "fill-color": "#abc" } },
    { id: "highway_minor", type: "line", paint: { "line-color": "#eee" } },
    { id: "highway_major_casing", type: "line", paint: { "line-color": "#ddd" } },
    { id: "label_city", type: "symbol", layout: { "text-field": "{name}" } },
    { id: "highway_name_other", type: "symbol", layout: { "text-field": "{name}" }, paint: { "text-color": "#333" } },
    { id: "water_name_line_label", type: "symbol", layout: {} },
  ],
};

test("recoloration nuit : sol, eau, rues et bordures aux couleurs de la palette ; villes et cours d'eau cachés ; style d'origine intact", () => {
  const p = PALETTES_CARTE.nuit;
  const s = recolorer(STYLE, p);
  const c = (id: string) => s.layers.find((l) => l.id === id)!;
  assert.equal(c("background").paint!["background-color"], p.sol);
  assert.equal(c("water").paint!["fill-color"], p.eau);
  assert.equal(c("highway_minor").paint!["line-color"], p.route);
  assert.equal(c("highway_major_casing").paint!["line-color"], p.bord);
  assert.equal(c("label_city").layout!.visibility, "none");
  assert.equal(c("water_name_line_label").layout!.visibility, "none");
  assert.equal(c("highway_name_other").paint!["text-color"], p.lib);
  assert.equal(STYLE.layers[0]!.paint!["background-color"], "#fff");
  // Le tracé se pose sous la première couche de libellés encore visible (les noms de rues).
  assert.equal(premiereCoucheLibelles(s), "highway_name_other");
});

test("cône de direction : vers l'est quand on court vers l'est, rien à l'arrêt", () => {
  const p = (lon: number) => ({ lat: 48.85, lon });
  const cone = coneDirection([p(5.8037), p(5.8039), p(5.8041)])!;
  assert.ok(cone.length > 5);
  const pointe = cone[Math.floor(cone.length / 2)]!;
  assert.ok(pointe[0] > 5.8041 && Math.abs(pointe[1] - 48.85) < 1e-4);
  assert.ok(Math.abs(distanceM({ lat: 48.85, lon: 5.8041 }, { lat: pointe[1], lon: pointe[0] }) - 34) < 1);
  assert.equal(coneDirection([p(5.8037), p(5.80371)]), null);
  assert.equal(coneDirection([]), null);
});
