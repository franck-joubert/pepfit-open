// Cinq familles de sports (planche familles-sports, décisions du 30/10) : chaque sport du catalogue a sa famille, aucune
// famille ne range un sport absent du catalogue, les exemples d'Alex sont à leur place ; lieux, unités, pas, effort du jour.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogueSports } from "../src/db/depots/lanceur.ts";
import { chargeSeance } from "../src/ecrans/effort-pepfit.ts";
import {
  allureEnUnite, aUneFamille, AUTRE_LIEU, avecPas, compteDansEffort, FAMILLE_PAR_DEFAUT, familleDe, familleDeSeance, familleDuSuivi, FAMILLES,
  grouperParFamille, lieuxDepart, mesureSport, nomFamille, SPORTS_RANGES, type Famille,
} from "../src/ecrans/familles-sports.ts";
import { genreSport, MUSCULATION } from "../src/ecrans/lanceur-sports.ts";
import { capteursDepart, mesureDe } from "../src/ecrans/suivi-direct-vue.ts";
import { baseDeTest, catalogue } from "./aide.ts";

const lignes = readFileSync(new URL("./fixtures/whoop-activites.csv", import.meta.url), "utf8").trim().split("\n").slice(1);
const slugsWhoop = lignes.map((l) => l.split(",")[0]!);
const sportsDuCatalogue = catalogue().exercices.filter((e) => e.whoop_ids?.length).map((e) => e.slug);

test("couverture : chaque sport du catalogue et de la liste Whoop a une famille", () => {
  assert.equal(sportsDuCatalogue.length, 88);
  const sans = [...new Set([...sportsDuCatalogue, ...slugsWhoop])].filter((s) => !aUneFamille(`cat:${s}`));
  assert.deepEqual(sans, []);
});

test("couverture : les sports du lanceur (base chargée) ont tous une famille", async () => {
  const { db } = await baseDeTest(true);
  const sports = await catalogueSports(db);
  assert.ok(sports.length >= 88);
  assert.deepEqual(sports.filter((s) => !aUneFamille(s.id)).map((s) => s.id), []);
});

test("aucune famille ne range un sport absent du catalogue, ni deux fois le même", () => {
  const connus = new Set(sportsDuCatalogue);
  assert.deepEqual(SPORTS_RANGES.filter((s) => !connus.has(s)), []);
  assert.equal(new Set(SPORTS_RANGES).size, SPORTS_RANGES.length);
  assert.equal(SPORTS_RANGES.length, sportsDuCatalogue.length);
});

test("les cinq familles servent toutes ; répartition 2 / 13 / 9 / 58 / 6", () => {
  const n = (f: Famille) => sportsDuCatalogue.filter((s) => familleDe(s) === f).length;
  assert.deepEqual(FAMILLES.map(n), [2, 13, 9, 58, 6]);
});

test("exemples d'Alex (29/10) et décisions du 30/10 : chaque sport cité est dans sa famille", () => {
  const attendu: Record<Famille, string[]> = {
    force: ["musculation", "cross-training"],
    dehors: ["course", "bicycling", "randonnee", "ski-de-fond"],
    interieur: ["rowing-stationary", "bicycling-stationary", "natation"],
    // HIIT : un sport et cours (D1 du 30/10) ; pas de famille Trail (D7)
    seance: ["tennis", "padel", "football", "rugby", "boxe", "jiu-jitsu", "escalade", "danse", "hiit"],
    recup: ["etirements", "yoga", "meditation", "sauna", "bain-froid"],
  };
  for (const [f, slugs] of Object.entries(attendu)) for (const s of slugs) assert.equal(familleDe(`cat:${s}`), f, s);
  assert.equal(aUneFamille("cat:trail"), false);
});

test("noms des familles (lexique, D9) : « Sports et cours »", () => {
  assert.deepEqual(FAMILLES.map(nomFamille), ["Force", "Endurance dehors", "Endurance en intérieur", "Sports et cours", "Récupération et bien-être"]);
});

test("cohérent avec le lanceur : Force ouvre les routines, les autres familles le départ du suivi", () => {
  assert.equal(familleDe(MUSCULATION), "force");
  for (const s of sportsDuCatalogue) assert.equal(genreSport(`cat:${s}`), familleDe(s) === "force" ? "muscu" : "suivi", s);
});

test("deux lieux (D2) : segmenté du départ, famille de la séance et du suivi en cours", () => {
  assert.deepEqual(lieuxDepart("cat:course"), ["Extérieur", "Intérieur"]);
  assert.deepEqual(lieuxDepart("cat:bicycling"), ["Extérieur", "Intérieur"]);
  assert.deepEqual(lieuxDepart("cat:natation"), ["Piscine", "Eau libre"]);
  assert.equal(lieuxDepart("cat:randonnee"), null, "pas de segmenté : la rando n'a pas d'intérieur (07/11 : jamais grisé)");
  assert.equal(lieuxDepart("cat:padel"), null);
  assert.equal(lieuxDepart("cat:musculation"), null);
  assert.equal(familleDeSeance("cat:course", false), "dehors");
  assert.equal(familleDeSeance("cat:course", true), "interieur");
  assert.equal(familleDeSeance("cat:natation", false), "interieur");
  assert.equal(familleDeSeance("cat:natation", true), "dehors");
  assert.equal(familleDeSeance("cat:padel", true), "seance");
  for (const [s, a] of Object.entries(AUTRE_LIEU)) {
    assert.ok(aUneFamille(s), s);
    assert.notEqual(a.famille, familleDe(s), s);
  }
  // Le suivi en cours : sans GPS, un sport du dehors est en intérieur ; avec le GPS, la natation est en eau libre.
  assert.equal(familleDuSuivi("cat:course", true), "interieur");
  assert.equal(familleDuSuivi("cat:course", false), "dehors");
  assert.equal(familleDuSuivi("cat:natation", false), "dehors");
  assert.equal(familleDuSuivi("cat:natation", true), "interieur");
  assert.equal(familleDuSuivi("cat:padel", true), "seance");
});

test("départ : segmenté des sports à deux lieux, GPS seulement dehors, pas de FC en récupération", () => {
  assert.deepEqual(capteursDepart("cat:natation", false), { segment: true, gps: false, fc: true });
  assert.deepEqual(capteursDepart("cat:natation", true), { segment: true, gps: true, fc: true });
  assert.deepEqual(capteursDepart("cat:marche", true), { segment: true, gps: false, fc: true });
  assert.deepEqual(capteursDepart("cat:padel", false), { segment: false, gps: false, fc: true });
  assert.deepEqual(capteursDepart("cat:sauna", false), { segment: false, gps: false, fc: false });
});

test("unités (correction 4) : km/h pour les vélos, /500 m au rameur, /100 m en natation, /km sinon", () => {
  assert.equal(mesureSport("cat:bicycling-stationary"), "vitesse");
  assert.equal(mesureSport("cat:assault-bike"), "vitesse");
  assert.equal(mesureSport("cat:rowing-stationary"), "allure-500");
  assert.equal(mesureSport("cat:natation"), "allure-100");
  assert.equal(mesureSport("cat:course"), "allure-km");
  assert.equal(mesureDe("cat:assault-bike"), "vitesse");
  assert.equal(mesureDe("cat:rowing-stationary"), "allure");
  // 4'00" au km : 2'00" au 500 m, 24" au 100 m
  assert.equal(allureEnUnite(240, "allure-500"), 120);
  assert.equal(allureEnUnite(240, "allure-100"), 24);
});

test("pas (correction 8) : en sports et cours, sauf motocross, sport auto, voile, plongée", () => {
  assert.equal(avecPas("cat:padel"), true);
  for (const s of ["motocross", "sport-auto", "voile", "plongee"]) assert.equal(avecPas(`cat:${s}`), false, s);
  assert.equal(avecPas("cat:course"), false);
});

test("catalogue rangé par famille (D9) : ordre des familles, groupes vides omis, ordre d'origine gardé", () => {
  const g = grouperParFamille([{ id: "cat:sauna" }, { id: "cat:padel" }, { id: "cat:musculation" }, { id: "cat:tennis" }]);
  assert.deepEqual(g.map((x) => [x.famille, x.sports.map((s) => s.id)]), [
    ["force", ["cat:musculation"]],
    ["seance", ["cat:padel", "cat:tennis"]],
    ["recup", ["cat:sauna"]],
  ]);
});

test("sport inconnu (activité perso) : sports et cours par défaut, sans famille rangée", () => {
  assert.equal(FAMILLE_PAR_DEFAUT, "seance");
  assert.equal(familleDe("01JABCPERSO"), "seance");
  assert.equal(aUneFamille("01JABCPERSO"), false);
});

test("effort du jour (D6) : la récupération n'y compte pas", () => {
  assert.deepEqual(FAMILLES.filter((f) => !compteDansEffort(f)), ["recup"]);
  assert.equal(chargeSeance({ sportId: "cat:sauna", minutes: 20, zones: null, ressenti: null }), null);
  assert.ok(chargeSeance({ sportId: "cat:padel", minutes: 60, zones: null, ressenti: null })!.charge > 0);
});

test("récupération (D11) : compte à rebours de la durée visée, puis dépassement compté à part", async () => {
  const { compteRebours } = await import("../src/ecrans/direct-familles.ts");
  assert.deepEqual(compteRebours(760, 900), { resteS: 140, depasseS: 0, atteint: false });
  assert.deepEqual(compteRebours(900, 900), { resteS: 0, depasseS: 0, atteint: true });
  assert.deepEqual(compteRebours(912.4, 900), { resteS: 0, depasseS: 12, atteint: true });
});

test("sports et cours : effort en direct (barème sans FC, FC par zones avec) ; exemple de score adapté au sport (D5)", async () => {
  const { effortEnDirect, exempleScore, fcDeLaSeance } = await import("../src/ecrans/direct-familles.ts");
  assert.equal(effortEnDirect("cat:padel", [], 30_000, 181), null, "moins d'une minute");
  const sansFc = effortEnDirect("cat:padel", [], 60 * 60_000, 181)!;
  assert.ok(sansFc > 5 && sansFc < 10, String(sansFc));
  const fc = Array.from({ length: 3600 }, (_, i) => ({ s: i * 1000, bpm: 155 }));
  assert.ok(effortEnDirect("cat:padel", fc, 3600_000, 181)! > sansFc, "une heure en Z4 pèse plus que le barème");
  assert.equal(fcDeLaSeance(fc, 181)!.moy, 155);
  assert.equal(fcDeLaSeance([], 181), null);
  assert.equal(exempleScore("cat:padel"), "Ex. 6-4 6-3");
  assert.equal(exempleScore("cat:escalade"), "Ex. 6b+ en tête");
  assert.equal(exempleScore("cat:rugby"), "Ex. gagné 3-1");
  assert.equal(exempleScore("cat:danse"), "Ex. niveau 2");
});
