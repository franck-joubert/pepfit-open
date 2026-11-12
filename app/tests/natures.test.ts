// Migration 4 (natures, pesées, salles, paliers) et logique de la planche v2.3 (D7 à D17).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { chargeEffective, poidsAvant } from "../src/db/calculs.ts";
import {
  changerNature, compteursEquipement, compterExercices, creerExercice, creerVariante, evaluerChangementNature, lireExercice, modifierExercice,
  rechercherExercices,
} from "../src/db/depots/exercices.ts";
import { ajouterPesee, listerPesees, peseeAvant, supprimerPesee, synchroniserPoidsSante } from "../src/db/depots/pesees.ts";
import { recalculerExercice, recalculerSiEnAttente } from "../src/db/depots/recalcul.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import {
  creerAppareil, creerSalle, definirSalleParDefaut, listerSalles, lireSalle, modifierAppareil, modifierSalle, paliersPour, salleParDefaut,
  supprimerSalle,
} from "../src/db/depots/salles.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, modifierSerie, terminerSeance } from "../src/db/depots/seances.ts";
import { CORRECTIONS_EQUIPEMENT, VERSION_COURANTE, migrer } from "../src/db/migrations.ts";
import { allureSecParKm, equipementDuCatalogue, formaterAllure, mesuresExercice, natureDuCatalogue, verdictChangementNature } from "../src/db/natures.ts";
import { estHorsPalier, palierVoisin, paliersReguliers, pasRegulier } from "../src/db/paliers.ts";
import { progressionExercice, recordsExercice } from "../src/db/stats.ts";
import { adapter, baseDeTest, catalogue, jour } from "./aide.ts";

type Db = Awaited<ReturnType<typeof baseDeTest>>["db"];

/** Une séance faite : chaque série est [kg, reps] (ou un objet pour la durée et la distance). */
async function faire(db: Db, exo: string, debut: number, series: ({ kg?: number | null; reps?: number; dureeS?: number; distanceM?: number })[]) {
  const id = await demarrerSeance(db, null, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [debut, id]);
  for (const s of series) {
    const sid = await ajouterSerie(db, { seanceId: id, exerciceId: exo });
    await modifierSerie(db, sid, { kg: s.kg ?? null, reps: s.reps ?? null, dureeS: s.dureeS ?? null, distanceM: s.distanceM ?? null });
    await cocherSerie(db, sid, true);
    await db.runAsync("UPDATE series SET fait_le = ? WHERE id = ?", [debut, sid]);
  }
  await recalculerExercice(db, exo);
  await terminerSeance(db, id, debut + 3_600_000);
  return id;
}

// --- Migration 4 sur une base remplie à l'ancienne -------------------------------------------------

async function baseAncienne() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 3);
  // Le catalogue complet, tel que l'ancienne version l'inscrivait (matériel texte, mesure par défaut).
  const cat = catalogue();
  for (const [i, e] of cat.exercices.entries()) {
    raw
      .prepare(
        "INSERT INTO exercices (id,nom,nom_norm,slug,muscle,secondaires,materiel,categorie,poids_corps,picto,perso,cree_le,maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,0,1,1)",
      )
      .run(`c${i}`, e.nom, e.nom.toLowerCase(), e.slug, e.muscle, e.secondaires.join("|"), e.materiel, e.categorie, e.poids_corps, e.picto);
  }
  const id = (slug: string) => (raw.prepare("SELECT id FROM exercices WHERE slug = ?").get(slug) as { id: string }).id;
  // Perso : une durée, une distance, une mesure « reps », un exercice poids du corps lesté (Hevy), un squat banal.
  raw.exec(`INSERT INTO exercices (id,nom,nom_norm,poids_corps,perso,mesure,cree_le,maj_le) VALUES
    ('p-duree','Padel','padel',0,1,'duree',1,1), ('p-dist','Course','course',0,1,'distance_duree',1,1),
    ('p-reps','Burpees','burpees',1,1,'reps',1,1), ('p-squat','Squat maison','squat maison',0,1,'kg_reps',1,1);`);
  const dips = id("dips-triceps-version");
  const pullups = id("pullups");
  raw.exec(`
    INSERT INTO routines VALUES ('r1','Push',NULL,0,1,1);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,nb_series) VALUES ('l1','r1','${dips}',0,2);
    INSERT INTO routine_series VALUES ('l1',0,20,8);
    INSERT INTO seances (id,debut,fin,salle,maj_le,volume_kg,nb_series) VALUES
      ('s1',${jour(2026, 1, 5)},${jour(2026, 1, 5, 19)},'Club Oberkampf',1,1000,3),
      ('s2',${jour(2026, 1, 8)},${jour(2026, 1, 8, 19)},'  club oberkampf ',1,0,0),
      ('s3',${jour(2026, 2, 1)},${jour(2026, 2, 1, 19)},'Maison',1,0,0),
      ('s4',${jour(2026, 2, 2)},${jour(2026, 2, 2, 19)},NULL,1,0,0),
      ('s5',${jour(2026, 2, 3)},${jour(2026, 2, 3, 19)},'   ',1,0,0);
    INSERT INTO series (id,seance_id,exercice_id,position,kg,reps,faite,fait_le) VALUES
      ('a1','s1','${dips}',0,20,8,1,${jour(2026, 1, 5)}), ('a2','s1','${dips}',1,25,6,1,${jour(2026, 1, 5)}),
      ('b1','s2','${pullups}',0,NULL,10,1,${jour(2026, 1, 8)}), ('b2','s2','${pullups}',1,0,8,1,${jour(2026, 1, 8)}),
      ('c1','s3','p-squat',0,100,5,1,${jour(2026, 2, 1)}), ('d1','s3','p-duree',1,NULL,NULL,1,${jour(2026, 2, 1)});
    UPDATE series SET duree_s = 600 WHERE id = 'd1';
    INSERT INTO records VALUES ('rec1','p-squat','charge',100,'c1','s3',${jour(2026, 2, 1)},1);
  `);
  return { raw, db, ids: { dips, pullups } };
}

test("migration 4 : base remplie à l'ancienne, rien n'est perdu, tout est converti", async () => {
  const { raw, db } = await baseAncienne();
  const avant = {
    exercices: (raw.prepare("SELECT COUNT(*) AS n FROM exercices").get() as { n: number }).n,
    // exercice_id change à la migration 12 (« cat:<slug> » pour le catalogue) : comparé à part, par le nom.
    series: raw.prepare("SELECT id,seance_id,kg,reps,duree_s,faite FROM series ORDER BY id").all(),
    noms: raw.prepare("SELECT se.id, e.nom FROM series se JOIN exercices e ON e.id = se.exercice_id ORDER BY se.id").all(),
    seances: (raw.prepare("SELECT COUNT(*) AS n FROM seances").get() as { n: number }).n,
  };
  assert.equal(await migrer(db), VERSION_COURANTE);
  assert.equal(VERSION_COURANTE >= 4, true);
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);

  // Données intactes.
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM exercices").get() as { n: number }).n, avant.exercices);
  assert.deepEqual(raw.prepare("SELECT id,seance_id,kg,reps,duree_s,faite FROM series ORDER BY id").all(), avant.series);
  assert.deepEqual(raw.prepare("SELECT se.id, e.nom FROM series se JOIN exercices e ON e.id = se.exercice_id ORDER BY se.id").all(), avant.noms);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM seances").get() as { n: number }).n, avant.seances);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM records").get() as { n: number }).n, 1);
  assert.deepEqual(raw.prepare("SELECT kg,reps FROM routine_series").all().map((r) => ({ ...r })), [{ kg: 20, reps: 8 }]);

  // Les colonnes remplacées ont disparu, les nouvelles tables existent.
  const cols = (raw.prepare("PRAGMA table_info(exercices)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(!cols.includes("mesure") && !cols.includes("materiel"));
  for (const c of ["nature", "equipement", "allure", "appareil_id", "a_verifier"]) assert.ok(cols.includes(c), c);
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  for (const t of ["pesee", "salle", "appareil", "appareil_exercice"]) assert.ok(tables.includes(t), t);

  // Natures : les 4 anciennes gardent leur sens, le poids du corps est lesté (kg saisis) ou en réps seules.
  const nat = (id: string) => (raw.prepare("SELECT nature FROM exercices WHERE id = ?").get(id) as { nature: string }).nature;
  assert.equal(nat("p-duree"), "duree");
  assert.equal(nat("p-dist"), "distance_duree");
  assert.equal(nat("p-reps"), "reps");
  assert.equal(nat("p-squat"), "poids_reps");
  // Migration 12 : le catalogue prend l'id « cat:<slug> ».
  assert.equal(nat("cat:dips-triceps-version"), "leste");
  assert.equal(nat("cat:pullups"), "reps");
  // Cardio et étirements sans historique.
  const parSlug = (slug: string) => raw.prepare("SELECT nature, equipement FROM exercices WHERE slug = ?").get(slug) as { nature: string; equipement: string };
  assert.deepEqual({ ...parSlug("rowing-stationary") }, { nature: "distance_duree", equipement: "cardio" });
  assert.equal(parSlug("plank").nature, "duree");
  assert.equal(parSlug("smith-machine-bench-press").equipement, "smith");
  assert.equal(parSlug("pullups").equipement, "barre_fixe");

  // Les règles SQL de la migration et la fonction du catalogue donnent la même chose (équipement) sur tout le catalogue.
  for (const e of catalogue().exercices) {
    assert.equal(parSlug(e.slug).equipement, equipementDuCatalogue(e), e.slug);
    assert.ok(["poids_reps", "reps", "leste", "duree", "distance_duree"].includes(parSlug(e.slug).nature), e.slug);
  }
  assert.equal(natureDuCatalogue({ slug: "pullups", categorie: "Force", poids_corps: 1 }), "leste");

  // Salles texte -> salles (insensible à la casse et aux espaces), séances sans salle inchangées, la plus utilisée par défaut.
  const salles = raw.prepare("SELECT nom, defaut, proprietaire_id, publique, source_id FROM salle ORDER BY nom").all() as { nom: string; defaut: number }[];
  assert.deepEqual(salles.map((s) => s.nom), ["Club Oberkampf", "Maison"]);
  assert.deepEqual(salles.map((s) => s.defaut), [1, 0]);
  assert.deepEqual(salles.map((s) => [(s as never as { proprietaire_id: string }).proprietaire_id, (s as never as { publique: number }).publique, (s as never as { source_id: null }).source_id]), [["local", 0, null], ["local", 0, null]]);
  const lien = raw.prepare("SELECT se.id, sa.nom FROM seances se LEFT JOIN salle sa ON sa.id = se.salle_id ORDER BY se.id").all().map((r) => ({ ...r }));
  assert.deepEqual(lien, [
    { id: "s1", nom: "Club Oberkampf" }, { id: "s2", nom: "Club Oberkampf" }, { id: "s3", nom: "Maison" }, { id: "s4", nom: null }, { id: "s5", nom: null },
  ]);
  assert.ok(!(raw.prepare("PRAGMA table_info(seances)").all() as { name: string }[]).some((c) => c.name === "salle"));

  // Le recalcul en attente refait volumes et records une seule fois.
  assert.equal(await recalculerSiEnAttente(db), true);
  assert.equal(await recalculerSiEnAttente(db), false);
  const rec = raw.prepare("SELECT type, valeur FROM records WHERE exercice_id = 'p-squat'").all();
  assert.deepEqual(rec.map((r) => (r as { type: string }).type).sort(), ["charge", "e1rm", "volume_seance", "volume_serie"]);
  const duree = raw.prepare("SELECT type, valeur FROM records WHERE exercice_id = 'p-duree'").all().map((r) => ({ ...r }));
  assert.deepEqual(duree, [{ type: "duree", valeur: 600 }]);

  // Idempotente : une deuxième passe ne change rien.
  assert.equal(await migrer(db), VERSION_COURANTE);
});

test("migration 4 : une base neuve contient les mêmes tables", async () => {
  const { raw } = await baseDeTest();
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  for (const t of ["pesee", "salle", "appareil", "appareil_exercice", "records"]) assert.ok(tables.includes(t), t);
  assert.throws(() => raw.exec("INSERT INTO appareil (id,salle_id,nom,type) VALUES ('a','nope','x','pile')"));
  assert.throws(() => raw.exec("INSERT INTO exercices (id,nom,nature,cree_le,maj_le) VALUES ('x','x','bizarre',1,1)"));
  assert.throws(() => raw.exec("INSERT INTO pesee (id,date,kg) VALUES ('p',1,0)"));
});

// --- D8, D9 : charge effective ---------------------------------------------------------------------

test("D8 D9 : charge effective = pesée la plus proche avant + lest ou − aide ; null sans pesée", async () => {
  assert.equal(chargeEffective("reps", null, 78), 78);
  assert.equal(chargeEffective("leste", 17.5, 78), 95.5);
  assert.equal(chargeEffective("assiste", 20, 78), 58);
  assert.equal(chargeEffective("poids_reps", 100, 78), null);
  assert.equal(chargeEffective("leste", 10, null), null);
  const p = [{ date: 10, kg: 80 }, { date: 20, kg: 78 }];
  assert.equal(poidsAvant(p, 15), 80);
  assert.equal(poidsAvant(p, 25), 78);
  assert.equal(poidsAvant(p, 5), 80); // avant la première pesée : la plus ancienne
  assert.equal(poidsAvant([], 5), null);
});

test("D8 : sans pesée volume et e1RM restent vides, la pesée recalcule tout l'historique, chaque série garde son poids d'époque", async () => {
  const { db } = await baseDeTest();
  const dips = await creerExercice(db, { nom: "Dips", nature: "leste" });
  const s1 = await faire(db, dips, jour(2026, 1, 10), [{ kg: 10, reps: 10 }]);
  const s2 = await faire(db, dips, jour(2026, 6, 10), [{ kg: 10, reps: 10 }]);
  assert.equal((await lireSeance(db, s1))!.exercices[0]!.series[0]!.charge_eff, null);
  assert.equal((await lireSeance(db, s1))!.seance.volume_kg, 0);
  assert.equal((await progressionExercice(db, dips, "charge_eff")).points.length, 0);
  assert.equal(await peseeAvant(db), null);

  await ajouterPesee(db, 80, jour(2026, 1, 1));
  await ajouterPesee(db, 76, jour(2026, 5, 1));
  const a = (await lireSeance(db, s1))!;
  const b = (await lireSeance(db, s2))!;
  assert.equal(a.exercices[0]!.series[0]!.charge_eff, 90); // 80 + 10
  assert.equal(b.exercices[0]!.series[0]!.charge_eff, 86); // 76 + 10 : la pesée de janvier ne bouge pas
  assert.equal(a.seance.volume_kg, 900);
  assert.equal(b.seance.volume_kg, 860);
  assert.deepEqual((await progressionExercice(db, dips, "charge_eff")).points.map((p) => p.valeur), [90, 86]);
  const rec = await recordsExercice(db, dips);
  assert.equal(rec.actuels.volume_serie?.valeur, 900);
  assert.equal(rec.actuels.charge?.valeur, 10); // record de lest

  // Supprimer la pesée de mai : la série de juin reprend 80.
  const l = await listerPesees(db);
  await supprimerPesee(db, l.find((p) => p.kg === 76)!.id);
  assert.equal((await lireSeance(db, s2))!.exercices[0]!.series[0]!.charge_eff, 90);
});

test("D8 : réps seules comptent le poids du corps (tractions 78 kg × 23 réps = 1 794)", async () => {
  const { db } = await baseDeTest();
  const tractions = await creerExercice(db, { nom: "Tractions", nature: "reps" });
  await ajouterPesee(db, 78, jour(2026, 10, 1));
  const s = await faire(db, tractions, jour(2026, 10, 20), [{ reps: 8 }, { reps: 8 }, { reps: 7 }]);
  assert.equal((await lireSeance(db, s))!.seance.volume_kg, 1794);
  assert.equal((await recordsExercice(db, tractions)).actuels.reps?.valeur, 8);
});

test("D8 : les abdos ne comptent pas le poids du corps (crunch : ni charge effective, ni volume)", async () => {
  const { db } = await baseDeTest();
  const crunch = await creerExercice(db, { nom: "Crunch", nature: "reps", muscle: "Abdominaux" });
  await ajouterPesee(db, 78, jour(2026, 10, 1));
  const s = await faire(db, crunch, jour(2026, 10, 20), [{ reps: 20 }]);
  const l = (await lireSeance(db, s))!;
  assert.equal(l.exercices[0]!.series[0]!.charge_eff, null);
  assert.equal(l.seance.volume_kg, 0);
  assert.equal((await recordsExercice(db, crunch)).actuels.reps?.valeur, 20);
  assert.ok(!mesuresExercice("reps", "Abdominaux").includes("charge_eff"));
  assert.ok(mesuresExercice("reps", "Grand dorsal").includes("charge_eff"));
});

test("D8 : assisté, 78 − 20 = 58, la charge effective monte quand l'aide baisse ; record d'aide inversé", async () => {
  const { db } = await baseDeTest();
  const m = await creerExercice(db, { nom: "Tractions assistées", nature: "assiste" });
  await ajouterPesee(db, 78, jour(2026, 1, 1));
  await faire(db, m, jour(2026, 2, 1), [{ kg: 30, reps: 8 }]);
  await faire(db, m, jour(2026, 3, 1), [{ kg: 20, reps: 8 }]);
  await faire(db, m, jour(2026, 4, 1), [{ kg: 25, reps: 8 }]);
  assert.deepEqual((await progressionExercice(db, m, "charge_eff")).points.map((p) => p.valeur), [48, 58, 53]);
  const aide = (await recordsExercice(db, m)).historique.filter((r) => r.type === "charge").map((r) => r.valeur).sort((a, b) => b - a);
  assert.deepEqual(aide, [30, 20]); // 30 puis 20 : on bat le record en baissant l'aide, 25 n'en est pas un
  assert.equal((await recordsExercice(db, m)).actuels.charge?.valeur, 20);
});

test("E1 : corriger une série d'un exercice au poids du corps recalcule volume et records", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Dips", nature: "leste" });
  await ajouterPesee(db, 80, jour(2026, 1, 1));
  const id = await faire(db, e, jour(2026, 2, 1), [{ kg: 10, reps: 10 }]);
  const sid = (await lireSeance(db, id))!.exercices[0]!.series[0]!.id;
  await modifierSerie(db, sid, { kg: 20 });
  assert.equal((await lireSeance(db, id))!.seance.volume_kg, 1000);
  assert.equal((await recordsExercice(db, e)).actuels.charge?.valeur, 20);
});

test("Santé Connect : sans module rien ne se passe, avec module la pesée arrive une fois", async () => {
  const { db } = await baseDeTest();
  const absent = { disponible: async () => false, dernierPoids: async () => null };
  assert.equal(await synchroniserPoidsSante(db, absent), false);
  const present = { disponible: async () => true, dernierPoids: async () => ({ kg: 77.4, date: jour(2026, 10, 25, 8) }) };
  await ecrireReglage(db, "sante_poids", "0");
  assert.equal(await synchroniserPoidsSante(db, present), false); // interrupteur coupé par l'utilisateur
  await ecrireReglage(db, "sante_poids", "1");
  assert.equal(await synchroniserPoidsSante(db, present), true);
  assert.equal(await synchroniserPoidsSante(db, present), false);
  assert.deepEqual((await listerPesees(db)).map((p) => [p.kg, p.source]), [[77.4, "sante_connect"]]);
  await assert.rejects(ajouterPesee(db, 0));
});

// --- Autres natures --------------------------------------------------------------------------------

test("D11 : durée (meilleur temps), distance et durée (allure, plus bas = mieux)", async () => {
  const { db } = await baseDeTest();
  const g = await creerExercice(db, { nom: "Gainage", nature: "duree" });
  await faire(db, g, jour(2026, 3, 1), [{ dureeS: 60 }]);
  await faire(db, g, jour(2026, 3, 8), [{ dureeS: 90 }, { dureeS: 45 }]);
  assert.deepEqual((await progressionExercice(db, g, "duree")).points.map((p) => p.valeur), [60, 90]);
  assert.equal((await recordsExercice(db, g)).actuels.duree?.valeur, 90);

  const r = await creerExercice(db, { nom: "Rameur", nature: "distance_duree", allure: "500m" });
  await faire(db, r, jour(2026, 3, 1), [{ distanceM: 2000, dureeS: 480 }]); // 4:00 /km
  await faire(db, r, jour(2026, 3, 8), [{ distanceM: 2000, dureeS: 440 }]); // 3:40 /km
  await faire(db, r, jour(2026, 3, 15), [{ distanceM: 2000, dureeS: 460 }]);
  assert.deepEqual((await progressionExercice(db, r, "allure")).points.map((p) => p.valeur), [240, 220, 230]);
  const rec = await recordsExercice(db, r);
  assert.equal(rec.actuels.allure?.valeur, 220);
  assert.equal(rec.actuels.distance?.valeur, 2000);
  assert.equal(allureSecParKm(2000, 440), 220);
  assert.equal(formaterAllure(220, "500m"), "1:50 /500 m");
  assert.equal(formaterAllure(240, "km"), "4:00 /km");
  assert.equal(formaterAllure(180, "kmh"), "20,0 km/h");
  assert.equal(allureSecParKm(null, 100), null);
});

test("D11 : poids et distance, durée et poids", async () => {
  const { db } = await baseDeTest();
  const f = await creerExercice(db, { nom: "Marche du fermier", nature: "poids_distance" });
  await faire(db, f, jour(2026, 3, 1), [{ kg: 40, distanceM: 30 }, { kg: 50, distanceM: 20 }]);
  const rec = await recordsExercice(db, f);
  assert.equal(rec.actuels.charge?.valeur, 50);
  assert.equal(rec.actuels.distance?.valeur, 30);
  const l = await creerExercice(db, { nom: "Gainage lesté", nature: "duree_poids" });
  await faire(db, l, jour(2026, 3, 1), [{ kg: 10, dureeS: 40 }]);
  assert.equal((await recordsExercice(db, l)).actuels.duree?.valeur, 40);
});

test("D16 : le précédent d'une durée ou d'une distance préremplit la séance suivante", async () => {
  const { db } = await baseDeTest();
  const g = await creerExercice(db, { nom: "Gainage", nature: "duree" });
  await faire(db, g, jour(2026, 3, 1), [{ dureeS: 60 }]);
  const id = await demarrerSeance(db, null, "Suite");
  const { ajouterExerciceASeance } = await import("../src/db/depots/seances.ts");
  await ajouterExerciceASeance(db, id, g, { nbSeries: 1 });
  const s = (await lireSeance(db, id))!.exercices[0]!.series[0]!;
  assert.equal(s.precedent_duree_s, 60);
  assert.equal(s.duree_s, 60);
});

// --- D10 : changer la nature -----------------------------------------------------------------------

test("D10 : verdicts de changement de nature", () => {
  assert.equal(verdictChangementNature("reps", "leste", false).mode, "en_place");
  assert.equal(verdictChangementNature("reps", "assiste", false).mode, "en_place");
  assert.equal(verdictChangementNature("leste", "reps", false).mode, "en_place");
  assert.equal(verdictChangementNature("leste", "reps", true).mode, "variante");
  assert.equal(verdictChangementNature("leste", "assiste", true).mode, "variante");
  assert.equal(verdictChangementNature("duree", "duree_poids", false).mode, "en_place");
  assert.equal(verdictChangementNature("duree_poids", "duree", true).mode, "variante");
  assert.equal(verdictChangementNature("reps", "poids_reps", false).mode, "en_place");
  assert.equal(verdictChangementNature("poids_reps", "leste", false).mode, "variante");
  assert.equal(verdictChangementNature("poids_reps", "reps", false).mode, "variante");
  assert.equal(verdictChangementNature("reps", "distance_duree", false).mode, "variante");
  assert.equal(verdictChangementNature("duree", "reps", false).mode, "variante");
});

test("D10 : changement en place sans perte d'historique, sinon variante à part", async () => {
  const { db } = await baseDeTest();
  await ajouterPesee(db, 80, jour(2026, 1, 1));
  const e = await creerExercice(db, { nom: "Tractions", nature: "reps", muscle: "Dos", equipement: "barre_fixe" });
  const sid = await faire(db, e, jour(2026, 2, 1), [{ reps: 10 }]);
  assert.equal((await lireSeance(db, sid))!.seance.volume_kg, 800);

  // En place : réps seules -> lesté, l'historique garde ses séries et sa charge effective.
  const v = await changerNature(db, e, "leste");
  assert.equal(v?.mode, "en_place");
  assert.equal((await lireExercice(db, e))!.nature, "leste");
  assert.equal((await lireSeance(db, sid))!.seance.volume_kg, 800);

  // Avec du lest saisi, lesté -> assisté casserait le sens : rien ne bouge, on propose la variante.
  await faire(db, e, jour(2026, 3, 1), [{ kg: 10, reps: 5 }]);
  assert.equal((await evaluerChangementNature(db, e, "assiste"))?.mode, "variante");
  assert.equal((await changerNature(db, e, "assiste"))?.mode, "variante");
  assert.equal((await lireExercice(db, e))!.nature, "leste");

  const w = (await creerVariante(db, e, "assiste"))!;
  const copie = (await lireExercice(db, w))!;
  assert.equal(copie.nature, "assiste");
  assert.equal(copie.muscle, "Dos");
  assert.equal(copie.perso, 1);
  assert.equal(copie.nom, "Tractions (assisté)");
  assert.equal((await recordsExercice(db, e)).actuels.charge?.valeur, 10); // l'original garde son histoire

  // Vers la distance : allure par défaut, poids_corps remis à jour.
  const sans = await creerExercice(db, { nom: "Gainage", nature: "duree" });
  assert.equal((await changerNature(db, sans, "duree_poids"))?.mode, "en_place");
  assert.equal((await lireExercice(db, sans))!.poids_corps, 0);
  await modifierExercice(db, sans, { equipement: "poids_du_corps", aVerifier: false });
  assert.equal((await lireExercice(db, sans))!.equipement, "poids_du_corps");
});

// --- D12, D13 : filtres ----------------------------------------------------------------------------

test("D12 D13 : filtres équipement et muscle (multi), salle (équipements cochés), compteurs", async () => {
  const { db } = await baseDeTest();
  await creerExercice(db, { nom: "Développé couché", muscle: "Pectoraux", secondaires: ["Triceps"], equipement: "barre" });
  await creerExercice(db, { nom: "Écartés", muscle: "Pectoraux", equipement: "halteres" });
  await creerExercice(db, { nom: "Extension triceps", muscle: "Triceps", equipement: "poulie" });
  await creerExercice(db, { nom: "Tractions", muscle: "Dos", equipement: "barre_fixe", nature: "reps" });
  const maison = await creerSalle(db, "Maison", ["halteres", "barre_fixe"]);
  const club = await creerSalle(db, "Club", ["barre", "poulie", "halteres"]);

  assert.equal(await compterExercices(db, {}), 4);
  assert.equal(await compterExercices(db, { equipements: ["barre", "poulie"] }), 2);
  assert.equal(await compterExercices(db, { muscles: ["Pectoraux"] }), 2);
  assert.equal(await compterExercices(db, { muscles: ["Triceps"] }), 1);
  assert.equal(await compterExercices(db, { muscles: ["Triceps"], secondaires: true }), 2);
  assert.equal(await compterExercices(db, { muscles: ["Pectoraux", "Dos"] }), 3);
  assert.equal(await compterExercices(db, { salleId: maison }), 2);
  assert.equal(await compterExercices(db, { salleId: club }), 3);
  assert.equal(await compterExercices(db, { salleId: club, muscles: ["Pectoraux"] }), 2);
  assert.deepEqual((await rechercherExercices(db, { salleId: maison, texte: "tract" })).map((e) => e.nom), ["Tractions"]);

  // Les compteurs d'une feuille ignorent sa propre dimension.
  const eq = await compteursEquipement(db, { muscles: ["Pectoraux"] });
  assert.deepEqual(eq.sort((a, b) => a.equipement.localeCompare(b.equipement)), [{ equipement: "barre", n: 1 }, { equipement: "halteres", n: 1 }]);
  const parSalle = await (await import("../src/db/depots/exercices.ts")).compteursSalle(db, { muscles: ["Pectoraux"] });
  assert.deepEqual(parSalle.map((s) => s.n), [1, 2]);
  const sansEquipement = await creerSalle(db, "Vide");
  assert.equal(await compterExercices(db, { salleId: sansEquipement }), 0);
});

// --- D14 D15 : paliers -----------------------------------------------------------------------------

test("D14 : + et − sautent de palier en palier, valeur hors palier gardée, sans palier 2,5 kg", () => {
  const pile = [25, 31.5, 38.5, 45, 52, 58.5];
  assert.equal(palierVoisin(pile, 45, 1), 52);
  assert.equal(palierVoisin(pile, 45, -1), 38.5);
  assert.equal(palierVoisin(pile, 58.5, 1), null);
  assert.equal(palierVoisin(pile, 25, -1), null);
  assert.equal(palierVoisin(pile, null, 1), 25);
  assert.equal(estHorsPalier(pile, 54.5), true);
  assert.equal(estHorsPalier(pile, 52), false);
  assert.equal(estHorsPalier(pile, null), false);
  assert.equal(estHorsPalier(null, 54.5), false);
  assert.equal(palierVoisin(pile, 54.5, 1), 58.5); // repart des voisins
  assert.equal(palierVoisin(pile, 54.5, -1), 52);
  assert.equal(palierVoisin(null, 60, 1), 62.5);
  assert.equal(palierVoisin([], 60, -1), 57.5);
  assert.equal(palierVoisin(null, 1, -1), null);
  assert.equal(palierVoisin(null, null, 1), 2.5);
});

test("D15 : pas régulier déplié en liste", () => {
  assert.deepEqual(paliersReguliers(5, 5, 25), [5, 10, 15, 20, 25]);
  assert.deepEqual(paliersReguliers(2.5, 2.5, 10), [2.5, 5, 7.5, 10]);
  assert.deepEqual(paliersReguliers(10, 0, 20), []);
  assert.deepEqual(paliersReguliers(30, 5, 20), []);
  assert.equal(pasRegulier([5, 10, 15, 20]), 5);
  assert.equal(pasRegulier([25, 31.5, 38.5, 45]), null);
  assert.equal(pasRegulier([5, 10]), null);
});

test("D13 D14 D15 : salles, appareils, paliers par exercice, séance et salle par défaut", async () => {
  const { db } = await baseDeTest();
  const presse = await creerExercice(db, { nom: "Presse", equipement: "machine" });
  const incline = await creerExercice(db, { nom: "Presse inclinée", equipement: "machine" });
  const curl = await creerExercice(db, { nom: "Curl", equipement: "halteres" });
  assert.equal(await salleParDefaut(db), null);

  const club = await creerSalle(db, "Club Oberkampf", ["machine", "poulie"]);
  const hotel = await creerSalle(db, "Hôtel Lyon", ["halteres"]);
  assert.deepEqual((await listerSalles(db)).map((s) => [s.nom, s.defaut]), [["Club Oberkampf", true], ["Hôtel Lyon", false]]);
  assert.equal(await salleParDefaut(db), club);

  // Une pile irrégulière commune à deux exercices (D15).
  const pile = await creerAppareil(db, club, { nom: "Pile presse", type: "pile", paliersKg: [58.5, 25, 31.5, 38.5, 45, 52, 25], exerciceIds: [presse, incline] });
  const s = (await lireSalle(db, club))!;
  assert.deepEqual(s.appareils[0]!.paliers_kg, [25, 31.5, 38.5, 45, 52, 58.5]);
  assert.deepEqual(s.appareils[0]!.exerciceIds.sort(), [presse, incline].sort());
  assert.deepEqual(await paliersPour(db, presse, club), [25, 31.5, 38.5, 45, 52, 58.5]);
  assert.deepEqual(await paliersPour(db, incline, club), [25, 31.5, 38.5, 45, 52, 58.5]);
  assert.equal(await paliersPour(db, curl, club), null);
  assert.equal(await paliersPour(db, presse, hotel), null); // autre salle : pas de palier, 2,5 kg
  assert.equal(await paliersPour(db, presse, null), null);

  await modifierAppareil(db, pile, { paliersKg: paliersReguliers(10, 10, 50), exerciceIds: [presse] });
  assert.deepEqual(await paliersPour(db, presse, club), [10, 20, 30, 40, 50]);
  assert.equal(await paliersPour(db, incline, club), null);

  // Appareil par défaut d'un exercice, valable dans sa salle.
  await modifierExercice(db, curl, { appareilId: pile });
  assert.deepEqual(await paliersPour(db, curl, club), [10, 20, 30, 40, 50]);
  assert.equal(await paliersPour(db, curl, hotel), null);

  // Séance : salle par défaut à la création (D17), changeable ; supprimer la salle garde la séance.
  const id = await demarrerSeance(db, null, "Test");
  assert.deepEqual({ ...(await lireSeance(db, id))!.salle }, { id: club, nom: "Club Oberkampf", type: "salle" });
  const { modifierSeance } = await import("../src/db/depots/seances.ts");
  await modifierSeance(db, id, { salleId: hotel });
  assert.equal((await lireSeance(db, id))!.salle?.nom, "Hôtel Lyon");
  await definirSalleParDefaut(db, hotel);
  assert.equal(await salleParDefaut(db), hotel);
  await modifierSalle(db, hotel, { nom: "Hôtel Lyon 2", equipements: ["halteres", "kettlebell"] });
  assert.deepEqual((await lireSalle(db, hotel))!.equipements, ["kettlebell", "halteres"].sort((a, b) => ["poids_du_corps", "barre", "halteres", "kettlebell"].indexOf(a) - ["poids_du_corps", "barre", "halteres", "kettlebell"].indexOf(b)));
  await supprimerSalle(db, hotel);
  assert.equal((await lireSeance(db, id))!.salle, null);
  assert.equal(await salleParDefaut(db), club); // la salle restante reprend le rôle
  await supprimerSalle(db, club);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM appareil", []))!.n, 0);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM appareil_exercice", []))!.n, 0);
});

// --- Tractions et dips : équipement du catalogue et migration 17 -----------------------------------

test("toute traction du catalogue est à la barre fixe, tout dips au poids du corps", () => {
  const eq = (slug: string, materiel: string) => equipementDuCatalogue({ slug, materiel, categorie: "Force" });
  for (const [slug, materiel] of [
    ["pullups", "Poids du corps"], ["chin-up", "Poids du corps"], ["v-bar-pullup", "Poids du corps"], ["wide-grip-rear-pull-up", "Poids du corps"],
    ["scapular-pull-up", "Aucun"], ["weighted-pull-ups", "Autre"], ["one-arm-chin-up", "Autre"], ["band-assisted-pull-up", "Autre"],
    ["muscle-up", "Autre"], ["kipping-muscle-up", "Autre"], ["mixed-grip-chin", "Autre"], ["side-to-side-chins", "Autre"], ["hanging-pike", "Poids du corps"],
  ]) {
    assert.equal(eq(slug!, materiel!), "barre_fixe", slug);
  }
  for (const slug of ["parallel-bar-dip", "ring-dips", "dips-chest-version", "weighted-bench-dip", "dips-triceps-version", "bench-dips"]) {
    assert.equal(eq(slug, "Autre"), "poids_du_corps", slug);
  }
  assert.equal(eq("v-bar-pulldown", "Poulie"), "poulie");
  assert.equal(eq("dip-machine", "Machine"), "machine");
  assert.equal(eq("chin-to-chest-stretch", "Aucun"), "poids_du_corps");
  assert.equal(eq("gorilla-chin-crunch", "Poids du corps"), "poids_du_corps");
  assert.equal(eq("jerk-dip-squat", "Barre"), "barre");
});

test("migration 17 : l'équipement des tractions et dips du catalogue est corrigé, les réglages d'Alex et les perso restent", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 16);
  const ins = (id: string, slug: string, eqp: string, perso: number) =>
    raw.prepare("INSERT INTO exercices (id,nom,nom_norm,slug,poids_corps,perso,equipement,cree_le,maj_le) VALUES (?,?,?,?,0,?,?,1,1)").run(id, slug, slug, slug, perso, eqp);
  ins("a", "weighted-pull-ups", "autre", 0);
  ins("b", "wide-grip-rear-pull-up", "poids_du_corps", 0);
  ins("c", "parallel-bar-dip", "elastique", 0);
  ins("d", "muscle-up", "autre", 1);
  ins("e", "pullups", "barre_fixe", 0);
  await migrer(db);
  const eq = (id: string) => (raw.prepare("SELECT equipement FROM exercices WHERE id = ?").get(id) as { equipement: string }).equipement;
  assert.equal(eq("a"), "barre_fixe");
  assert.equal(eq("b"), "barre_fixe");
  assert.equal(eq("c"), "elastique");
  assert.equal(eq("d"), "autre");
  assert.equal(eq("e"), "barre_fixe");
});

test("les corrections de la migration 17 couvrent tout écart entre l'ancienne classification et la nouvelle", () => {
  for (const [slug, , apres] of CORRECTIONS_EQUIPEMENT) {
    const e = catalogue().exercices.find((x) => x.slug === slug);
    assert.ok(e, slug);
    assert.equal(equipementDuCatalogue(e), apres, slug);
  }
});
