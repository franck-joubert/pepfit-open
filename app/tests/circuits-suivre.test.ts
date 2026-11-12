// Suivre un circuit (planche Circuits, lot F ; docs/CODE-CIRCUITS.md) : où l'on est par rapport au tracé (40 m), ce qu'il reste, les circuits
// proposés à un sport (du départ le plus proche au plus loin, sans doublon), « Mon temps » (une sortie qui a fait le circuit), et la structure
// des écrans (ligne « Circuit », carte du direct, phrase d'état, bouton « Suivre ce circuit »).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { densifier, haversineM } from "../src/circuits/geo.ts";
import { SUIVRE_DISPONIBLE } from "../src/circuits/page.ts";
import { encoderTrace } from "../src/circuits/polyline.ts";
import {
  activitesDuSport, circuitsASuivre, circuitSuivi, estArrive, etatSurCircuit, monTemps, parcoursFait, sportDeActivite, SUR_CIRCUIT_M,
  type TraceSuivie,
} from "../src/circuits/suivre.ts";
import type { Circuit, Point } from "../src/circuits/types.ts";
import { vueDuCircuit } from "../src/circuits/vue.ts";
import { lireTemps, noterTemps } from "../src/db/depots/circuits-temps.ts";
import { baseDeTest } from "./aide.ts";

// Une boucle d'environ 4 km : un rectangle de 1,2 km sur 0,8 km, les points tous les 25 m.
const COINS: Point[] = [
  { lat: 48.8, lon: 5.6937 },
  { lat: 48.8, lon: 5.711 },
  { lat: 48.8072, lon: 5.711 },
  { lat: 48.8072, lon: 5.6937 },
  { lat: 48.8, lon: 5.6937 },
];
const BOUCLE = densifier(COINS, 25);
const vue = vueDuCircuit({ trace: encoderTrace(BOUCLE), profil: null }) as TraceSuivie;
const decaler = (p: Point, nordM: number, estM = 0): Point => ({ lat: p.lat + nordM / 111_195, lon: p.lon + estM / (111_195 * Math.cos((p.lat * Math.PI) / 180)) });

function circuit(id: string, nom: string, depart: Point, activites: Circuit["activites"], visibilite: Circuit["visibilite"] = "public"): Circuit {
  const trace = [depart, decaler(depart, 500, 300), decaler(depart, 900, -200)];
  return {
    id, nom, type: "lineaire", activites, departLieu: null, departNom: null, commune: null, zone: "48_2", trace: encoderTrace(trace), profil: null,
    bbox: [0, 0, 0, 0], distanceM: 1500, denivelePlusM: null, deniveleMoinsM: null, altMinM: null, altMaxM: null, altSource: null, source: "osm",
    sourceRef: null, licence: "odbl", sourceMaj: null, visibilite, publieLe: null, creeLe: 1, majLe: 1,
  };
}

test("sur le circuit à moins de 40 m, ailleurs l'écart est dit avec le point du tracé le plus proche", () => {
  const milieu = BOUCLE[Math.floor(BOUCLE.length / 8)]!;
  const sur = etatSurCircuit(vue, decaler(milieu, 0, 10));
  assert.equal(sur.surCircuit, true);
  assert.ok(sur.ecartM <= SUR_CIRCUIT_M);
  assert.ok(Math.abs(sur.resteM - (vue.longueurM - sur.progresM)) < 0.001);
  // 180 m au sud-ouest du départ : hors du tracé, le point le plus proche est celui du tracé
  const loin = etatSurCircuit(vue, decaler(BOUCLE[0]!, -180, -180));
  assert.equal(loin.surCircuit, false);
  assert.ok(loin.ecartM > SUR_CIRCUIT_M);
  assert.ok(Math.abs(haversineM(decaler(BOUCLE[0]!, -180, -180), loin.plusProche) - loin.ecartM) < 3, "l'écart est la distance au point le plus proche");
  const pile = etatSurCircuit(vue, decaler(BOUCLE[10]!, 0, 39.5));
  assert.equal(pile.surCircuit, pile.ecartM <= SUR_CIRCUIT_M);
});

test("au départ d'une boucle, il reste toute la boucle (jamais zéro) ; à l'arrivée, on est arrivé", () => {
  const depart = etatSurCircuit(vue, BOUCLE[0]!, 0);
  assert.ok(depart.surCircuit && depart.resteM > vue.longueurM - 50, "le départ n'est pas pris pour l'arrivée, qui est au même endroit");
  assert.equal(estArrive(depart), false);
  const fin = etatSurCircuit(vue, BOUCLE.at(-1)!, vue.longueurM - 100);
  assert.ok(fin.surCircuit && fin.resteM < 50);
  assert.equal(estArrive(fin), true);
});

test("la progression ne recule pas : sur le tracé repassé au même endroit, c'est la suite qui compte", () => {
  // un aller-retour : on repasse sur les mêmes points, 275 m avant le demi-tour
  const aller = BOUCLE.slice(0, Math.floor(BOUCLE.length / 4));
  const ar = [...aller, ...aller.slice(0, -1).reverse()];
  const v = vueDuCircuit({ trace: encoderTrace(ar), profil: null }) as TraceSuivie;
  const ici = aller.at(-12)!;
  const allant = etatSurCircuit(v, ici, 0);
  // le relevé d'avant était sur le retour, 250 m après le demi-tour : le point du retour est la suite, jamais celui de l'aller
  const revenant = etatSurCircuit(v, ici, v.longueurM / 2 + 250);
  assert.ok(allant.progresM < v.longueurM / 2, "à l'aller, le point de l'aller");
  assert.ok(Math.abs(allant.progresM - v.cumul[aller.length - 12]!) < 3, "la progression est celle du point, pas celle d'un point voisin à moins de 40 m");
  assert.ok(revenant.progresM > v.longueurM / 2, "au retour, le point du retour");
  assert.ok(Math.abs(revenant.progresM + allant.progresM - v.longueurM) < 40, "les deux passages sont symétriques autour du demi-tour");
});

test("sans tracé lisible, rien ne se calcule : la sortie est libre", () => {
  assert.equal(vueDuCircuit({ trace: "", profil: null }), null);
});

test("Mon temps : une sortie qui prend le circuit au début et le finit l'a fait, avec son temps sans les pauses", () => {
  const sortie = BOUCLE.map((p, i) => ({ ...p, s: i * 10_000 }));
  const fait = parcoursFait(vue, sortie, vue.longueurM + 50);
  assert.equal(fait.fait, true);
  assert.ok(fait.dureeS != null && Math.abs(fait.dureeS - (BOUCLE.length - 1) * 10 * (1 - 100 / vue.longueurM)) < 40, "du début jusqu'à 100 m de la fin");
  // une moitié de boucle : pas fait
  assert.equal(parcoursFait(vue, sortie.slice(0, Math.floor(sortie.length / 2)), vue.longueurM / 2).fait, false);
  // beaucoup de distance mais ailleurs : pas fait
  const ailleurs = BOUCLE.map((p, i) => ({ ...decaler(p, 500), s: i * 10_000 }));
  assert.equal(parcoursFait(vue, ailleurs, vue.longueurM + 50).fait, false);
  // un trajet qui saute d'un bout à l'autre sans courir le circuit : la distance de la sortie est trop courte
  assert.equal(parcoursFait(vue, [{ ...BOUCLE[0]!, s: 0 }, { ...BOUCLE.at(-1)!, s: 60_000 }], 200).fait, false);
  assert.equal(parcoursFait(vue, [], 0).fait, false);
});

test("Mon temps : le meilleur temps, la dernière fois, le nombre de fois ; rien tant que le circuit n'a pas été fait", () => {
  assert.equal(monTemps([]), null);
  const m = monTemps([
    { seanceId: "a", le: 100, dureeS: 11_520 },
    { seanceId: "b", le: 300, dureeS: 12_660 },
    { seanceId: "c", le: 200, dureeS: 12_000 },
  ])!;
  assert.equal(m.fois, 3);
  assert.equal(m.meilleur.seanceId, "a");
  assert.equal(m.derniere.seanceId, "b");
});

test("Mon temps est gardé sur le téléphone : une sortie refinie remplace son temps, un autre circuit n'est pas touché", async () => {
  const { db } = await baseDeTest();
  {
    await noterTemps(db, "circuit1aaaaaaaaa", { seanceId: "s1", le: 1000, dureeS: 3600 });
    await noterTemps(db, "circuit1aaaaaaaaa", { seanceId: "s2", le: 2000, dureeS: 3500 });
    await noterTemps(db, "circuit1aaaaaaaaa", { seanceId: "s1", le: 1000, dureeS: 3400 });
    await noterTemps(db, "circuit2bbbbbbbbb", { seanceId: "s3", le: 3000, dureeS: 900 });
    const t1 = await lireTemps(db, "circuit1aaaaaaaaa");
    assert.equal(t1.length, 2);
    assert.equal(monTemps(t1)!.meilleur.dureeS, 3400);
    assert.equal((await lireTemps(db, "circuit2bbbbbbbbb")).length, 1);
    assert.deepEqual(await lireTemps(db, "inconnu"), []);
    const reglage = await db.getFirstAsync<{ cle: string }>("SELECT cle FROM reglages WHERE cle LIKE 'circuit_temps:%' LIMIT 1", []);
    assert.ok(reglage, "un réglage par circuit, pas de table");
  }
});

test("les circuits proposés : ceux qui vont à l'activité, le plus proche d'abord, les siens importés compris, sans doublon", () => {
  const ici: Point = { lat: 48.806, lon: 5.6947 };
  const proche = circuit("proche0000000001", "Proche", decaler(ici, 200), ["course"]);
  const loin = circuit("loin000000000001", "Loin", decaler(ici, 4000), ["course", "randonnee"]);
  const velo = circuit("velo000000000001", "Vélo", decaler(ici, 100), ["bicycling"]);
  const importe = { ...circuit("importe000000001", "Importé", decaler(ici, 2000), ["course"], "prive"), source: "gpx" as const };
  const mien = circuit("mien0000000000001", "Le mien", decaler(ici, 900), ["course"], "public");
  const decouverts = [
    { circuit: loin, m: haversineM(ici, decaler(ici, 4000)) },
    { circuit: proche, m: 200 },
    { circuit: velo, m: 100 },
    { circuit: mien, m: 900 },
  ];
  const liste = circuitsASuivre([importe, mien], decouverts, activitesDuSport("cat:course")!, ici);
  assert.deepEqual(liste.map((c) => c.circuit.id), [proche.id, mien.id, importe.id, loin.id]);
  assert.ok(liste.every((c) => c.m != null && c.m >= 0));
  assert.equal(liste.filter((c) => c.circuit.id === mien.id).length, 1, "un circuit à soi et publié n'est compté qu'une fois");
  assert.equal(liste.find((c) => c.circuit.id === velo.id), undefined, "un circuit à vélo ne va pas à la course");
  // à vélo : les circuits de vélo et de VTT
  assert.deepEqual(circuitsASuivre([], decouverts, activitesDuSport("cat:bicycling")!, ici).map((c) => c.circuit.id), [velo.id]);
  // sans position : les siens d'abord, dans l'ordre reçu (le plus récent d'abord), sans distance
  const sans = circuitsASuivre([importe, mien], decouverts, activitesDuSport("cat:course")!, null);
  assert.deepEqual(sans.map((c) => c.circuit.id), [importe.id, mien.id, loin.id, proche.id]);
  assert.equal(sans[0]!.m, null);
});

test("seuls la course, la randonnée et le vélo ont des circuits ; une activité ouvre le bon sport", () => {
  assert.deepEqual(activitesDuSport("cat:course"), ["course"]);
  assert.deepEqual(activitesDuSport("cat:randonnee"), ["randonnee"]);
  assert.deepEqual(activitesDuSport("cat:bicycling"), ["bicycling", "vtt"]);
  assert.equal(activitesDuSport("cat:musculation"), null);
  assert.equal(sportDeActivite("course"), "cat:course");
  assert.equal(sportDeActivite("randonnee"), "cat:randonnee");
  assert.equal(sportDeActivite("vtt"), "cat:bicycling");
  assert.equal(sportDeActivite("bicycling"), "cat:bicycling");
});

test("le suivi ne garde que ce qu'il faut du circuit : nom, tracé, altitudes, chiffres", () => {
  const c = circuit("proche0000000001", "Proche", BOUCLE[0]!, ["course"]);
  const s = circuitSuivi(c);
  assert.deepEqual(Object.keys(s).sort(), ["denivelePlusM", "distanceM", "id", "nom", "profil", "trace"]);
  assert.equal(s.trace, c.trace);
});

test("le suivi d'un circuit est disponible", () => {
  assert.equal(SUIVRE_DISPONIBLE, true);
});

// Structure des écrans : sans commentaires, pour ne tester que le code.
const source = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("le départ : la ligne « Circuit » entre « Lieu » et « Capteurs », seulement pour un sport qui a des circuits, sans routine guidée", () => {
  const s = source("ecrans/SuiviDepart.tsx");
  const lieu = s.indexOf('t("gps.lieu")');
  const circuitLigne = s.indexOf('t("circuit.suivre.titre")');
  const capteurs = s.indexOf('t("gps.capteurs")');
  assert.ok(lieu > 0 && circuitLigne > lieu && capteurs > circuitLigne, "Lieu, Circuit, Capteurs dans cet ordre");
  assert.match(s, /activitesDuSport\(sport\.id\)/);
  assert.match(s, /circuit: avecCircuit \? circuitChoisi : null/, "le circuit part avec le suivi lancé");
  assert.match(s, /setCircuitChoisi\(c \? circuitSuivi\(c\) : null\)/, "ce qui part est l'instantané du circuit (circuitSuivi)");
  assert.match(s, /FeuilleCircuits/);
});

test("le direct : le circuit vient du suivi lancé, la carte et le mini-tracé le dessinent, la phrase d'état remplace le dénivelé", () => {
  const d = source("ecrans/SuiviDirect.tsx");
  assert.match(d, /lance\?\.circuit/);
  assert.match(d, /etatSurCircuit\(/);
  assert.match(d, /<PhraseCircuit/);
  const c = source("ecrans/CarteDirect.tsx");
  assert.match(c, /pepfit-circuit/);
  assert.match(c, /line-dasharray/);
  assert.match(c, /traceGeoJson\(/);
  // une carte qui ne se charge pas laisse le tracé seul (échec signalé, ou délai dépassé après la lecture du style)
  assert.match(c, /onDidFailLoadingMap=\{\(\) => onEchec\?\.\(\)\}/);
  assert.match(c, /CARTE_DELAI_MS/);
  // chrono, capteurs et ligne de FC : le bloc de la FC et le chrono ne parlent pas du circuit
  const debutHaut = d.indexOf("styles.hautD");
  const hautDirect = d.slice(debutHaut, d.indexOf("{fcVue.current ? ("));
  assert.ok(debutHaut > 0 && hautDirect.length > 200, "le bloc du chrono est bien lu");
  assert.doesNotMatch(hautDirect, /circuit/i);
});

test("« Suivre ce circuit » : un seul bouton, sur la page du circuit et sur la carte pleine, qui ouvre l'écran de départ avec le circuit", () => {
  const b = source("ecrans/circuit/BoutonSuivre.tsx");
  assert.match(b, /circuit\.suivre\.bouton/);
  // l'écran de départ s'ouvre par commencer.ts (seule porte de /suivi/depart, avec le garde d'une séance en cours)
  assert.match(b, /ouvrirDepartCircuit\(sportDeActivite\(activiteAffichee\(c\.activites, choisie\)\), c\.id\)/);
  assert.doesNotMatch(b, /\/suivi\/depart/);
  assert.match(source("ecrans/commencer.ts"), /pathname: "\/suivi\/depart", params: \{ sport, circuit: circuitId \}/);
  assert.match(source("ecrans/circuit/PageCircuit.tsx"), /<BarreSuivre/);
  assert.match(source("ecrans/circuit/CartePleine.tsx"), /<BoutonSuivre/);
  // jamais un second bouton écrit à la main
  for (const f of ["ecrans/circuit/PageCircuit.tsx", "ecrans/circuit/CartePleine.tsx"]) assert.doesNotMatch(source(f), /circuit\.suivre\.bouton|\/suivi\/depart/, f);
});

test("la page d'un circuit : « Mon temps » vient du téléphone, jamais du serveur", () => {
  assert.match(source("ecrans/circuit/PageCircuit.tsx"), /<MonTemps/);
  const m = source("ecrans/circuit/MonTemps.tsx");
  assert.match(m, /lireTemps\(/);
  assert.doesNotMatch(m, /fetch|api\/|serveur/i);
  // ni compteur, ni classement, ni record côté serveur : le dépôt des temps n'envoie rien et reste hors de la synchronisation
  const depot = source("db/depots/circuits-temps.ts");
  assert.doesNotMatch(depot, /fetch|http/i);
  const schema = source("sync/schema.ts");
  assert.doesNotMatch(schema, /circuit_temps/);
});
