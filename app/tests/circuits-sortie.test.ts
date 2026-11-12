// « Faire de cette sortie un circuit » (planche Circuits, lot E ; docs/CODE-CIRCUITS.md) : l'aperçu est calculé avec la coupe du profil public,
// pas dessiné. Le tracé est coupé à la création (début et fin 400 à 800 m), les chiffres sont ceux du tracé gardé, le départ est un lieu
// public à 300 m au plus du début gardé, une sortie ne fait qu'un circuit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decoderAltitudes, decoderTrace } from "../src/circuits/polyline.ts";
import {
  activitesDeSport, apercuSortie, categorieDuDepart, circuitDepuisSortie, DEPART_MAX_M, departLePlusProche, pointsDeSortie, type DepartPossible,
} from "../src/circuits/sortie.ts";
import type { PointAlt } from "../src/circuits/types.ts";
import { circuitDeSortie, ecrireCircuit } from "../src/db/depots/circuits.ts";
import { COUPE_MAX_M, COUPE_MIN_M, distanceM, longueurM } from "../src/circuits/coupe.ts";
import { baseDeTest } from "./aide.ts";

interface Cas {
  nom: string;
  points: [number, number, number][];
}
const CAS = (JSON.parse(readFileSync(new URL("./fixtures/circuits-cas.json", import.meta.url), "utf8")) as { circuits: Record<string, Cas> }).circuits;
const pts = (c: Cas): PointAlt[] => c.points.map(([lat, lon, alt]) => ({ lat, lon, alt }));
const GRAINE = "graine-du-compte";
const sortie = pts(CAS.plateau!);

test("l'aperçu : la sortie coupée de 400 à 800 m de chaque côté, comme le profil public ; le début et la fin sont ce qui ne part jamais", () => {
  const a = apercuSortie(sortie, GRAINE, "seance1");
  assert.ok(a.gardee);
  const [d, f] = a.coupeM;
  assert.ok(d >= COUPE_MIN_M && d <= COUPE_MAX_M && f >= COUPE_MIN_M && f <= COUPE_MAX_M);
  assert.ok(Math.abs(longueurM(a.gardee) - (longueurM(sortie) - d - f)) < 2, "le tracé gardé est la sortie moins ses deux bouts");
  assert.ok(Math.abs(longueurM(a.debut) - d) < 2 && Math.abs(longueurM(a.fin) - f) < 2, "les pointillés font les longueurs coupées");
  assert.ok(distanceM(a.debut.at(-1)!, a.gardee[0]!) < 1, "le pointillé du début rejoint le tracé gardé");
  assert.ok(distanceM(a.gardee.at(-1)!, a.fin[0]!) < 1, "celui de la fin part de son dernier point");
  assert.ok(distanceM(a.debut[0]!, sortie[0]!) < 1 && distanceM(a.fin.at(-1)!, sortie.at(-1)!) < 1, "ils touchent le vrai départ et la vraie arrivée");
  assert.equal(a.entiere.length, sortie.length);
  assert.ok(a.gardee.every((p) => typeof p.alt === "number"), "les deux points coupés ont l'altitude du point le plus proche");
});

test("l'aperçu : la coupe est celle du compte et de la séance (stable), pas d'un autre compte ni d'une autre séance", () => {
  const a = apercuSortie(sortie, GRAINE, "seance1");
  assert.deepEqual(apercuSortie(sortie, GRAINE, "seance1").coupeM, a.coupeM);
  assert.notDeepEqual(apercuSortie(sortie, "une-autre-graine", "seance1").coupeM, a.coupeM);
  assert.notDeepEqual(apercuSortie(sortie, GRAINE, "seance2").coupeM, a.coupeM);
});

test("l'aperçu : une sortie trop courte pour être coupée ne donne rien (il ne reste pas 200 m)", () => {
  const court = sortie.slice(0, 30);
  const a = apercuSortie(court, GRAINE, "seance1");
  assert.equal(a.gardee, null);
  assert.deepEqual([a.debut, a.fin], [[], []]);
  assert.equal(apercuSortie([], GRAINE, "seance1").gardee, null);
});

test("le circuit d'une sortie : privé, de source « sortie », ses chiffres sont ceux du tracé gardé (pas de la sortie entière)", () => {
  const a = apercuSortie(sortie, GRAINE, "seance1");
  const c = circuitDepuisSortie({ seanceId: "seance1", nom: "  Boucle   du plateau ", gardee: a.gardee!, activites: ["randonnee", "course"], type: a.type, maintenant: 5000, id: "abcdefghij12345" })!;
  assert.equal(c.nom, "Boucle du plateau");
  assert.equal(c.source, "sortie");
  assert.equal(c.sourceRef, "sortie/seance1");
  assert.equal(c.visibilite, "prive");
  assert.equal(c.licence, "propre");
  assert.equal(c.publieLe, null);
  assert.equal(c.altSource, "trace");
  const gardee = decoderTrace(c.trace)!;
  assert.equal(c.distanceM, Math.round(longueurM(gardee)));
  assert.ok(c.distanceM < longueurM(sortie) - 2 * COUPE_MIN_M + 1, "la sortie entière n'est plus comptée");
  assert.equal(decoderAltitudes(c.profil!)!.length, gardee.length);
  assert.ok(c.denivelePlusM != null && c.denivelePlusM > 0);
  assert.ok(gardee.length <= 400);
  assert.equal(c.type, "boucle", "début et fin proches : une boucle");
  assert.equal(circuitDepuisSortie({ seanceId: "seance1", nom: "x", gardee: a.gardee!, activites: ["course"] })!.type, "lineaire", "sans le type de la sortie, le tracé gardé seul ne se referme plus");
});

test("le type vient de la sortie entière (une boucle, un aller-retour, un linéaire), pas du tracé coupé qui ne se referme plus", () => {
  assert.equal(apercuSortie(pts(CAS.plateau!), GRAINE, "s").type, "boucle");
  assert.equal(apercuSortie(pts(CAS.lac!), GRAINE, "s").type, "boucle");
  assert.equal(apercuSortie(pts(CAS.ar!), GRAINE, "s").type, "aller-retour");
  assert.equal(apercuSortie(pts(CAS.lineaire!), GRAINE, "s").type, "lineaire");
});

test("le circuit d'une sortie : le lieu de départ et la commune viennent du lieu public choisi ; sans lieu, rien (jamais inventé)", () => {
  const a = apercuSortie(sortie, GRAINE, "seance1");
  const depart: DepartPossible = { cle: "node/123", nom: "Gare du plateau", ville: "Valmont", lat: 48.8, lon: 5.6837 };
  const avec = circuitDepuisSortie({ seanceId: "seance1", nom: "x", gardee: a.gardee!, activites: ["course"], depart })!;
  assert.deepEqual([avec.departLieu, avec.departNom, avec.commune], ["node/123", "Gare du plateau", "Valmont"]);
  const sans = circuitDepuisSortie({ seanceId: "seance1", nom: "x", gardee: a.gardee!, activites: ["course"], depart: null })!;
  assert.deepEqual([sans.departLieu, sans.departNom, sans.commune], [null, null, null]);
  assert.equal(circuitDepuisSortie({ seanceId: "s", nom: "x", gardee: [], activites: ["course"] }), null);
});

test("les points d'une sortie : l'altitude de la page de la sortie (lissée), les positions illisibles écartées", () => {
  const points = Array.from({ length: 60 }, (_, i) => ({ t: i * 1000, s: i * 1000, lat: 48.8 + i * 0.0001, lon: 5.6537, altBaro: 100 + i * 0.1, altGps: 100 + i * 0.1, precision: 5, vitesse: 3 }));
  points[10] = { ...points[10]!, lat: Number.NaN };
  const p = pointsDeSortie({ points, barometre: true });
  assert.equal(p.length, 59);
  assert.ok(p.every((x) => typeof x.alt === "number" && x.alt >= 99 && x.alt <= 107));
  const sans = pointsDeSortie({ points: points.map((x) => ({ ...x, altBaro: null, altGps: null })), barometre: false });
  assert.ok(sans.every((x) => x.alt == null), "sans altitude, rien n'est inventé");
});

test("activités par défaut : celle du sport de la sortie (le trail est de la course) ; un sport inconnu, la randonnée", () => {
  assert.deepEqual(activitesDeSport("course"), ["course"]);
  assert.deepEqual(activitesDeSport("trail-running-walking"), ["course"]);
  assert.deepEqual(activitesDeSport("marche"), ["randonnee"]);
  assert.deepEqual(activitesDeSport("randonnee"), ["randonnee"]);
  assert.deepEqual(activitesDeSport("bicycling"), ["bicycling"]);
  assert.deepEqual(activitesDeSport("vtt"), ["vtt"]);
  assert.deepEqual(activitesDeSport(null), ["randonnee"]);
  assert.deepEqual(activitesDeSport("rowing-stationary"), ["randonnee"]);
  assert.equal(categorieDuDepart("course"), "courir");
  assert.equal(categorieDuDepart("vtt"), "velo");
  assert.equal(categorieDuDepart("randonnee"), "randonnee");
  assert.equal(categorieDuDepart(undefined), "randonnee");
});

test("le lieu de départ : le lieu public le plus proche du début gardé, à 300 m au plus ; au-delà, aucun", () => {
  const debut = { lat: 48.8, lon: 5.6537 };
  const lieu = (cle: string, dLat: number): DepartPossible => ({ cle, nom: cle, ville: "Valmont", lat: debut.lat + dLat, lon: debut.lon });
  const lieux = [lieu("node/loin", 0.01), lieu("node/proche", 0.002), lieu("node/plusproche", 0.0005), lieu("node/hors", 0.0035)];
  assert.equal(DEPART_MAX_M, 300);
  assert.equal(departLePlusProche(debut, lieux)!.cle, "node/plusproche");
  assert.equal(departLePlusProche(debut, [lieu("node/hors", 0.0035), lieu("node/loin", 0.01)]), null, "389 m et 1,1 km : aucun");
  assert.equal(departLePlusProche(debut, [lieu("node/limite", 0.0026)])!.cle, "node/limite", "289 m : encore proposé");
  assert.equal(departLePlusProche(debut, []), null);
});

test("un circuit par sortie : le circuit d'une sortie se retrouve par sa séance, pas celui d'une autre", async () => {
  const { db } = await baseDeTest();
  const a = apercuSortie(sortie, GRAINE, "seance1");
  const c = circuitDepuisSortie({ seanceId: "seance1", nom: "Boucle", gardee: a.gardee!, activites: ["randonnee"], id: "abcdefghij12345" })!;
  assert.equal(await circuitDeSortie(db, "seance1"), null);
  await ecrireCircuit(db, c);
  assert.equal((await circuitDeSortie(db, "seance1"))!.id, c.id);
  assert.equal(await circuitDeSortie(db, "seance2"), null);
  assert.equal((await circuitDeSortie(db, "seance1"))!.sourceRef, "sortie/seance1");
});

test("structure : la coupe est celle de circuits/coupe.ts, le début et la fin d'une sortie ne sont jamais gardés", () => {
  const src = readFileSync(new URL("../src/circuits/sortie.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\/coupe"/);
  assert.match(src, /longueursCoupees\(graine, seanceId\)/);
  assert.match(src, /source: "sortie"/);
  assert.doesNotMatch(src, /fetch\(/, "rien ne part : tout se calcule sur le téléphone");
});
