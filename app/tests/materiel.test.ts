// Matériel d'un lieu (lots L2, L4, L7) : reprise de salle_poids_libre (migration 67), dépôt, postes, barre choisie, charges en séance.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterMachines, reglerMachine } from "../src/db/depots/inventaire.ts";
import {
  barreParDefaut, basculerPoste, chargesPour, choisirBarre, ecrireMateriel, ecrireOngletMateriel, lireMateriel, lireOngletMateriel, lirePostes,
  nouvelleBarre, retirerMateriel, type NouveauMateriel,
} from "../src/db/depots/materiel.ts";
import { creerSalle, paliersPour } from "../src/db/depots/salles.ts";
import { migrer } from "../src/db/migrations.ts";
import { adapter, baseDeTest } from "./aide.ts";

const liste = (genre: "halteres" | "kettlebell", poids: number[], unite: "kg" | "lbs" = "kg"): NouveauMateriel => ({
  genre, forme: null, nom: null, poids, poidsPropre: null, nombre: null, chargeMax: null, maxParCote: null, trou: null, prechargee: false, disques: [], unite,
});
const MAISON_DISQUES = [{ kg: 20, paires: 1 }, { kg: 15, paires: 1 }, { kg: 10, paires: 1 }, { kg: 5, paires: 1 }, { kg: 2.5, paires: 1 }, { kg: 1.25, paires: 1 }];
const disques = (d = MAISON_DISQUES): NouveauMateriel => ({ ...liste("halteres", []), genre: "disques", trou: "50", disques: d });

test("migration 67 : plages et listes deviennent des listes, la barre une barre droite avec un jeu de disques à vérifier, les postes en clés fines", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 65);
  const t = Date.now();
  raw.exec(`INSERT INTO salle (id, nom, equipements, cree_le, maj_le) VALUES ('s1', 'Maison', 'halteres|kettlebell|barre|barre_fixe|elastique|disque', ${t}, ${t})`);
  raw.exec(`INSERT INTO salle (id, nom, equipements, cree_le, maj_le) VALUES ('s2', 'Salle OSM',
    'poids_du_corps|barre|halteres|kettlebell|machine|poulie|smith|barre_fixe|elastique|cardio|disque|autre', ${t}, ${t})`);
  raw.exec(`INSERT INTO salle_poids_libre (salle_id, type, min_val, max_val, pas, liste, unite) VALUES
    ('s1', 'halteres', 2, 10, 2, '[]', 'kg'), ('s1', 'kettlebell', NULL, NULL, NULL, '[12,16]', 'kg'), ('s1', 'barre', 20, 140, 2.5, '[]', 'kg'),
    ('s2', 'halteres', 5, 50, 5, '[]', 'lbs'), ('s2', 'kettlebell', NULL, NULL, NULL, '[]', 'kg')`);
  await migrer(db);
  const l = raw.prepare("SELECT id, genre, forme, poids, poids_propre, charge_max, trou, disques, unite, a_verifier FROM salle_materiel ORDER BY id").all();
  assert.deepEqual(
    l.map((x) => ({ ...x })),
    [
      { id: "pl:s1:barre", genre: "barre", forme: "droite", poids: "[]", poids_propre: 20, charge_max: 140, trou: "50", disques: "[]", unite: "kg", a_verifier: 0 },
      { id: "pl:s1:disques", genre: "disques", forme: null, poids: "[]", poids_propre: null, charge_max: null, trou: "50", disques: "[]", unite: "kg", a_verifier: 1 },
      { id: "pl:s1:halteres", genre: "halteres", forme: null, poids: "[2,4,6,8,10]", poids_propre: null, charge_max: null, trou: null, disques: "[]", unite: "kg", a_verifier: 0 },
      { id: "pl:s1:kettlebell", genre: "kettlebell", forme: null, poids: "[12,16]", poids_propre: null, charge_max: null, trou: null, disques: "[]", unite: "kg", a_verifier: 0 },
      {
        id: "pl:s2:halteres", genre: "halteres", forme: null, poids: "[5,10,15,20,25,30,35,40,45,50]", poids_propre: null, charge_max: null, trou: null, disques: "[]",
        unite: "lbs", a_verifier: 0,
      },
    ],
    "le kettlebell vide de s2 ne devient rien",
  );
  const postes = raw.prepare("SELECT id, postes FROM salle ORDER BY id").all().map((x) => ({ ...x }));
  assert.deepEqual(postes, [{ id: "s1", postes: "barre_traction|elastiques" }, { id: "s2", postes: "" }], "un lieu OSM tout coché n'a pas d'inventaire");
  const j = raw.prepare("SELECT cle, ms FROM sync_journal WHERE tab = 'salle_materiel' ORDER BY cle").all().map((x) => ({ ...x }));
  assert.equal(j.length, 5);
  assert.ok(j.every((x) => x.ms === 0), "repris à l'heure 0 : ce qui est déjà au serveur gagne");
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sync_silence").get()!.n, 0, "journal rouvert");
});

test("dépôt : ajouter, modifier, retirer ; la famille suit ; postes en clés fines ; dernier onglet sur le téléphone", async () => {
  const { db } = await baseDeTest(true);
  const s = await creerSalle(db, "Garage", []);
  assert.deepEqual(await lireMateriel(db, s), [], "un lieu neuf n'a rien : pas de modèle");
  const h = await ecrireMateriel(db, s, liste("halteres", [30, 4, 8, 20, 8]));
  const m = await lireMateriel(db, s);
  assert.deepEqual(m[0]!.poids, [4, 8, 20, 30], "triés, sans doublon");
  const eq = async () => (await db.getFirstAsync<{ equipements: string }>("SELECT equipements FROM salle WHERE id = ?", [s]))!.equipements;
  assert.equal(await eq(), "halteres");
  await ecrireMateriel(db, s, { ...liste("halteres", [4, 8]), id: h });
  assert.deepEqual((await lireMateriel(db, s))[0]!.poids, [4, 8]);
  await retirerMateriel(db, h);
  assert.equal(await eq(), "", "le dernier élément retiré décoche la famille");

  await basculerPoste(db, s, "rameur");
  await basculerPoste(db, s, "barre_traction");
  assert.deepEqual(await lirePostes(db, s), ["rameur", "barre_traction"]);
  assert.equal(await eq(), "barre_fixe|cardio");
  await basculerPoste(db, s, "rameur");
  assert.equal(await eq(), "barre_fixe");

  assert.equal(await lireOngletMateriel(db, s), null);
  await ecrireOngletMateriel(db, s, "cardio");
  assert.equal(await lireOngletMateriel(db, s), "cardio");
});

test("barre par défaut : EZ pour un exercice EZ, hexagonale pour la trap bar, sinon la droite la plus lourde", () => {
  const b = (forme: "droite" | "ez" | "hexagonale", kg: number) => ({ ...nouvelleBarre(forme, "kg"), poidsPropre: kg, id: `${forme}${kg}`, salleId: "s", aVerifier: false });
  const l = [b("droite", 15), b("ez", 10), b("droite", 20), b("hexagonale", 25)];
  assert.equal(barreParDefaut(l, "curl-barre-ez")!.id, "ez10");
  assert.equal(barreParDefaut(l, "souleve-de-terre-trap-bar")!.id, "hexagonale25");
  assert.equal(barreParDefaut(l, "squat")!.id, "droite20");
  assert.equal(barreParDefaut([], "squat"), null);
});

test("séance : charges réalisables d'un exercice au lieu (haltères, barre choisie et disques, machine à pile et à disques)", async () => {
  const { db } = await baseDeTest(true);
  const s = await creerSalle(db, "Maison", []);
  const curl = await creerExercice(db, { nom: "Curl test", muscle: "Biceps", equipement: "halteres" });
  const squat = await creerExercice(db, { nom: "Squat test", muscle: "Quadriceps", equipement: "barre" });
  assert.equal(await chargesPour(db, curl, s), null, "rien d'inventorié : la séance garde son pas");
  assert.equal(await paliersPour(db, curl, s), null);

  await ecrireMateriel(db, s, liste("halteres", [4, 8, 20, 30]));
  assert.deepEqual(await paliersPour(db, curl, s), [4, 8, 20, 30]);

  const droite = await ecrireMateriel(db, s, nouvelleBarre("droite", "kg"));
  const ez = await ecrireMateriel(db, s, nouvelleBarre("ez", "kg"));
  assert.deepEqual(await paliersPour(db, squat, s), [20], "barre sans disques : la barre seule");
  await ecrireMateriel(db, s, disques());
  const c = (await chargesPour(db, squat, s))!;
  assert.equal(c.barre!.choisie.id, droite);
  assert.equal(c.charges.length, 44);
  assert.equal(c.charges[c.charges.length - 1], 127.5);
  await choisirBarre(db, squat, s, ez);
  const c2 = (await chargesPour(db, squat, s))!;
  assert.equal(c2.barre!.choisie.id, ez);
  assert.equal(c2.charges[0], 10);
  await choisirBarre(db, squat, s, null);
  assert.equal((await chargesPour(db, squat, s))!.barre!.choisie.id, droite);

  const [poulie] = await ajouterMachines(db, s, [{ machineId: "crunch-machine", palier: 5, max: 50, unite: "kg" }]);
  const exoPoulie = (await db.getFirstAsync<{ exercice_id: string }>("SELECT exercice_id FROM appareil_exercice WHERE appareil_id = ?", [poulie!]))!.exercice_id;
  await reglerMachine(db, poulie!, { min: 5, appoint: [2.5] });
  const p = (await paliersPour(db, exoPoulie, s))!;
  assert.equal(p.length, 20);
  assert.equal(p[p.length - 1], 52.5);
  await reglerMachine(db, poulie!, { type: "disques", min: 50, max: 300 });
  const d = (await paliersPour(db, exoPoulie, s))!;
  assert.equal(d[0], 50);
  assert.equal(d[d.length - 1], 157.5, "les disques du lieu s'arrêtent avant 300 kg");
});

test("unités : haltères en lbs, charges en kg", async () => {
  const { db } = await baseDeTest(true);
  const s = await creerSalle(db, "US", []);
  const curl = await creerExercice(db, { nom: "Curl test", muscle: "Biceps", equipement: "halteres" });
  await ecrireMateriel(db, s, liste("halteres", [5, 10], "lbs"));
  const c = (await chargesPour(db, curl, s))!;
  assert.equal(c.unite, "lbs");
  assert.deepEqual(c.charges, [2.27, 4.54]);
});
