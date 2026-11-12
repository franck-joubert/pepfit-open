// La dette de sommeil et le besoin de la nuit (planche sommeil du 03/11, NOTES § 2, D1 à D4, D17, D18) : les chiffres de la
// planche (planches/sommeil/outils/donnees.js) recalculés par recup-pepfit.ts, la même fonction que le score, le MCP et la page.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrondiDette, besoinNuit, calculerDette, coucherConseille, decalerIso, poidsNuit, RECUP, scoreRecup, sommeilDuMatin, type DonneesRecup, type NuitDette,
  type NuitRecup, type SourceNuit,
} from "../src/ecrans/recup-pepfit.ts";
import { appareilDes, coucherMoyen, partBesoin, sommeilDuJour } from "../src/ecrans/mesures/sommeil-dette.ts";

const OBJ = 450;
const nuits = (l: readonly (number | null)[], source: SourceNuit = "montre"): (NuitDette | null)[] => l.map((m) => (m == null ? null : { sommeil: m, siestes: 0, source }));
// les cas de la planche, de la nuit du 2 au 3 nov. (la plus récente) à la plus ancienne
const HABITUEL = nuits([382, 425, 348, 460, 370, 495, 415, 430]);
const TROUS = nuits([382, 425, 348, null, 370, null, 415]);
const RIEN = nuits([470, 440, 485, 455, 410, 490, 460, 460]);
const LOURDE = nuits([120, 120, 120, 120, 120, 120, 120]);
const TELEPHONE = nuits([400, 430, 380, 445, 410, 465, 420], "telephone");
const SEUIL = [...nuits([370, 410, 395], "telephone"), null, null, null, null];

test("le poids des nuits : 7/7 la nuit dernière, 1/7 il y a 7 jours", () => {
  assert.deepEqual([0, 3, 6].map((a) => poidsNuit(a)), [1, 4 / 7, 1 / 7]);
});

test("la semaine de la page : 3 h 03 → affiché 3 h 05, 5 soirs, 5 h 10 de manque cumulé, précision élevée", () => {
  const r = calculerDette(HABITUEL, OBJ);
  assert.equal(r.aRattraper, 183);
  assert.equal(arrondiDette(r.aRattraper), 185);
  assert.equal(r.soirs, 5);
  assert.equal(r.cumul, 310);
  assert.equal(r.lourde, false);
  assert.equal(r.mesurees, 7);
  assert.equal(r.precision, 100);
  assert.equal(r.chiffre, true);
  // la 8e nuit ne compte pas : seulement 7
  assert.equal(r.lignes.length, 7);
  // le tableau de NOTES § 2 : − 68, − 21, − 73, + 6, − 34, + 13, − 5
  assert.deepEqual(r.lignes.map((l) => Math.round(l.poids * l.ecart)), [68, 21, 73, -6, 34, -13, 5]);
});

test("après une sieste de 19 min : 2 h 45, 4 soirs, le cumul ne bouge pas", () => {
  const r = calculerDette(HABITUEL, OBJ, 19);
  assert.equal(arrondiDette(r.aRattraper), 165);
  assert.equal(r.soirs, 4);
  assert.equal(r.cumul, 310);
});

test("une sieste de la veille compte dans le sommeil des 24 h de la nuit, minute pour minute", () => {
  const avec = HABITUEL.map((n, i) => (i === 0 ? { ...n!, siestes: 30 } : n));
  assert.equal(calculerDette(avec, OBJ).aRattraper, 183 - 30);
});

test("les autres cas : bonne semaine, nuits sans mesure, dette lourde (cas d'Alex)", () => {
  const rien = calculerDette(RIEN, OBJ);
  assert.deepEqual([rien.aRattraper, rien.cumul, rien.soirs], [0, 50, 0]);
  const trous = calculerDette(TROUS, OBJ);
  assert.deepEqual([arrondiDette(trous.aRattraper), trous.cumul, trous.soirs, trous.mesurees, trous.precision], [200, 310, 5, 5, 79]);
  const lourde = calculerDette(LOURDE, 420);
  assert.deepEqual([lourde.aRattraper, lourde.cumul, lourde.soirs, lourde.lourde], [1200, 2100, 27, true]);
});

test("la précision : téléphone seul 50 % (les chiffres restent), 3 nuits du téléphone 32 % (aucun chiffre)", () => {
  const tel = calculerDette(TELEPHONE, OBJ);
  assert.deepEqual([tel.precision, tel.chiffre, arrondiDette(tel.aRattraper), tel.soirs], [50, true, 135, 4]);
  const seuil = calculerDette(SEUIL, OBJ);
  assert.deepEqual([seuil.precision, seuil.chiffre], [32, false]);
  // la saisie vaut le téléphone
  assert.equal(calculerDette(nuits([400, 430, 380, 445, 410, 465, 420], "saisie"), OBJ).precision, 50);
  // sans aucune nuit : 0 %, rien à chiffrer
  assert.deepEqual([calculerDette([], OBJ).precision, calculerDette([], OBJ).aRattraper], [0, 0]);
});

test("le besoin de la nuit du 2 au 3 : 7 h 30 + 45 min + 10 min = 8 h 25 ; manque 2 h 03 ; 76 %", () => {
  const b = besoinNuit(HABITUEL, OBJ, { veille: 15, moyenne: 12 });
  assert.deepEqual([b.objectif, b.rattrapage, b.effort, b.total], [450, 45, 10, 505]);
  assert.equal(arrondiDette(b.veille!), 145); // 2 h 25 à rattraper la veille au soir
  assert.equal(b.total - 382, 123);
  assert.equal(Math.round((382 / b.total) * 100), 76);
  assert.equal(b.chiffre, true);
});

test("le besoin : l'effort récent est borné de 0 à 20 min ; sans moyenne, 0 ; rattrapage ≤ ce qui restait la veille", () => {
  assert.equal(besoinNuit(HABITUEL, OBJ, { veille: 30, moyenne: 12 }).effort, 20);
  assert.equal(besoinNuit(HABITUEL, OBJ, { veille: 6, moyenne: 12 }).effort, 0);
  assert.equal(besoinNuit(HABITUEL, OBJ, { veille: 6, moyenne: null }).effort, 0);
  assert.equal(besoinNuit(HABITUEL, OBJ, null).effort, 0);
  assert.equal(besoinNuit(RIEN, OBJ, null).rattrapage, 0);
  // une sieste de la veille réduit ce qui restait le soir
  assert.equal(besoinNuit(HABITUEL, OBJ, null, 120).veille, besoinNuit(HABITUEL, OBJ, null).veille! - 120);
});

test("le besoin sous le seuil : l'objectif seul, ni rattrapage, ni effort", () => {
  const b = besoinNuit(SEUIL, OBJ, { veille: 15, moyenne: 12 });
  assert.deepEqual([b.total, b.rattrapage, b.effort, b.chiffre, b.precision], [450, 0, 0, false, 32]);
});

test("le coucher conseillé : 45 min plus tôt que le coucher moyen, aux 5 min ; le coucher moyen sans dette ; rien en dette lourde", () => {
  assert.equal(coucherConseille(23 * 60 + 46, calculerDette(HABITUEL, OBJ)), 23 * 60);
  assert.equal(coucherConseille(23 * 60 + 46, calculerDette(RIEN, OBJ)), 23 * 60 + 45);
  assert.equal(coucherConseille(23 * 60 + 46, calculerDette(LOURDE, 420)), null);
  assert.equal(coucherConseille(23 * 60 + 46, calculerDette(SEUIL, OBJ)), null);
  assert.equal(coucherConseille(null, calculerDette(HABITUEL, OBJ)), null);
  // un coucher moyen après minuit (24:20, compté depuis minuit la veille) reste une heure du jour
  assert.equal(coucherConseille(24 * 60 + 20, calculerDette(HABITUEL, OBJ)), 23 * 60 + 35);
});

// ---- la même valeur dans le score de Récupération (D1) : depuis les nuits de recup_nuit

const MARDI = "2026-11-03";
function donnees(min: readonly (number | null)[], source: "montre" | "telephone" = "montre"): DonneesRecup {
  const n = new Map<string, NuitRecup>();
  min.forEach((m, i) => {
    if (m != null) n.set(decalerIso(MARDI, -i), { rmssd: null, fcRepos: null, sommeilMin: m, milieuMin: null, besoinMin: 999, sourceSommeil: source });
  });
  // l'Effort : 12 de moyenne sur 28 jours, 15 hier
  const charges = new Map<string, number>();
  for (let i = 1; i <= 28; i++) charges.set(decalerIso(MARDI, -i), 12);
  charges.set(decalerIso(MARDI, -1), 15 + 3);
  return { nuits: n, charges, objectifSommeil: OBJ };
}

test("le score lit « à rattraper » et notre besoin, jamais le besoin de Whoop (besoinMin)", () => {
  const d = donnees([382, 425, 348, 460, 370, 495, 415, 430]);
  const r = scoreRecup(MARDI, d);
  assert.equal(r.version, 4);
  assert.equal(r.detail.sommeil.dette, 183);
  assert.equal(r.detail.sommeil.calcul.dette.aRattraper, 183);
  assert.deepEqual(r.detail.sommeil.calcul, sommeilDuMatin(MARDI, d));
  // la moyenne des 28 jours compte hier (15 + 3 = 18 → moyenne 12,1) : effort récent de 20 × (18 / 12,1 − 1) / 0,5
  const moy = (27 * 12 + 18) / 28;
  assert.equal(r.detail.sommeil.calcul.besoin.effort, Math.round(20 * Math.min(1, (18 / moy - 1) / 0.5)));
  assert.equal(r.detail.sommeil.besoin, 450 + 45 + r.detail.sommeil.calcul.besoin.effort);
});

test("le score : les siestes de la veille entrent dans la dette (sommeil des 24 h), à 50 % contre le besoin", () => {
  const d = donnees([382, 425, 348, 460, 370, 495, 415, 430]);
  const avec = { ...d, siestes: new Map([[decalerIso(MARDI, -1), 30]]) };
  const r = scoreRecup(MARDI, avec);
  assert.equal(r.detail.sommeil.dette, 183 - 30);
  assert.equal(r.detail.sommeil.sieste, 30);
});

test("le score : les nuits du téléphone comptent (D17) ; sous 40 % de précision, pas de dette et le besoin est l'objectif", () => {
  const tel = scoreRecup(MARDI, donnees([400, 430, 380, 445, 410, 465, 420], "telephone"));
  assert.equal(arrondiDette(tel.detail.sommeil.dette!), 135);
  assert.equal(tel.detail.sommeil.calcul.dette.precision, 50);
  const seuil = scoreRecup(MARDI, donnees([370, 410, 395], "telephone"));
  assert.equal(seuil.detail.sommeil.dette, null);
  assert.equal(seuil.detail.sommeil.besoin, OBJ);
  assert.equal(seuil.detail.sommeil.sous!.dette, null);
});

test("RECUP.dette : les paramètres de la planche (45 min, 7 soirs, 90 min, 1 et ½, 40 %, 20 min, 50 %)", () => {
  assert.deepEqual(RECUP.dette, {
    fenetre: 7, avance: 45, soirsMax: 7, seuilCta: 90, qualite: { montre: 1, telephone: 0.5, saisie: 0.5 }, precisionMin: 40, effortMax: 20, effortPlein: 0.5, arrondi: 5,
  });
});

// ---- la page Sommeil (sommeil-dette.ts) : les siestes du jour, le coucher moyen, l'appareil, la part du besoin

test("la page : le coucher moyen des nuits (23:46), le coucher conseillé 23:00, la sieste du jour retirée (2 h 45)", () => {
  const matin = { dette: calculerDette(HABITUEL, OBJ), besoin: besoinNuit(HABITUEL, OBJ, { veille: 15, moyenne: 12 }) };
  assert.equal(coucherMoyen([-20, -8, null, undefined]), 1426);
  assert.equal(coucherMoyen([null]), null);
  const s = sommeilDuJour(matin, HABITUEL, { objectif: OBJ, siestesJour: 19, couchers: [-14], bracelet: false });
  assert.equal(arrondiDette(s.dette.aRattraper), 165);
  assert.equal(arrondiDette(s.matin.dette.aRattraper), 185);
  assert.equal(s.coucher, 23 * 60);
  assert.equal(s.appareil, "montre");
  // sans sieste, la dette du matin telle quelle
  assert.equal(sommeilDuJour(matin, HABITUEL, { objectif: OBJ, siestesJour: 0, couchers: [], bracelet: true }).dette, matin.dette);
  assert.equal(partBesoin(382, matin), 76);
  assert.equal(partBesoin(382, { ...matin, besoin: besoinNuit(SEUIL, OBJ, null) }), null);
});

test("la page : l'appareil dit (bracelet, montre, téléphone), jamais la marque", () => {
  assert.equal(appareilDes(HABITUEL, true), "bracelet");
  assert.equal(appareilDes(HABITUEL, false), "montre");
  assert.equal(appareilDes(TELEPHONE, true), "telephone");
  assert.equal(appareilDes([null, null], false), null);
});
