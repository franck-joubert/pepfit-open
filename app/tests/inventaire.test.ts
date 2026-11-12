// Inventaire de salle : migration 19, détection des équipements, confirmer / ignorer / annuler, unités, retrait.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { MACHINE_DE_EXERCICE, MACHINES } from "../src/db/machines.ts";
import { dansUnite } from "../src/db/inventaire.ts";
import { creerExercice } from "../src/db/depots/exercices.ts";
import {
  ajouterMachines, annulerRetraitEquipement, annulerTraitement, confirmerEquipement, detecterEquipements, equipementsDetectes, ignorerEquipement,
  lireInventaire, reglerMachine, retirerEquipementSalle, toutConfirmer, uniteEquipementPour,
} from "../src/db/depots/inventaire.ts";
import { ecrireMateriel, lireMateriel } from "../src/db/depots/materiel.ts";
import { remplacerExercice } from "../src/db/depots/remplacement.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { creerSalle, paliersPour } from "../src/db/depots/salles.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { adapter, baseDeTest } from "./aide.ts";

async function monde() {
  const { raw, db } = await baseDeTest(true);
  const salle = await creerSalle(db, "Salle test", ["machine"]);
  const idDe = async (slug: string) => (await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE slug = ?", [slug]))!.id;
  const seance = async (exoId: string, kg: number) => {
    const s = await demarrerSeance(db, null);
    const sr = await ajouterSerie(db, { seanceId: s, exerciceId: exoId, kg, reps: 8 });
    await cocherSerie(db, sr, true);
    await terminerSeance(db, s);
    await detecterEquipements(db, s);
    return s;
  };
  return { raw, db, salle, idDe, seance };
}

const crunch = "ab-crunch-machine";

const poidsLibres = (genre: "halteres" | "kettlebell", poids: number[], unite: "kg" | "lbs" = "kg") => ({
  genre, forme: null, nom: null, poids, poidsPropre: null, nombre: null, chargeMax: null, maxParCote: null, trou: null, prechargee: false, disques: [], unite,
});

test("catalogue des machines : chaque slug du CSV existe dans le catalogue", async () => {
  const { db } = await baseDeTest(true);
  for (const slug of Object.keys(MACHINE_DE_EXERCICE)) {
    assert.ok(await db.getFirstAsync("SELECT 1 FROM exercices WHERE slug = ?", [slug]), slug);
    assert.ok(MACHINES.some((m) => m.id === MACHINE_DE_EXERCICE[slug]), slug);
  }
});

test("migration 19 : colonnes de l'appareil, nouvelles tables, unité contrainte", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 18);
  raw.exec("INSERT INTO salle (id,nom,defaut,equipements,cree_le,maj_le) VALUES ('s','S',1,'machine',1,1); INSERT INTO appareil (id,salle_id,nom,type,paliers_kg) VALUES ('a','s','A','pile','[]')");
  assert.equal(await migrer(db, 19), 19);
  const a = raw.prepare("SELECT machine_id, palier, max_val, unite FROM appareil").get() as Record<string, unknown>;
  assert.deepEqual({ ...a }, { machine_id: null, palier: null, max_val: null, unite: "kg" });
  assert.throws(() => raw.exec("UPDATE appareil SET unite = 'st'"));
  const t = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
  for (const n of ["salle_poids_libre", "equipement_detecte", "salle_retrait"]) assert.ok(t.includes(n), n);
});

test("machine absente de l'inventaire : détectée, confirmée (création), annulée (retirée)", async () => {
  const { db, salle, idDe, seance } = await monde();
  const s = await seance(await idDe(crunch), 40);
  const l = await equipementsDetectes(db, salle);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.type, "machine:crunch-machine");
  assert.equal(l[0]!.nouveau, true);
  assert.equal(l[0]!.exerciceSlug, crunch);
  assert.equal((await detecterEquipements(db, s)).length, 1, "détecter deux fois n'ajoute rien");
  await confirmerEquipement(db, l[0]!.id);
  let inv = await lireInventaire(db, salle);
  assert.equal(inv.machines.length, 1);
  assert.equal(inv.machines[0]!.machineId, "crunch-machine");
  assert.ok(inv.machines[0]!.exerciceIds.length >= 1);
  assert.equal((await equipementsDetectes(db, salle)).length, 0);
  await annulerTraitement(db, l[0]!.id);
  inv = await lireInventaire(db, salle);
  assert.equal(inv.machines.length, 0);
  assert.equal((await equipementsDetectes(db, salle)).length, 1);
});

test("plafond dépassé en kg : détecté, confirmer relève le max ; ignoré, ne revient que plus haut", async () => {
  const { db, salle, idDe, seance } = await monde();
  const exo = await idDe(crunch);
  const app = (await ajouterMachines(db, salle, [{ machineId: "crunch-machine" }]))[0]!;
  await reglerMachine(db, app, { palier: 5, max: 60 });
  await seance(exo, 60);
  assert.equal((await equipementsDetectes(db, salle)).length, 0, "pile au max : rien");
  await seance(exo, 70);
  let l = await equipementsDetectes(db, salle);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.nouveau, false);
  assert.equal(l[0]!.ancienPlafondKg, 60);
  await ignorerEquipement(db, l[0]!.id);
  await seance(exo, 70);
  assert.equal((await equipementsDetectes(db, salle)).length, 0, "ignoré à 70, 70 ne revient pas");
  await seance(exo, 80);
  l = await equipementsDetectes(db, salle);
  assert.equal(l.length, 1);
  await confirmerEquipement(db, l[0]!.id);
  assert.equal((await lireInventaire(db, salle)).machines[0]!.max, 80);
  await annulerTraitement(db, l[0]!.id);
  assert.equal((await lireInventaire(db, salle)).machines[0]!.max, 60);
});

test("machine en lbs : 100 lbs ne dépassent pas un max de 100 lbs (arrondis kg tolérés), 105 si", async () => {
  const { db, salle, idDe, seance } = await monde();
  const exo = await idDe(crunch);
  const app = (await ajouterMachines(db, salle, [{ machineId: "crunch-machine", unite: "lbs" }]))[0]!;
  await reglerMachine(db, app, { palier: 5, max: 100 });
  assert.equal((await lireInventaire(db, salle)).machines[0]!.unite, "lbs");
  await seance(exo, 100 / 2.2046226218);
  assert.equal((await equipementsDetectes(db, salle)).length, 0);
  await seance(exo, 105 / 2.2046226218);
  const l = await equipementsDetectes(db, salle);
  assert.equal(l.length, 1);
  await confirmerEquipement(db, l[0]!.id);
  assert.equal((await lireInventaire(db, salle)).machines[0]!.max, 105, "le max reste dans l'unité de la machine");
  assert.equal(await uniteEquipementPour(db, exo, salle), "lbs");
});

test("unité d'une machine : défaut = unité du profil ; bascule garde les chiffres, palier de 5 lbs exact", async () => {
  const { db, salle } = await monde();
  await ecrireReglage(db, "unite", "lbs");
  const app = (await ajouterMachines(db, salle, [{ machineId: "chest-press" }]))[0]!;
  let m = (await lireInventaire(db, salle)).machines[0]!;
  assert.equal(m.unite, "lbs");
  await reglerMachine(db, app, { palier: 5, max: 200 });
  const kg = await db.getFirstAsync<{ paliers_kg: string }>("SELECT paliers_kg FROM appareil WHERE id = ?", [app]);
  const liste = JSON.parse(kg!.paliers_kg) as number[];
  assert.equal(liste.length, 40);
  assert.equal(dansUnite(liste[0]!, "lbs"), 5);
  assert.equal(dansUnite(liste[39]!, "lbs"), 200);
  await reglerMachine(db, app, { unite: "kg" });
  m = (await lireInventaire(db, salle)).machines[0]!;
  assert.deepEqual([m.unite, m.palier, m.max], ["kg", 5, 200]);
});

test("paliers d'une machine sans max : proposés à la volée", async () => {
  const { db, salle, idDe } = await monde();
  await ajouterMachines(db, salle, [{ machineId: "crunch-machine" }]);
  const p = (await paliersPour(db, await idDe(crunch), salle))!;
  assert.ok(p.length > 20);
  assert.equal(p[0], 5);
});

test("poids libres : réglage, plafond haltères en lbs, kettlebell par liste, confirmation et annulation", async () => {
  const { db, salle } = await monde();
  const halt = await creerExercice(db, { nom: "Curl test", muscle: "Biceps", equipement: "halteres" });
  const kb = await creerExercice(db, { nom: "Swing test", muscle: "Fessiers", equipement: "kettlebell" });
  const faire = async (e: string, kg: number) => {
    const s = await demarrerSeance(db, null);
    await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: e, kg, reps: 10 }), true);
    await terminerSeance(db, s);
    await detecterEquipements(db, s);
  };
  await ecrireMateriel(db, salle, poidsLibres("halteres", [5, 10, 25, 50], "lbs"));
  await faire(halt, 50 / 2.2046226218);
  assert.equal((await equipementsDetectes(db, salle)).length, 0);
  await faire(halt, 55 / 2.2046226218);
  assert.equal((await equipementsDetectes(db, salle)).length, 1);
  await faire(kb, 16);
  const l = await equipementsDetectes(db, salle);
  assert.equal(l.length, 2);
  assert.deepEqual(await toutConfirmer(db, salle), l.map((x) => x.id));
  const inv = await lireInventaire(db, salle);
  const mat = await lireMateriel(db, salle);
  assert.deepEqual(mat.find((x) => x.genre === "halteres")!.poids, [5, 10, 25, 50, 55]);
  assert.deepEqual(mat.find((x) => x.genre === "kettlebell")!.poids, [16]);
  assert.ok(inv.equipements.includes("kettlebell"));
  for (const x of l) await annulerTraitement(db, x.id);
  const apres = await lireInventaire(db, salle);
  const matApres = await lireMateriel(db, salle);
  assert.deepEqual(matApres.find((x) => x.genre === "halteres")!.poids, [5, 10, 25, 50]);
  assert.equal(matApres.find((x) => x.genre === "kettlebell"), undefined);
  assert.ok(!apres.equipements.includes("kettlebell"));
});

test("séance non terminée ou série non faite : rien détecté", async () => {
  const { db, salle, idDe } = await monde();
  const s = await demarrerSeance(db, null);
  await ajouterSerie(db, { seanceId: s, exerciceId: await idDe(crunch), kg: 40, reps: 8 });
  assert.equal((await detecterEquipements(db, s)).length, 0);
  assert.equal((await equipementsDetectes(db, salle)).length, 0);
});

test("retirer un équipement de la salle : machine et poids libre, puis annulation complète", async () => {
  const { db, salle } = await monde();
  const app = (await ajouterMachines(db, salle, [{ machineId: "crunch-machine" }]))[0]!;
  await reglerMachine(db, app, { palier: 5, max: 80, unite: "lbs" });
  await ecrireMateriel(db, salle, poidsLibres("halteres", [2, 4, 30]));
  const avant = await lireInventaire(db, salle);
  const matAvant = await lireMateriel(db, salle);
  const r = await retirerEquipementSalle(db, salle, "machine:crunch-machine");
  assert.ok(r);
  assert.equal((await lireInventaire(db, salle)).machines.length, 0);
  assert.equal(await retirerEquipementSalle(db, salle, "machine:crunch-machine"), null, "déjà retirée");
  const h = await retirerEquipementSalle(db, salle, "halteres");
  assert.ok(h);
  const milieu = await lireInventaire(db, salle);
  assert.equal((await lireMateriel(db, salle)).length, 0);
  assert.ok(!milieu.equipements.includes("halteres"));
  assert.equal(await annulerRetraitEquipement(db, r!.id), true);
  assert.equal(await annulerRetraitEquipement(db, r!.id), false, "une seule fois");
  assert.equal(await annulerRetraitEquipement(db, h!.id), true);
  const apres = await lireInventaire(db, salle);
  assert.deepEqual(apres.machines, avant.machines);
  assert.deepEqual(await lireMateriel(db, salle), matAvant);
  assert.deepEqual(apres.equipements, avant.equipements);
});

test("Alternative « Matériel manquant » : remplacer puis retirer l'équipement de la salle de la séance, annulable", async () => {
  const { db, salle, idDe } = await monde();
  await ajouterMachines(db, salle, [{ machineId: "crunch-machine" }]);
  const ancien = await idDe(crunch);
  const nouveau = await creerExercice(db, { nom: "Crunch sol test", muscle: "Abdominaux", equipement: "autre" });
  const s = await demarrerSeance(db, null);
  await ajouterSerie(db, { seanceId: s, exerciceId: ancien, kg: 0, reps: 10 });
  await remplacerExercice(db, s, ancien, nouveau, { raison: "manquant" });
  const seanceSalle = (await db.getFirstAsync<{ salle_id: string }>("SELECT salle_id FROM seances WHERE id = ?", [s]))!.salle_id;
  assert.equal(seanceSalle, salle);
  const r = await retirerEquipementSalle(db, seanceSalle, "machine:crunch-machine");
  assert.equal(r?.libelle, "Crunch machine");
  assert.equal((await lireInventaire(db, salle)).machines.length, 0);
  await annulerRetraitEquipement(db, r!.id);
  assert.equal((await lireInventaire(db, salle)).machines.length, 1);
});

test("filtre « Ici » : une salle aux machines inventoriées ne propose que ses machines ; sans inventaire de machines, la case suffit", async () => {
  const { db, salle, idDe } = await monde();
  const { rechercherExercices } = await import("../src/db/depots/exercices.ts");
  const noms = async (id: string) => (await rechercherExercices(db, { salleId: id, limite: 5000 })).map((e) => e.slug);
  const avant = await noms(salle);
  assert.ok(avant.includes(crunch), "salle ancienne : toutes les machines (case cochée)");
  await ajouterMachines(db, salle, [{ machineId: "chest-press" }]);
  const apres = await noms(salle);
  assert.ok(!apres.includes(crunch), "crunch machine absente de la salle");
  const presse = Object.keys(MACHINE_DE_EXERCICE).filter((s) => MACHINE_DE_EXERCICE[s] === "chest-press");
  assert.ok(presse.length > 0 && presse.every((s) => apres.includes(s)));
  void idDe;
});
