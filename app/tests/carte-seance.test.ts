// La carte d'une séance terminée, touchée pour l'agrandir (08/11) : les couleurs et le GeoJSON du tracé en grand (les mêmes que
// la page), le cadrage, le magasin qui passe le tracé de la page à l'écran, et la structure (une seule carte pleine pour le circuit et la
// séance, Google Maps devenu un bouton de la carte pleine, séance sans trace non touchable, textes fr et en). Pas de moteur de rendu.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { definirActif, detecter, en, fr, t } from "../src/i18n/index.ts";
import { modes } from "../src/theme/jetons.ts";
import type { PointTrace } from "../src/ecrans/effort-vue.ts";
import { couleursTrace, oublierTrace, poserTrace, tracePosee, traceGeoJsonSeance, vueDeLaTrace } from "../src/ecrans/trace-pleine.ts";

const langue = (l: "fr" | "en") => definirActif(detecter({ codeLangue: l, systeme: "metric", fuseau: "Europe/Paris" }));
const source = (chemin: string) => readFileSync(new URL(`../src/${chemin}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
const C = modes.jour;

const pt = (i: number, zone: number, alt: number | null): PointTrace => ({ lat: 48.85 + i * 0.001, lon: 5.8037 + i * 0.001, s: i * 10, d: i * 120, zone, alt });
const TRACE = Array.from({ length: 14 }, (_, i) => pt(i, i < 5 ? 2 : i < 9 ? 3 : 4, 40 + i * 3));

test("zones : un morceau par zone, qui se touchent, dans la couleur de la zone", () => {
  const m = couleursTrace(TRACE, "zones", C, { min: 40, max: 79 });
  assert.deepEqual(m.map((x) => [x.a, x.b, x.couleur]), [[0, 5, C.zone2], [5, 9, C.zone3], [9, 13, C.zone4]]);
});

test("zones : sans FC (zone 0), le trait est t3", () => {
  const sans = TRACE.map((p) => ({ ...p, zone: 0 }));
  assert.deepEqual(couleursTrace(sans, "zones", C, null).map((x) => x.couleur), [C.t3]);
});

test("altitude : des morceaux de 6 points, du bas vers le haut ; un point sans altitude est t3", () => {
  const m = couleursTrace(TRACE, "altitude", C, { min: 40, max: 79 });
  assert.deepEqual(m.map((x) => [x.a, x.b]), [[0, 6], [6, 12], [12, 13]]);
  assert.notEqual(m[0]!.couleur, m[2]!.couleur);
  const trou = [{ ...TRACE[0]!, alt: null }, ...TRACE.slice(1)];
  assert.equal(couleursTrace(trou, "altitude", C, { min: 40, max: 79 })[0]!.couleur, C.t3);
});

test("altitude demandée sans profil : retombe sur les zones", () => {
  assert.equal(couleursTrace(TRACE, "altitude", C, null).length, 3);
});

test("GeoJSON : un trait par morceau, [lon, lat], couleur dans c", () => {
  const g = traceGeoJsonSeance(TRACE, couleursTrace(TRACE, "zones", C, null));
  assert.equal(g.features.length, 3);
  assert.deepEqual(g.features[0]!.geometry.coordinates[0], [5.8037, 48.85]);
  assert.equal(g.features[0]!.geometry.coordinates.length, 6);
  assert.equal(g.features[1]!.properties.c, C.zone3);
});

test("vue de la trace : points, altitudes seulement si toutes connues, bbox sud-ouest-nord-est", () => {
  const v = vueDeLaTrace(TRACE)!;
  assert.equal(v.vue.points.length, 14);
  assert.equal(v.vue.longueurM, 13 * 120);
  assert.equal(v.vue.alts?.length, 14);
  assert.deepEqual(v.bbox, [48.85, 5.8037, 48.863, 5.8167]);
  assert.equal(vueDeLaTrace([{ ...TRACE[0]!, alt: null }, ...TRACE.slice(1)])!.vue.alts, null);
});

test("séance sans trace GPS (tapis, une seule position) : rien à agrandir", () => {
  assert.equal(vueDeLaTrace([]), null);
  assert.equal(vueDeLaTrace([TRACE[0]!]), null);
});

test("le magasin rend ce que le bloc a posé, jusqu'à ce qu'on l'oublie", () => {
  oublierTrace();
  assert.equal(tracePosee(), null);
  poserTrace({ trace: TRACE, altitude: null, mode: "zones", distanceM: 1560, dureeS: 130 });
  assert.equal(tracePosee()?.trace.length, 14);
  oublierTrace();
  assert.equal(tracePosee(), null);
});

test("structure : la carte pleine est UN composant, pour le circuit comme pour la séance", () => {
  assert.match(source("ecrans/circuit/CartePleine.tsx"), /<CarteTracePleine/);
  assert.match(source("ecrans/CartePleineSeance.tsx"), /<CarteTracePleine/);
  // plus de MapLibre ni de gestes dans le circuit ni dans la séance : tout est dans le composant commun
  for (const f of ["ecrans/circuit/CartePleine.tsx", "ecrans/CartePleineSeance.tsx"]) assert.doesNotMatch(source(f), /maplibre|GeoJSONSource|zoomTo/, f);
  assert.match(source("ecrans/circuit/CarteTracePleine.tsx"), /AttributionCarte touchee=\{touchee\}/);
});

test("structure : toucher la carte de la page ouvre la carte pleine, Google Maps est un bouton de celle-ci", () => {
  const bloc = source("ecrans/BlocEffort.tsx");
  assert.doesNotMatch(bloc, /Linking|lienCarte/);
  assert.match(bloc, /router\.push\("\/suivi\/carte"\)/);
  assert.match(bloc, /disabled=\{!agrandir\}/);
  const pleine = source("ecrans/CartePleineSeance.tsx");
  assert.match(pleine, /Linking\.openURL\(lien\)/);
  assert.match(pleine, /<Bouton libelle=\{t\("ui\.ouvrirMaps"\)\}/);
  assert.match(source("app/suivi/carte.tsx"), /<CartePleineSeance/);
  assert.match(source("ui/largeur.ts"), /"suivi\/carte"/);
});

test("textes : fr et en pour chaque clé, sans point médian", () => {
  for (const cle of ["effort.agrandir", "effort.carte.pleine", "effort.carte.tout", "effort.carte.loin", "effort.carte.resume"] as const) {
    assert.ok(cle in fr && cle in en, cle);
    for (const l of ["fr", "en"] as const) {
      langue(l);
      assert.ok(t(cle, { distance: "1 km", duree: "5:00" }).length > 0);
      assert.doesNotMatch(t(cle, { distance: "1 km", duree: "5:00" }), /·/);
    }
  }
  langue("fr");
});
