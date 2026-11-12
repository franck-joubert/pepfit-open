// Page Santé côté base : mesures du corps (migration 29) dédoublonnées, données des méthodes du métabolisme, bilan d'un jour
// (séance pepfit estimée, journal Nutrition), soldes de la semaine. Santé Connect absent sous Node : pas ni séances lues.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterMesures, derniereMesure, historiqueMesure, importerMesures } from "../src/db/depots/mesures.ts";
import { ajouterMensuration, ecrireAnneeNaissance, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { decaler, donneesBmr, historiqueComposition, jourEnergie, soldesSemaine } from "../src/ecrans/sante-donnees.ts";
import { conseilDepense } from "../src/precision/modele.ts";
import { lireDonneesPrecision } from "../src/precision/lire.ts";
import { baseDeTest } from "./aide.ts";

const H = 3_600_000;
const JOUR = 24 * H;
const MINUIT = new Date(2026, 10, 10).getTime();
const W = "com.withings.wiscale2";

async function alex() {
  const { db } = await baseDeTest();
  await ecrireSexe(db, "h");
  await ecrireAnneeNaissance(db, 1987);
  await ajouterMensuration(db, "taille", 183, MINUIT - 60 * JOUR);
  await ajouterPesee(db, 77.96, MINUIT - 2 * JOUR + 7 * H, "sante_connect", W);
  return db;
}

test("mesures du corps : dédoublonnées par (type, date, source), la dernière avant une date, l'historique", async () => {
  const db = await alex();
  assert.equal(await ajouterMesures(db, "gras", [{ valeur: 14.2, date: MINUIT - JOUR, origine: W }, { valeur: 0, date: MINUIT }]), 1);
  assert.equal(await ajouterMesures(db, "gras", [{ valeur: 14.2, date: MINUIT - JOUR, origine: W }]), 0);
  await ajouterMesures(db, "gras", [{ valeur: 14.6, date: MINUIT - 10 * JOUR, origine: W }]);
  assert.equal((await derniereMesure(db, "gras", MINUIT))!.valeur, 14.2);
  assert.equal((await derniereMesure(db, "gras", MINUIT - 5 * JOUR))!.valeur, 14.6);
  assert.deepEqual((await historiqueMesure(db, "gras")).map((m) => m.valeur), [14.2, 14.6]);
  const n = await importerMesures(db, { mesures: async (type) => (type === "vfc" ? [{ valeur: 48, date: MINUIT, origine: "com.whoop.android" }] : null) });
  assert.equal(n, 1);
  // masse maigre sans mesure : poids × (1 − gras) le même jour
  await ajouterPesee(db, 78, MINUIT - JOUR + H, "sante_connect", W);
  const m = await historiqueComposition(db, "maigre-calcule");
  assert.equal(Math.round(m[0]!.valeur * 10), Math.round(78 * 0.858 * 10));
});

test("méthodes : balance, masse maigre (poids × (1 − gras)) et profil connus ; Automatique prend la balance", async () => {
  const db = await alex();
  await ajouterMesures(db, "bmr", [{ valeur: 1931, date: MINUIT - JOUR, origine: W }]);
  await ajouterMesures(db, "gras", [{ valeur: 14.2, date: MINUIT - JOUR, origine: W }]);
  const d = await donneesBmr(db, MINUIT + 16 * H);
  assert.equal(d.balance!.kcal, 1931);
  assert.equal(Math.round(d.maigre!.kg * 10), 669);
  assert.deepEqual(d.profil, { sexe: "h", kg: 77.96, cm: 183, age: 39 });
  const e = (await jourEnergie(db, MINUIT, MINUIT + 16 * H))!;
  assert.equal(e.bmr.methode, "balance");
  assert.equal(e.bmrMesure!.origine, W);
  assert.equal(e.enCours, true);
  // sans journal : pas d'apports, pas de solde, digestion estimée
  assert.equal(e.bilan.solde, null);
  assert.equal(e.bilan.digestion.estime, true);
});

test("choix Mifflin à la main, séance pepfit estimée aux MET, journal du jour : solde", async () => {
  const db = await alex();
  await ecrireReglage(db, "sante_bmr_methode", "mifflin");
  await db.runAsync("INSERT INTO seances (id, debut, fin, maj_le) VALUES (?,?,?,?)", ["s1", MINUIT + 10 * H, MINUIT + 11 * H, 0]);
  await db.runAsync(
    "INSERT INTO produits (id, nom, nutriments, cree_le, vu_le) VALUES ('p1', 'Riz', ?, 0, 0)",
    [JSON.stringify({ kcal: 350, proteines: 7, glucides: 78, lipides: 1 })],
  );
  await db.runAsync("INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, nb_unites, cree_le) VALUES ('c1', '2026-11-10', 'repas:dejeuner', 'p1', 600, 600, 0)", []);
  const e = (await jourEnergie(db, MINUIT, MINUIT + 2 * JOUR))!;
  assert.equal(e.bmr.methode, "mifflin");
  assert.equal(e.bmr.auto, false);
  assert.equal(Math.round(e.bmr.kcal), 1733);
  assert.equal(e.enCours, false);
  assert.equal(e.bilan.sport.seances.length, 1);
  assert.equal(e.bilan.sport.estime, true);
  assert.equal(Math.round(e.bilan.sport.kcal), Math.round(5 * 77.96 - 1733.35 / 24));
  assert.ok(Math.abs(e.bilan.apports! - 2100) < 20, `apports ${e.bilan.apports}`);
  assert.equal(e.nbRepas, 1);
  assert.equal(Math.round(e.bilan.solde!), Math.round(e.bilan.apports! - e.bilan.depense.kcal));
  const s = await soldesSemaine(db, MINUIT, MINUIT + 2 * JOUR);
  assert.equal(s.length, 7);
  assert.equal(s[6]!.jour, MINUIT);
  assert.deepEqual(s.slice(0, 6).map((x) => x.solde), [null, null, null, null, null, null]);
});

test("rien de connu : un bilan quand même, avec le métabolisme par défaut", async () => {
  const { db } = await baseDeTest();
  const e = await jourEnergie(db, MINUIT, MINUIT + H);
  assert.equal(e.bmr.methode, "defaut");
  assert.equal(e.bilan.solde, null);
});

/** Une consommation de `g` grammes de riz (350 kcal/100 g) le jour `jour` (minuit local). */
async function manger(db: Awaited<ReturnType<typeof alex>>, jour: number, g: number) {
  await db.runAsync("INSERT OR IGNORE INTO produits (id, nom, nutriments, cree_le, vu_le) VALUES ('riz', 'Riz', ?, 0, 0)", [
    JSON.stringify({ kcal: 350, proteines: 7, glucides: 78, lipides: 1 }),
  ]);
  const d = new Date(jour);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await db.runAsync("INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, nb_unites, cree_le) VALUES (?, ?, 'repas:dejeuner', 'riz', ?, ?, 0)", [
    `c${jour}`,
    date,
    g,
    g,
  ]);
}

test("journal tenu une semaine puis abandonné : les jours suivants ont des apports estimés (habitudes) et un solde estimé", async () => {
  const db = await alex();
  for (let i = 1; i <= 7; i++) await manger(db, decaler(MINUIT, -10 - i), 600);
  const e = await jourEnergie(db, MINUIT, MINUIT + 2 * JOUR);
  assert.equal(e.bilan.recharge?.source, "habitudes");
  assert.ok(Math.abs(e.bilan.apports! - 2100) < 20, `apports ${e.bilan.apports}`);
  assert.equal(e.bilan.soldeEstime, true);
  assert.equal(e.recalage, null);
  // la semaine de journal ne suffit pas au recalage : le conseil (étape de la précision qui fait monter la dépense) le dit
  // (profil complet, pas encore de pas sous Node)
  assert.equal(conseilDepense((await lireDonneesPrecision(db, {}, MINUIT + 2 * JOUR)).d), "pas");
});

test("4 semaines de journal et de pesées : la dépense est recalée sur le poids, précision bonne (journal supposé juste à 10 %, D2)", async () => {
  const db = await alex();
  for (let i = 1; i <= 28; i++) {
    await manger(db, decaler(MINUIT, -i), 700); // 2 450 kcal
    if (i % 3 === 0) await ajouterPesee(db, 78 + (0.5 / 7) * i, decaler(MINUIT, -i) + 7 * H, "manuel"); // −0,5 kg/sem.
  }
  const e = await jourEnergie(db, MINUIT, MINUIT + 2 * JOUR);
  assert.ok(e.recalage, "recalage attendu");
  assert.ok(e.recalage!.kgSemaine < -0.4 && e.recalage!.kgSemaine > -0.6, `kg/sem ${e.recalage!.kgSemaine}`);
  assert.equal(e.bilan.depense.recalee, true);
  assert.ok(e.bilan.ajustement > 0, "perdre en mangeant 2 450 : la formule sous-estimait");
  // σ ≈ 7 % avec l'erreur de journal de 10 % : « bonne » ; « élevée » (σ < 6 %) demandait l'erreur de 3 % d'avant
  assert.equal(e.bilan.depense.precision, "bonne");
  // ce jour-là, rien au journal : 28 jours tenus, donc la moyenne des mêmes jours de semaine
  assert.equal(e.bilan.recharge?.source === "habitudes" && e.bilan.recharge.methode, "jourSemaine");
});
