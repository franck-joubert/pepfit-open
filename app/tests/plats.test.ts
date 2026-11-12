// Plats personnalisés (planche plats, validée le 30/10) : calculs (portion, 100 g, plat entier, poids cuit), ajustement
// « pour cette fois », ajout au journal en une ligne aux valeurs figées, copier et répéter, repas → plat, recettes Fitatu
// devenues des plats, synchro chiffrée (nom et produits des ingrédients jamais en clair) et photo connue du ménage.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cheminsPhotosConnus } from "../src/db/depots/photos.ts";
import { copierPhotoPlat } from "../src/photos/copie-plat.ts";
import {
  ajouterConsommation, chercherLocal, consommationsDuJour, copierConsommations, dernieresQuantites, enregistrerProduit, foisDepuis, kcalParJour, masquerAliment, mesAliments,
  nbProduitsConsommes, recentsDuRepas, remettreAliment, repeterRepas, restaurerConsommation, statsProduit, supprimerConsommation, type Produit,
} from "../src/db/depots/nutrition.ts";
import {
  ajouterPlatAuJournal, brouillonDepuisRepas, consommationDePlat, enregistrerPlat, lirePlat, listerPlats, nomCopie, recentsPlatsDuRepas,
  statsPlat, supprimerPlat, type BrouillonPlat,
} from "../src/db/depots/plats.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { compositionPour, nutrimentsPour100, poidsPlat, poidsPortion, totalPlat, valeursPlat, type PlatCalcul } from "../src/nutrition/plats.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { tableSync } from "../src/sync/schema.ts";
import { baseDeTest, sensiblesChiffrees } from "./aide.ts";

const proche = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

const fige = (nom: string, kcal: number, p: number, g: number, l: number, s = 0) => ({
  nom, marque: null, base: "100g" as const, nutriments: { energie_kcal: kcal, proteines: p, glucides: g, lipides: l, sucres: s }, portions: [],
});

/** Le chili de la planche, en plus court : bœuf 500 g, riz cru 240 g, haricots 400 g ; 4 portions, 2 160 g cuit. */
const CHILI: PlatCalcul = {
  portions: 4,
  poids_cuit_g: 2160,
  sans_ingredients: false,
  nutriments_100g: null,
  poids_total_g: null,
  ingredients: [
    { id: "boeuf", produit_id: "p1", produit: fige("Bœuf haché 5 %", 137, 21.4, 0, 5.6), quantite_g: 500, unite: "g", nb_unites: 500 },
    { id: "riz", produit_id: "p2", produit: fige("Riz basmati cru", 350, 8.3, 76.7, 0.8, 0.4), quantite_g: 240, unite: "g", nb_unites: 240 },
    { id: "haricots", produit_id: "p3", produit: fige("Haricots rouges", 113, 8.5, 15.5, 0.5, 0.75), quantite_g: 400, unite: "piece", nb_unites: 1 },
  ],
};

test("plat : poids (cuit, sinon cru), plat entier, une portion et 100 g", () => {
  assert.equal(poidsPlat(CHILI), 2160);
  assert.equal(poidsPortion(CHILI), 540);
  assert.equal(poidsPlat({ ...CHILI, poids_cuit_g: null }), 1140);
  const t = totalPlat(CHILI);
  proche(t.kcal, 685 + 840 + 452);
  proche(t.proteines, 107 + 19.92 + 34);
  const v = valeursPlat(CHILI);
  proche(v.portion.kcal, (685 + 840 + 452) / 4);
  assert.equal(v.portionG, 540);
  proche(v.cent.kcal, ((685 + 840 + 452) * 100) / 2160);
  proche(v.entier.glucides, 184.08 + 62);
  // Sans poids cuit, les 100 g sont pris sur le poids des ingrédients.
  proche(valeursPlat({ ...CHILI, poids_cuit_g: null }).cent.kcal, ((685 + 840 + 452) * 100) / 1140);
});

test("plat sans ingrédients (recette Fitatu) : ses valeurs pour 100 g et son poids", () => {
  const p: PlatCalcul = { portions: 6, poids_cuit_g: null, sans_ingredients: true, nutriments_100g: { energie_kcal: 175, proteines: 9.7 }, poids_total_g: 2100, ingredients: [] };
  assert.equal(poidsPortion(p), 350);
  proche(valeursPlat(p).portion.kcal, 612.5);
  const c = compositionPour(p, 350);
  assert.deepEqual(c.lignes, []);
  proche(c.macros.kcal, 612.5);
});

test("quantité choisie : une demi-portion met chaque ingrédient à l'échelle ; nutriments pour 100 g de la composition", () => {
  const c = compositionPour(CHILI, 270);
  assert.equal(c.poidsG, 270);
  assert.equal(c.ajuste, false);
  proche(c.lignes.find((l) => l.id === "boeuf")!.quantite_g, 62.5);
  assert.equal(c.lignes.find((l) => l.id === "haricots")!.nb_unites, 0.13);
  proche(c.macros.kcal, (685 + 840 + 452) / 8);
  const n = nutrimentsPour100(c);
  proche(n.energie_kcal!, ((685 + 840 + 452) * 100) / 2160, 0.02);
  proche(n.proteines!, ((107 + 19.92 + 34) * 100) / 2160, 0.02);
});

test("ajustement pour cette fois : quantité propre, ou retiré ; le poids suit l'écart cru × rapport cuit / cru", () => {
  // Une portion (540 g) : riz prévu 60 g, mis à 120 g ; écart cru + 60 g, rapport 2160 / 1140.
  const c = compositionPour(CHILI, 540, new Map([["riz", { quantite_g: 120, unite: "g" as const, nb_unites: 120 }]]));
  assert.equal(c.ajuste, true);
  const riz = c.lignes.find((l) => l.id === "riz")!;
  assert.equal(riz.ajuste, true);
  assert.equal(riz.quantite_g, 120);
  proche(c.poidsG, 540 + 60 * (2160 / 1140));
  proche(c.macros.kcal, (685 + 452) / 4 + 420);
  // Retiré : sa ligne part, ses valeurs aussi, le plat ne change pas.
  const r = compositionPour(CHILI, 540, new Map([["boeuf", null]]));
  assert.deepEqual(r.lignes.map((l) => l.id), ["riz", "haricots"]);
  proche(r.macros.kcal, (840 + 452) / 4);
  proche(r.poidsG, 540 - 125 * (2160 / 1140));
  assert.equal(CHILI.ingredients[0]!.quantite_g, 500);
});

async function produits(db: Executeur): Promise<Produit[]> {
  return [
    await enregistrerProduit(db, { nom: "Bœuf haché 5 %", nutriments: { energie_kcal: 137, proteines: 21.4, lipides: 5.6 }, source: "perso" }),
    await enregistrerProduit(db, { nom: "Riz basmati cru", nutriments: { energie_kcal: 350, proteines: 8.3, glucides: 76.7, lipides: 0.8 }, source: "off" }),
  ];
}

const brouillon = (p: Produit[], o: Partial<BrouillonPlat> = {}): BrouillonPlat => ({
  nom: "Chili con carne",
  portions: 4,
  poids_cuit_g: 1480,
  photo: null,
  ingredients: [
    { produit_id: p[0]!.id, produit: p[0]!, quantite_g: 500, unite: "g", nb_unites: 500 },
    { produit_id: p[1]!.id, produit: p[1]!, quantite_g: 240, unite: "g", nb_unites: 240 },
  ],
  ...o,
});

test("dépôt : créer, relire, modifier (les ingrédients gardés gardent leur id), chercher, supprimer ; refus sans nom ni ingrédient", async () => {
  const { db, raw } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  assert.equal(plat.nom, "Chili con carne");
  assert.equal(plat.ingredients.length, 2);
  assert.equal(plat.ingredients[0]!.produit.nom, "Bœuf haché 5 %");
  assert.equal(poidsPortion(plat), 370);
  const riz = plat.ingredients[1]!;
  await enregistrerPlat(db, { ...brouillon(p, { nom: "Chili", portions: 2 }), ingredients: [{ ...riz, quantite_g: 300, nb_unites: 300 }] }, id);
  const apres = (await lirePlat(db, id))!;
  assert.deepEqual(apres.ingredients.map((i) => [i.id, i.quantite_g]), [[riz.id, 300]]);
  assert.equal(apres.portions, 2);
  assert.deepEqual((await listerPlats(db, "chi")).map((x) => x.id), [id]);
  assert.deepEqual(await listerPlats(db, "lasagnes"), []);
  await assert.rejects(enregistrerPlat(db, brouillon(p, { nom: " " })));
  await assert.rejects(enregistrerPlat(db, brouillon(p, { ingredients: [] })));
  await supprimerPlat(db, id);
  assert.equal(await lirePlat(db, id), null);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM plat_ingredients").get() as { n: number }).n, 0);
  assert.equal(nomCopie("Gâteau protéiné", new Set(["Gâteau protéiné (2)"])), "Gâteau protéiné (3)");
  assert.equal(nomCopie("Chili (2)", new Set()), "Chili (2)");
});

test("journal : un plat en une ligne (« 1 portion, 370 g »), valeurs figées : modifier ou supprimer le plat ne change pas le jour passé", async () => {
  const { db } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  const consoId = await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:dejeuner", unite: "portion", nb: 1 });
  const [l] = await consommationsDuJour(db, "2026-10-30");
  assert.equal(l!.id, consoId);
  assert.equal(l!.plat_id, id);
  assert.equal(l!.produit.nom, "Chili con carne");
  assert.equal(l!.unite, "portion");
  assert.equal(l!.nb_unites, 1);
  assert.equal(l!.quantite_g, 370);
  const kcal = (685 + 840) / 4;
  proche(l!.macros.kcal, kcal, 0.05);
  // Le produit figé ne sort ni dans la recherche, ni dans les récents, ni dans Mes aliments : ses ingrédients, si.
  assert.deepEqual((await chercherLocal(db, "chili")).map((x) => x.nom), []);
  assert.deepEqual((await recentsDuRepas(db, "repas:dejeuner")).map((x) => x.nom).sort(), ["Bœuf haché 5 %", "Riz basmati cru"]);
  assert.deepEqual((await mesAliments(db, "tout", "fois", null)).map((x) => x.produit.nom).sort(), ["Bœuf haché 5 %", "Riz basmati cru"]);
  assert.equal(await nbProduitsConsommes(db), 2);
  assert.deepEqual((await recentsPlatsDuRepas(db, "repas:dejeuner")).map((x) => x.id), [id]);
  // Le plat change : le jour passé garde ses valeurs (P4).
  await enregistrerPlat(db, brouillon(p, { portions: 1 }), id);
  proche((await consommationsDuJour(db, "2026-10-30"))[0]!.macros.kcal, kcal, 0.05);
  await supprimerPlat(db, id);
  proche((await consommationsDuJour(db, "2026-10-30"))[0]!.macros.kcal, kcal, 0.05);
});

test("journal : demi-portion, grammes, ajustement pour cette fois relu à la réouverture ; même plat mangé pareil = un seul produit figé", async () => {
  const { db, raw } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:dejeuner", unite: "portion", nb: 0.5 });
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-31", repasId: "repas:dejeuner", unite: "portion", nb: 0.5 });
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:diner", unite: "g", nb: 350 });
  const riz = plat.ingredients[1]!;
  const ajuste = await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:gouter", unite: "portion", nb: 1, ajustements: new Map([[riz.id, null]]) });
  const jour = await consommationsDuJour(db, "2026-10-30");
  const demi = jour.find((x) => x.repas_id === "repas:dejeuner")!;
  assert.equal(demi.quantite_g, 185);
  proche(demi.macros.kcal, (685 + 840) / 8, 0.05);
  const g = jour.find((x) => x.repas_id === "repas:diner")!;
  assert.deepEqual([g.unite, g.nb_unites, g.quantite_g], ["g", 350, 350]);
  const a = jour.find((x) => x.id === ajuste)!;
  assert.equal(a.ajuste, true);
  proche(a.macros.kcal, 685 / 4, 0.05);
  proche(a.quantite_g, 370 - 60 * (1480 / 740), 0.1);
  const relue = (await consommationDePlat(db, ajuste))!;
  assert.equal(relue.plat_id, id);
  assert.deepEqual([...relue.ajustements.entries()], [[riz.id, null]]);
  // Demi-portions et grammes partagent leur produit figé (mêmes valeurs pour 100 g) ; l'ajusté a le sien.
  const figes = raw.prepare("SELECT COUNT(*) AS n FROM produits WHERE categorie = 'plat'").get() as { n: number };
  assert.equal(figes.n, 2);
  // Rouvrir et modifier la ligne : même ligne, nouvelle quantité.
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:gouter", unite: "portion", nb: 2, consoId: ajuste });
  assert.equal((await consommationsDuJour(db, "2026-10-30")).find((x) => x.id === ajuste)!.nb_unites, 2);
  assert.equal((await consommationDePlat(db, ajuste))!.ajustements.size, 0);
  const s = await statsPlat(db, plat, "2026-10-01");
  assert.equal(s.foisMois, 4);
  proche(s.portions, 0.5 + 0.5 + 350 / 370 + 2);
});

test("journal : copier, répéter et annuler gardent le plat, sa composition et son ajustement", async () => {
  const { db } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  const c = await ajouterPlatAuJournal(db, { plat, date: "2026-10-29", repasId: "repas:dejeuner", unite: "portion", nb: 1, ajustements: new Map([[plat.ingredients[1]!.id, null]]) });
  await copierConsommations(db, [c], { date: "2026-10-30", repasId: "repas:diner" });
  await repeterRepas(db, { date: "2026-10-29", repasId: "repas:dejeuner" }, { date: "2026-10-31", repasId: "repas:dejeuner" });
  for (const j of ["2026-10-30", "2026-10-31"]) {
    const [x] = await consommationsDuJour(db, j);
    assert.equal(x!.plat_id, id, j);
    assert.equal(x!.ajuste, true, j);
    assert.ok(x!.composition?.includes("ajustements"), j);
  }
  const [x] = await consommationsDuJour(db, "2026-10-29");
  await supprimerConsommation(db, x!.id);
  await restaurerConsommation(db, x!);
  const [y] = await consommationsDuJour(db, "2026-10-29");
  assert.deepEqual([y!.plat_id, y!.ajuste, y!.composition], [id, true, x!.composition]);
});

test("repas → plat : les aliments et leurs quantités, une ligne de plat donne ses ingrédients ; le journal ne change pas", async () => {
  const { db } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  await ajouterConsommation(db, { date: "2026-10-30", repasId: "repas:dejeuner", produitId: p[1]!.id, quantiteG: 200, unite: "g", nbUnites: 200 });
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:dejeuner", unite: "portion", nb: 1 });
  const b = await brouillonDepuisRepas(db, "2026-10-30", "repas:dejeuner");
  assert.deepEqual(
    b.ingredients.map((i) => [i.produit.nom, Math.round(i.quantite_g)]),
    [["Riz basmati cru", 200], ["Bœuf haché 5 %", 125], ["Riz basmati cru", 60]],
  );
  assert.equal(b.portions, 1);
  assert.equal((await consommationsDuJour(db, "2026-10-30")).length, 2);
  const { id: neuf } = await enregistrerPlat(db, { ...b, nom: "Bowl" });
  assert.equal((await lirePlat(db, neuf))!.ingredients.length, 3);
});

test("photo du plat : connue du ménage (pas effacée comme orpheline), remplacée = fichiers distants à effacer", async () => {
  const { db, raw } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p, { photo: { photo: "photos/a.webp", vignette: "photos/a-v.webp" } }));
  assert.ok((await cheminsPhotosConnus(db)).has("photos/a-v.webp"));
  raw.prepare("UPDATE plats SET photo_distante = 'a.webp' WHERE id = ?").run(id);
  const r = await enregistrerPlat(db, brouillon(p, { photo: { photo: "photos/b.webp", vignette: "photos/b-v.webp" } }), id);
  assert.deepEqual(r.anciennePhoto, { photo: "photos/a.webp", vignette: "photos/a-v.webp" });
  assert.equal((await lirePlat(db, id))!.photo_distante, null);
  const aEffacer = JSON.parse((raw.prepare("SELECT valeur FROM sync_etat WHERE cle = 'fichiers_a_effacer'").get() as { valeur: string }).valeur) as string[];
  assert.deepEqual(aEffacer.sort(), ["a-v.webp", "a.webp"]);
});

class Serveur {
  lignes = new Map<string, Changement & { seq: number }>();
  fichiers = new Map<string, Uint8Array>();
  seq = 0;
  transport(): Transport {
    return {
      pousser: async (lot) => {
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur, limite): Promise<Lot> => {
        const l = [...this.lignes.values()].filter((x) => x.seq > (curseur ? Number(curseur) : 0)).sort((a, b) => a.seq - b.seq).slice(0, limite);
        return { changements: l.map(({ seq: _, ...c }) => c), curseur: l.length ? String(l[l.length - 1]!.seq) : curseur, encore: false };
      },
      envoyerFichier: async (cle, contenu) => void this.fichiers.set(cle, contenu.slice()),
      lireFichier: async (cle) => this.fichiers.get(cle)?.slice() ?? null,
      supprimerFichier: async (cle) => void this.fichiers.delete(cle),
    };
  }
}

test("synchro : le plat, ses ingrédients et sa photo passent sur l'autre téléphone ; nom et produits jamais en clair", async () => {
  await pret();
  const serveur = new Serveur();
  const cle = aleatoire(32);
  const disques = [new Map<string, Uint8Array>(), new Map<string, Uint8Array>()];
  const fichiers = (d: Map<string, Uint8Array>) => ({ existe: (c: string) => d.has(c), lire: async (c: string) => d.get(c)!, ecrire: async (c: string, x: Uint8Array) => void d.set(c, x) });
  const A = await baseDeTest();
  const B = await baseDeTest();
  const p = await produits(A.db);
  const { id } = await enregistrerPlat(A.db, brouillon(p, { photo: { photo: "photos/c.webp", vignette: "photos/c-v.webp" } }));
  disques[0]!.set("photos/c.webp", new Uint8Array([1, 2, 3])).set("photos/c-v.webp", new Uint8Array([4]));
  const ba = await synchroniser({ db: A.db, transport: serveur.transport(), cle, noeud: "A", fichiers: fichiers(disques[0]!) });
  assert.equal(ba.photosEnvoyees, 1);
  assert.equal(sensiblesChiffrees(serveur.lignes.values(), "plats", tableSync("plats")!.sensibles), 1);
  assert.equal(sensiblesChiffrees(serveur.lignes.values(), "plat_ingredients", tableSync("plat_ingredients")!.sensibles), 2);
  const tout = JSON.stringify([...serveur.lignes.values()]);
  assert.ok(!tout.includes("Chili") && !tout.includes("Bœuf"));
  const bb = await synchroniser({ db: B.db, transport: serveur.transport(), cle, noeud: "B", fichiers: fichiers(disques[1]!) });
  assert.equal(bb.photosRecues, 1);
  const recu = (await lirePlat(B.db, id))!;
  assert.equal(recu.nom, "Chili con carne");
  assert.equal(recu.ingredients.length, 2);
  // Les produits ne voyagent pas : le plat se calcule avec la copie de ses ingrédients.
  proche(totalPlat(recu).kcal, 685 + 840);
  assert.deepEqual(disques[1]!.get("photos/c.webp"), new Uint8Array([1, 2, 3]));
});

test("Mes aliments et statistiques : un plat mangé compte ses ingrédients au prorata de la portion", async () => {
  const { db } = await baseDeTest();
  const p = await produits(db);
  const [boeuf, riz] = p as [Produit, Produit];
  // Chili : bœuf 500 g, riz 240 g, 4 portions. Une demi-portion : 62,5 g de bœuf et 30 g de riz.
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:dejeuner", unite: "portion", nb: 0.5 }, 1_000);
  await ajouterConsommation(db, { date: "2026-10-29", repasId: "repas:diner", produitId: riz.id, quantiteG: 80, unite: "g", nbUnites: 80 });
  const l = await mesAliments(db, "tout", "quantite", null);
  assert.deepEqual(l.map((x) => [x.produit.nom, x.fois, Math.round(x.quantiteG * 10) / 10]), [["Riz basmati cru", 2, 110], ["Bœuf haché 5 %", 1, 62.5]]);
  proche(l[0]!.kcal, 3.5 * 110);
  assert.equal(l[1]!.derniere, "2026-10-30");
  assert.equal(l[1]!.repasFrequent, "repas:dejeuner");
  assert.equal(l[1]!.platId, null);
  // La période compte la date du plat.
  assert.deepEqual((await mesAliments(db, "semaine", "fois", "2026-10-30")).map((x) => [x.produit.nom, x.fois]).sort(), [["Bœuf haché 5 %", 1], ["Riz basmati cru", 1]]);
  // Ce produit, fois et dernière quantité (celle mangée dans le plat), récents de tous les repas.
  const s = await statsProduit(db, boeuf.id, "2026-10-01");
  assert.equal(s.foisMois, 1);
  proche(s.totalG, 62.5);
  assert.equal(s.repasFrequent, "repas:dejeuner");
  assert.equal(s.premiere, "2026-10-30");
  proche((await dernieresQuantites(db, [boeuf.id])).get(boeuf.id)!.quantite_g, 62.5);
  assert.equal((await foisDepuis(db, [boeuf.id, riz.id], "2026-10-01")).get(riz.id), 2);
  // Le riz mangé seul l'a été après le plat (horloge réelle contre 1 000 ms) : il passe devant.
  assert.deepEqual((await recentsDuRepas(db, null)).map((x) => x.nom), ["Riz basmati cru", "Bœuf haché 5 %"]);
  assert.equal(await nbProduitsConsommes(db), 2);
  // Les macros du jour (page du mois) : celles de la demi-portion, ni plus ni moins.
  proche((await kcalParJour(db, "2026-10-30", "2026-10-30")).get("2026-10-30")!, (685 + 840) / 8, 0.1);
  // Retirer un ingrédient de Mes aliments, puis le remanger dans un plat : il revient.
  const avant = await masquerAliment(db, boeuf.id, 2_000);
  assert.deepEqual((await mesAliments(db, "tout", "fois", null)).map((x) => x.produit.nom), ["Riz basmati cru"]);
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-31", repasId: "repas:diner", unite: "portion", nb: 1 }, 3_000);
  assert.deepEqual((await mesAliments(db, "tout", "fois", null)).map((x) => [x.produit.nom, x.fois]), [["Riz basmati cru", 3], ["Bœuf haché 5 %", 2]]);
  await remettreAliment(db, boeuf.id, avant);
});

test("Mes aliments : un ingrédient ajusté pour cette fois compte sa quantité, un retiré ne compte pas", async () => {
  const { db } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p));
  const plat = (await lirePlat(db, id))!;
  const [ib, ir] = plat.ingredients as [(typeof plat.ingredients)[number], (typeof plat.ingredients)[number]];
  await ajouterPlatAuJournal(db, { plat, date: "2026-10-30", repasId: "repas:dejeuner", unite: "portion", nb: 1, ajustements: new Map([[ib.id, null], [ir.id, { quantite_g: 100, unite: "g", nb_unites: 100 }]]) });
  assert.deepEqual((await mesAliments(db, "tout", "fois", null)).map((x) => [x.produit.nom, x.quantiteG]), [["Riz basmati cru", 100]]);
});

test("Mes aliments : un plat sans ingrédients (recette Fitatu) compte comme un seul aliment, et ouvre sa fiche de plat", async () => {
  const { db, raw } = await baseDeTest();
  const r = await enregistrerProduit(db, { nom: "Lasagnes maison", nutriments: { energie_kcal: 175, proteines: 9.7 }, portions: [{ type: "portion", libelle: "", grammes: 350 }], source: "perso" });
  raw.prepare("UPDATE produits SET import_cle = 'fitatu:recette:42' WHERE id = ?").run(r.id);
  await ajouterConsommation(db, { date: "2026-10-20", repasId: "repas:diner", produitId: r.id, quantiteG: 350, unite: "portion", nbUnites: 1 });
  // Plat sans ingrédients tel qu'une sauvegarde de l'édition complète l'apporte (recette Fitatu) : l'import n'existe pas ici.
  raw.prepare("INSERT INTO plats (id, nom, portions, poids_cuit_g, source, import_cle, sans_ingredients, nutriments_100g, poids_total_g, cree_le, modifie_le) SELECT 'plat-f', nom, 1, NULL, 'fitatu', import_cle, 1, nutriments, 350, 1, 1 FROM produits WHERE id = ?").run(r.id);
  raw.prepare("UPDATE produits SET categorie = 'plat' WHERE id = ?").run(r.id);
  raw.prepare("UPDATE consommations SET plat_id = 'plat-f' WHERE produit_id = ?").run(r.id);
  const [plat] = await listerPlats(db);
  // Remangé depuis pepfit : un autre produit figé, le même aliment.
  await ajouterPlatAuJournal(db, { plat: plat!, date: "2026-10-30", repasId: "repas:dejeuner", unite: "portion", nb: 0.5 });
  const l = await mesAliments(db, "tout", "fois", null);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.produit.nom, "Lasagnes maison");
  assert.equal(l[0]!.platId, plat!.id);
  assert.equal(l[0]!.fois, 2);
  proche(l[0]!.quantiteG, 525);
  proche(l[0]!.kcal, 175 * 5.25);
  assert.equal(await nbProduitsConsommes(db), 1);
  // Retiré de la liste, il part en entier.
  await masquerAliment(db, l[0]!.produit.id, Date.now() + 1_000);
  assert.deepEqual(await mesAliments(db, "tout", "fois", null), []);
});

test("copier un plat : sa photo dans des fichiers à lui, envoyés chiffrés ; supprimer l'original ne touche pas la copie", async () => {
  await pret();
  const serveur = new Serveur();
  const cle = aleatoire(32);
  const disque = new Map<string, Uint8Array>();
  const f = { existe: (c: string) => disque.has(c), lire: async (c: string) => disque.get(c)!, ecrire: async (c: string, x: Uint8Array) => void disque.set(c, x) };
  const { db } = await baseDeTest();
  const p = await produits(db);
  const { id } = await enregistrerPlat(db, brouillon(p, { photo: { photo: "photos/o.webp", vignette: "photos/o-v.webp" } }));
  disque.set("photos/o.webp", new Uint8Array([7, 7, 7])).set("photos/o-v.webp", new Uint8Array([8]));
  assert.equal((await synchroniser({ db, transport: serveur.transport(), cle, noeud: "A", fichiers: f })).photosEnvoyees, 1);
  const origine = (await lirePlat(db, id))!;
  const photo = await copierPhotoPlat(f, { photo: origine.photo!, vignette: origine.photo_vignette! }, "copie1");
  assert.deepEqual(photo, { photo: "photos/copie1.webp", vignette: "photos/copie1-v.webp" });
  assert.deepEqual(disque.get("photos/copie1.webp"), new Uint8Array([7, 7, 7]));
  assert.deepEqual(disque.get("photos/copie1-v.webp"), new Uint8Array([8]));
  const { id: copie } = await enregistrerPlat(db, { ...brouillon(p, { nom: "Chili con carne (2)" }), photo });
  const c = (await lirePlat(db, copie))!;
  assert.equal(c.photo, "photos/copie1.webp");
  assert.equal(c.photo_distante, null);
  // La synchro envoie la photo de la copie, chiffrée : rien de son contenu ni de son nom en clair sur le serveur.
  const avant = new Set(serveur.fichiers.keys());
  assert.equal((await synchroniser({ db, transport: serveur.transport(), cle, noeud: "A", fichiers: f })).photosEnvoyees, 1);
  const nouveaux = [...serveur.fichiers.keys()].filter((k) => !avant.has(k));
  assert.equal(nouveaux.length, 2);
  for (const k of nouveaux) {
    assert.ok(!k.includes("copie1"));
    assert.notDeepEqual(serveur.fichiers.get(k), new Uint8Array([7, 7, 7]));
  }
  assert.equal((await lirePlat(db, copie))!.photo_distante, "copie1.webp");
  // Supprimer l'original : seuls ses fichiers partent ; la copie garde les siens.
  assert.deepEqual(await supprimerPlat(db, id), { photo: "photos/o.webp", vignette: "photos/o-v.webp" });
  assert.ok((await cheminsPhotosConnus(db)).has("photos/copie1.webp"));
  // L'original pas encore reçu sur ce téléphone : pas de photo pour la copie.
  assert.equal(await copierPhotoPlat(f, { photo: "photos/absente.webp", vignette: "photos/absente-v.webp" }), null);
});
