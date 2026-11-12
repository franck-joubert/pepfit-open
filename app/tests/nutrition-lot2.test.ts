// Nutrition, lot 2 : repas allumés ou éteints (migration 25), répéter un repas, copier d'un autre jour, jours remplis,
// supprimer un repas, statistiques d'un produit, objectifs selon l'activité. Données fictives.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import {
  ajouterConsommation, ajouterRepas, ajoutRapide, appliquerRepetitions, consommationsDuJour, consommationsDuRepas, copierConsommations, dernieresQuantites,
  ecrireRepetition, enregistrerProduit, joursRemplis, listerProduitsPerso, listerRepas, lireRepetition, modifierRepas, nbProduitsConsommes, ordonnerRepas,
  regleVaut, statsProduit, supprimerRepas,
} from "../src/db/depots/nutrition.ts";
import { kcalObjectif, objectifAuto } from "../src/nutrition/calculs.ts";

async function base() {
  const { db, raw } = await baseDeTest();
  const skyr = await enregistrerProduit(db, { nom: "Skyr fictif", nutriments: { energie_kcal: 60, proteines: 11 }, portions: [{ type: "portion", libelle: "", grammes: 150 }], source: "off" });
  const riz = await enregistrerProduit(db, { nom: "Riz fictif", nutriments: { energie_kcal: 130 }, source: "perso" });
  return { db, raw, skyr, riz };
}

test("repas : l'apéritif existe éteint, un repas s'éteint, se réordonne, s'ajoute ; supprimer n'efface qu'un repas ajouté sans historique", async () => {
  const { db, skyr } = await base();
  assert.deepEqual((await listerRepas(db)).map((r) => r.cle), ["petit_dej", "collation", "dejeuner", "gouter", "diner"]);
  assert.deepEqual((await listerRepas(db, true)).map((r) => r.cle), ["petit_dej", "collation", "dejeuner", "gouter", "aperitif", "diner"]);
  await modifierRepas(db, "repas:collation", { actif: false, heureMin: 640 });
  assert.ok(!(await listerRepas(db)).some((r) => r.cle === "collation"));
  assert.equal((await listerRepas(db, true)).find((r) => r.cle === "collation")!.heure_min, 640);
  const ids = (await listerRepas(db, true)).map((r) => r.id).reverse();
  await ordonnerRepas(db, ids);
  assert.equal((await listerRepas(db, true))[0]!.cle, "diner");
  const brunch = await ajouterRepas(db, "Brunch", 660);
  assert.ok(await supprimerRepas(db, brunch));
  assert.ok(!(await listerRepas(db, true)).some((r) => r.id === brunch));
  // Un repas d'origine, ou utilisé, s'éteint seulement.
  const souper = await ajouterRepas(db, "Souper", 1320);
  await ajouterConsommation(db, { date: "2026-10-20", repasId: souper, produitId: skyr.id, quantiteG: 150, unite: "portion", nbUnites: 1 });
  assert.equal(await supprimerRepas(db, souper), false);
  assert.equal(await supprimerRepas(db, "repas:diner"), false);
  assert.ok((await listerRepas(db, true)).some((r) => r.id === souper && !r.actif));
});

test("répéter : la règle, appliquée une seule fois par jour, seulement sur un repas vide", async () => {
  const { db, skyr, riz } = await base();
  assert.ok(regleVaut("semaine", "2026-10-30", false)); // vendredi
  assert.ok(!regleVaut("semaine", "2026-10-31", false)); // samedi
  assert.ok(regleVaut("entrainement", "2026-10-31", true) && !regleVaut("repos", "2026-10-31", true));
  await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:petit_dej", produitId: skyr.id, quantiteG: 150, unite: "portion", nbUnites: 1 });
  await ecrireRepetition(db, "repas:petit_dej", { regle: "tous", date: "2026-10-26" });
  assert.equal((await lireRepetition(db, "repas:petit_dej"))?.regle, "tous");
  assert.equal(await appliquerRepetitions(db, "2026-10-27", false, "2026-10-27"), 1);
  const j = await consommationsDuJour(db, "2026-10-27");
  assert.equal(j.length, 1);
  assert.ok(j[0]!.repete);
  // Relu : rien de plus ; vidé, il reste vide ; un jour futur n'est pas rempli d'avance.
  assert.equal(await appliquerRepetitions(db, "2026-10-27", false, "2026-10-27"), 0);
  await db.runAsync("DELETE FROM consommations WHERE date = ?", ["2026-10-27"]);
  assert.equal(await appliquerRepetitions(db, "2026-10-27", false, "2026-10-27"), 0);
  assert.equal(await appliquerRepetitions(db, "2026-10-29", false, "2026-10-27"), 0);
  // Repas déjà rempli : pas de répétition.
  await ajouterConsommation(db, { date: "2026-10-28", repasId: "repas:petit_dej", produitId: riz.id, quantiteG: 100, unite: "g", nbUnites: 100 });
  assert.equal(await appliquerRepetitions(db, "2026-10-28", false, "2026-10-28"), 0);
  await ecrireRepetition(db, "repas:petit_dej", { regle: "jamais", date: "2026-10-26" });
  assert.equal(await lireRepetition(db, "repas:petit_dej"), null);
});

test("copier d'un autre jour, jours remplis, dernières quantités, statistiques d'un produit", async () => {
  const { db, skyr, riz } = await base();
  const a = await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:dejeuner", produitId: riz.id, quantiteG: 180, unite: "g", nbUnites: 180 }, 1);
  const b = await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:dejeuner", produitId: skyr.id, quantiteG: 300, unite: "portion", nbUnites: 2 }, 2);
  assert.equal(await copierConsommations(db, [a, b], { date: "2026-10-27", repasId: "repas:diner" }), 2);
  const diner = await consommationsDuRepas(db, "2026-10-27", "repas:diner");
  assert.deepEqual(diner.map((c) => [c.produit.nom, c.quantite_g, c.unite, c.repete]), [["Riz fictif", 180, "g", false], ["Skyr fictif", 300, "portion", false]]);
  assert.deepEqual([...(await joursRemplis(db, "2026-10-20", "2026-10-26"))], ["2026-10-26"]);
  const q = await dernieresQuantites(db, [skyr.id], "repas:dejeuner");
  assert.deepEqual(q.get(skyr.id), { quantite_g: 300, unite: "portion", nb_unites: 2 });
  assert.equal(await nbProduitsConsommes(db), 2);
  const s = await statsProduit(db, skyr.id, "2026-10-01");
  // À égalité, le repas le plus récent l'emporte.
  assert.deepEqual(s, { foisMois: 2, totalG: 600, repasFrequent: "repas:diner", premiere: "2026-10-26" });
});

test("ajout rapide : une portion qui porte les valeurs, hors de « Mes produits »", async () => {
  const { db } = await base();
  await ajoutRapide(db, { nom: "Resto", proteines: 40, lipides: 20, glucides: 60, date: "2026-10-27", repasId: "repas:dejeuner" });
  const [c] = await consommationsDuJour(db, "2026-10-27");
  assert.equal(c!.unite, "portion");
  assert.equal(Math.round(c!.macros.kcal), 580);
  assert.ok(c!.macros.approx);
  assert.deepEqual((await listerProduitsPerso(db)).map((p) => p.nom), ["Riz fictif"]);
});

test("objectifs : l'activité hors sport change la dépense", () => {
  const h = { sexe: "h" as const, tailleCm: 180, poidsKg: 80, age: 40 };
  const assise = kcalObjectif(objectifAuto(h, "repos", 0, "assise"));
  const debout = kcalObjectif(objectifAuto(h, "repos", 0, "debout"));
  const physique = kcalObjectif(objectifAuto(h, "repos", 0, "physique"));
  assert.ok(assise < debout && debout < physique);
  assert.equal(kcalObjectif(objectifAuto(h, "repos")), debout);
});
