// Règle des macros (docs/MACROS-SOURCES.md § 9, D1 à D14) : un test par règle et par décision, le cas d'Alex, les
// garde-fous (mineurs, grossesse, allaitement, 65 ans et plus), les exemples de docs/CODE-MACROS.md. Valeurs vérifiées à la main.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as calculs from "../src/nutrition/calculs.ts";
import { kcalObjectif, objectifAuto, objectifDetail, sucresParDefaut } from "../src/nutrition/calculs.ts";
import {
  FACTEUR_ACTIVITE,
  REGLE,
  bandeGlucides,
  evaluerCible,
  facteurAgeMaigre,
  metabolismeMifflin,
  metabolismeTenHaaf,
  objectifNutrition,
  plafondMaigreMoisKg,
  poidsReference,
  type ChargeRegle,
  type HistoriqueRegle,
  type ObjectifRegle,
  type ProfilRegle,
} from "../src/nutrition/regle.ts";
import { ERREUR_JOURNAL, densiteVariation } from "../src/ecrans/energie-precision.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";

const proche = (a: number | null, b: number, e = 1) => assert.ok(a != null && Math.abs(a - b) <= e, `${a} ≠ ${b} (±${e})`);

const alex: ProfilRegle = { sexe: "h", age: 39, tailleCm: 180, poidsKg: 78, grasPct: 14.2, niveau: "intermediaire", activite: "debout", declarations: {} };
const femme: ProfilRegle = { sexe: "f", age: 35, tailleCm: 165, poidsKg: 65, grasPct: 28, niveau: "intermediaire", activite: "debout", declarations: {} };
const maintien: ObjectifRegle = { type: "maintien", rythmeSouhaitePctSemaine: null, poidsCibleKg: null, grasCiblePct: null };
const repos = (n = 3, extra: Partial<ChargeRegle> = {}): ChargeRegle => ({ seancesParSemaine: n, depenseNetteSeanceKcal: 300, jour: "repos", ...extra });
const entrainement = (n = 3, extra: Partial<ChargeRegle> = {}): ChargeRegle => repos(n, { jour: "entrainement", ...extra });
const mesuree = (kcal: number, jours = 28): HistoriqueRegle => ({ depenseMesuree28j: { kcal, joursAvecApports: jours }, depenseCalculee28j: kcal, perteRecentePct12Sem: null });
const sans: HistoriqueRegle = { depenseMesuree28j: null, depenseCalculee28j: null, perteRecentePct12Sem: null };
const calc = (p: ProfilRegle, o: ObjectifRegle, c: ChargeRegle, h: HistoriqueRegle = sans) => objectifNutrition(p, o, c, h);

// ---- D1 : dépense d'entretien -------------------------------------------------------------------------------------------

test("D1 : la dépense mesurée (≥ 14 jours d'apports) passe devant la calculée, puis la formule", () => {
  const m = calc(alex, maintien, repos(6), mesuree(2858));
  assert.equal(m.source, "mesuree");
  assert.equal(m.depenseEntretienKcal, 2858);
  assert.equal(m.incertitudePct, 5);
  assert.equal(m.estimationAAffiner, false);
  // 13 jours d'apports seulement : la dépense calculée (28 jours) prend la place
  const c = calc(alex, maintien, repos(6), { ...mesuree(2858, 13), depenseCalculee28j: 2700 });
  assert.equal(c.source, "calculee");
  assert.equal(c.depenseEntretienKcal, 2700);
  assert.equal(c.incertitudePct, 10);
  // rien : la formule, avec « estimation à affiner »
  const f = calc(alex, maintien, repos(6), sans);
  assert.equal(f.source, "formule");
  assert.equal(f.estimationAAffiner, true);
  assert.ok(f.alertes.includes("estimationAAffiner"));
  assert.ok(!m.alertes.includes("estimationAAffiner"));
});

test("D1 : formule = repos × facteur hors sport + n/7 × 300 ; « assise » vaut 1,35", () => {
  assert.deepEqual(FACTEUR_ACTIVITE, { assise: 1.35, debout: 1.4, physique: 1.6 });
  const f = calc(alex, maintien, repos(3));
  proche(f.depenseEntretienKcal, metabolismeMifflin(alex) * 1.4 + (3 / 7) * 300, 1);
  const assise = calc({ ...alex, activite: "assise" }, maintien, repos(3));
  proche(assise.depenseEntretienKcal, metabolismeMifflin(alex) * 1.35 + (3 / 7) * 300, 1);
});

test("D1 : formule réduite de 5 % après une perte de 5 % en 12 semaines, jamais la dépense mesurée", () => {
  const sec = calc(alex, maintien, repos(3));
  const perte = calc(alex, maintien, repos(3), { ...sans, perteRecentePct12Sem: 6 });
  proche(perte.depenseEntretienKcal, sec.depenseEntretienKcal! * 0.95, 1);
  assert.deepEqual(perte.ajustements, ["perteRecente"]);
  const petite = calc(alex, maintien, repos(3), { ...sans, perteRecentePct12Sem: 3 });
  assert.equal(petite.depenseEntretienKcal, sec.depenseEntretienKcal);
  const mes = calc(alex, maintien, repos(3), { ...mesuree(2858), perteRecentePct12Sem: 8 });
  assert.equal(mes.depenseEntretienKcal, 2858);
  assert.deepEqual(mes.ajustements, []);
});

// ---- D2 : erreur du journal ---------------------------------------------------------------------------------------------

test("D2 : l'erreur du journal passe de 3 % à 10 %", () => {
  assert.equal(ERREUR_JOURNAL, 0.1);
});

// ---- D3 : formules de repos ----------------------------------------------------------------------------------------------

test("D3 : Mifflin-St Jeor, Ten Haaf si 3 séances par semaine depuis 8 semaines ; plus de « Katch-McArdle » dans la règle", () => {
  proche(metabolismeMifflin(alex), 10 * 78 + 6.25 * 180 - 5 * 39 + 5, 0.01); // 1 715
  proche(metabolismeTenHaaf(alex), 11.936 * 78 + 587.728 * 1.8 - 8.129 * 39 + 191.027 + 29.279, 0.01);
  proche(metabolismeTenHaaf(femme), 11.936 * 65 + 587.728 * 1.65 - 8.129 * 35 + 29.279, 0.01);
  assert.equal(calc(alex, maintien, repos(3)).methodeRepos, "mifflin");
  assert.equal(calc(alex, maintien, repos(3, { regulier8Semaines: true })).methodeRepos, "tenHaaf");
  proche(calc(alex, maintien, repos(3, { regulier8Semaines: true })).depenseEntretienKcal, metabolismeTenHaaf(alex) * 1.4 + (3 / 7) * 300, 1);
  // avec une mesure, aucune formule de repos n'intervient
  assert.equal(calc(alex, maintien, repos(3), mesuree(2800)).methodeRepos, null);
  assert.equal("katchMcArdle" in calculs, false);
  assert.equal("MAIGRE_MAX_SEMAINE" in calculs, false);
});

// ---- D4 : écart d'énergie en sèche ---------------------------------------------------------------------------------------

const seche = (pct: number | null): ObjectifRegle => ({ type: "seche", rythmeSouhaitePctSemaine: pct, poidsCibleKg: null, grasCiblePct: null });
const kcalPourCent = (p: ProfilRegle) => (p.poidsKg * densiteVariation((p.poidsKg * (p.grasPct ?? 20)) / 100)) / 100 / 7;

test("D4 : déficit = taux hebdomadaire × poids × densité ÷ 7 (0,5 % IMC < 25, 0,75 % de 25 à 29,9, 1,0 % dès 30)", () => {
  const normal = calc(alex, seche(null), repos(3), mesuree(2858));
  proche(normal.ecartKcal, -0.5 * kcalPourCent(alex), 1);
  proche(normal.rythmeEffectifPctSemaine, 0.5, 0.01);
  const surpoids = { ...alex, poidsKg: 88, grasPct: 22 }; // IMC 27,2
  proche(calc(surpoids, seche(null), repos(3), mesuree(3800)).ecartKcal, -0.75 * kcalPourCent(surpoids), 1);
  const obese = { ...alex, poidsKg: 105, grasPct: 30 }; // IMC 32,4
  // à IMC ≥ 30 le taux (1,0 %) dépasse presque toujours 750 kcal : c'est le plafond de 750 qui joue
  assert.equal(calc(obese, seche(null), repos(3), mesuree(4500)).ecartKcal, -Math.round(Math.min(1.0 * kcalPourCent(obese), 0.25 * 4500, 750)));
  // maigre (≤ 15 % chez l'homme) : 0,5 % même à IMC 25 et plus
  const sec = { ...alex, poidsKg: 85, grasPct: 14 }; // IMC 26,2
  proche(calc(sec, seche(null), repos(3), mesuree(3600)).ecartKcal, -0.5 * kcalPourCent(sec), 1);
});

test("D4 : plafonds du déficit (20 % de la dépense, 25 % si IMC ≥ 30, 750 kcal) et rythme plus lent respecté", () => {
  const obese = { ...alex, poidsKg: 150, grasPct: 40, tailleCm: 175 }; // IMC 49 : le taux donnerait plus de 1 000 kcal
  const r = calc(obese, seche(null), repos(3), mesuree(3600));
  assert.equal(r.ecartKcal, -750);
  const petit = { ...femme, poidsKg: 70, grasPct: 35, tailleCm: 160 }; // IMC 27 : 0,75 % ≈ 640 kcal > 20 % de 2 000
  const p = calc(petit, seche(null), repos(3), mesuree(2000));
  assert.equal(p.ecartKcal, -400);
  // un rythme voulu plus lent que le plafond est respecté
  const lent = calc(alex, seche(0.25), repos(3), mesuree(2858));
  proche(lent.ecartKcal, -0.25 * kcalPourCent(alex), 1);
  // plus rapide que le plafond : ramené au plafond, avec l'alerte
  const vite = calc(alex, seche(1.0), repos(3), mesuree(2858));
  proche(vite.ecartKcal, -0.5 * kcalPourCent(alex), 1);
  assert.ok(vite.alertes.includes("rythmeRamene"));
});

// ---- D5 : gain de maigre ---------------------------------------------------------------------------------------------------

test("D5 : gain de maigre au plus 1,0 / 0,5 / 0,25 % du poids par mois, × 0,75 dès 50 ans, × 0,5 dès 65 ans", () => {
  proche(plafondMaigreMoisKg(80, "debutant", 30), 0.8, 0.001);
  proche(plafondMaigreMoisKg(80, "intermediaire", 30), 0.4, 0.001);
  proche(plafondMaigreMoisKg(80, "avance", 30), 0.2, 0.001);
  assert.equal(facteurAgeMaigre(49), 1);
  assert.equal(facteurAgeMaigre(50), 0.75);
  assert.equal(facteurAgeMaigre(64), 0.75);
  assert.equal(facteurAgeMaigre(65), 0.5);
  proche(plafondMaigreMoisKg(80, "intermediaire", 55), 0.3, 0.001);
});

test("D5 : une cible qui demande trop de maigre est irréaliste, avec une fourchette réaliste", () => {
  const e = evaluerCible({ poidsKg: 78, grasPct: 14.2, cibleKg: 82, grasCiblePct: 12.2, niveau: "intermediaire", age: 39, rythmeKgSemaine: 0.25 });
  proche(e.gainMaigreKg, 82 * 0.878 - 78 * 0.858, 0.001);
  assert.equal(e.realiste, false);
  proche(e.plafondMoisKg, 0.39, 0.001);
  proche(e.moisPourCible, 13, 0.1);
  // 4 kg à 0,25 kg/sem = 3,7 mois : la fourchette va de la moitié du plafond au plafond sur ces 3,7 mois
  proche(e.moisSelonRythme, 3.69, 0.02);
  proche(e.fourchetteMaigreKg![0], 0.72, 0.02);
  proche(e.fourchetteMaigreKg![1], 1.44, 0.02);
  // un débutant gagne deux fois plus vite : une cible plus modeste, sur un rythme plus lent, tient dans les repères
  const debutant = evaluerCible({ poidsKg: 78, grasPct: 14.2, cibleKg: 80, grasCiblePct: 14, niveau: "debutant", age: 30, rythmeKgSemaine: 0.1 });
  assert.equal(debutant.realiste, true);
  // rien à gagner : toujours réaliste
  assert.equal(evaluerCible({ poidsKg: 78, grasPct: 20, cibleKg: 72, grasCiblePct: 16, niveau: "avance", age: 40, rythmeKgSemaine: -0.5 }).realiste, true);
});

// ---- D6 : prise ----------------------------------------------------------------------------------------------------------------

const prise = (pct: number | null = null): ObjectifRegle => ({ type: "prise", rythmeSouhaitePctSemaine: pct, poidsCibleKg: null, grasCiblePct: null });

test("D6 : l'excédent de la prise est 15 / 10 / 5 % de la dépense selon le niveau, 500 kcal au plus", () => {
  proche(calc({ ...alex, niveau: "debutant" }, prise(), repos(3), mesuree(2800)).ecartKcal, 420, 1);
  proche(calc({ ...alex, niveau: "intermediaire" }, prise(), repos(3), mesuree(2800)).ecartKcal, 280, 1);
  proche(calc({ ...alex, niveau: "avance" }, prise(), repos(3), mesuree(2800)).ecartKcal, 140, 1);
  assert.equal(calc({ ...alex, niveau: "debutant" }, prise(), repos(3), mesuree(4000)).ecartKcal, 500);
  // D15 : le niveau fixe l'excédent, un rythme en kg par semaine ne compte plus en prise
  assert.equal(calc(alex, prise(0.1), repos(3), mesuree(2800)).ecartKcal, calc(alex, prise(), repos(3), mesuree(2800)).ecartKcal);
  assert.equal(calc(alex, prise(0.9), repos(3), mesuree(2800)).alertes.includes("rythmeRamene"), false);
  assert.equal(calc(alex, prise(), repos(3), mesuree(2800)).excedentPctDepense, 0.1);
});

test("D6 : recomposition à −5 % de la dépense, −10 % pour un débutant ou à IMC ≥ 25", () => {
  const recompo: ObjectifRegle = { type: "recomposition", rythmeSouhaitePctSemaine: null, poidsCibleKg: null, grasCiblePct: null };
  proche(calc(alex, recompo, repos(3), mesuree(2800)).ecartKcal, -140, 1);
  proche(calc({ ...alex, niveau: "debutant" }, recompo, repos(3), mesuree(2800)).ecartKcal, -280, 1);
  proche(calc({ ...alex, poidsKg: 90 }, recompo, repos(3), mesuree(2800)).ecartKcal, -280, 1); // IMC 27,8
});

// ---- Planchers et cohérence hebdomadaire ------------------------------------------------------------------------------------

test("planchers : 1 500 (homme), 1 200 (femme), 1 350 (x) et 30 kcal par kg de maigre", () => {
  const trop = calc(femme, seche(null), repos(0), mesuree(1250));
  assert.equal(trop.kcal, Math.round(Math.max(1200, 30 * 65 * 0.72)));
  assert.ok(trop.planchersAppliques.includes("energie"));
  assert.ok(trop.alertes.includes("plancherEnergie"));
  const homme = calc({ ...alex, poidsKg: 60, grasPct: 12 }, seche(null), repos(0), mesuree(1600));
  assert.ok(homme.kcal! >= 1500);
  assert.ok(calc({ ...femme, sexe: "x" }, seche(null), repos(0), mesuree(1400)).kcal! >= 1350);
});

test("cohérence de la semaine : la moyenne des jours redonne dépense + écart, l'entraînement ajoute la séance", () => {
  const n = 6;
  const r = calc(alex, seche(0.25), repos(n), mesuree(2858));
  const e = calc(alex, seche(0.25), entrainement(n), mesuree(2858));
  proche(((7 - n) * r.kcal! + n * e.kcal!) / 7, r.kcalMoyenneSemaine!, 1);
  proche(r.kcalMoyenneSemaine, 2858 + r.ecartKcal!, 1);
  proche(e.kcal! - r.kcal!, 300, 1);
});

// ---- D7 : protéines -----------------------------------------------------------------------------------------------------------

test("D7 : 1,8 g/kg au maintien et en prise, 2,0 en recomposition et en sèche (2,2 si le déficit dépasse 15 %)", () => {
  assert.equal(calc(alex, maintien, repos(3), mesuree(2858)).proteinesG, Math.round(1.8 * 78));
  assert.equal(calc(alex, prise(), repos(3), mesuree(2858)).proteinesG, Math.round(1.8 * 78));
  // sèche douce : 2,0 + 0,2 (homme à 14,2 % ≤ 15 %) = 2,2
  assert.equal(calc(alex, seche(0.25), repos(3), mesuree(2858)).proteinesG, Math.round(2.2 * 78));
  // sèche de Mme : taux 0,5 % ≈ 14 % de la dépense, pas maigre (28 %) : 2,0
  assert.equal(calc(femme, seche(null), repos(3), mesuree(2200)).proteinesG, Math.round(2.0 * 65));
  const costaud = { ...alex, poidsKg: 85, grasPct: 25 }; // IMC 26,2 : taux 0,75 % ≈ 18 % de la dépense
  const d = calc(costaud, seche(null), repos(3), mesuree(3300));
  assert.ok(-d.ecartKcal! / 3300 > 0.15, String(d.ecartKcal));
  assert.equal(d.proteinesG, Math.round(2.2 * 85));
});

test("D7 : poids de référence plafonné à l'IMC 30, bonus de 50 à 64 ans, bornes et 35 % des kcal", () => {
  const gros = { ...alex, poidsKg: 130, grasPct: 35 }; // IMC 40 : poids de référence 97,2 kg
  proche(poidsReference(130, 180), 97.2, 0.01);
  assert.equal(calc(gros, maintien, repos(3), mesuree(3200)).proteinesG, Math.round(1.8 * 97.2));
  assert.equal(calc({ ...alex, age: 55 }, maintien, repos(3), mesuree(2858)).proteinesG, Math.round(2.0 * 78));
  // jamais plus de 35 % des kcal du jour
  const petit = calc({ ...femme, poidsKg: 90, tailleCm: 160, grasPct: 25 }, seche(null), repos(0), mesuree(1500));
  assert.ok(petit.proteinesG! * 4 <= 0.35 * petit.kcal! + 4);
  assert.ok(REGLE.proteines.min === 1.2 && REGLE.proteines.max === 2.4);
});

// ---- D8 : lipides --------------------------------------------------------------------------------------------------------------

test("D8 : lipides à 25 % de l'énergie moyenne, plancher 0,6 g/kg (homme) ou 0,8 g/kg (femme) et 20 % des kcal du jour", () => {
  const r = calc(alex, maintien, repos(3), mesuree(2858));
  assert.equal(r.lipidesG, Math.round((0.25 * 2858) / 9));
  // grammes constants d'un jour à l'autre
  assert.equal(calc(alex, maintien, entrainement(3), mesuree(2858)).lipidesG, r.lipidesG);
  // sèche dure d'une femme : le plancher par kg (0,8) et celui des 20 % des kcal jouent
  const f = calc(femme, seche(null), repos(0), mesuree(1700));
  assert.ok(f.lipidesG! >= Math.round(0.8 * 65), `${f.lipidesG}`);
  assert.ok(f.lipidesG! * 9 >= 0.2 * f.kcal! - 9);
  assert.ok(f.lipidesG! * 9 <= 0.35 * f.kcal! + 9);
  assert.equal(REGLE.lipides.plancherParKg.h, 0.6);
  assert.equal(REGLE.lipides.plancherParKg.f, 0.8);
});

// ---- D9 : glucides -------------------------------------------------------------------------------------------------------------

test("D9 : glucides = le reste, bandes en g/kg selon la charge du jour", () => {
  assert.deepEqual(bandeGlucides({ jour: "repos" }), [3, 5]);
  assert.deepEqual(bandeGlucides({ jour: "entrainement" }), [4, 7]);
  assert.deepEqual(bandeGlucides({ jour: "entrainement", effort: "endurance", dureeEffortMin: 60 }), [5, 7]);
  assert.deepEqual(bandeGlucides({ jour: "entrainement", effort: "endurance", dureeEffortMin: 120 }), [6, 10]);
  assert.deepEqual(bandeGlucides({ jour: "entrainement", effort: "endurance", dureeEffortMin: 300 }), [8, 12]);
  const r = calc(alex, maintien, repos(6), mesuree(2858));
  proche(r.glucidesG, (r.kcal! - 4 * r.proteinesG! - 9 * r.lipidesG!) / 4, 1);
  const kcalRecalculees = kcalObjectif({ proteines: r.proteinesG!, glucides: r.glucidesG!, lipides: r.lipidesG!, sucres: 0 });
  proche(kcalRecalculees, r.kcal!, 4);
});

test("D9 : sous la bande, les lipides baissent jusqu'à leur plancher, puis l'alerte (facultative)", () => {
  // endurance longue le même jour : 6 g/kg de glucides visés avec peu d'énergie
  const charge = entrainement(3, { effort: "endurance", dureeEffortMin: 150 });
  const sansAlerte = objectifNutrition(femme, seche(null), charge, mesuree(1700), { alerteGlucides: false });
  assert.ok(!sansAlerte.alertes.includes("glucidesBas"));
  const avec = objectifNutrition(femme, seche(null), charge, mesuree(1700));
  assert.ok(avec.alertes.includes("glucidesBas"));
  // le plancher des lipides (0,8 g/kg) tient malgré la bande
  assert.ok(avec.lipidesG! >= Math.round(0.8 * 65));
  // glucides < 130 g : alerte absolue
  const bas = calc({ ...femme, poidsKg: 55, grasPct: 25 }, seche(null), repos(0), mesuree(1500));
  if (bas.glucidesG! < 130) assert.ok(bas.alertes.includes("glucidesSousPlancher"));
});

// ---- D10, D11 : repères --------------------------------------------------------------------------------------------------------

test("D10 : repère des sucres = le plus bas de 100 g et de 20 % des kcal", () => {
  assert.equal(sucresParDefaut(2000), 100);
  assert.equal(sucresParDefaut(1500), 75);
  assert.equal(sucresParDefaut(3000), 100);
  const r = calc(alex, maintien, repos(3), mesuree(2858));
  assert.equal(r.sucresRepereG, 100);
  const p = calc({ ...femme, grasPct: 30 }, seche(null), repos(0), mesuree(1500));
  assert.equal(p.sucresRepereG, Math.round(Math.min(100, (0.2 * p.kcal!) / 4)));
});

test("D11 : fibres = le plus haut de 25 g et de 14 g pour 1 000 kcal (un minimum, jamais un plafond)", () => {
  const grand = calc(alex, maintien, repos(3), mesuree(3600));
  assert.equal(grand.fibresMinG, Math.round((14 * grand.kcal!) / 1000));
  const petit = calc(femme, seche(null), repos(0), mesuree(1500));
  assert.equal(petit.fibresMinG, 25);
});

// ---- D12 : garde-fous ------------------------------------------------------------------------------------------------------------

test("D12 : moins de 18 ans et grossesse → non_calcule, aucun chiffre ; renvoi vers un professionnel", () => {
  for (const p of [{ ...alex, age: 17 }, { ...femme, declarations: { grossesse: true } }]) {
    const r = calc(p, maintien, repos(3), mesuree(2500));
    assert.equal(r.statut, "non_calcule");
    assert.equal(r.kcal, null);
    assert.equal(r.proteinesG, null);
    assert.equal(r.glucidesG, null);
    assert.equal(r.lipidesG, null);
    assert.ok(r.sansChiffres);
    assert.ok(r.renvois.length > 0);
    assert.equal(r.mention, "macros.mention");
  }
  assert.deepEqual(calc({ ...alex, age: 17 }, maintien, repos(3)).raisons, ["mineur"]);
  assert.deepEqual(calc({ ...femme, declarations: { grossesse: true } }, maintien, repos(3)).raisons, ["grossesse"]);
  // 18 ans : calculé
  assert.equal(calc({ ...alex, age: 18 }, maintien, repos(3)).statut, "ok");
  // le détail de l'appli : mineur, valeurs par défaut en repli
  const d = objectifDetail({ sexe: "h", tailleCm: 175, poidsKg: 60, age: 16 }, "repos");
  assert.equal(d.statut, "non_calcule");
  assert.deepEqual(objectifAuto({ sexe: "h", tailleCm: 175, poidsKg: 60, age: 16 }, "repos"), calculs.OBJECTIF_DEFAUT.repos);
});

test("D12 : allaitement → limite : pas d'écart, dépense mesurée, protéines + 19 g, + 500 kcal sans mesure", () => {
  const p = { ...femme, declarations: { allaitement: true } };
  const r = calc(p, seche(null), repos(3), mesuree(2200));
  assert.equal(r.statut, "limite");
  assert.equal(r.ecartKcal, 0);
  const sansAllait = calc(femme, maintien, repos(3), mesuree(2200));
  assert.equal(r.proteinesG! - sansAllait.proteinesG!, 19);
  const f = calc(p, maintien, repos(3));
  const base = calc(femme, maintien, repos(3));
  proche(f.depenseEntretienKcal! - base.depenseEntretienKcal!, 500, 1);
  assert.deepEqual(f.ajustements, ["allaitement"]);
  assert.ok(r.renvois.includes("allaitement"));
});

test("D12 : trouble alimentaire déclaré, IMC < 18,5, perte vers un poids cible d'IMC < 20 → limite, sans chiffres", () => {
  const trouble = calc({ ...alex, declarations: { troubleAlimentaire: true } }, maintien, repos(3), mesuree(2800));
  assert.equal(trouble.statut, "limite");
  assert.ok(trouble.sansChiffres);
  assert.equal(trouble.kcal, null);
  assert.ok(trouble.renvois.includes("professionnel"));
  const maigre = calc({ ...alex, poidsKg: 58 }, maintien, repos(3), mesuree(2400)); // IMC 17,9
  assert.deepEqual([maigre.statut, maigre.sansChiffres, maigre.kcal], ["limite", true, null]);
  assert.ok(maigre.raisons.includes("imcBas"));
  const cible: ObjectifRegle = { type: "seche", rythmeSouhaitePctSemaine: null, poidsCibleKg: 62, grasCiblePct: null }; // IMC 19,1
  const perte = calc(alex, cible, repos(3), mesuree(2800));
  assert.deepEqual([perte.statut, perte.sansChiffres, perte.kcal], ["limite", true, null]);
  assert.ok(perte.raisons.includes("perteImcBas"));
  // une prise vers ce poids n'est pas bloquée
  assert.equal(calc({ ...alex, poidsKg: 62 }, { ...prise(), poidsCibleKg: 70 }, repos(3), mesuree(2400)).statut, "ok");
});

test("D12 : diabète/rein, suivi de l'obésité, chirurgie bariatrique → limite : pas de déficit, protéines 1,2 à 1,6 g/kg", () => {
  for (const cle of ["diabeteOuRein", "traitementObesite", "chirurgieBariatrique"] as const) {
    const p = { ...alex, poidsKg: 95, grasPct: 28, declarations: { [cle]: true } };
    const r = calc(p, seche(null), repos(3), mesuree(2900));
    assert.equal(r.statut, "limite", cle);
    assert.ok(r.ecartKcal! >= 0, `${cle} ${r.ecartKcal}`);
    assert.ok(r.proteinesG! <= Math.round(1.6 * 95) && r.proteinesG! >= Math.round(1.2 * 95), `${cle} ${r.proteinesG}`);
    assert.ok(r.alertes.includes("deficitRefuse"));
    assert.ok(r.renvois.includes("medecinOuDiet"));
  }
});

test("D12 : 65 ans et plus → limite : déficit seulement si IMC ≥ 30 et ≤ 10 % de la dépense, protéines 1,4 à 1,6 g/kg", () => {
  const senior = { ...alex, age: 70 };
  const r = calc(senior, seche(null), repos(3), mesuree(2400));
  assert.equal(r.statut, "limite");
  assert.equal(r.ecartKcal, 0);
  assert.equal(r.proteinesG, Math.round(1.4 * 78));
  const fort = { ...alex, age: 70, poidsKg: 100, grasPct: 33 }; // IMC 30,9
  const d = calc(fort, seche(null), repos(3), mesuree(2600));
  assert.ok(d.ecartKcal! < 0 && d.ecartKcal! >= -260, `${d.ecartKcal}`);
  assert.equal(d.proteinesG, Math.round(1.6 * 97.2 > 1.6 * 100 ? 1.6 * 100 : 1.6 * 97.2));
});

// ---- D13 : cycle -------------------------------------------------------------------------------------------------------------------

test("D13 : aucun ajustement au cycle ; pour une femme, seulement un message facultatif", () => {
  const f = calc(femme, maintien, repos(3), mesuree(2100));
  assert.deepEqual(f.infos, ["cycle"]);
  const h = calc({ ...femme, sexe: "h" }, maintien, repos(3), mesuree(2100));
  assert.deepEqual(h.infos, []);
  // même dépense, mêmes poids et taille : la règle n'a aucune entrée de cycle, et deux appels donnent le même résultat
  assert.deepEqual(calc(femme, maintien, repos(3), mesuree(2100)), f);
});

// ---- D14 : mention ---------------------------------------------------------------------------------------------------------------------

test("D14 : mention « repères généraux » dans chaque résultat, textes fr et en sans mot interdit", () => {
  assert.equal(calc(alex, maintien, repos(3)).mention, "macros.mention");
  assert.equal(calc({ ...alex, age: 15 }, maintien, repos(3)).mention, "macros.mention");
  const fr_ = fr as Record<string, unknown>;
  const en_ = en as Record<string, unknown>;
  assert.equal(fr_["macros.mention"], "Repères généraux, pas un avis médical.");
  assert.equal(en_["macros.mention"], "General guidelines, not medical advice.");
  const cles = Object.keys(fr_).filter((k) => k.startsWith("macros."));
  assert.ok(cles.length > 30);
  for (const c of cles) {
    assert.equal(typeof en_[c], "string", c);
    assert.doesNotMatch(String(fr_[c]), /maladie|traitement|médicament/i, c);
    assert.doesNotMatch(String(en_[c]), /disease|illness|treatment|medication|medicine|\bdrugs?\b/i, c);
  }
});

test("chaque clé que la règle peut rendre existe dans les dictionnaires fr et en", () => {
  const scenarios: [ProfilRegle, ObjectifRegle, ChargeRegle, HistoriqueRegle][] = [
    [{ ...alex, age: 17 }, maintien, repos(3), sans],
    [{ ...femme, declarations: { grossesse: true, allaitement: true } }, maintien, repos(3), sans],
    [{ ...alex, declarations: { troubleAlimentaire: true, diabeteOuRein: true, traitementObesite: true, chirurgieBariatrique: true } }, seche(null), repos(3), sans],
    [{ ...alex, age: 70, poidsKg: 58 }, seche(null), repos(3), sans],
    [alex, { ...seche(1), poidsCibleKg: 62 }, repos(3), { ...sans, perteRecentePct12Sem: 7 }],
    [femme, seche(null), entrainement(3, { effort: "endurance", dureeEffortMin: 200 }), mesuree(1500)],
    [alex, { ...prise(0.25), poidsCibleKg: 82, grasCiblePct: 12.2 }, repos(6), sans],
    [{ ...femme, declarations: { allaitement: true } }, maintien, repos(3), sans],
  ];
  const vus = new Set<string>();
  for (const [p, o, c, h] of scenarios) {
    const r = calc(p, o, c, h);
    for (const k of r.raisons) vus.add(`macros.raison.${k}`);
    for (const k of r.renvois) vus.add(`macros.renvoi.${k}`);
    for (const k of r.alertes) vus.add(`macros.alerte.${k}`);
    for (const k of r.infos) vus.add(`macros.info.${k}`);
    for (const k of r.ajustements) vus.add(`macros.ajustement.${k}`);
    for (const k of r.planchersAppliques) vus.add(`macros.plancher.${k}`);
    if (r.source) vus.add(`macros.source.${r.source}`);
    if (r.methodeRepos) vus.add(`macros.methode.${r.methodeRepos}`);
    vus.add(r.mention);
  }
  for (const k of vus) {
    assert.ok(k in fr, `fr ${k}`);
    assert.ok(k in en, `en ${k}`);
  }
  assert.ok(vus.size >= 20, String(vus.size));
});

// ---- Le cas d'Alex et les exemples ----------------------------------------------------------------------------------------------------

test("Alex (78 kg, 14,2 % de gras, 39 ans, 180 cm, 6 séances, cible 82 kg à 12,2 %) : cible de maigre irréaliste, étape à 6 mois, kcal proches de la dépense mesurée (planche, D15 à D18)", () => {
  const p = { sexe: "h" as const, tailleCm: 180, poidsKg: 78, age: 39 };
  const contexte = { niveau: "intermediaire" as const, seancesParSemaine: 6, regulier8Semaines: true, historique: mesuree(2858) };
  const compo = { grasPct: 14.2, cibleKg: 82, grasCiblePct: 12.2 };
  // D15 : pas de rythme en prise de muscle, le niveau fixe l'excédent
  const r = objectifDetail(p, "repos", 0, "debout", compo, contexte);
  const e = objectifDetail(p, "entrainement", 0, "debout", compo, contexte);
  assert.equal(r.statut, "ok");
  assert.equal(r.type, "prise");
  assert.equal(r.source, "mesuree");
  assert.equal(r.depenseEntretienKcal, 2858);
  assert.equal(r.ecartKcal, 286);
  assert.equal(r.ecartAfficheKcal, 290);
  assert.equal(r.excedentPctDepense, 0.1);
  // la cible de maigre est irréaliste : 5,1 kg de maigre, 0,39 kg par mois, 13 mois
  assert.ok(r.alertes.includes("cibleMaigreIrrealiste"));
  assert.equal(r.cible!.realiste, false);
  proche(r.cible!.gainMaigreKg, 5.07, 0.01);
  proche(r.cible!.plafondMoisKg, 0.39, 0.001);
  proche(r.cible!.moisPourCible!, 13, 0.05);
  assert.equal(r.cible!.moisSelonRythme, null);
  // D16 : étape à 6 mois au même % de gras : 79 kg à 12,2 %, + 2,3 kg de maigre
  assert.deepEqual([r.cible!.etape!.mois, r.cible!.etape!.poidsKg, r.cible!.etape!.grasPct], [6, 79, 12.2]);
  proche(r.cible!.etape!.gainMaigreKg, 2.34, 0.01);
  // fourchette réaliste sur l'année au plus : de la moitié du plafond au plafond
  proche(r.cible!.fourchetteMaigreKg![0], 2.34, 0.01);
  proche(r.cible!.fourchetteMaigreKg![1], 4.68, 0.01);
  assert.equal(r.plan!.realisme.realiste, r.cible!.realiste);
  proche(r.plan!.realisme.gainMaigreKg, r.cible!.gainMaigreKg, 0.001);
  assert.ok(r.plan!.semaines! > 16, "la durée suit le gain de maigre réaliste");
  // kcal de la semaine : dépense + 10 % ; 6 séances de 300 kcal : repos 2 887, entraînement 3 187
  proche(r.kcalMoyenneSemaine, 3144, 1);
  proche(r.kcal, 2887, 1);
  proche(e.kcal, 3187, 1);
  proche(((7 - 6) * r.kcal! + 6 * e.kcal!) / 7, r.kcalMoyenneSemaine!, 1);
  // macros : protéines 1,8 g/kg = 140, lipides 25 % de la moyenne = 87, glucides = le reste (≈ 385 et 460), dans les repères
  assert.equal(r.proteinesG, 140);
  assert.equal(r.lipidesG, 87);
  proche(r.glucidesG, 385, 2);
  proche(e.glucidesG, 460, 2);
  proche(kcalObjectif({ proteines: r.proteinesG!, glucides: r.glucidesG!, lipides: r.lipidesG!, sucres: 0 }), r.kcal!, 4);
  assert.ok(!r.alertes.includes("glucidesBas"));
  assert.deepEqual([r.fibresMinG, e.fibresMinG, r.sucresRepereG], [40, 45, 100]);
  // D18 : kcal à la dizaine, fourchette = ± 5 % de la dépense mesurée (± 143 kcal)
  assert.deepEqual(r.kcalAffichees, { valeur: 2890, bas: 2740, haut: 3030 });
  assert.deepEqual(e.kcalAffichees, { valeur: 3190, bas: 3040, haut: 3330 });
  assert.deepEqual(r.depenseAffichee, { valeur: 2860, bas: 2720, haut: 3000 });
  // D17 : activité hors sport cachée (dépense mesurée) ; plus de jauge de journal
  assert.equal(r.activiteVisible, false);
  assert.equal(r.joursJournal, null);
  assert.equal(r.mention, "macros.mention");
});

test("exemple A de docs/CODE-MACROS.md : Alex au maintien, dépense mesurée 2 858 → repos 2 601 kcal, entraînement 2 901", () => {
  const r = calc(alex, maintien, repos(6), mesuree(2858));
  const e = calc(alex, maintien, entrainement(6), mesuree(2858));
  assert.equal(r.kcal, 2601);
  assert.equal(e.kcal, 2901);
  assert.deepEqual([r.proteinesG, r.lipidesG], [140, 79]);
  proche(r.glucidesG, 331, 3);
  assert.equal(r.kcalMoyenneSemaine, 2858);
});

test("exemple B : femme de 35 ans, 165 cm, 65 kg, 28 % de gras, 3 séances de 250 kcal, formule Mifflin → repos 1 883 kcal", () => {
  const charge = { seancesParSemaine: 3, depenseNetteSeanceKcal: 250, jour: "repos" as const };
  const r = calc(femme, maintien, charge);
  proche(metabolismeMifflin(femme), 1345, 0.5);
  proche(r.depenseEntretienKcal, 1345 * 1.4 + (3 / 7) * 250, 1);
  proche(r.kcal, 1883, 2);
  assert.deepEqual([r.proteinesG, r.methodeRepos, r.source], [117, "mifflin", "formule"]);
  proche(r.lipidesG, 55, 1);
});

test("sexe « x » : la moyenne des deux constantes, mêmes planchers que la règle", () => {
  const x = { ...femme, sexe: "x" as const };
  proche(metabolismeMifflin(x), metabolismeMifflin(femme) + 83, 0.01);
  assert.equal(calc(x, maintien, repos(3)).statut, "ok");
});
