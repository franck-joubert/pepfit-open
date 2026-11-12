// Énergie adaptative (NOTES-ENERGIE.md) : métabolisme sans profil, précision qui monte avec les données, conseil, apports
// estimés par les habitudes du journal, dépense recalée sur l'évolution du poids.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bilanJour, choisirBmr, mifflin, segmentsDepense, type Bmr } from "../src/ecrans/energie-calc.ts";
import {
  apportsHabitudes, decaler, densiteVariation, KCAL_KG_GRAS, mifflinPartiel, penteRegression, precisionDe, recaler,
  type ApportJour, type ProfilPartiel,
} from "../src/ecrans/energie-precision.ts";

const r = Math.round;
const RIEN: ProfilPartiel = { sexe: null, kg: null, cm: null, age: null };
const ALEX = { sexe: "h" as const, kg: 77.96, cm: 183, age: 39 };
const LUNDI = new Date(2026, 9, 26).getTime();

test("précision : seuils 6 / 10 / 14 % de l'écart type relatif", () => {
  assert.equal(precisionDe(50, 2000), "elevee");
  assert.equal(precisionDe(150, 2000), "bonne");
  assert.equal(precisionDe(250, 2000), "moyenne");
  assert.equal(precisionDe(300, 2000), "faible");
  assert.equal(precisionDe(10, 0), "faible");
});

test("métabolisme sans rien : adulte de référence (71 kg, 170 cm, 40 ans, sexe moyen), jamais d'absence de valeur", () => {
  const m = mifflinPartiel(RIEN);
  assert.equal(r(m.kcal), r(10 * 71 + 6.25 * 170 - 5 * 40 - 78));
  assert.deepEqual(m.manques, ["poids", "taille", "age", "sexe"]);
  assert.ok(m.sigma / m.kcal > 0.14, "sans profil, l'incertitude dépasse 14 %");
  // profil complet : exactement Mifflin
  const c = mifflinPartiel(ALEX);
  assert.equal(c.kcal, mifflin(ALEX));
  assert.deepEqual(c.manques, []);
  assert.equal(r(c.sigma), r(0.08 * c.kcal));
});

test("chaque donnée ajoutée réduit l'incertitude ; le sexe connu prend le poids de référence de son sexe", () => {
  const etapes: ProfilPartiel[] = [RIEN, { ...RIEN, kg: 80 }, { ...RIEN, kg: 80, sexe: "h" }, { sexe: "h", kg: 80, cm: null, age: 39 }, { sexe: "h", kg: 80, cm: 183, age: 39 }];
  const s = etapes.map((p) => mifflinPartiel(p).sigma / mifflinPartiel(p).kcal);
  for (let i = 1; i < s.length; i++) assert.ok(s[i]! < s[i - 1]!, `étape ${i} : ${s[i]} ≥ ${s[i - 1]}`);
  assert.equal(mifflinPartiel({ ...RIEN, sexe: "f" }).kcal, 10 * 64 + 6.25 * 163 - 200 - 161);
});

test("choix du métabolisme : sans rien, « defaut » avec ses manques (plus jamais null)", () => {
  const b = choisirBmr("auto", { balance: null, maigre: null, profil: null, partiel: { ...RIEN, kg: 80 } }, LUNDI);
  assert.equal(b.methode, "defaut");
  assert.deepEqual(b.manques, ["taille", "age", "sexe"]);
  assert.equal(choisirBmr("mifflin", { balance: null, maigre: null, profil: null }, LUNDI).methode, "defaut");
});

/** Journal de `n` jours consécutifs finissant à `fin` ; kcal(jour) au choix. */
function journal(fin: number, n: number, kcal: (j: number) => number): ApportJour[] {
  return Array.from({ length: n }, (_, i) => decaler(fin, -i)).map((jour) => ({ jour, kcal: kcal(jour) }));
}

test("habitudes, moins de 14 jours tenus : une semaine de repas puis plus rien, la moyenne des jours tenus sert encore 3 semaines après", () => {
  const sem = journal(decaler(LUNDI, -1), 7, (j) => (new Date(j).getDay() === 6 ? 3200 : 2200));
  const e = apportsHabitudes(sem, decaler(LUNDI, 21))!;
  assert.equal(e.methode, "moyenne");
  assert.equal(e.n, 7);
  assert.equal(r(e.kcal), r((6 * 2200 + 3200) / 7));
  assert.ok(e.sigma > 0);
  // au-delà de 90 jours, plus d'habitude
  assert.equal(apportsHabitudes(sem, decaler(LUNDI, 95)), null);
  assert.equal(apportsHabitudes([], LUNDI), null);
  // un jour ne s'estime qu'avec les jours d'avant
  assert.equal(apportsHabitudes(sem, decaler(LUNDI, -7)), null);
});

test("habitudes, 14 jours et plus : le lundi, la moyenne des lundis du mois", () => {
  const mois = journal(decaler(LUNDI, -1), 28, (j) => (new Date(j).getDay() === 1 ? 1800 : 2500));
  const e = apportsHabitudes(mois, LUNDI)!;
  assert.equal(e.methode, "jourSemaine");
  assert.equal(e.n, 4);
  assert.equal(e.jours, 28);
  assert.equal(r(e.kcal), 1800);
  const mardi = apportsHabitudes(mois, decaler(LUNDI, 1))!;
  assert.equal(r(mardi.kcal), 2500);
  // jours à zéro (journal ouvert sans rien) : non comptés
  assert.equal(apportsHabitudes([{ jour: decaler(LUNDI, -1), kcal: 0 }], LUNDI), null);
});

test("densité de la variation de poids (Forbes, Hall 2008) : plus de graisse, plus de kcal par kg ; 7 700 vers 30 kg de graisse", () => {
  assert.ok(densiteVariation(10) < densiteVariation(20));
  assert.ok(densiteVariation(40) > 7500 && densiteVariation(40) < KCAL_KG_GRAS);
  assert.equal(r(densiteVariation(11)), r((11 / 21.4) * 9440 + (10.4 / 21.4) * 1816));
});

test("pente des pesées par moindres carrés, avec son erreur type", () => {
  const p = Array.from({ length: 10 }, (_, i) => ({ date: LUNDI + i * 2 * 86_400_000, kg: 80 - 0.1 * i * 2 + (i % 2 ? 0.3 : -0.3) }));
  const reg = penteRegression(p)!;
  assert.ok(Math.abs(reg.pente + 0.1) < 0.03, `pente ${reg.pente}`);
  assert.ok(reg.erreur > 0);
  assert.equal(penteRegression(p.slice(0, 2)), null);
});

/** 28 jours : 2 500 kcal/j mangés, −0,5 kg/sem. (pesée tous les 2 jours, ±0,4 kg d'eau), formule à 2 600 ± 10 %. */
function scenario(joursApports = 28, pesees = 14) {
  const fin = decaler(LUNDI, -1);
  const apports = journal(fin, joursApports, () => 2500);
  const p = Array.from({ length: pesees }, (_, i) => {
    const jour = decaler(fin, -27 + i * 2);
    return { date: jour + 7 * 3_600_000, kg: 80 - (0.5 / 7) * i * 2 + (i % 3 === 0 ? 0.4 : i % 3 === 1 ? -0.4 : 0) };
  });
  return { apports, pesees: p, formule: Array.from({ length: 28 }, () => ({ kcal: 2600, sigma: 260 })), grasPct: 20, sexe: "h" as const };
}

test("recalage : 2 500 mangées et −0,5 kg/sem. → dépense observée ≈ 2 950 ; le facteur va vers elle, la précision monte", () => {
  const rec = recaler(scenario())!;
  assert.ok(Math.abs(rec.kgSemaine + 0.5) < 0.1, `kg/sem ${rec.kgSemaine}`);
  assert.ok(Math.abs(rec.observee - 2950) < 120, `observée ${rec.observee}`);
  assert.ok(rec.facteur > 1.05 && rec.facteur < rec.observee / 2600, `facteur ${rec.facteur}`);
  assert.ok(rec.sigmaRel < 0.08, `σ ${rec.sigmaRel}`); // journal supposé juste à 10 % (D2) : 0,072 ; 0,05 quand il l'était à 3 %
  // sans mesure de gras : densité de population, incertitude plus large
  const sans = recaler({ ...scenario(), grasPct: null })!;
  assert.ok(sans.sigmaRel > rec.sigmaRel);
});

test("recalage : rien sous 14 jours de journal ou 4 pesées sur 14 jours ; facteur borné", () => {
  assert.equal(recaler(scenario(13)), null);
  assert.equal(recaler(scenario(28, 3)), null);
  assert.equal(recaler({ ...scenario(), pesees: scenario().pesees.slice(0, 6) }), null); // 10 jours d'étendue
  const fou = recaler({ ...scenario(), apports: scenario().apports.map((a) => ({ ...a, kcal: 9000 })) })!;
  // le journal n'est cru qu'à 10 % (D2) : même absurde (9 000 kcal), il tire le facteur à 1,20 et non plus jusqu'à la borne 1,35
  assert.ok(fou.facteur > 1.15 && fou.facteur <= 1.35, `facteur ${fou.facteur}`);
});

const BMR_DEFAUT: Bmr = { ...mifflinPartiel(RIEN), estime: true, methode: "defaut", auto: true };
const BMR_ALEX: Bmr = { kcal: mifflin(ALEX), estime: true, sigma: 0.08 * mifflin(ALEX), methode: "mifflin", auto: true };

test("dépense : sans pas, 5 000 pas par défaut ; la précision monte du profil vide au recalage", () => {
  const vide = bilanJour({ bmr: BMR_DEFAUT, seances: [], pas: null, apports: null, kg: null, enCours: false });
  assert.equal(vide.neat!.defaut, true);
  assert.equal(vide.neat!.pasHorsSport, 5000);
  assert.equal(vide.depense.precision, "faible");
  const profil = bilanJour({ bmr: BMR_ALEX, seances: [], pas: null, apports: null, kg: 78, enCours: false });
  assert.equal(profil.depense.precision, "moyenne");
  const pas = bilanJour({ bmr: BMR_ALEX, seances: [], pas: 8000, apports: 2400, kg: 78, enCours: false });
  assert.equal(pas.depense.precision, "bonne");
  assert.equal(pas.neat!.defaut, false);
  const recale = bilanJour({ bmr: BMR_ALEX, seances: [], pas: 8000, apports: 2400, kg: 78, enCours: false, recalage: { facteur: 1.1, sigmaRel: 0.04 } });
  assert.equal(recale.depense.precision, "elevee");
  assert.equal(r(recale.depense.kcal), r(pas.depense.kcal * 1.1));
  assert.equal(r(recale.ajustement), r(pas.depense.kcal * 0.1));
  assert.equal(recale.depense.recalee, true);
  // la barre fait toujours la dépense
  assert.equal(r(segmentsDepense(recale).reduce((a, s) => a + s.kcal, 0)), r(recale.depense.kcal));
  assert.ok(vide.depense.sigma > profil.depense.sigma && profil.depense.sigma > pas.depense.sigma && pas.depense.sigma > recale.depense.sigma);
});

test("journal vide : apports estimés par les habitudes, solde estimé ; journal tenu : il l'emporte", () => {
  const habitudes = { kcal: 2300, methode: "moyenne" as const, n: 7, jours: 7, sigma: 400, precision: "faible" as const };
  const b = bilanJour({ bmr: BMR_ALEX, seances: [], pas: 8000, apports: null, habitudes, kg: 78, enCours: false });
  assert.equal(b.apports, 2300);
  assert.equal(b.recharge!.source, "habitudes");
  assert.equal(b.soldeEstime, true);
  assert.equal(r(b.solde!), r(2300 - b.depense.kcal));
  assert.equal(r(b.digestion.kcal), 230);
  assert.equal(b.digestion.duJournal, false);
  const j = bilanJour({ bmr: BMR_ALEX, seances: [], pas: 8000, apports: 2000, habitudes, kg: 78, enCours: false });
  assert.equal(j.apports, 2000);
  assert.deepEqual(j.recharge, { source: "journal" });
  assert.equal(j.soldeEstime, false);
  const rien = bilanJour({ bmr: BMR_ALEX, seances: [], pas: 8000, apports: null, kg: 78, enCours: false });
  assert.equal(rien.apports, null);
  assert.equal(rien.solde, null);
  assert.equal(rien.recharge, null);
});
