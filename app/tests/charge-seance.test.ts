// Charge en séance d'après le matériel du lieu (lot L4) : paliers en kg et en lbs, charge la plus proche et son avis, chargement de la barre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import {
  avisCharge, bandeCharge, chargementAffiche, horsCharges, libellePuce, nomDansPhrase, optionsBarre, paliersAffiches, rapprocher, type InfoCharge,
} from "../src/ecrans/charge-seance.ts";
import { nouvelleBarre, type Materiel } from "../src/db/depots/materiel.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const MAISON = [4, 8, 20, 30];
const DISQUES = [{ kg: 20, paires: 1 }, { kg: 15, paires: 1 }, { kg: 10, paires: 1 }, { kg: 5, paires: 1 }, { kg: 2.5, paires: 1 }, { kg: 1.25, paires: 1 }];
const BARRE = { libelle: "Barre droite de 20 kg", poidsPropreKg: 20, disques: DISQUES, maxParCote: Infinity };

test("paliers : tels quels en kg ; en lbs, convertis au dixième (des haltères de 5 et 10 lbs restent 5 et 10)", () => {
  assert.deepEqual(paliersAffiches(MAISON, "kg"), MAISON);
  assert.deepEqual(paliersAffiches([2.27, 4.54], "lbs"), [5, 10]);
  assert.deepEqual(paliersAffiches([20], "lbs"), [44.1]);
});

test("rapprocher : 12 kg devient 8 ; une charge qui existe, une case vide ou sans matériel ne bougent pas", () => {
  assert.equal(rapprocher(MAISON, 12), 8);
  assert.equal(rapprocher(MAISON, 6), 4, "à égalité, la plus légère");
  assert.equal(rapprocher(MAISON, 8), null);
  assert.equal(rapprocher(MAISON, null), null);
  assert.equal(rapprocher(null, 12), null);
});

test("avis : le plus proche, le plus lourd, le plus léger, et la liste du lieu", () => {
  const info = { materiel: "Haltères", lieu: "Maison" };
  assert.deepEqual(avisCharge(12, MAISON, "kg", info), { titre: "Pas de 12 kg ici : 8 kg, le plus proche.", detail: "Haltères de Maison : 4, 8, 20 et 30 kg" });
  assert.equal(avisCharge(35, MAISON, "kg", info)!.titre, "Pas de 35 kg ici : 30 kg, le plus lourd.");
  assert.equal(avisCharge(2, MAISON, "kg", info)!.titre, "Pas de 2 kg ici : 4 kg, le plus léger.");
  assert.equal(avisCharge(8, MAISON, "kg", info), null);
});

test("chargement : 62,5 kg sur la barre de 20 kg, 20 et 1,25 kg par côté ; la barre seule ; une charge impossible", () => {
  assert.deepEqual(chargementAffiche(62.5, "kg", BARRE), { coteKg: [20, 1.25], titre: "20 et 1,25 kg par côté", sous: "Barre droite de 20 kg" });
  assert.equal(chargementAffiche(20, "kg", BARRE)!.titre, "Barre seule");
  assert.equal(chargementAffiche(21, "kg", BARRE), null);
  assert.equal(chargementAffiche(null, "kg", BARRE), null);
});

test("chargement en lbs : barre de 45 lbs et disques de 45 lbs, 135 lbs affichés", () => {
  const kg = (lbs: number) => Math.round((lbs / 2.20462) * 100) / 100;
  const b = { libelle: "Barre droite de 45 lbs", poidsPropreKg: kg(45), disques: [{ kg: kg(45), paires: 2 }, { kg: kg(2.5), paires: 1 }], maxParCote: Infinity };
  const c = chargementAffiche(135, "lbs", b)!;
  assert.equal(c.titre, "45 lbs par côté");
  assert.equal(chargementAffiche(140, "lbs", b)!.titre, "45 et 2,5 lbs par côté");
});

test("nom dans la phrase : « Barre du squat »", () => {
  assert.equal(nomDansPhrase("Squat"), "squat");
  assert.equal(nomDansPhrase("RDL"), "RDL");
});

test("hors palier : comparé dans l'unité affichée (10 lbs enregistrés en kg restent sur l'haltère de 10 lbs)", () => {
  assert.equal(horsCharges(MAISON, 12, "kg"), true);
  assert.equal(horsCharges(MAISON, 8, "kg"), false);
  assert.equal(horsCharges([2.27, 4.54], 4.5359, "lbs"), false);
  assert.equal(horsCharges([2.27, 4.54], 6.8, "lbs"), true);
  assert.equal(horsCharges(null, 12, "kg"), false);
});

const info = (o: Partial<InfoCharge> = {}): InfoCharge => ({
  chargesKg: MAISON, materiel: "Haltères", lieu: "Maison", rapprocher: true, serie: "s", kgSerie: null, unite: "kg", ...o,
});

test("bande du clavier : l'avis tant que la case montre la charge rapprochée, puis la barre ; la case des répétitions suit la charge", () => {
  const rapproche = { voulu: 12, kg: 8 };
  assert.deepEqual(bandeCharge(info(), { champ: "kg", texte: "8", rapproche }), {
    avis: { titre: "Pas de 12 kg ici : 8 kg, le plus proche.", detail: "Haltères de Maison : 4, 8, 20 et 30 kg" },
  });
  assert.equal(bandeCharge(info(), { champ: "kg", texte: "20", rapproche }), null, "autre charge choisie : plus d'avis, pas de barre");
  const squat = info({ barre: BARRE, chargesKg: [20, 62.5], materiel: "Barre droite" });
  assert.deepEqual(bandeCharge(squat, { champ: "kg", texte: "62,5" }), { barre: { coteKg: [20, 1.25], titre: "20 et 1,25 kg par côté", sous: "Barre droite de 20 kg" } });
  assert.equal((bandeCharge(squat, { champ: "reps", texte: "8", kgSerie: 20 }) as { barre: { titre: string } }).barre.titre, "Barre seule");
  assert.equal((bandeCharge({ ...squat, kgSerie: 62.5 }, { champ: "reps", texte: "8" }) as { barre: { titre: string } }).barre.titre, "20 et 1,25 kg par côté");
  assert.equal(bandeCharge(squat, { champ: "duree_s", texte: "30" }), null);
});

test("pastille et feuille de la barre : « Barre 20 kg », une option par barre à charger, avec son étendue", () => {
  const b = (forme: "droite" | "ez", id: string, prechargee = false): Materiel => ({ ...nouvelleBarre(forme, "kg"), id, salleId: "s", aVerifier: false, prechargee });
  const droite = b("droite", "d");
  const ez = b("ez", "e");
  const fixe = { ...b("droite", "f", true), poids: [30] };
  const disques: Materiel = { ...nouvelleBarre("droite", "kg"), genre: "disques", forme: null, poidsPropre: null, id: "x", salleId: "s", aVerifier: false, disques: DISQUES };
  assert.equal(libellePuce(droite), "Barre 20 kg");
  const o = optionsBarre({ choisie: droite, barres: [droite, ez, fixe], poidsPropreKg: 20, disques: DISQUES, maxParCote: Infinity }, [droite, ez, fixe, disques], "kg");
  assert.deepEqual(o.map((x) => [x.titre, x.sous, x.choisie]), [
    ["Barre droite 20 kg", "20 à 127,5 kg par 2,5", true],
    ["Barre EZ 10 kg", "10 à 117,5 kg par 2,5", false],
  ]);
});
