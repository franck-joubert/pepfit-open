// Import Fitatu (lot 2 de Nutrition) : correspondance des repas, produits (fiche, recette, aliment libre), dédoublonnage par
// clé Fitatu et code-barres, unités, idempotence. Données fictives uniquement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { consommationsDuJour, enregistrerProduit, listerProduitsPerso, listerRepas } from "../src/db/depots/nutrition.ts";
import { cleProduit, estExportFitatu, importerFitatu, importerFitatuTexte, lireExportFitatu, portionsDeFiche, type ExportFitatu } from "../src/import/fitatu.ts";
import { ErreurImport } from "../src/import/hevy-csv.ts";

const item = (id: string, o: Record<string, unknown>) => ({ planDayDietItemId: id, foodType: "PRODUCT", updatedAt: "2026-07-07 08:00:00", ...o });

function exportFictif(): ExportFitatu {
  return {
    exporte_le: "2026-10-27",
    jours: {
      "2026-07-07": {
        breakfast: { items: [item("a1", { productId: 10, name: "Flocons fictifs", weight: 60, measureId: 1, measureName: "g", measureQuantity: 60, energy: 222 })] },
        second_breakfast: { items: [item("a2", { productId: 11, name: "Yaourt fictif", weight: 250, measureId: 39, measureName: "portion", measureQuantity: 2, energy: 150 })] },
        lunch: { items: [item("a3", { foodType: "RECIPE", recipeId: 7, name: "Chili fictif", weight: 300, measureId: 1, measureName: "g", measureQuantity: 300, energy: 390, protein: 30, fat: 12, carbohydrate: 39 })] },
        dinner: { items: [item("a4", { productId: 12, name: "Barre fictive", weight: 40, measureId: 20, measureName: "cuillère à soupe", measureQuantity: 2, energy: 160 })] },
        supper: { items: [item("a5", { foodType: "CUSTOM_ITEM", name: "Repas libre", measureId: 39, measureName: "portion", measureQuantity: 1, energy: 700, protein: 110, fat: 28, carbohydrate: 0 })] },
      },
      "2026-07-08": {
        breakfast: { items: [item("b1", { productId: 10, name: "Flocons fictifs", weight: 80, measureId: 1, measureName: "g", measureQuantity: 80, energy: 296 })] },
        snack: { items: [item("b2", { productId: 13, name: "Chips fictives", weight: 30, measureId: 1, measureName: "g", measureQuantity: 30, energy: 160 })] },
        brunch: { items: [item("b3", { productId: 10, name: "Flocons fictifs", weight: 10 })] },
      },
    },
    aliments: {
      "PRODUCT:10": { id: 10, name: "Flocons fictifs", brand: "Moulin fictif", barcode: "3000000000010", energy: 370, protein: 13, fat: 7, carbohydrate: 59, sugars: 1, fiber: 10, measures: [{ id: 1, name: "g", weightPerUnit: 1 }, { id: 2, name: "paquet", weightPerUnit: 500 }] },
      "PRODUCT:11": { id: 11, name: "Yaourt fictif", energy: 60, protein: 10, fat: 0, carbohydrate: 4, private: true, userId: 42, measures: [{ id: 39, name: "portion", weightPerUnit: 125 }] },
      "PRODUCT:12": { id: 12, name: "Barre fictive", energy: 400, measures: [{ id: 20, name: "cuillère à soupe", weightPerUnit: 20 }] },
      "PRODUCT:13": { id: 13, name: "Chips fictives", barcode: "3000000000013", energy: 530 },
      "RECIPE:7": { id: 7, name: "Chili fictif" },
    },
  };
}

test("export Fitatu : reconnu, lu, refusé s'il est illisible", () => {
  assert.ok(estExportFitatu(JSON.stringify(exportFictif())));
  assert.ok(!estExportFitatu('[{"id": 1, "title": "Routine"}]'));
  assert.throws(() => lireExportFitatu("{ pas du json"), ErreurImport);
  assert.throws(() => lireExportFitatu('{"jours": 3}'), ErreurImport);
});

test("portions d'une fiche : portion, pièce, paquet au poids de l'unité ; cuillère et verre ignorés", () => {
  assert.deepEqual(portionsDeFiche({ measures: [{ id: 1, weightPerUnit: 1 }, { id: 20, weightPerUnit: 15 }, { id: 2, weightPerUnit: 400 }, { id: 39, weightPerUnit: 200 }] }), [
    { type: "paquet", libelle: "", grammes: 400 },
    { type: "portion", libelle: "", grammes: 200 },
  ]);
  assert.equal(cleProduit({ foodType: "PRODUCT", productId: 11 }, { private: true }), "fitatu:perso:11");
  assert.equal(cleProduit({ foodType: "RECIPE_AI", recipeId: 9 }, undefined), "fitatu:recette:9");
});

test("import : repas de Fitatu vers ceux de pepfit, unités, produits dédoublonnés", async () => {
  const { db } = await baseDeTest();
  // Un produit déjà scanné (Open Food Facts) avec le même code-barres que les flocons : il est réutilisé, pas recréé.
  const off = await enregistrerProduit(db, { code_barres: "3000000000010", nom: "Flocons OFF", nutriments: { energie_kcal: 372 }, source: "off" });
  const r = await importerFitatu(db, exportFictif());
  assert.equal(r.joursLus, 2);
  assert.equal(r.joursImportes, 2);
  assert.equal(r.alimentsLus, 8);
  assert.equal(r.alimentsImportes, 7);
  assert.equal(r.erreurs.length, 1);
  assert.match(r.erreurs[0]!, /brunch/);
  assert.equal(r.produitsCrees, 5);
  assert.equal(r.produitsReutilises, 1);

  const j1 = await consommationsDuJour(db, "2026-07-07");
  const par = new Map(j1.map((c) => [c.repas_id, c]));
  assert.equal(par.get("repas:petit_dej")!.produit_id, off.id);
  assert.equal(par.get("repas:petit_dej")!.quantite_g, 60);
  // second_breakfast = Collation, en portions du produit (2 × 125 g).
  const yaourt = par.get("repas:collation")!;
  assert.equal(yaourt.unite, "portion");
  assert.equal(yaourt.nb_unites, 2);
  assert.equal(yaourt.quantite_g, 250);
  // Recette : valeurs pour 100 g déduites de l'aliment (390 kcal pour 300 g).
  const chili = par.get("repas:dejeuner")!;
  assert.equal(chili.produit.nutriments.energie_kcal, 130);
  assert.equal(Math.round(chili.macros.kcal), 390);
  // dinner = Goûter ; la cuillère n'existe pas dans pepfit : grammes.
  assert.equal(par.get("repas:gouter")!.unite, "g");
  assert.equal(par.get("repas:gouter")!.quantite_g, 40);
  // supper = Dîner ; aliment libre : une portion de 100 g qui porte ses valeurs.
  const libre = par.get("repas:diner")!;
  assert.equal(libre.unite, "portion");
  assert.equal(Math.round(libre.macros.kcal), 700);
  // snack = Apéritif (éteint, mais il a des aliments ce jour-là).
  const j2 = await consommationsDuJour(db, "2026-07-08");
  assert.ok(j2.some((c) => c.repas_id === "repas:aperitif"));
  assert.ok(!(await listerRepas(db)).some((x) => x.cle === "aperitif"));
  assert.ok((await listerRepas(db, true)).some((x) => x.cle === "aperitif"));
  // Les flocons des deux jours sont un seul produit.
  assert.equal(j2.find((c) => c.repas_id === "repas:petit_dej")!.produit_id, off.id);
  // Un produit perso de Fitatu rejoint « Mes produits » ; un produit public, non.
  assert.deepEqual((await listerProduitsPerso(db)).map((p) => p.nom), ["Yaourt fictif"]);
});

test("import : le relancer ne double rien, même après une suppression annulée", async () => {
  const { db, raw } = await baseDeTest();
  const texte = JSON.stringify(exportFictif());
  await importerFitatuTexte(db, texte);
  const n1 = (raw.prepare("SELECT COUNT(*) AS n FROM consommations").get() as { n: number }).n;
  const p1 = (raw.prepare("SELECT COUNT(*) AS n FROM produits").get() as { n: number }).n;
  const r2 = await importerFitatuTexte(db, texte);
  assert.equal(r2.alimentsImportes, 0);
  assert.equal(r2.alimentsDejaPresents, 7);
  assert.equal(r2.produitsCrees, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM consommations").get() as { n: number }).n, n1);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM produits").get() as { n: number }).n, p1);
  // Un jour de plus dans un nouvel export : seul lui entre.
  const e = exportFictif();
  e.jours["2026-07-09"] = { lunch: { items: [item("c1", { productId: 13, name: "Chips fictives", weight: 45, measureId: 1, measureName: "g", measureQuantity: 45 })] } };
  const r3 = await importerFitatu(db, e);
  assert.equal(r3.alimentsImportes, 1);
  assert.equal(r3.joursImportes, 1);
  assert.equal(r3.produitsCrees, 0);
});
