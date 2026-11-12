// Bilan énergétique de Santé : méthodes du métabolisme de base, choix Automatique, dépense BMR + EAT + NEAT + TEF, solde.
// Chiffres de la planche sante-energie (Alex au 27/10 : 77,96 kg, 14,2 %, 183 cm, 39 ans, BMR Withings 1 931).
import assert from "node:assert/strict";
import { test } from "node:test";
import { kcalSeance } from "../src/ecrans/kcal-seance.ts";
import {
  bilanJour, choisirBmr, cunningham, echelleBarres, eatSeance, harrisBenedict, katchMcArdle, lireMethode, maigreDe, methodeAuto, mifflin,
  moyenneSoldes, segmentsDepense, valeursBmr, type DonneesBmr,
} from "../src/ecrans/energie-calc.ts";

const JOUR = 86_400_000;
const T = new Date(2026, 9, 27, 16, 42).getTime();
const P = { sexe: "h" as const, kg: 77.96, cm: 183, age: 39 };
const MAIGRE = 77.96 * (1 - 0.142);
const TOUT: DonneesBmr = { balance: { kcal: 1931, date: T - JOUR, origine: "com.withings.wiscale2" }, maigre: { kg: MAIGRE, date: T - JOUR }, profil: P };
const r = Math.round;

test("BMR : les cinq méthodes donnent les valeurs de la planche", () => {
  assert.equal(r(mifflin(P)), 1733);
  assert.equal(r(harrisBenedict(P)), 1790);
  assert.equal(r(katchMcArdle(MAIGRE)), 1815);
  assert.equal(r(cunningham(MAIGRE)), 1972);
  assert.equal(r(mifflin({ ...P, sexe: "f" })), 1733 - 166);
  assert.equal(r(harrisBenedict({ sexe: "f", kg: 60, cm: 165, age: 30 })), r(447.593 + 9.247 * 60 + 3.098 * 165 - 4.33 * 30));
});

test("valeurs par méthode : une méthode sans ses données est null (grisée)", () => {
  const v = valeursBmr({ balance: null, maigre: null, profil: P });
  assert.equal(v.balance, null);
  assert.equal(v.katch, null);
  assert.equal(v.cunningham, null);
  assert.equal(r(v.mifflin!.kcal), 1733);
  assert.equal(v.mifflin!.estime, true);
  assert.equal(valeursBmr(TOUT).balance!.estime, false);
});

test("Automatique : balance récente, sinon masse maigre récente, sinon profil, sinon le métabolisme par défaut", () => {
  assert.equal(methodeAuto(TOUT, T), "balance");
  const vieille = { ...TOUT, balance: { ...TOUT.balance!, date: T - 31 * JOUR } };
  assert.equal(methodeAuto(vieille, T), "katch");
  assert.equal(methodeAuto({ ...vieille, maigre: { kg: MAIGRE, date: T - 40 * JOUR } }, T), "mifflin");
  assert.equal(methodeAuto({ balance: null, maigre: null, profil: null }, T), "defaut");
});

test("choix de la méthode : respecté si possible, sinon Automatique ; toujours un BMR", () => {
  assert.deepEqual(choisirBmr("auto", TOUT, T), { kcal: 1931, estime: false, sigma: 1931 * 0.07, methode: "balance", auto: true });
  const c = choisirBmr("cunningham", TOUT, T)!;
  assert.equal(c.methode, "cunningham");
  assert.equal(c.auto, false);
  assert.equal(choisirBmr("katch", { balance: null, maigre: null, profil: P }, T)!.methode, "mifflin");
  assert.equal(choisirBmr("harris", { balance: null, maigre: null, profil: null }, T).methode, "defaut");
  assert.equal(lireMethode("katch"), "katch");
  assert.equal(lireMethode("n'importe"), "auto");
  assert.equal(lireMethode(null), "auto");
});

test("dépense = BMR + sport calculé à la FC + pas + digestion (planche : padel 62 min, 11 581 pas, 2 630 kcal)", () => {
  // depuis le 31/10, le sport se calcule chez nous (kcal-seance.ts) : Keytel à la FC moyenne de Whoop, jamais ses kcal
  const corps = { sexe: "h" as const, kg: 77.96, age: 45, fcRepos: 55, fcMax: 180 };
  const sport = kcalSeance({ minutes: 62, fcMoy: 125 }, corps, 1931);
  const b = bilanJour({
    bmr: { kcal: 1931, estime: false, sigma: 135, methode: "balance", auto: true },
    seances: [{ nom: "Padel", minutes: 62, fcMoy: 125, origine: null, pas: 62 * 55 }],
    pas: 11581,
    apports: 2630,
    kg: 77.96,
    corps,
    enCours: true,
  });
  assert.equal(sport.methode, "fc");
  assert.equal(b.sport.kcal, sport.kcal);
  assert.equal(b.sport.estime, false);
  assert.equal(b.neat!.pasHorsSport, 8171);
  assert.equal(r(b.neat!.kcal), 286);
  assert.equal(r(b.digestion.kcal), 263);
  assert.equal(b.digestion.duJournal, true);
  assert.equal(r(b.depense.kcal), r(1931 + sport.kcal + 8171 * 0.035 + 263));
  assert.equal(b.depense.estime, true);
  assert.equal(r(b.solde!), r(2630 - b.depense.kcal));
  assert.deepEqual(segmentsDepense(b).map((s) => s.cle), ["bmr", "sport", "neat", "digestion"]);
});

test("séance pepfit sans FC : MET × kg × h moins le BMR déjà compté, estimée ; sans poids, l'adulte de référence", () => {
  const e = eatSeance({ nom: "Push", minutes: 60, origine: null, pas: null }, 1440, { sexe: null, kg: 80, age: null });
  assert.equal(r(e.kcal), 5 * 80 - 60);
  assert.equal(e.estime, true);
  assert.equal(r(eatSeance({ nom: "x", minutes: 60, origine: null, pas: null }, 1440, { sexe: "h", kg: null, age: null }).kcal), 5 * 78 - 60);
});

test("sans journal : digestion estimée (BMR + EAT + NEAT) × 0,1 / 0,9, pas de solde ; sans pas : 5 000 pas par défaut", () => {
  const b = bilanJour({ bmr: { kcal: 1800, estime: true, sigma: 144, methode: "mifflin", auto: true }, seances: [], pas: null, apports: null, kg: 80, enCours: false });
  assert.equal(b.neat!.defaut, true);
  assert.equal(r(b.neat!.kcal), 175);
  assert.equal(r(b.digestion.kcal), r((1975 * 0.1) / 0.9));
  assert.equal(b.digestion.estime, true);
  assert.equal(b.solde, null);
  assert.equal(b.apports, null);
  assert.deepEqual(segmentsDepense(b).map((s) => s.cle), ["bmr", "neat", "digestion"]);
});

test("jour passé, tout mesuré : la dépense reste estimée (pas) ; réglages kcal par pas et digestion appliqués", () => {
  const b = bilanJour({ bmr: { kcal: 1931, estime: false, sigma: 135, methode: "balance", auto: true }, seances: [], pas: 0, apports: 2000, kg: 78, enCours: false });
  assert.equal(b.depense.estime, true);
  const c = bilanJour({ bmr: { kcal: 1931, estime: false, sigma: 135, methode: "balance", auto: true }, seances: [], pas: null, apports: 2000, kg: 78, enCours: false, kcalParPas: 0.04, partDigestion: 0.12 });
  assert.equal(c.depense.estime, true);
  assert.equal(r(c.neat!.kcal), 200);
  assert.equal(r(c.digestion.kcal), 240);
});

test("barres à la même échelle, moyenne des soldes connus", () => {
  assert.deepEqual(echelleBarres(2892, 2630), { depense: 1, apports: 2630 / 2892 });
  assert.deepEqual(echelleBarres(2000, 2500), { depense: 0.8, apports: 1 });
  assert.deepEqual(echelleBarres(2000, null), { depense: 1, apports: 0 });
  assert.equal(r(moyenneSoldes([-120, 340, 260, -40, 380, 86, -262])!), 92);
  assert.equal(moyenneSoldes([null, null]), null);
});

test("masse maigre : mesurée, sinon poids × (1 − gras)", () => {
  assert.deepEqual(maigreDe({ valeur: 66, date: 5 }, null, null), { kg: 66, date: 5 });
  assert.equal(r(maigreDe(null, { valeur: 14.2, date: 3 }, { kg: 77.96, date: 4 })!.kg * 10), 669);
  assert.equal(maigreDe(null, { valeur: 14.2, date: 3 }, null), null);
});

test("Composition : repères ronds qui encadrent, écart sur la période, clés de mesure", async () => {
  const { reperes, ecart, lireCle, pointsPeriode } = await import("../src/ecrans/composition-vue.ts");
  assert.deepEqual(reperes([14.0, 14.9, 14.2]), [14, 14.5, 15, 15.5, 16]);
  const r2 = reperes([77.1, 78.9]);
  assert.ok(r2[0]! <= 77.1 && r2[4]! >= 78.9);
  assert.equal(ecart([{ valeur: 78 }, { valeur: 79.1 }], 1)! < 0, true);
  assert.equal(ecart([{ valeur: 78 }], 1), null);
  assert.equal(ecart([{ valeur: 78.01 }, { valeur: 78 }], 1), null);
  assert.equal(lireCle("vfc"), "vfc");
  assert.equal(lireCle("m:tour_taille"), "m:tour_taille");
  assert.equal(lireCle("rien"), null);
  assert.deepEqual(pointsPeriode([{ date: 5 }, { date: 1 }, { date: 100 }], 0, 200).map((p) => p.date), [1, 5, 100]);
});
