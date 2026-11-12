// Macros, D15 à D18 (planche des écrans validée le 01/11) : ce que l'écran Objectifs lit. Niveau en prise de muscle, étape à 6 mois
// quand la cible est irréaliste, activité hors sport cachée si la dépense est mesurée, kcal à la dizaine avec fourchette.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { CLE_GESTE_CIBLE, gesteGarder, noteCibleVisible } from "../src/nutrition/objectifs-calc.ts";
import { garderMaCible, lireGesteCible, objectifDetailCalcule, viserEtape } from "../src/db/depots/objectifs.ts";
import { ecrireReglage, lireReglage } from "../src/db/depots/reglages.ts";
import { ajouterGras } from "../src/ecrans/mesures/corps-donnees.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { decalerJour, objectifDetail } from "../src/nutrition/calculs.ts";
import { MOIS_ETAPE, objectifNutrition, type ChargeRegle, type HistoriqueRegle, type NiveauEntrainement, type ObjectifRegle, type ProfilRegle } from "../src/nutrition/regle.ts";

const proche = (a: number | null | undefined, b: number, e = 1) => assert.ok(a != null && Math.abs(a - b) <= e, `${a} ≠ ${b} (±${e})`);
const JOUR = 86_400_000;
const alex: ProfilRegle = { sexe: "h", age: 39, tailleCm: 180, poidsKg: 78, grasPct: 14.2, niveau: "intermediaire", activite: "debout", declarations: {} };
const femme: ProfilRegle = { sexe: "f", age: 35, tailleCm: 165, poidsKg: 65, grasPct: 28, niveau: "intermediaire", activite: "debout", declarations: {} };
const prise = (cibleKg: number | null = null, grasCiblePct: number | null = null): ObjectifRegle => ({ type: "prise", rythmeSouhaitePctSemaine: null, poidsCibleKg: cibleKg, grasCiblePct });
const repos = (n = 3, nette = 250): ChargeRegle => ({ seancesParSemaine: n, depenseNetteSeanceKcal: nette, jour: "repos" });
const mesuree: HistoriqueRegle = { depenseMesuree28j: { kcal: 2858, joursAvecApports: 28 }, depenseCalculee28j: 2858, perteRecentePct12Sem: null, joursAvecApports28j: 28 };
const sans: HistoriqueRegle = { depenseMesuree28j: null, depenseCalculee28j: null, perteRecentePct12Sem: null };

// ---- D15 : le niveau d'entraînement remplace le rythme en prise de muscle ----------------------------------------------------------

test("D15 : en prise, l'excédent suit le niveau (15 / 10 / 5 % de la dépense), jamais un rythme", () => {
  const par = (niveau: NiveauEntrainement) => objectifNutrition({ ...alex, niveau }, prise(), repos(), mesuree);
  assert.deepEqual([par("debutant").ecartKcal, par("intermediaire").ecartKcal, par("avance").ecartKcal], [429, 286, 143]);
  assert.deepEqual([par("debutant").excedentPctDepense, par("intermediaire").excedentPctDepense, par("avance").excedentPctDepense], [0.15, 0.1, 0.05]);
  // un rythme vaut seulement « je veux prendre » : il ne change plus rien aux kcal
  const lent = objectifNutrition(alex, { ...prise(), rythmeSouhaitePctSemaine: 0.1 }, repos(), mesuree);
  assert.equal(lent.ecartKcal, 286);
  // plafond de 500 kcal
  assert.equal(objectifNutrition({ ...alex, niveau: "debutant" }, prise(), repos(), { ...mesuree, depenseMesuree28j: { kcal: 4000, joursAvecApports: 28 } }).ecartKcal, 500);
  // la sèche garde son rythme et n'a pas d'excédent
  const seche = objectifNutrition(alex, { type: "seche", rythmeSouhaitePctSemaine: 0.5, poidsCibleKg: null, grasCiblePct: null }, repos(), mesuree);
  assert.equal(seche.excedentPctDepense, null);
});

test("D15 : objectifDetail garde une prise sans rythme ; une sèche à rythme 0 devient le maintien", () => {
  const profil = { sexe: "h" as const, tailleCm: 180, poidsKg: 78, age: 39 };
  const compo = { grasPct: 14.2, cibleKg: 82, grasCiblePct: 12.2 };
  assert.equal(objectifDetail(profil, "repos", 0.25, "debout", compo).type, "prise");
  assert.equal(objectifDetail(profil, "repos", 0, "debout", undefined).type, "maintien");
  // sans rythme : la sèche à rythme 0 ne ferait rien, la prise reste une prise
  assert.equal(objectifDetail(profil, "repos", 0, "debout", compo).type, "prise");
});

// ---- D16 : cible irréaliste → étape à 6 mois au même % de gras --------------------------------------------------------------------

test("D16 : 78 kg à 14,2 % vers 82 kg à 12,2 % → étape de 6 mois : 79 kg à 12,2 %", () => {
  const r = objectifNutrition(alex, prise(82, 12.2), repos(), mesuree);
  assert.equal(r.cible!.realiste, false);
  const e = r.cible!.etape!;
  assert.equal(MOIS_ETAPE, 6);
  assert.deepEqual([e.mois, e.poidsKg, e.grasPct], [6, 79, 12.2]);
  proche(e.poidsExactKg, 79, 0.5);
  assert.ok(e.gainMaigreKg > 2 && e.gainMaigreKg < r.cible!.gainMaigreKg);
  // une cible réaliste n'a pas d'étape
  const ok = objectifNutrition(alex, prise(79.5, 12.2), repos(), mesuree);
  assert.equal(ok.cible!.realiste, true);
  assert.equal(ok.cible!.etape, null);
  // pas de cible : pas d'évaluation
  assert.equal(objectifNutrition(alex, prise(), repos(), mesuree).cible, null);
});

test("D16 : la note se montre tant que la cible est irréaliste et n'est pas gardée ; « Garder ma cible » la range jusqu'à un autre choix", () => {
  const irrealiste = { realiste: false };
  assert.equal(noteCibleVisible(irrealiste, null, 82, 12.2), true);
  assert.equal(noteCibleVisible({ realiste: true }, null, 82, 12.2), false);
  assert.equal(noteCibleVisible(null, null, 82, 12.2), false);
  assert.equal(gesteGarder(82, 12.2), "garder:82:12.2");
  assert.equal(noteCibleVisible(irrealiste, gesteGarder(82, 12.2), 82, 12.2), false);
  assert.equal(noteCibleVisible(irrealiste, gesteGarder(82, 12.2), 83, 12.2), true, "une autre cible rouvre la note");
});

test("D16 : « Viser 79 kg à 12,2 % » écrit le poids cible (le % de gras ne bouge pas) ; « Garder ma cible » est local", async () => {
  const { db } = await baseDeTest();
  await ecrireReglage(db, "nutri_poids_cible", "82");
  await ecrireReglage(db, "nutri_gras_cible", "12.2");
  await garderMaCible(db);
  assert.equal(await lireGesteCible(db), "garder:82:12.2");
  await viserEtape(db, { poidsKg: 79 });
  assert.equal(await lireReglage(db, "nutri_poids_cible"), "79");
  assert.equal(await lireReglage(db, "nutri_gras_cible"), "12.2");
  assert.equal(await lireGesteCible(db), null);
  assert.equal(CLE_GESTE_CIBLE, "nutri_cible_geste");
});

test("D16 : l'étape sort aussi du dépôt (objectifDetailCalcule) pour le cas d'Alex", async () => {
  const { db } = await baseDeTest();
  const t = new Date(2026, 10, 1, 12).getTime();
  await ecrireReglage(db, "sexe", "h");
  await ecrireReglage(db, "naissance", "1987-05-14");
  await ajouterMensuration(db, "taille", 180, t - JOUR);
  await ajouterPesee(db, 78, t - 3_600_000);
  assert.ok(await ajouterGras(db, 14.2, t - 1_800_000));
  await ecrireReglage(db, "nutri_poids_cible", "82");
  await ecrireReglage(db, "nutri_gras_cible", "12.2");
  await ecrireReglage(db, "nutri_rythme", "0.25");
  await ecrireReglage(db, "niveau_sport", "2");
  for (let i = 1; i <= 28; i++) {
    const depense = JSON.stringify({ kcal: 2858, recalee: true, en_cours: false, apports: { kcal: 2700, source: "journal" } });
    await db.runAsync("INSERT INTO jour_energie (jour, depense, seances, maj_le) VALUES (?,?,?,?)", [decalerJour("2026-11-01", -i), depense, "[]", t]);
  }
  const d = (await objectifDetailCalcule(db, "repos", t))!;
  assert.deepEqual([d.cible!.etape!.mois, d.cible!.etape!.poidsKg, d.cible!.etape!.grasPct], [6, 79, 12.2]);
  assert.equal(d.ecartAfficheKcal, 290);
  // repos = moyenne de la semaine (2 858 + 286) moins la part des séances ; à la dizaine, avec sa fourchette
  const k = d.kcalAffichees!;
  assert.equal(k.valeur % 10, 0);
  proche(k.valeur, d.kcal!, 5);
  assert.ok(k.bas < k.valeur && k.valeur < k.haut);
  proche(d.kcalMoyenneSemaine, 2858 + 286, 1);
});

// ---- D17 : l'activité hors sport n'est demandée que sans mesure ------------------------------------------------------------------

test("D17 : `activiteVisible` seulement quand la dépense vient d'une formule", () => {
  assert.equal(objectifNutrition(alex, prise(), repos(), mesuree).activiteVisible, false);
  assert.equal(objectifNutrition(alex, prise(), repos(), { ...mesuree, depenseMesuree28j: null, depenseCalculee28j: 2700 }).activiteVisible, false);
  assert.equal(objectifNutrition(alex, prise(), repos(), sans).activiteVisible, true);
  // le réglage « assise / debout / physique » ne change pas une dépense mesurée
  const assise = objectifNutrition({ ...alex, activite: "assise" }, prise(), repos(), mesuree);
  assert.equal(assise.depenseEntretienKcal, 2858);
});

// ---- D18 : kcal à la dizaine, avec fourchette ---------------------------------------------------------------------------------------

test("D18 : exemple B (femme, formule, sèche) : kcal à la dizaine, fourchette ± 10 %, 6 jours sur 14, glucides par kg, rythme maximal", () => {
  const r = objectifNutrition(femme, { type: "seche", rythmeSouhaitePctSemaine: 0.5, poidsCibleKg: null, grasCiblePct: null }, repos(), { ...sans, joursAvecApports28j: 6 });
  assert.equal(r.kcalAffichees!.valeur % 10, 0);
  proche(r.kcalAffichees!.valeur, r.kcal!, 5);
  assert.ok(r.kcalAffichees!.bas < r.kcalAffichees!.valeur && r.kcalAffichees!.valeur < r.kcalAffichees!.haut);
  assert.equal(r.incertitudePct, 10);
  proche(r.depenseAffichee!.haut - r.depenseAffichee!.valeur, 199, 10);
  assert.equal(r.depenseAffichee!.valeur % 10, 0);
  assert.deepEqual(r.joursJournal, { tenus: 6, requis: 14, restants: 8 });
  assert.equal(r.glucidesParKg, 2.1);
  assert.deepEqual(r.bandeGlucidesParKg, [3, 5]);
  assert.ok(r.alertes.includes("glucidesBas"));
  assert.deepEqual(r.rythmeMax, { pctSemaine: 0.5, kgSemaine: 0.33 });
  assert.equal(r.excedentPctDepense, null);
});

test("D18 : dépense mesurée → pas de compte de jours ; kcal d'Alex 2 890 (2 740 à 3 030), écart 290", () => {
  const r = objectifNutrition(alex, prise(82, 12.2), repos(6, 300), mesuree);
  assert.equal(r.joursJournal, null);
  assert.equal(r.ecartAfficheKcal, 290);
  assert.deepEqual(r.depenseAffichee, { valeur: 2860, bas: 2720, haut: 3000 });
  assert.deepEqual(r.kcalAffichees, { valeur: 2890, bas: 2740, haut: 3030 });
});
