// Nutrition, lot 1 : calculs (macros, totaux, portions, objectifs), conversion Open Food Facts, migration et dépôts.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrer, VERSION_COURANTE } from "../src/db/migrations.ts";
import {
  additionner, cleJour, dateEstimee, decalerJour, energiePour100, grammesDepuisUnite, kcalDepuisMacros, kcalObjectif, macrosPourQuantite, metabolismeBase,
  objectifAuto, progression, sucresParDefaut, totaux, uniteDepuisGrammes, unitesDisponibles, valeursGrammes, valeursUnites, type Portion,
} from "../src/nutrition/calculs.ts";
import { grammesDuTexte, produitDepuisOff } from "../src/nutrition/off.ts";
import {
  ajouterConsommation, basculerFavori, chercherLocal, consommationsDuJour, deplacerConsommation, enregistrerProduit, listerRepas, mesAliments, modifierConsommation,
  masquerAliment, produitParCode, recentsDuRepas, remettreAliment, repasDeLHeure, repeterRepas, restaurerConsommation, supprimerConsommation, totalDe,
} from "../src/db/depots/nutrition.ts";
import { ecrireObjectif, estJourEntrainement, choisirJourEntrainement, lireObjectif, objectifCalcule } from "../src/db/depots/objectifs.ts";
import { ajouterMensuration, derniereMensuration, ecrireAnneeNaissance, ecrireSexe, historiqueMensuration, lireMorphologie } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";

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
const proche = (a: number, b: number, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

const SKYR = { proteines: 11, glucides: 4, lipides: 0.2, sucres: 3.8, energie_kcal: 63 };
const RIZ = { proteines: 7, glucides: 78, lipides: 0.6, sucres: 0.5, fibres: 1.4 };

test("kcal depuis les macros : 4 / 9 / 4, fibres à 2", () => {
  assert.equal(kcalDepuisMacros({ proteines: 10, glucides: 10, lipides: 10 }), 40 + 40 + 90);
  assert.equal(kcalDepuisMacros({ proteines: 0, glucides: 10, lipides: 0, fibres: 4 }), 4 * 6 + 2 * 4);
  assert.equal(kcalDepuisMacros({ glucides: 2, fibres: 5 }), 4);
});

test("énergie : kcal d'étiquette, sinon kJ, sinon macros (approximative)", () => {
  assert.deepEqual(energiePour100({ energie_kcal: 63 }), { kcal: 63, approx: false });
  const kj = energiePour100({ energie_kj: 418.4 });
  proche(kj.kcal, 100);
  assert.equal(kj.approx, false);
  const m = energiePour100(RIZ);
  assert.equal(m.approx, true);
  proche(m.kcal, 4 * 7 + 4 * 76.6 + 9 * 0.6 + 2 * 1.4);
});

test("macros d'une quantité et totaux", () => {
  const a = macrosPourQuantite(SKYR, 150);
  proche(a.kcal, 94.5);
  proche(a.proteines, 16.5);
  assert.equal(a.approx, false);
  const b = macrosPourQuantite(RIZ, 50);
  assert.equal(b.approx, true);
  const t = totaux([a, b]);
  proche(t.proteines, 16.5 + 3.5);
  assert.equal(t.approx, true);
  assert.deepEqual(totaux([]), { kcal: 0, proteines: 0, glucides: 0, lipides: 0, sucres: 0, approx: false });
  assert.equal(additionner(a, a).kcal, a.kcal * 2);
  assert.equal(macrosPourQuantite(SKYR, 100, true).approx, true);
});

test("portions : unités disponibles et conversions", () => {
  const portions: Portion[] = [
    { type: "portion", libelle: "1 pot", grammes: 125 },
    { type: "paquet", libelle: "4 pots", grammes: 0 },
  ];
  assert.deepEqual(unitesDisponibles(portions), ["g", "portion"]);
  assert.deepEqual(unitesDisponibles([]), ["g"]);
  assert.equal(grammesDepuisUnite("portion", 2, portions), 250);
  assert.equal(grammesDepuisUnite("paquet", 1, portions), null);
  assert.equal(grammesDepuisUnite("g", 80, portions), 80);
  assert.equal(uniteDepuisGrammes("portion", 250, portions), 2);
  assert.equal(uniteDepuisGrammes("piece", 10, portions), null);
});

test("valeurs des roues", () => {
  const g = valeursGrammes();
  assert.equal(g[0], 5);
  assert.equal(g.at(-1), 1000);
  assert.ok(g.includes(100) && g.includes(110) && g.includes(500) && g.includes(525));
  assert.deepEqual(g, [...g].sort((a, b) => a - b));
  const u = valeursUnites();
  assert.equal(u[0], 0.25);
  assert.equal(u.at(-1), 20);
});

test("objectifs : Mifflin-St Jeor, jour d'entraînement, rythme, kcal recalculées", () => {
  const h = { sexe: "h" as const, tailleCm: 180, poidsKg: 80, age: 30 };
  proche(metabolismeBase(h), 800 + 1125 - 150 + 5);
  proche(metabolismeBase({ ...h, sexe: "f" }), 800 + 1125 - 150 - 161);
  const repos = objectifAuto(h, "repos");
  const sport = objectifAuto(h, "entrainement");
  assert.ok(kcalObjectif(sport) > kcalObjectif(repos) + 200);
  assert.equal(repos.proteines, 144);
  // sèche à 0,5 kg/semaine : au plus 20 % de la dépense (D4)
  assert.ok(kcalObjectif(objectifAuto(h, "repos", -0.5)) < kcalObjectif(repos) - 300);
  assert.equal(sucresParDefaut(2800), 100); // repère D10 : 20 % des kcal, 100 g au plus
  assert.equal(sucresParDefaut(1500), 75);
  // la règle des macros (D1) : formule × 1,4, la dépense des séances (3 par semaine par défaut) est dans la moyenne de la semaine
  proche(kcalObjectif(repos), 1780 * 1.4, 10);
});

test("progression et date estimée", () => {
  assert.equal(progression(50, 100), 0.5);
  assert.equal(progression(150, 100), 1);
  assert.equal(progression(5, 0), 0);
  const d = dateEstimee(80, 75, -0.5, new Date(2026, 9, 27));
  assert.equal(cleJour(d!), "2027-01-05");
  assert.equal(dateEstimee(80, 85, -0.5, new Date()), null);
  assert.equal(dateEstimee(80, 80, 0.5, new Date()), null);
  assert.equal(decalerJour("2026-10-31", 1), "2026-11-01");
  assert.equal(decalerJour("2026-01-01", -1), "2025-12-31");
});

test("Open Food Facts : conversion d'un produit", () => {
  assert.equal(grammesDuTexte("1,5 kg"), 1500);
  assert.equal(grammesDuTexte("33 cl"), 330);
  assert.equal(grammesDuTexte("des pommes"), undefined);
  const p = produitDepuisOff({
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Ferrero, autre",
    categories_tags: ["en:spreads", "en:chocolate-spreads"],
    nutriments: { "energy-kcal_100g": 539, "energy-kj_100g": 2252, fat_100g: 30.9, "saturated-fat_100g": 10.6, carbohydrates_100g: 57.5, sugars_100g: 56.3, proteins_100g: 6.3, salt_100g: 0.107 },
    serving_size: "15 g",
    quantity: "400 g",
    nutriscore_grade: "e",
    nova_group: 4,
  })!;
  assert.equal(p.nom, "Nutella");
  assert.equal(p.marque, "Ferrero");
  assert.equal(p.categorie, "chocolate-spreads");
  assert.equal(p.nutriments.energie_kcal, 539);
  assert.equal(p.nutriments.lipides, 30.9);
  assert.deepEqual(p.portions.map((x) => [x.type, x.grammes]), [["portion", 15], ["paquet", 400]]);
  assert.equal(p.nutriscore, "E");
  assert.equal(p.nova, 4);
  assert.equal(p.base, "100g");
  assert.equal(produitDepuisOff({ code: "1", product_name: "", nutriments: { fat_100g: 1 } }), null);
  assert.equal(produitDepuisOff({ code: "1", product_name: "Rien", nutriments: {} }), null);
  assert.equal(produitDepuisOff({ code: "2", product_name: "Eau", quantity: "1 l", nutriments: { sugars_100g: 0 } })!.base, "100ml");
  // search-a-licious : marques en liste.
  assert.equal(produitDepuisOff({ code: "3", product_name: "Skyr fictif", brands: ["Marque A", "B"], nutriments: { proteins_100g: 10 } })!.marque, "Marque A");
  assert.equal(produitDepuisOff({ code: "4", product_name: "Sans marque", brands: [], nutriments: { proteins_100g: 10 } })!.marque, null);
});

test("migration 24 : tables, cinq repas, contraintes, idempotence", async () => {
  const { raw, db } = neuve();
  assert.equal(await migrer(db), VERSION_COURANTE);
  assert.ok(VERSION_COURANTE >= 24);
  assert.equal(await migrer(db), VERSION_COURANTE);
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  for (const t of ["produits", "repas", "consommations", "objectifs", "mensurations"]) assert.ok(tables.includes(t), t);
  assert.deepEqual((await listerRepas(db)).map((r) => r.cle), ["petit_dej", "collation", "dejeuner", "gouter", "diner"]);
  assert.throws(() => raw.prepare("INSERT INTO objectifs VALUES ('autre',1,1,1,1)").run());
});

test("migration 24 sur une base à la version 23 : les données restent", async () => {
  const { raw, db } = neuve();
  await migrer(db, 23);
  raw.prepare("INSERT INTO reglages (cle, valeur) VALUES ('prenom', 'F')").run();
  await migrer(db, 24);
  assert.equal((raw.prepare("SELECT valeur FROM reglages WHERE cle='prenom'").get() as { valeur: string }).valeur, "F");
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM repas").get() as { n: number }).n, 5);
});

async function base() {
  const { raw, db } = neuve();
  await migrer(db);
  const skyr = await enregistrerProduit(db, { code_barres: "111", nom: "Skyr nature", marque: "Danone", nutriments: SKYR, portions: [{ type: "portion", libelle: "1 pot", grammes: 150 }], source: "off" });
  const riz = await enregistrerProduit(db, { nom: "Riz basmati", nutriments: RIZ, source: "perso" });
  return { raw, db, skyr, riz };
}
const J = "2026-10-27";

test("produits : code-barres unique mis à jour, licence ODbL, recherche locale, favoris", async () => {
  const { db, skyr } = await base();
  assert.equal(skyr.licence, "ODbL");
  const maj = await enregistrerProduit(db, { code_barres: "111", nom: "Skyr nature 0 %", marque: "Danone", nutriments: SKYR, source: "off" });
  assert.equal(maj.id, skyr.id);
  assert.equal((await produitParCode(db, "111"))!.nom, "Skyr nature 0 %");
  assert.deepEqual((await chercherLocal(db, "skyr dan")).map((p) => p.nom), ["Skyr nature 0 %"]);
  assert.deepEqual((await chercherLocal(db, "RIZ")).map((p) => p.nom), ["Riz basmati"]);
  assert.deepEqual(await chercherLocal(db, "  "), []);
  assert.deepEqual(await chercherLocal(db, "pizza"), []);
  await basculerFavori(db, skyr.id, true);
  assert.equal((await produitParCode(db, "111"))!.favori, true);
  await assert.rejects(enregistrerProduit(db, { nom: " ", nutriments: {}, source: "perso" }));
});

test("journal : ajout, totaux par repas, modification, suppression et restauration", async () => {
  const { db, skyr, riz } = await base();
  const a = await ajouterConsommation(db, { date: J, repasId: "repas:petit_dej", produitId: skyr.id, quantiteG: 300, unite: "portion", nbUnites: 2 });
  await ajouterConsommation(db, { date: J, repasId: "repas:dejeuner", produitId: riz.id, quantiteG: 100, unite: "g", nbUnites: 100 });
  const lignes = await consommationsDuJour(db, J);
  assert.equal(lignes.length, 2);
  const pd = lignes.filter((l) => l.repas_id === "repas:petit_dej");
  proche(totalDe(pd).kcal, 189);
  assert.equal(totalDe(lignes).approx, true);
  await modifierConsommation(db, a, { quantiteG: 150, unite: "portion", nbUnites: 1 });
  proche(totalDe(await consommationsDuJour(db, J)).proteines, 16.5 + 7);
  const avant = (await consommationsDuJour(db, J)).find((l) => l.id === a)!;
  await supprimerConsommation(db, a);
  assert.equal((await consommationsDuJour(db, J)).length, 1);
  await restaurerConsommation(db, avant);
  assert.equal((await consommationsDuJour(db, J)).find((l) => l.id === a)!.quantite_g, 150);
  assert.equal((await consommationsDuJour(db, "2026-10-26")).length, 0);
  await assert.rejects(ajouterConsommation(db, { date: J, repasId: "repas:diner", produitId: riz.id, quantiteG: 0, unite: "g", nbUnites: 0 }));
});

test("glisser-déposer : dans un repas, vers un autre, ordres renumérotés", async () => {
  const { db, skyr, riz } = await base();
  const ids: string[] = [];
  for (const [p, r] of [[skyr, "repas:dejeuner"], [riz, "repas:dejeuner"], [skyr, "repas:dejeuner"], [riz, "repas:gouter"]] as const)
    ids.push(await ajouterConsommation(db, { date: J, repasId: r, produitId: p.id, quantiteG: 100, unite: "g", nbUnites: 100 }));
  const ordre = async (repas: string) => (await consommationsDuJour(db, J)).filter((l) => l.repas_id === repas).sort((a, b) => a.ordre - b.ordre).map((l) => ids.indexOf(l.id));
  assert.deepEqual(await ordre("repas:dejeuner"), [0, 1, 2]);
  await deplacerConsommation(db, ids[2]!, "repas:dejeuner", 0);
  assert.deepEqual(await ordre("repas:dejeuner"), [2, 0, 1]);
  await deplacerConsommation(db, ids[0]!, "repas:gouter", 1);
  assert.deepEqual(await ordre("repas:dejeuner"), [2, 1]);
  assert.deepEqual(await ordre("repas:gouter"), [3, 0]);
  await deplacerConsommation(db, ids[1]!, "repas:diner", 99);
  assert.deepEqual(await ordre("repas:diner"), [1]);
  await deplacerConsommation(db, "inconnu", "repas:diner", 0);
});

test("répéter un repas : lignes copiées, marquées ↻ ; récents du repas ; Mes aliments", async () => {
  const { db, skyr, riz } = await base();
  await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:dejeuner", produitId: riz.id, quantiteG: 200, unite: "g", nbUnites: 200 }, 1000);
  await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:dejeuner", produitId: skyr.id, quantiteG: 150, unite: "portion", nbUnites: 1 }, 2000);
  assert.equal(await repeterRepas(db, { date: "2026-10-26", repasId: "repas:dejeuner" }, { date: J, repasId: "repas:dejeuner" }), 2);
  const l = await consommationsDuJour(db, J);
  assert.deepEqual(l.map((x) => [x.produit.nom, x.repete, x.quantite_g]), [["Riz basmati", true, 200], ["Skyr nature", true, 150]]);
  assert.equal(await repeterRepas(db, { date: "2025-01-01", repasId: "repas:diner" }, { date: J, repasId: "repas:diner" }), 0);
  assert.deepEqual((await recentsDuRepas(db, "repas:dejeuner")).map((p) => p.nom).sort(), ["Riz basmati", "Skyr nature"]);
  const parFois = await mesAliments(db, "tout", "fois", null);
  assert.equal(parFois[0]!.fois, 2);
  const parQuantite = await mesAliments(db, "semaine", "quantite", "2026-10-27");
  assert.deepEqual(parQuantite.map((x) => x.produit.nom), ["Riz basmati", "Skyr nature"]);
  assert.equal(parQuantite[0]!.quantiteG, 200);
  const parKcal = await mesAliments(db, "mois", "kcal", "2026-10-01");
  assert.equal(parKcal[0]!.produit.nom, "Riz basmati");
});

test("Mes aliments : retirer garde le journal, Annuler remet, une nouvelle consommation fait revenir", async () => {
  const { db, raw, skyr, riz } = await base();
  await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:dejeuner", produitId: riz.id, quantiteG: 200, unite: "g", nbUnites: 200 }, 1000);
  await ajouterConsommation(db, { date: "2026-10-26", repasId: "repas:gouter", produitId: skyr.id, quantiteG: 150, unite: "g", nbUnites: 150 }, 1000);
  const noms = async () => (await mesAliments(db, "tout", "fois", null)).map((x) => x.produit.nom).sort();
  assert.deepEqual(await noms(), ["Riz basmati", "Skyr nature"]);

  const avant = await masquerAliment(db, riz.id, 5000);
  assert.equal(avant, null);
  assert.deepEqual(await noms(), ["Skyr nature"]);
  // le journal est intact
  assert.equal((await consommationsDuJour(db, "2026-10-26")).length, 2);
  // filtre aussi sur une période
  assert.deepEqual((await mesAliments(db, "semaine", "kcal", "2026-10-20")).map((x) => x.produit.nom), ["Skyr nature"]);

  await remettreAliment(db, riz.id, avant);
  assert.deepEqual(await noms(), ["Riz basmati", "Skyr nature"]);

  await masquerAliment(db, riz.id, 5000);
  // consommation datée d'avant le retrait (cree_le 4000) : reste retiré ; après (6000) : revient, avec tout son historique
  await ajouterConsommation(db, { date: J, repasId: "repas:diner", produitId: riz.id, quantiteG: 100, unite: "g", nbUnites: 100 }, 4000);
  assert.deepEqual(await noms(), ["Skyr nature"]);
  await ajouterConsommation(db, { date: J, repasId: "repas:diner", produitId: riz.id, quantiteG: 100, unite: "g", nbUnites: 100 }, 6000);
  const l = await mesAliments(db, "tout", "fois", null);
  assert.deepEqual(l.map((x) => [x.produit.nom, x.fois]), [["Riz basmati", 3], ["Skyr nature", 1]]);
  assert.equal((raw.prepare("SELECT masque_le FROM produits WHERE id = ?").get(riz.id) as { masque_le: number }).masque_le, 5000);
});

test("repas de l'heure", async () => {
  const { db } = await base();
  const r = await listerRepas(db);
  assert.equal(repasDeLHeure(r, 7 * 60)!.cle, "petit_dej");
  assert.equal(repasDeLHeure(r, 12 * 60 + 40)!.cle, "dejeuner");
  assert.equal(repasDeLHeure(r, 23 * 60)!.cle, "diner");
  assert.equal(repasDeLHeure(r, 3 * 60)!.cle, "petit_dej");
});

test("objectifs : défaut, réglés, calculés (auto) et jour d'entraînement", async () => {
  const { raw, db } = await base();
  assert.equal((await lireObjectif(db, "repos")).proteines, 150);
  await ecrireObjectif(db, "repos", { proteines: 120, glucides: 200, lipides: 60, sucres: 50 });
  await ecrireObjectif(db, "repos", { proteines: 125, glucides: 200, lipides: 60, sucres: 50 });
  assert.equal((await lireObjectif(db, "repos")).proteines, 125);
  assert.equal(await objectifCalcule(db, "repos"), null);
  await ecrireSexe(db, "h");
  await ajouterMensuration(db, "taille", 180);
  await ajouterPesee(db, 80);
  await ecrireAnneeNaissance(db, 1996);
  const calc = (await objectifCalcule(db, "repos", new Date(2026, 5, 1).getTime()))!;
  assert.equal(calc.proteines, 144);
  await ecrireReglage(db, "nutri_auto", "1");
  assert.equal((await lireObjectif(db, "repos")).proteines, 144);
  // jour d'entraînement : séance faite ce jour-là, sinon choix
  assert.equal(await estJourEntrainement(db, J), false);
  const debut = new Date(2026, 9, 27, 18).getTime();
  raw.prepare("INSERT INTO seances (id, debut, fin, maj_le) VALUES ('s', ?, ?, ?)").run(debut, debut + 3600_000, debut);
  assert.equal(await estJourEntrainement(db, J), true);
  await choisirJourEntrainement(db, J, false);
  assert.equal(await estJourEntrainement(db, J), false);
  await choisirJourEntrainement(db, "2026-10-28", true);
  assert.equal(await estJourEntrainement(db, "2026-10-28"), true);
});

test("lireMorphologie : sexe, taille, poids les plus récents, null sans donnée", async () => {
  const { db } = await base();
  assert.deepEqual(await lireMorphologie(db), { sexe: null, tailleCm: null, poidsKg: null });
  await ecrireSexe(db, "f");
  await ajouterMensuration(db, "taille", 168, 1000);
  await ajouterMensuration(db, "taille", 169, 2000);
  await ajouterPesee(db, 62.5, 1000);
  await ajouterPesee(db, 61, 2000);
  assert.deepEqual(await lireMorphologie(db), { sexe: "f", tailleCm: 169, poidsKg: 61 });
  assert.deepEqual((await historiqueMensuration(db, "taille")).map((m) => m.valeur), [169, 168]);
  assert.equal((await derniereMensuration(db, "bras")), null);
  await assert.rejects(ajouterMensuration(db, "taille", 0));
});

test("glisser-déposer : rang d'insertion et nouvel ordre", async () => {
  const { rangDeDepot, placerAliment } = await import("../src/nutrition/glisser.ts");
  assert.equal(rangDeDepot(50, [10, 40, 90]), 2);
  assert.equal(rangDeDepot(5, [10, 40]), 0);
  assert.equal(rangDeDepot(500, []), 0);
  assert.deepEqual(placerAliment(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
  assert.deepEqual(placerAliment(["a", "b", "c"], "a", 2), ["b", "c", "a"]);
  assert.deepEqual(placerAliment(["a", "b"], "z", 99), ["a", "b", "z"]);
});
