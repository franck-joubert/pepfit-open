// Quantité d'un aliment (07/11) : une même quantité se lit en grammes, en % de paquet, en portions et en fractions ;
// portions et poids du paquet saisis sur la fiche locale (« Modifier la fiche »), jamais effacés par Open Food Facts.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrer } from "../src/db/migrations.ts";
import { enregistrerProduit, modifierPortionsProduit, produitParId } from "../src/db/depots/nutrition.ts";
import { grammesDepuisUnite, macrosPourQuantite, unitesDisponibles, type Portion } from "../src/nutrition/calculs.ts";
import {
  aUnePortion, avecValeur, champsDepuisPortions, fractionGlyphe, grammesApres, fractionSimple, garderPortionsPerso, horsGrille, nombrePortions, ordreUnites,
  portionsApresSaisie, pourcentPaquet, quantiteDepuisGrammes, quantiteLue, quantiteTexte, recalculerPortions, sousOnglet, surGrille, valeursPourUnite,
} from "../src/nutrition/quantite.ts";

const PAQUET: Portion[] = [{ type: "paquet", libelle: "", grammes: 240 }];
const NUTRI = { energie_kcal: 260, proteines: 7.7, glucides: 52, lipides: 1.2, sucres: 10 };
const NBSP = " ";

test("% de paquet : 200 g d'un paquet de 240 g = 83 %, sans décimale", () => {
  assert.equal(pourcentPaquet(200, 240), 83);
  assert.equal(pourcentPaquet(120, 240), 50);
  assert.equal(pourcentPaquet(240, 240), 100);
  assert.equal(pourcentPaquet(360, 240), 150);
});

test("% de paquet : paquet de poids inconnu ou nul, pas de pourcentage", () => {
  assert.equal(pourcentPaquet(200, null), null);
  assert.equal(pourcentPaquet(200, undefined), null);
  assert.equal(pourcentPaquet(200, 0), null);
  assert.equal(pourcentPaquet(200, -5), null);
  assert.equal(pourcentPaquet(Number.NaN, 240), null);
});

test("nombre de portions : portion de 0 ou inconnue → null, jamais Infinity", () => {
  assert.equal(nombrePortions(240, 60), 4);
  assert.equal(nombrePortions(200, 60)! > 3.33, true);
  assert.equal(nombrePortions(240, 0), null);
  assert.equal(nombrePortions(240, null), null);
});

test("sous les onglets : le gramme montre la quantité, le paquet son %, la portion son nombre", () => {
  const p: Portion[] = [{ type: "portion", libelle: "", grammes: 60 }, ...PAQUET];
  assert.equal(sousOnglet("g", 200, p, "g"), "200 g");
  assert.equal(sousOnglet("paquet", 200, p, "g"), `83${NBSP}%`);
  assert.equal(sousOnglet("portion", 180, p, "g"), "3");
  assert.equal(sousOnglet("portion", 200, p, "g"), "3,3");
  assert.equal(sousOnglet("piece", 200, p, "g"), undefined);
  assert.equal(sousOnglet("paquet", 200, [], "g"), undefined);
});

test("quantité plus grande que le paquet : 150 %, 1 ½ paquet, grammes exacts", () => {
  assert.equal(sousOnglet("paquet", 360, PAQUET, "g"), `150${NBSP}%`);
  assert.equal(grammesDepuisUnite("paquet", 1.5, PAQUET), 360);
  assert.deepEqual(quantiteDepuisGrammes("paquet", 360, PAQUET), { nb: 1.5, horsGrille: false });
});

test("fractions : quarts écrits en glyphes et en « 1/2 » pour la lecture", () => {
  assert.equal(fractionGlyphe(0.25), "¼");
  assert.equal(fractionGlyphe(0.5), "½");
  assert.equal(fractionGlyphe(0.75), "¾");
  assert.equal(fractionGlyphe(1), "1");
  assert.equal(fractionGlyphe(1.5), "1 ½");
  assert.equal(fractionGlyphe(0.8333), null);
  assert.equal(fractionSimple(0.5), "1/2");
  assert.equal(fractionSimple(1.75), "1 3/4");
  assert.equal(fractionSimple(0.3), null);
});

test("roue : pas naturels (quarts de paquet, demi-portions), aucun cran à 0", () => {
  const paquet = valeursPourUnite("paquet");
  assert.deepEqual(paquet.slice(0, 5), [0.25, 0.5, 0.75, 1, 1.25]);
  const portion = valeursPourUnite("portion");
  assert.deepEqual(portion.slice(0, 4), [0.5, 1, 1.5, 2]);
  assert.equal(portion.includes(0.25), false);
  assert.equal(valeursPourUnite("g")[0], 5);
  assert.equal(paquet.includes(0), false);
});

test("hors grille : 200 g = 0,83 paquet est gardé tel quel, sans bouger la quantité", () => {
  const q = quantiteDepuisGrammes("paquet", 200, PAQUET)!;
  assert.equal(q.horsGrille, true);
  assert.ok(Math.abs(grammesDepuisUnite("paquet", q.nb, PAQUET)! - 200) < 0.05);
  assert.equal(quantiteTexte("paquet", q.nb), `83${NBSP}%`);
  assert.equal(quantiteTexte("portion", 3.3333), "3,3");
  assert.equal(quantiteTexte("paquet", 0.75), "¾");
  const roue = avecValeur(valeursPourUnite("paquet"), q.nb);
  assert.equal(roue.length, valeursPourUnite("paquet").length + 1);
  assert.deepEqual([...roue].sort((a, b) => a - b), roue);
  assert.equal(avecValeur(valeursPourUnite("paquet"), 0.5).length, valeursPourUnite("paquet").length);
  assert.equal(horsGrille("paquet", 0.5), null);
  assert.equal(horsGrille("paquet", q.nb), q.nb);
  assert.equal(surGrille("portion", 0.25), false);
  assert.equal(surGrille("g", 83), false);
});

test("proche d'un cran : se pose sur le cran ; minuscule : pas de zéro", () => {
  assert.deepEqual(quantiteDepuisGrammes("paquet", 120.4, PAQUET), { nb: 0.5, horsGrille: false });
  const petit = quantiteDepuisGrammes("portion", 2, [{ type: "portion", libelle: "", grammes: 60 }])!;
  assert.ok(petit.nb >= 0.5);
});

test("unité qui n'existe pas pour le produit : null", () => {
  assert.equal(quantiteDepuisGrammes("portion", 100, PAQUET), null);
  assert.equal(quantiteDepuisGrammes("paquet", 100, [{ type: "paquet", libelle: "", grammes: 0 }]), null);
  assert.deepEqual(quantiteDepuisGrammes("g", 83.4, PAQUET), { nb: 83, horsGrille: true });
});

test("lecture d'écran : « 1/2 paquet, 120 grammes »", () => {
  assert.equal(quantiteLue("paquet", 0.5, 120, "paquet", false), "1/2 paquet, 120 grammes");
  assert.equal(quantiteLue("portion", 1.5, 90, "portion", false), "1 1/2 portion, 90 grammes");
  assert.equal(quantiteLue("g", 200, 200, "g", false), "200 grammes");
  assert.equal(quantiteLue("g", 200, 200, "ml", true), "200 millilitres");
  assert.equal(quantiteLue("paquet", 0.8333, 200, "paquet", false), "83 pour cent du paquet, 200 grammes");
});

test("ordre des onglets : g à gauche, paquet à droite", () => {
  assert.deepEqual(ordreUnites(["g", "paquet", "portion"]), ["g", "portion", "paquet"]);
  assert.deepEqual(ordreUnites(unitesDisponibles([{ type: "paquet", libelle: "", grammes: 240 }, { type: "portion", libelle: "", grammes: 60 }])), ["g", "portion", "paquet"]);
});

test("calories et macros : la même quantité donne les mêmes valeurs, quelle que soit l'unité", () => {
  const p: Portion[] = [{ type: "portion", libelle: "", grammes: 60 }, ...PAQUET];
  const enG = macrosPourQuantite(NUTRI, 120);
  const enPaquet = macrosPourQuantite(NUTRI, grammesDepuisUnite("paquet", 0.5, p)!);
  const enPortions = macrosPourQuantite(NUTRI, grammesDepuisUnite("portion", 2, p)!);
  assert.deepEqual(enPaquet, enG);
  assert.deepEqual(enPortions, enG);
  assert.equal(Math.round(enG.kcal), 312);
});

// ---- Portions saisies sur la fiche ----------------------------------------------------------------------------------

test("portions : le nombre calcule le poids d'une portion depuis le paquet, et inversement", () => {
  let c = champsDepuisPortions(PAQUET);
  assert.deepEqual(c, { paquetG: 240, portionG: null, nbPortions: null });
  c = recalculerPortions(c, "nbPortions", 4);
  assert.deepEqual(c, { paquetG: 240, portionG: 60, nbPortions: 4 });
  c = recalculerPortions(c, "portionG", 80);
  assert.deepEqual(c, { paquetG: 240, portionG: 80, nbPortions: 3 });
  c = recalculerPortions(c, "portionG", 100, "portionG");
  assert.equal(c.nbPortions, 2.4);
});

test("portions : changer le paquet garde la dernière valeur saisie des deux", () => {
  const base = { paquetG: 240, portionG: 60, nbPortions: 4 };
  assert.deepEqual(recalculerPortions(base, "paquetG", 300, "portionG"), { paquetG: 300, portionG: 60, nbPortions: 5 });
  assert.deepEqual(recalculerPortions(base, "paquetG", 300, "nbPortions"), { paquetG: 300, portionG: 75, nbPortions: 4 });
});

test("portions : poids du paquet absent, la portion se définit seule ; 0 et vide ne calculent rien", () => {
  let c = recalculerPortions({ paquetG: null, portionG: null, nbPortions: null }, "portionG", 45);
  assert.deepEqual(c, { paquetG: null, portionG: 45, nbPortions: null });
  c = recalculerPortions(c, "paquetG", 180);
  assert.deepEqual(c, { paquetG: 180, portionG: 45, nbPortions: 4 });
  const zero = recalculerPortions(c, "portionG", 0);
  assert.deepEqual(zero, { paquetG: 180, portionG: null, nbPortions: null });
  assert.equal(recalculerPortions(c, "nbPortions", 0).nbPortions, null);
  assert.equal(recalculerPortions(c, "nbPortions", -3).nbPortions, null);
  assert.equal(recalculerPortions(c, "paquetG", null).nbPortions, null);
  // nombre de portions saisi sans paquet : gardé, la portion se calcule dès que le paquet arrive
  const n = recalculerPortions({ paquetG: null, portionG: null, nbPortions: null }, "nbPortions", 4, "nbPortions");
  assert.deepEqual(n, { paquetG: null, portionG: null, nbPortions: 4 });
  assert.deepEqual(recalculerPortions(n, "paquetG", 240, "nbPortions"), { paquetG: 240, portionG: 60, nbPortions: 4 });
});

test("portions : la saisie remplace le paquet et la portion, marqués perso, et garde la pièce", () => {
  const avant: Portion[] = [{ type: "piece", libelle: "", grammes: 60 }, { type: "paquet", libelle: "240 g", grammes: 240 }];
  const apres = portionsApresSaisie(avant, { paquetG: 240, portionG: 60, nbPortions: 4 });
  assert.deepEqual(apres.map((p) => p.type), ["portion", "piece", "paquet"]);
  assert.equal(apres.find((p) => p.type === "portion")?.perso, true);
  // paquet inchangé : l'entrée d'origine (libellé « 240 g ») est gardée telle quelle
  assert.deepEqual(apres.find((p) => p.type === "paquet"), avant[1]);
  assert.equal(aUnePortion(apres), true);
  assert.equal(aUnePortion(avant), false);
  // poids vide : l'unité disparaît (l'onglet et la roue aussi)
  const sans = portionsApresSaisie(apres, { paquetG: 240, portionG: null, nbPortions: null });
  assert.equal(aUnePortion(sans), false);
  assert.deepEqual(unitesDisponibles(sans), ["g", "piece", "paquet"]);
  // poids de portion à 0 : ignoré
  assert.equal(aUnePortion(portionsApresSaisie(avant, { paquetG: 240, portionG: 0, nbPortions: null })), false);
});

test("rafraîchissement : les poids saisis ne sont pas remplacés par ceux d'Open Food Facts", () => {
  const anciennes: Portion[] = [{ type: "portion", libelle: "", grammes: 60, perso: true }, { type: "paquet", libelle: "", grammes: 240 }];
  const off: Portion[] = [{ type: "portion", libelle: "1 pain", grammes: 55 }, { type: "paquet", libelle: "250 g", grammes: 250 }, { type: "piece", libelle: "", grammes: 30 }];
  const r = garderPortionsPerso(anciennes, off);
  assert.equal(r.find((p) => p.type === "portion")?.grammes, 60);
  assert.equal(r.find((p) => p.type === "paquet")?.grammes, 250);
  assert.equal(r.find((p) => p.type === "piece")?.grammes, 30);
  assert.deepEqual(garderPortionsPerso([{ type: "paquet", libelle: "", grammes: 240 }], off), off);
});

// ---- Base locale ------------------------------------------------------------------------------------------------------

type P = (string | number | null)[];
function neuve() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = {
    execAsync: async (sql: string) => void raw.exec(sql),
    runAsync: async (sql: string, p: P) => raw.prepare(sql).run(...p),
    getFirstAsync: async (sql: string, p: P) => (raw.prepare(sql).get(...p) as never) ?? null,
    getAllAsync: async (sql: string, p: P) => raw.prepare(sql).all(...p) as never[],
    withTransactionAsync: async (t: () => Promise<void>) => {
      raw.exec("BEGIN");
      try {
        await t();
        raw.exec("COMMIT");
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { raw, db };
}

test("fiche locale : portions écrites, notées pour la synchro, gardées au rafraîchissement OFF", async () => {
  const { raw, db } = neuve();
  await migrer(db);
  const p = await enregistrerProduit(db, { code_barres: "3270160", nom: "4 petits pains aux figues", nutriments: NUTRI, portions: PAQUET, source: "off" });
  raw.exec("DELETE FROM sync_journal");
  const nouvelles = portionsApresSaisie(p.portions, { paquetG: 240, portionG: 60, nbPortions: 4 });
  await modifierPortionsProduit(db, p.id, nouvelles);
  const lu = (await produitParId(db, p.id))!;
  assert.equal(lu.portions.find((x) => x.type === "portion")?.grammes, 60);
  // la ligne produits est dans le journal de synchro : elle part avec les autres données de nutrition
  const j = (raw.prepare("SELECT tab, cle FROM sync_journal WHERE tab = 'produits'").all() as { tab: string; cle: string }[]).map((x) => ({ ...x }));
  assert.deepEqual(j, [{ tab: "produits", cle: p.id }]);
  // le produit est rouvert depuis Open Food Facts (sans portion) : la portion saisie reste
  const maj = await enregistrerProduit(db, { code_barres: "3270160", nom: "4 petits pains aux figues", nutriments: NUTRI, portions: PAQUET, source: "off" });
  assert.equal(maj.id, p.id);
  assert.equal(maj.portions.find((x) => x.type === "portion")?.grammes, 60);
  assert.equal(aUnePortion(maj.portions), true);
});

test("grammes derrière la quantité de la roue : virgule après une fraction, espace large après une décimale", () => {
  assert.equal(grammesApres("½", 120, "g"), ", 120 g");
  assert.equal(grammesApres(`83${NBSP}%`, 200, "g"), ", 200 g");
  assert.equal(grammesApres("3,3", 200, "g"), " 200 g");
});
