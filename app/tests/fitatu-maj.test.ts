// Mise en accord avec Fitatu (docs/FITATU-MAJ.md) : un jour relu suit la réponse (ligne modifiée, supprimée, nouvel
// identifiant) ; les lignes saisies dans pepfit et les jours non relus ne bougent pas ; « Tout réimporter » nettoie les
// doublons d'avant ; plus de 800 g d'un aliment sec est signalé. Faux serveur derrière le vrai client, réponses INVENTÉES.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { creerClientFitatu, type ReponseHttp, type SessionFitatu } from "../src/fitatu/api.ts";
import { importerHistorique, type DepsHistorique, type EtatImportFitatu } from "../src/fitatu/historique.ts";
import { importerFitatu, type ExportFitatu } from "../src/import/fitatu.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JETON = `${b64({ alg: "RS256" })}.${b64({ id: 900001, exp: 2_000_000_000 })}.signature-fictive`;
const SESSION: SessionFitatu = {
  jeton: JETON,
  renouvellement: "rt-fictif",
  uid: "900001",
  base: "https://xx-xx.fitatu.example/api",
  entetes: { "api-key": "CLE-FICTIVE", "api-secret": "SECRET-FICTIF", "app-os": "FITATU-WEB", "app-uuid": "00000000-0000-1000-8000-000000000000" },
  cluster: "xx-xx900001",
};

const rep = (status: number, corps: unknown = {}): ReponseHttp => ({ status, headers: { get: () => null }, text: async () => JSON.stringify(corps) });
const ligne = (id: string, o: Record<string, unknown> = {}) => ({ planDayDietItemId: id, foodType: "PRODUCT", productId: 10, name: "Flocons fictifs", measureId: 1, measureName: "g", weight: 60, measureQuantity: 60, ...o });
const jour = (repas: Record<string, unknown[]>) => ({ dietPlan: Object.fromEntries(Object.entries(repas).map(([k, items]) => [k, { items }])) });

const PRODUITS: Record<string, unknown> = {
  "10": { id: 10, name: "Flocons fictifs", energy: 372, protein: 14, fat: 7, carbohydrate: 59, measures: [{ id: 2, name: "paquet", weightPerUnit: 1000 }] },
  "11": { id: 11, name: "Lait fictif", energy: 46, liquid: true },
};

/** Faux Fitatu : journal modifiable entre deux imports ; compte créé le 2026-10-01, aujourd'hui 2026-10-10. */
function simulation(db: Executeur) {
  let brut: string | null = null;
  const journal: Record<string, unknown> = {};
  const absents = new Set<string>();
  const s = { journal, absents, aujourdhui: "2026-10-10", etat: () => JSON.parse(brut!) as EtatImportFitatu, d: null as unknown as DepsHistorique };
  const c = creerClientFitatu({
    fetch: async (url) => {
      const chemin = url.replace(SESSION.base, "");
      const j = /\/day\/(\d{4}-\d{2}-\d{2})$/.exec(chemin);
      if (j) return absents.has(j[1]!) ? rep(404) : rep(200, journal[j[1]!] ?? { dietPlan: {} });
      const p = /^\/products\/(\d+)$/.exec(chemin);
      if (p) return PRODUITS[p[1]!] ? rep(200, PRODUITS[p[1]!]) : rep(404);
      if (chemin === "/users/900001") return rep(200, { createdAt: "2026-10-01 08:00:00" });
      return rep(500);
    },
    lireSession: async () => SESSION,
    ecrireSession: async () => {},
    attendre: async () => {},
  });
  s.d = {
    jour: (d) => c.jour(d),
    produit: (id) => c.produit(id),
    produitConnu: async (id) => {
      const r = await db.getFirstAsync<{ import_cle: string }>("SELECT import_cle FROM produits WHERE import_cle IN (?, ?)", [`fitatu:produit:${id}`, `fitatu:perso:${id}`]);
      return r ? (r.import_cle.startsWith("fitatu:perso:") ? "perso" : "produit") : null;
    },
    importer: (e, joursRelus) => importerFitatu(db, e, Date.now(), { joursRelus }),
    lireEtat: async () => brut,
    ecrireEtat: async (e) => void (brut = e),
    attendre: async () => {},
    aujourdhui: () => s.aujourdhui,
    premiereDate: async () => "2026-10-01",
    actif: async () => true,
  };
  return s;
}

type L = { date: string; repas_id: string; quantite_g: number; unite: string; nb_unites: number; import_cle: string | null; produit_id: string };
const lignes = (db: Executeur, date?: string) =>
  db.getAllAsync<L>(`SELECT date, repas_id, quantite_g, unite, nb_unites, import_cle, produit_id FROM consommations ${date ? "WHERE date = ?" : ""} ORDER BY date, repas_id, ordre`, date ? [date] : []);

/** Ligne saisie dans pepfit (sans clé d'import), sur le produit des flocons. */
async function saisir(db: Executeur, date: string) {
  const p = (await db.getFirstAsync<{ id: string }>("SELECT id FROM produits WHERE import_cle = 'fitatu:produit:10'", []))!;
  await db.runAsync("INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, unite, nb_unites, ordre, cree_le) VALUES (?,?,?,?,?,?,?,?,?)", [`saisie-${date}`, date, "repas:dejeuner", p.id, 50, "g", 50, 99, 0]);
}

test("modification : même clé, quantité changée chez Fitatu → la ligne est mise à jour, pas doublée", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.journal["2026-10-08"] = jour({ lunch: [ligne("a1", { weight: 1000, measureQuantity: 1000 })] });
  assert.equal(await importerHistorique(s.d), "fini");
  assert.equal((await lignes(db, "2026-10-08"))[0]!.quantite_g, 1000);

  s.journal["2026-10-08"] = jour({ supper: [ligne("a1", { weight: 100, measureQuantity: 100 })] });
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  const l = await lignes(db, "2026-10-08");
  assert.equal(l.length, 1);
  assert.equal(l[0]!.quantite_g, 100);
  assert.equal(l[0]!.repas_id, "repas:diner"); // changé de repas aussi
  assert.equal(s.etat().alimentsMisAJour, 1);

  // aliment changé (lait à la place des flocons) : même ligne, autre produit
  s.journal["2026-10-08"] = jour({ supper: [ligne("a1", { productId: 11, name: "Lait fictif", weight: 250, measureQuantity: 250, liquid: true })] });
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  const [lait] = await lignes(db, "2026-10-08");
  assert.equal((await db.getFirstAsync<{ nom: string }>("SELECT nom FROM produits WHERE id = ?", [lait!.produit_id]))!.nom, "Lait fictif");
  assert.equal(lait!.quantite_g, 250);
});

test("suppression : clé absente du jour relu (retirée ou deletedAt) → ligne supprimée et notée dans le rapport", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.journal["2026-10-06"] = jour({ lunch: [ligne("b1"), ligne("b2", { weight: 40 })], breakfast: [ligne("b3")] });
  assert.equal(await importerHistorique(s.d), "fini");
  assert.equal((await lignes(db, "2026-10-06")).length, 3);

  s.journal["2026-10-06"] = jour({ lunch: [ligne("b1"), ligne("b2", { weight: 40, deletedAt: "2026-10-09 10:00:00" })] });
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  assert.deepEqual((await lignes(db, "2026-10-06")).map((l) => l.import_cle), ["fitatu:b1"]);
  assert.equal(s.etat().alimentsSupprimes, 2);

  // jour vidé chez Fitatu (dietPlan vide) : plus rien d'importé ce jour-là
  s.journal["2026-10-06"] = { dietPlan: {} };
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  assert.equal((await lignes(db, "2026-10-06")).length, 0);
});

test("nouvel identifiant : l'ancienne ligne part, la nouvelle arrive, un seul « Flocons » au déjeuner", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.journal["2026-10-09"] = jour({ lunch: [ligne("c1", { weight: 1000, measureQuantity: 1000 })] });
  assert.equal(await importerHistorique(s.d), "fini");
  s.journal["2026-10-09"] = jour({ lunch: [ligne("c2", { weight: 100, measureQuantity: 100 })] });
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  const l = await lignes(db, "2026-10-09");
  assert.deepEqual(l.map((x) => [x.import_cle, x.quantite_g]), [["fitatu:c2", 100]]);
});

test("ligne saisie dans pepfit et jour non relu : intacts", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.journal["2026-10-01"] = jour({ lunch: [ligne("d1")] });
  s.journal["2026-10-05"] = jour({ lunch: [ligne("d2")] });
  s.journal["2026-10-07"] = jour({ lunch: [ligne("d3")] });
  assert.equal(await importerHistorique(s.d), "fini");
  await saisir(db, "2026-10-05");
  await saisir(db, "2026-10-01");

  // tout change chez Fitatu ; « Mettre à jour » relit du 2026-10-03 au 2026-10-10 ; le 7, Fitatu répond 404 (pas relu)
  s.journal["2026-10-01"] = { dietPlan: {} };
  s.journal["2026-10-05"] = { dietPlan: {} };
  s.absents.add("2026-10-07");
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  assert.equal(s.etat().debut, "2026-10-03");
  // jour relu : la ligne Fitatu part, la saisie pepfit reste
  assert.deepEqual((await lignes(db, "2026-10-05")).map((l) => l.import_cle), [null]);
  // jours non relus (hors période, 404) : rien ne bouge
  assert.deepEqual((await lignes(db, "2026-10-01")).map((l) => l.import_cle), ["fitatu:d1", null]);
  assert.deepEqual((await lignes(db, "2026-10-07")).map((l) => l.import_cle), ["fitatu:d3"]);
});

test("« Tout réimporter » : relit tout l'historique et retire les doublons d'avant ; la saisie pepfit reste", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  // doublon d'avant la mise en accord : l'ancienne clé e1 et la nouvelle e2 le même jour, hors des 7 derniers jours
  s.journal["2026-10-01"] = jour({ lunch: [ligne("e1", { weight: 1000, measureQuantity: 1000 })] });
  const exp: ExportFitatu = { jours: { "2026-10-01": { lunch: { items: [ligne("e1", { weight: 1000, measureQuantity: 1000 })] } } }, aliments: { "PRODUCT:10": PRODUITS["10"] as never } };
  await importerFitatu(db, exp);
  await importerFitatu(db, { ...exp, jours: { "2026-10-01": { lunch: { items: [ligne("e2", { weight: 100, measureQuantity: 100 })] } } } });
  await saisir(db, "2026-10-01");
  assert.equal((await lignes(db, "2026-10-01")).length, 3); // l'import par fichier ne fait qu'ajouter
  s.journal["2026-10-01"] = jour({ lunch: [ligne("e2", { weight: 100, measureQuantity: 100 })] });
  assert.equal(await importerHistorique(s.d), "fini");
  // « Mettre à jour » ne relit pas le 1er : le doublon reste
  assert.equal(await importerHistorique(s.d, { mettreAJour: true }), "fini");
  assert.equal((await lignes(db, "2026-10-01")).length, 2);

  assert.equal(await importerHistorique(s.d, { toutReimporter: true }), "fini");
  assert.equal(s.etat().debut, "2026-10-01");
  assert.deepEqual((await lignes(db, "2026-10-01")).map((l) => [l.import_cle, l.quantite_g]), [["fitatu:e2", 100], [null, 50]]);
});

test("plus de 800 g d'un aliment sec : gardé tel quel, mais signalé ; pas un liquide", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.journal["2026-10-04"] = jour({
    lunch: [ligne("f1", { weight: null, measureId: 2, measureName: "paquet", measureQuantity: 1 })],
    breakfast: [ligne("f2", { productId: 11, name: "Lait fictif", weight: 1000, measureQuantity: 1000, liquid: true })],
  });
  assert.equal(await importerHistorique(s.d), "fini");
  const [f1] = (await lignes(db, "2026-10-04")).filter((l) => l.import_cle === "fitatu:f1");
  assert.deepEqual([f1!.quantite_g, f1!.unite, f1!.nb_unites], [1000, "paquet", 1]);
  assert.deepEqual(s.etat().alertes, ["2026-10-04 : « Flocons fictifs » 1000 g (1 × paquet)"]);
});
