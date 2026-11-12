// % de gras dans les objectifs (docs/OBJECTIF-GRAS.md) : objectif de
// composition (78 kg à 14 % vers 82 kg à 13 %), incohérences, formule au poids sans % de gras, cible sans base ignorée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ciblesVisibles, kcalObjectif, objectifAuto, objectifDetail, planComposition } from "../src/nutrition/calculs.ts";
import { lireComposition, objectifCalcule } from "../src/db/depots/objectifs.ts";
import { ajouterGras } from "../src/ecrans/mesures/corps-donnees.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";

const proche = (a: number, b: number, e = 0.05) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
const alex = { sexe: "h" as const, tailleCm: 180, poidsKg: 78, age: 45 };

test("sans % de gras : formule au poids (Mifflin × 1,4, % de gras de population), protéines 1,8 g/kg, séances dans la semaine", () => {
  // Mifflin 1 685 × 1,4 = 2 359 un jour de repos ; la séance de 300 kcal s'ajoute au jour d'entraînement
  const repos = objectifAuto(alex, "repos", 0, "debout");
  const sport = objectifAuto(alex, "entrainement", 0, "debout");
  proche(kcalObjectif(repos), 2359, 4);
  proche(kcalObjectif(sport) - kcalObjectif(repos), 300, 4);
  assert.deepEqual(objectifAuto(alex, "repos", 0, "debout", undefined), repos);
  assert.equal(repos.proteines, 140);
  assert.equal(repos.lipides, Math.round((0.25 * (2359 + (3 / 7) * 300)) / 9));
  // sèche : au plus 20 % de la dépense (D4) ; prise : excédent de l'intermédiaire, 10 % de la dépense (D6)
  const seche = kcalObjectif(objectifAuto(alex, "repos", -0.5, "debout"));
  assert.ok(seche < kcalObjectif(repos) - 300 && seche > kcalObjectif(repos) - 600, String(seche));
  const prise = kcalObjectif(objectifAuto(alex, "repos", 0.25, "debout"));
  assert.ok(prise > kcalObjectif(repos) + 100 && prise < kcalObjectif(repos) + 250, String(prise));
});

test("78 kg à 14 % vers 82 kg à 13 % : prise de muscle, masses visées, écart et durée ; le maigre visé tient dans les repères (D15)", () => {
  const p = planComposition(78, 14, 82, 13, 0.25);
  assert.equal(p.type, "prise");
  proche(p.maigreKg, 71.34);
  proche(p.grasKg, 10.66);
  proche(p.ecartMaigreKg, 4.26);
  proche(p.ecartGrasKg, -0.26);
  // 4 kg à 0,25 kg/sem = 16 semaines, mais 4,26 kg de maigre au rythme d'un intermédiaire (0,5 % du poids par mois = 0,39 kg,
  // soit 0,09 kg par semaine) : 47 semaines
  proche(p.semaines!, 4.26 / (0.39 / (52 / 12)), 0.2);
  // D15 : le rythme ne compte plus en prise ; 4,26 kg de maigre au plafond de 0,39 kg par mois = 11 mois, sous l'année : réaliste
  assert.equal(p.realisme.realiste, true);
  assert.equal(p.realisme.etape, null);
  assert.equal(planComposition(78, 14, 86, 13, 0.25).realisme.realiste, false);
  proche(p.realisme.plafondMoisKg, 0.39, 0.001);
  assert.equal(p.incoherence, null);
  // un débutant gagne deux fois plus vite : durée plus courte et cible plus proche du réalisable
  const debutant = planComposition(78, 14, 82, 13, 0.25, { niveau: "debutant" });
  assert.ok(debutant.semaines! < p.semaines! / 1.9);

  const o = objectifAuto(alex, "repos", 0.25, "debout", { grasPct: 14, cibleKg: 82, grasCiblePct: 13 });
  // protéines : 1,8 g par kg de poids de référence (poids réel 78 kg), plus de masse maigre
  assert.equal(o.proteines, 140);
  // énergie : l'entretien de 2 359 un jour de repos plus l'excédent du niveau (D15 : 10 % de la dépense, intermédiaire)
  const kcal = kcalObjectif(o);
  assert.ok(kcal > 2359 + 200 && kcal < 2359 + 300, String(kcal));
});

test("% connu sans cible : mêmes formules, protéines du poids de référence (2,2 g/kg en sèche chez un homme maigre)", () => {
  const o = objectifAuto(alex, "repos", -0.5, "debout", { grasPct: 14 });
  assert.equal(o.proteines, Math.round(2.2 * 78)); // sèche 2,0 + 0,2 (homme ≤ 15 % de gras)
  assert.equal(objectifAuto(alex, "repos", 0, "debout", { grasPct: 14 }).proteines, 140);
});

test("recomposition : poids stable, % plus bas ; la durée suit la masse maigre, l'énergie est à −5 % de la dépense", () => {
  const p = planComposition(78, 14, null, 12, 0);
  assert.equal(p.type, "recomposition");
  proche(p.ecartMaigreKg, 1.56);
  proche(p.semaines!, 1.56 / (0.39 / (52 / 12)), 0.2);
  const o = objectifDetail(alex, "repos", 0, "debout", { grasPct: 14, grasCiblePct: 12 });
  assert.equal(o.type, "recomposition");
  assert.equal(o.proteinesG, Math.round(2.2 * 78)); // 2,0 + 0,2 (maigre, en déficit)
  proche(o.ecartKcal!, -0.05 * o.depenseEntretienKcal!, 1);
});

test("sèche : durée ; maintien choisi : ni écart ni durée", () => {
  const p = planComposition(78, 14, 75, 11, -0.5);
  assert.equal(p.type, "seche");
  // maigre 66,75 (−0,33 kg, toléré), gras 8,25 (−2,67 kg) ; 3 kg à 0,5 kg/sem = 6 semaines
  proche(p.semaines!, 6);
  assert.equal(p.incoherence, null);
  const m = planComposition(78, 14, 75, 11, 0);
  assert.equal(m.semaines, null);
  assert.equal(objectifDetail(alex, "repos", 0, "debout", { grasPct: 14, cibleKg: 75, grasCiblePct: 11 }).ecartKcal, 0);
});

test("incohérences : masse maigre à perdre, poids sous la masse maigre", () => {
  const perte = planComposition(78, 14, 70, 8, -0.5).incoherence;
  assert.equal(perte?.cas, "perteMaigre");
  if (perte?.cas === "perteMaigre") {
    proche(perte.perteKg, 2.68);
    proche(perte.grasGardePct, 4.17); // à 70 kg, 4,2 % garderait les 67,08 kg de maigre
  }
  assert.equal(planComposition(78, 14, 65, 10, -0.5).incoherence?.cas, "sousMaigre");
  assert.equal(planComposition(78, 14, 82, 13, 0.25).incoherence, null);
});

test("dépôt : la cible de % ne compte qu'avec un % actuel ; sinon le calcul d'avant (31/10)", async () => {
  const { db } = await baseDeTest();
  const t = new Date(2026, 9, 31, 12).getTime();
  await ecrireReglage(db, "sexe", "h");
  await ecrireReglage(db, "naissance", "1981-05-14");
  await ajouterMensuration(db, "taille", 180, t - 86_400_000);
  await ajouterPesee(db, 78, t - 3_600_000);
  await ecrireReglage(db, "nutri_poids_cible", "82");
  await ecrireReglage(db, "nutri_gras_cible", "13");
  await ecrireReglage(db, "nutri_rythme", "0.25");
  // % cible gardé en mémoire, mais sans % actuel : ni composition ni écart, le calcul au poids
  assert.equal(await lireComposition(db, t), undefined);
  const avant = (await objectifCalcule(db, "repos", t))!;
  assert.deepEqual(avant, objectifAuto(alex, "repos", 0.25, "debout"));
  // le % actuel arrive : la cible compte
  assert.ok(await ajouterGras(db, 14, t - 1_800_000));
  assert.deepEqual(await lireComposition(db, t), { grasPct: 14, cibleKg: 82, grasCiblePct: 13 });
  const apres = (await objectifCalcule(db, "repos", t))!;
  assert.equal(apres.proteines, 140);
  assert.deepEqual(apres, objectifAuto(alex, "repos", 0.25, "debout", { grasPct: 14, cibleKg: 82, grasCiblePct: 13 }));
});

test("écran : pas de ligne cible sans valeur de base ; une cible sans base reste en mémoire sans compter (31/10)", () => {
  assert.deepEqual(ciblesVisibles({ poids: false, gras: false }, { kg: 82, gras: 13 }), { lignePoids: false, ligneGras: false, cibleKg: null, grasCible: null });
  assert.deepEqual(ciblesVisibles({ poids: true, gras: false }, { kg: 82, gras: 13 }), { lignePoids: true, ligneGras: false, cibleKg: 82, grasCible: null });
  assert.deepEqual(ciblesVisibles({ poids: true, gras: true }, { kg: null, gras: 13 }), { lignePoids: true, ligneGras: true, cibleKg: null, grasCible: 13 });
});
