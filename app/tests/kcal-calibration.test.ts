// Coefficient par famille de sport et calibration personnelle des kcal (docs/KCAL-CALIBRATION.md). Profil des tests : homme, 78 kg, 45 ans, FC au
// repos 55, FC max 180, métabolisme 1 733 kcal (celui du 30/10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALCUL_KCAL, familleKcal, kcalSeance } from "../src/ecrans/kcal-seance.ts";
import { SPORTS_RANGES } from "../src/ecrans/familles-sports.ts";
import {
  calibrationsKcal, CLE_CALIBRATION_KCAL, ecrirePoints, facteurPersonnel, facteursKcal, fusionnerPoints, lirePoints, pointSeance, type PointCalibration,
} from "../src/ecrans/calibration.ts";
import { apprendreCalibrationKcal, lireCalibrationsKcal } from "../src/ecrans/kcal-calibration.ts";
import { lireComparaisonKcal } from "../src/ecrans/kcal-comparaison.ts";
import { jourEnergie } from "../src/ecrans/sante-donnees.ts";
import { ecrireAnneeNaissance, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import { baseDeTest } from "./aide.ts";

const MIN = 60_000;
const H = 60 * MIN;
const J = 24 * H;
const CORPS = { sexe: "h" as const, kg: 78, age: 45, fcRepos: 55, fcMax: 180 };
const BMR = 1733;
const REPOS_MIN = BMR / 1440;
const keytelH = (fc: number) => (-55.0969 + 0.6309 * fc + 0.1988 * 78 + 0.2017 * 45) / 4.184;
const pres = (a: number, b: number, e = 0.5) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

// ---- 1. coefficient par famille --------------------------------------------------------------------------------------

test("familles kcal : les cinq familles de l'appli, « Sports et cours » détaillé ; tout sport du catalogue a la sienne", () => {
  const attendu: Record<string, string> = {
    "cat:padel": "raquette", "cat:tennis": "raquette", "cat:musculation": "force", "cat:cross-training": "intermittent", "cat:hiit": "intermittent",
    "cat:course": "endurance", "cat:bicycling-stationary": "endurance", "cat:rowing-stationary": "endurance", "cat:natation": "natation",
    "cat:football": "collectif", "cat:basketball": "collectif", "cat:boxe": "combat", "cat:escalade": "autre", "cat:danse": "autre",
    "cat:yoga": "recup", "cat:sauna": "thermique", "cat:bain-froid": "thermique", "cat:inconnu": "autre", "perso:mon-sport": "autre",
  };
  for (const [id, f] of Object.entries(attendu)) assert.equal(familleKcal(id), f, id);
  assert.equal(familleKcal(null), "inconnue");
  for (const slug of SPORTS_RANGES) assert.ok(CALCUL_KCAL.coefFc[familleKcal(`cat:${slug}`)] > 0, slug);
  // les coefficients restent dans la fourchette annoncée par la note
  for (const c of Object.values(CALCUL_KCAL.coefFc)) assert.ok(c >= 0.5 && c <= 1.1);
});

test("coefficients chiffrés : padel 743 (× 0,8), muscu 171 (× 0,75), course 45 min à 150 bpm 635 (× 1), natation × 1,1", () => {
  const padel = kcalSeance({ minutes: 86, fcMoy: 128, sportId: "cat:padel" }, CORPS, BMR);
  pres(padel.kcal, (keytelH(128) - REPOS_MIN) * 86 * 0.8);
  pres(padel.kcal, 743.3);
  const muscu = kcalSeance({ minutes: 31, fcMoy: 105, sportId: "cat:musculation" }, CORPS, BMR);
  pres(muscu.kcal, (keytelH(105) - REPOS_MIN) * 31 * 0.75);
  pres(muscu.kcal, 170.6);
  const course = kcalSeance({ minutes: 45, fc: new Array(45).fill(150), sportId: "cat:course" }, CORPS, BMR);
  assert.equal(course.coef, 1);
  pres(course.kcal, (keytelH(150) - REPOS_MIN) * 45);
  pres(course.kcal, 635.5);
  const nage = kcalSeance({ minutes: 45, fcMoy: 130, sportId: "cat:natation" }, CORPS, BMR);
  pres(nage.kcal, (keytelH(130) - REPOS_MIN) * 45 * 1.1);
  // aux MET (sans FC), le coefficient ne s'applique pas : il corrige la FC
  pres(kcalSeance({ minutes: 86, sportId: "cat:padel" }, CORPS, BMR).kcal, 6 * 78 * (86 / 60) - REPOS_MIN * 86);
});

test("sauna et bain froid : toujours aux MET (1,3 et 2), même avec une FC ; ni coefficient, ni facteur personnel", () => {
  assert.deepEqual(CALCUL_KCAL.auxMet, ["thermique"]);
  // sauna 20 min à 120 bpm : à la FC (famille recup, × 0,5) il comptait ≈ 96 kcal nettes ; aux MET, ≈ 10 (34 brutes)
  pres((keytelH(120) - REPOS_MIN) * 20 * 0.5, 96, 1);
  const sauna = kcalSeance({ minutes: 20, fc: new Array(20).fill(120), fcMoy: 120, sportId: "cat:sauna" }, CORPS, BMR);
  assert.equal(sauna.methode, "met");
  assert.equal(sauna.famille, "thermique");
  pres(sauna.kcal, 1.3 * 78 * (20 / 60) - REPOS_MIN * 20);
  pres(sauna.kcal, 9.7);
  pres(sauna.brutes, 33.8);
  assert.deepEqual([sauna.coef, sauna.facteur], [1, 1]);
  // la même séance sans FC : le même chiffre ; un facteur personnel (même mal appris) n'y touche pas
  assert.deepEqual(kcalSeance({ minutes: 20, sportId: "cat:sauna" }, CORPS, BMR), sauna);
  assert.deepEqual(kcalSeance({ minutes: 20, fcMoy: 120, sportId: "cat:sauna" }, { ...CORPS, calibration: { thermique: 1.3, recup: 1.3 } }, BMR), sauna);
  // bain froid 5 min à 110 bpm : 2 MET → ≈ 7 kcal nettes (13 brutes)
  const froid = kcalSeance({ minutes: 5, fcMoy: 110, sportId: "cat:bain-froid" }, CORPS, BMR);
  assert.equal(froid.methode, "met");
  pres(froid.kcal, 2 * 78 * (5 / 60) - REPOS_MIN * 5);
  pres(froid.kcal, 7);
  pres(froid.brutes, 13);
  // le reste de la récupération (yoga) garde la FC, × 0,5
  const yoga = kcalSeance({ minutes: 60, fcMoy: 95, sportId: "cat:yoga" }, CORPS, BMR);
  assert.deepEqual([yoga.methode, yoga.famille, yoga.coef], ["fc", "recup", 0.5]);
  // jamais comparables à Whoop : pas de point de calibration
  assert.equal(pointSeance({ seanceId: "s", debut: 0, minutes: 20, methode: sauna.methode, famille: "thermique", netSansCoef: 190, mesureNette: 60, src: "whoop" }), null);
});

// ---- 2. facteur personnel ----------------------------------------------------------------------------------------------

test("facteur personnel : inactif sous 5 séances, rapproché de 1 jusqu'à 10, puis la médiane ; borné à [0,7 ; 1,3]", () => {
  assert.equal(facteurPersonnel([0.8, 0.8, 0.8, 0.8]).facteur, null);
  assert.equal(facteurPersonnel([0.8, 0.8, 0.8, 0.8]).n, 4);
  pres(facteurPersonnel(new Array(5).fill(0.8)).facteur!, 0.9, 1e-9); // 1 + (0,8 − 1) × 5/10
  pres(facteurPersonnel(new Array(10).fill(0.8)).facteur!, 0.8, 1e-9);
  assert.equal(facteurPersonnel(new Array(12).fill(0.5)).facteur, 0.7);
  assert.equal(facteurPersonnel(new Array(12).fill(1.8)).facteur, 1.3);
  // la médiane : une séance aberrante ne tire pas le facteur
  pres(facteurPersonnel([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 2.4]).facteur!, 0.8, 1e-9);
  // les 20 plus récentes seulement (la liste arrive la plus récente d'abord)
  pres(facteurPersonnel([...new Array(20).fill(0.9), ...new Array(30).fill(0.6)]).facteur!, 0.9, 1e-9);
});

test("le facteur converge vers le vrai rapport (0,73, celui du padel face à Whoop) et y reste, séance après séance", () => {
  const vrai = 0.73;
  const suite: (number | null)[] = [];
  const rapports: number[] = [];
  for (let i = 0; i < 25; i++) {
    // bruit de ± 8 % autour du vrai rapport, déterministe
    rapports.unshift(vrai * (1 + 0.08 * Math.sin(i * 1.7)));
    suite.push(facteurPersonnel(rapports).facteur);
  }
  assert.deepEqual(suite.slice(0, 4), [null, null, null, null]);
  for (const f of suite.slice(4)) assert.ok(f! >= 0.7 && f! <= 1.3);
  assert.ok(Math.abs(suite[4]! - 1) > 0.1, "actif dès 5 séances, à mi-chemin");
  for (const f of suite.slice(9)) pres(f!, vrai, 0.04);
  // l'écart à Whoop après calibration est bien plus petit qu'avant
  const avant = Math.abs(1 - vrai);
  assert.ok(Math.abs(suite[24]! - vrai) < avant / 5);
});

test("points : seulement les séances comparables ; gardés face à Keytel sans coefficient, relus face au coefficient actuel", () => {
  const base = { seanceId: "a", debut: 1, minutes: 86, methode: "fc" as const, famille: "raquette" as const, netSansCoef: 929.2, mesureNette: 541.7, src: "whoop" as const };
  const p = pointSeance(base)!;
  pres(p.r, 541.7 / 929.2, 0.001);
  assert.equal(pointSeance({ ...base, methode: "met" }), null, "aux MET : rien à calibrer");
  assert.equal(pointSeance({ ...base, minutes: 10 }), null, "moins de 15 min");
  assert.equal(pointSeance({ ...base, mesureNette: 3000 }), null, "rapport invraisemblable (mauvais rattachement)");
  assert.equal(pointSeance({ ...base, mesureNette: -5 }), null);
  // relu face au calcul avec le coefficient de la raquette (0,8) : 0,729
  const pts: PointCalibration[] = Array.from({ length: 10 }, (_, i) => ({ ...p, s: `s${i}`, t: i }));
  pres(calibrationsKcal(pts).get("raquette")!.facteur!, 541.7 / (929.2 * 0.8), 0.002);
  assert.deepEqual(Object.keys(facteursKcal(pts)), ["raquette"]);
  // fusion : une séance n'a qu'un point (le plus récent calcul), 20 au plus par famille, les plus récents
  const beaucoup = Array.from({ length: 30 }, (_, i) => ({ ...p, s: `x${i}`, t: i }));
  const f = fusionnerPoints([], beaucoup);
  assert.equal(f.length, 20);
  assert.equal(f[0]!.t, 29);
  assert.equal(fusionnerPoints(f, [{ ...p, s: "x29", t: 29, r: 0.5 }]).filter((x) => x.s === "x29")[0]!.r, 0.5);
  assert.deepEqual(lirePoints(ecrirePoints(f)), f);
  assert.deepEqual(lirePoints("{"), []);
  assert.deepEqual(lirePoints(JSON.stringify({ v: 9, p: f })), []);
});

// ---- dans la base : apprentissage, synchro, page Énergie ------------------------------------------------------------

const JOUR30 = new Date(2026, 9, 30).getTime();
const MAINTENANT = JOUR30 + 30 * H;

async function profil() {
  const b = await baseDeTest(true);
  await ecrireSexe(b.db, "h");
  await ecrireAnneeNaissance(b.db, 1981);
  await ajouterPesee(b.db, 78, JOUR30 - 40 * J, "manuel");
  return b;
}

/** `n` padels Whoop de 86 min à 128 bpm, 2 700 kJ (le padel du 30/10), un par jour avant `dernier`. */
const padels = (n: number, dernier: number) =>
  Array.from({ length: n }, (_, i) => {
    const debut = dernier - i * J;
    return { id: `p${i}`, debut, fin: debut + 86 * MIN, sportId: 249, sport: "Padel", strain: 14, kj: 2700, fcMoy: 128, fcMax: 170, distanceM: null, zones: null };
  });

test("apprentissage : 4 padels → facteur inactif ; 12 → actif, le rapport médian Whoop ÷ pepfit ; réglage synchronisé", async () => {
  const { db } = await profil();
  await enregistrerSeances(db, padels(4, JOUR30 - 2 * J + 18 * H), MAINTENANT);
  assert.equal(await apprendreCalibrationKcal(db, MAINTENANT), 4);
  assert.equal((await lireCalibrationsKcal(db)).get("raquette")!.facteur, null);
  assert.equal(await apprendreCalibrationKcal(db, MAINTENANT), 0, "rien de neuf : le réglage n'est pas réécrit");
  await enregistrerSeances(db, padels(12, JOUR30 - 2 * J + 18 * H), MAINTENANT);
  await apprendreCalibrationKcal(db, MAINTENANT);
  const c = (await lireCalibrationsKcal(db)).get("raquette")!;
  assert.equal(c.n, 12);
  const l = await lireComparaisonKcal(db, CORPS, BMR, MAINTENANT);
  const attendu = l[0]!.mesureNette / (l[0]!.netSansCoef * 0.8);
  assert.ok(attendu > 0.7 && attendu < 0.8, String(attendu));
  pres(c.facteur!, attendu, 0.01);
  // le réglage voyage (règle de la synchro complète), chiffré comme tous les réglages (valeur sensible)
  const j = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'reglages' AND cle = ?", [CLE_CALIBRATION_KCAL]);
  assert.equal(j?.n, 1);
});

test("page Énergie : le facteur appris s'applique au padel calculé à la FC ; l'écart à Whoop passe de ≈ 37 % à presque rien", async () => {
  const { db } = await profil();
  await enregistrerSeances(db, padels(12, JOUR30 - 2 * J + 18 * H), MAINTENANT);
  await apprendreCalibrationKcal(db, MAINTENANT);
  const f = (await lireCalibrationsKcal(db)).get("raquette")!.facteur!;
  await enregistrerSeances(db, [{ id: "jour", debut: JOUR30 + 18 * H, fin: JOUR30 + 18 * H + 86 * MIN, sportId: 249, sport: "Padel", strain: 14, kj: 2700, fcMoy: 128, fcMax: 170, distanceM: null, zones: null }], MAINTENANT);
  const e = await jourEnergie(db, JOUR30, MAINTENANT);
  const s = e.bilan.sport.seances[0]!;
  const sans = kcalSeance({ minutes: 86, fcMoy: 128, sportId: "cat:padel" }, { sexe: "h", kg: 78, age: 45 }, e.bmr.kcal);
  pres(s.kcal, sans.kcal * f, 1e-6);
  const whoopNet = 2700 / 4.184 - (sans.brutes - sans.kcal);
  assert.ok(Math.abs(sans.kcal / whoopNet - 1) > 0.3, `avant : ${sans.kcal} face à ${whoopNet}`);
  assert.ok(Math.abs(s.kcal / whoopNet - 1) < 0.03, `après : ${s.kcal} face à ${whoopNet}`);
  // le labo montre les deux
  const l = await lireComparaisonKcal(db, { ...CORPS, calibration: { raquette: f } }, BMR, MAINTENANT);
  assert.ok(l[0]!.nousCalibre < l[0]!.nous);
});
