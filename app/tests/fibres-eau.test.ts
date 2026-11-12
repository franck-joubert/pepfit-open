// Fibres et eau du Journal (planche Fibres et eau, docs/CODE-FIBRES-EAU.md) : le calcul des fibres du jour, l'objectif de départ,
// le palier, l'échange de la carte d'astuce, la table d'eau et ses réglages.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterEau, eauParJour, fibresParJour, listerEau, lireReglagesFibresEau, modifierEau, restaurerEau, supprimerEau } from "../src/db/depots/fibres-eau.ts";
import { ajouterConsommation, enregistrerProduit, listerRepas } from "../src/db/depots/nutrition.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import {
  ajoutEauValide, astuceVisible, departFibres, echangeDuJour, fibresDeLigne, fibresDuJour, heureTexte, litres, moyenneFibres, palierFibres,
  totalEauMl, type LigneAstuce,
} from "../src/nutrition/fibres-eau.ts";
import { baseDeTest } from "./aide.ts";

const ligne = (nom: string, g: number, nutriments: LigneAstuce["produit"]["nutriments"], repas = "r1"): LigneAstuce => ({ repas_id: repas, quantite_g: g, produit: { nom, nutriments } });

test("fibres d'une ligne : valeur pour 100 g × quantité ; absente, nulle sans glucides et inconnue sinon", () => {
  assert.deepEqual(fibresDeLigne(ligne("Lentilles", 200, { fibres: 8, glucides: 20 })), { g: 16, inconnu: false });
  assert.deepEqual(fibresDeLigne(ligne("Poulet", 150, { proteines: 25, glucides: 0 })), { g: 0, inconnu: false });
  assert.deepEqual(fibresDeLigne(ligne("Eau", 250, {})), { g: 0, inconnu: false });
  assert.deepEqual(fibresDeLigne(ligne("Biscuit", 30, { glucides: 70 })), { g: 0, inconnu: true });
  assert.deepEqual(fibresDeLigne(ligne("Pâte à tartiner", 20, { fibres: 0, glucides: 57 })), { g: 0, inconnu: false });
});

test("fibres du jour : la somme, une décimale ; « partiel » dès qu'un aliment à glucides n'a pas de fibres connues", () => {
  const pomme = ligne("Pomme", 150, { fibres: 2.4, glucides: 14 });
  const pain = ligne("Pain", 60, { fibres: 3, glucides: 50 });
  assert.deepEqual(fibresDuJour([pomme, pain]), { g: 5.4, partiel: false });
  assert.deepEqual(fibresDuJour([pomme, ligne("Biscuit", 30, { glucides: 70 })]), { g: 3.6, partiel: true });
  assert.deepEqual(fibresDuJour([]), { g: 0, partiel: false });
});

test("moyenne des fibres : seuls les jours remplis comptent", () => {
  assert.equal(moyenneFibres([null, null]), null);
  assert.equal(moyenneFibres([{ g: 10, partiel: false }, null, { g: 20, partiel: true }]), 15);
});

test("objectif de départ (D2) : moyenne + 5 g entre 15 et 30, ramenée à 20, 25 ou 30 ; sans historique, 20", () => {
  assert.equal(departFibres(null), 20);
  assert.equal(departFibres(4), 20); // 9 → borné à 15 → 20
  assert.equal(departFibres(16), 20); // 21 → 20
  assert.equal(departFibres(19), 25); // 24 → 25
  assert.equal(departFibres(21), 25); // 26 → 25
  assert.equal(departFibres(23), 30); // 28 → 30
  assert.equal(departFibres(40), 30);
});

test("palier +5 g : 12 jours sur 14 à l'objectif, jamais au-delà de 30 g, « Plus tard » repousse d'une semaine", () => {
  const jours = (g: (number | null)[]) => g.map((x) => (x == null ? null : { g: x, partiel: false }));
  const tenus = jours([...Array(14)].map(() => 26));
  const base = { objectifG: 25, jours: tenus, aujourdhui: "2026-11-06", reporteJusqua: null };
  assert.equal(palierFibres(base), 30);
  assert.equal(palierFibres({ ...base, objectifG: 22 }), 27);
  assert.equal(palierFibres({ ...base, objectifG: 28, jours: jours([...Array(14)].map(() => 29)) }), 30, "le dernier pas s'arrête au repère");
  assert.equal(palierFibres({ ...base, objectifG: 28 }), null, "26 g ne tiennent pas un objectif de 28");
  assert.equal(palierFibres({ ...base, objectifG: 30 }), null);
  assert.equal(palierFibres({ ...base, objectifG: 40 }), null);
  assert.equal(palierFibres({ ...base, jours: jours([...Array(12)].map((): number | null => 26).concat([10, null])) }), 30, "deux jours ratés ou vides sont permis");
  assert.equal(palierFibres({ ...base, jours: jours([...Array(11)].map((): number | null => 26).concat([10, null, 5])) }), null, "trois ne le sont plus");
  assert.equal(palierFibres({ ...base, jours: tenus.slice(0, 10) }), null, "moins de 14 jours lus");
  assert.equal(palierFibres({ ...base, reporteJusqua: "2026-11-10" }), null);
  assert.equal(palierFibres({ ...base, reporteJusqua: "2026-11-06" }), 30, "le report est échu le jour dit");
});

test("échange de l'astuce : un aliment du jour, un gain calculé sur la quantité mangée", () => {
  const rien = echangeDuJour([], []);
  assert.equal(rien, null, "aucun repas : pas de carte");
  const riz = echangeDuJour([ligne("Riz blanc cuit", 180, { glucides: 28 }, "dej")], [ligne("Lentilles", 100, {})]);
  assert.deepEqual(riz, { cle: "riz", gainG: 2, repasId: "dej" });
  const rizComplet = echangeDuJour([ligne("Riz complet", 180, { fibres: 2 })], [ligne("Haricots rouges", 100, {})]);
  assert.equal(rizComplet, null, "déjà complet, et des légumineuses cette semaine");
  assert.equal(echangeDuJour([ligne("Pâtes", 180, {})], [ligne("Pois chiches", 80, {})])!.cle, "pates");
  assert.equal(echangeDuJour([ligne("Pâtes", 180, {})], [])!.gainG, 3);
  assert.equal(echangeDuJour([ligne("Pain de mie", 60, {})], [ligne("Lentilles", 80, {})])!.gainG, 2);
  assert.equal(echangeDuJour([ligne("Jus de pomme", 200, {})], [ligne("Lentilles", 80, {})])!.cle, "pomme");
  assert.deepEqual(echangeDuJour([ligne("Yaourt nature", 125, {})], [ligne("Lentilles", 80, {})]), { cle: "coque", gainG: 2, repasId: "r1" });
  assert.deepEqual(echangeDuJour([ligne("Poulet", 150, {})], []), { cle: "legumineuses", gainG: 5, repasId: null });
  assert.equal(echangeDuJour([ligne("Poulet", 150, {})], [ligne("Salade de lentilles", 150, {})]), null, "des légumineuses cette semaine : rien à proposer");
});

test("carte d'astuce visible : aujourd'hui, suivi allumé, non masquée, chiffres affichés, objectif non atteint, un échange", () => {
  const ok = { aujourdhui: true, suivi: true, masquee: false, chiffres: true, fibresG: 18, objectifG: 30, echange: { cle: "riz" as const, gainG: 2, repasId: "r" } };
  assert.equal(astuceVisible(ok), true);
  for (const [cle, valeur] of [["aujourdhui", false], ["suivi", false], ["masquee", true], ["chiffres", false], ["fibresG", 30], ["echange", null]] as const) {
    assert.equal(astuceVisible({ ...ok, [cle]: valeur }), false, cle);
  }
});

test("textes de l'eau : litres à deux décimales au plus, heure sur deux chiffres, bornes d'un ajout", () => {
  assert.equal(litres(0), "0");
  assert.equal(litres(1200), "1,2");
  assert.equal(litres(1450), "1,45");
  assert.equal(litres(2000), "2");
  assert.equal(litres(2600, false), "2.6");
  assert.equal(heureTexte(8 * 60 + 12), "08:12");
  assert.equal(heureTexte(0), "00:00");
  assert.equal(totalEauMl([{ ml: 200 }, { ml: 250 }]), 450);
  assert.deepEqual([9, 10, 5000, 5001, 250.5].map(ajoutEauValide), [false, true, true, false, false]);
});

test("eau_ajout : ajout, liste du plus récent au plus ancien, total par jour, modification, suppression et restauration", async () => {
  const { db } = await baseDeTest();
  const a = await ajouterEau(db, { date: "2026-11-06", heureMin: 8 * 60 + 12, ml: 250, libelle: "verre" }, 1);
  await ajouterEau(db, { date: "2026-11-06", heureMin: 14 * 60 + 32, ml: 500, libelle: "bouteille" }, 2);
  await ajouterEau(db, { date: "2026-11-06", heureMin: 10 * 60 + 5, ml: 250 }, 3);
  await ajouterEau(db, { date: "2026-11-05", heureMin: 23 * 60 + 59, ml: 300 }, 4);
  assert.deepEqual((await listerEau(db, "2026-11-06")).map((x) => x.heure_min), [872, 605, 492]);
  assert.equal((await listerEau(db, "2026-11-06"))[1]!.libelle, null);
  assert.deepEqual([...(await eauParJour(db, "2026-11-05", "2026-11-06"))], [["2026-11-05", 300], ["2026-11-06", 1000]]);

  await modifierEau(db, a.id, { ml: 400, heureMin: 9 * 60 });
  const m = (await listerEau(db, "2026-11-06")).find((x) => x.id === a.id)!;
  assert.deepEqual([m.ml, m.heure_min, m.libelle], [400, 540, "verre"], "le libellé reste si on n'en donne pas");
  await modifierEau(db, a.id, { ml: 400, heureMin: 540, libelle: null });
  assert.equal((await listerEau(db, "2026-11-06")).find((x) => x.id === a.id)!.libelle, null);

  const avant = (await listerEau(db, "2026-11-06")).find((x) => x.id === a.id)!;
  await supprimerEau(db, a.id);
  assert.equal((await listerEau(db, "2026-11-06")).length, 2);
  await restaurerEau(db, avant);
  assert.deepEqual((await listerEau(db, "2026-11-06")).find((x) => x.id === a.id), avant);

  await assert.rejects(ajouterEau(db, { date: "2026-11-06", heureMin: 600, ml: 5 }), /Quantité/);
  await assert.rejects(ajouterEau(db, { date: "2026-11-06", heureMin: 1440, ml: 250 }), /Heure/);
});

test("eau_ajout : un ajout ou une suppression est noté au journal de synchro, la quantité n'y est pas", async () => {
  const { raw, db } = await baseDeTest();
  raw.exec("DELETE FROM sync_journal");
  const a = await ajouterEau(db, { date: "2026-11-06", heureMin: 600, ml: 250 });
  let l = raw.prepare("SELECT tab, cle, supprime FROM sync_journal WHERE tab = 'eau_ajout'").all();
  assert.deepEqual(l.map((x) => [x.tab, x.cle, x.supprime]), [["eau_ajout", a.id, 0]]);
  await supprimerEau(db, a.id);
  l = raw.prepare("SELECT supprime FROM sync_journal WHERE tab = 'eau_ajout'").all();
  assert.deepEqual(l.map((x) => x.supprime), [1]);
});

test("réglages : défauts, valeurs lues, valeur hors bornes ramenée au défaut ; les cinq voyagent, le report du palier non", async () => {
  const { raw, db } = await baseDeTest();
  assert.deepEqual(await lireReglagesFibresEau(db), { fibresSuivi: false, fibresObjectifG: 30, astuce: true, eauSuivi: false, eauObjectifMl: 2000, palierReporte: null });
  raw.exec("DELETE FROM sync_journal");
  await ecrireReglage(db, "nutri_fibres_suivi", "1");
  await ecrireReglage(db, "nutri_fibres_objectif_g", "25");
  await ecrireReglage(db, "nutri_fibres_astuce", "0");
  await ecrireReglage(db, "nutri_eau_suivi", "1");
  await ecrireReglage(db, "nutri_eau_objectif_ml", "2500");
  await ecrireReglage(db, "nutri_fibres_palier_report", "2026-11-13");
  assert.deepEqual(await lireReglagesFibresEau(db), { fibresSuivi: true, fibresObjectifG: 25, astuce: false, eauSuivi: true, eauObjectifMl: 2500, palierReporte: "2026-11-13" });
  const notes = raw.prepare("SELECT cle FROM sync_journal WHERE tab = 'reglages' ORDER BY cle").all().map((x) => String(x.cle));
  assert.deepEqual(notes, ["nutri_eau_objectif_ml", "nutri_eau_suivi", "nutri_fibres_astuce", "nutri_fibres_objectif_g", "nutri_fibres_suivi"]);
  await ecrireReglage(db, "nutri_fibres_objectif_g", "300");
  await ecrireReglage(db, "nutri_eau_objectif_ml", "abc");
  const r = await lireReglagesFibresEau(db);
  assert.deepEqual([r.fibresObjectifG, r.eauObjectifMl], [30, 2000]);
});

test("fibres par jour : lues depuis le journal (produit × quantité), un jour sans aliment vaut null", async () => {
  const { db } = await baseDeTest();
  const repas = (await listerRepas(db))[0]!;
  const p = await enregistrerProduit(db, { code_barres: "1", nom: "Lentilles cuites", nutriments: { energie_kcal: 116, fibres: 7.9, glucides: 20 }, source: "off" });
  await ajouterConsommation(db, { date: "2026-11-05", repasId: repas.id, produitId: p.id, quantiteG: 200, unite: "g", nbUnites: 200 });
  const { jours, lignes } = await fibresParJour(db, "2026-11-04", "2026-11-06");
  assert.deepEqual([...jours], [["2026-11-04", null], ["2026-11-05", { g: 15.8, partiel: false }], ["2026-11-06", null]]);
  assert.equal(lignes.get("2026-11-05")!.length, 1);
});
