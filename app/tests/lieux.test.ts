// Lieux, lot A : migration 25 (type ouvert, lieu_activite), registre des types, création d'un lieu, D6.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { aCapacite, estDepartDeRandonnee, libelleTypeLieu, TYPES_LIEU, typeLieu } from "../src/db/lieux.ts";
import {
  activiteAPreremplir, creerLieu, creerSalle, definirActivitesLieu, listerActivites, listerSalles, lireSalle, supprimerSalle,
} from "../src/db/depots/salles.ts";
import { ajouterExerciceASeance, demarrerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { MIGRATIONS, migrer, VERSION_COURANTE, type Migration } from "../src/db/migrations.ts";
import { TABLES_SYNC } from "../src/sync/schema.ts";
import { adapter, baseDeTest } from "./aide.ts";

test("migration 26 (lieux) : une base v24 garde ses salles, équipements et appareils, toutes de type « salle »", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 24);
  raw.exec(`INSERT INTO salle (id,nom,defaut,equipements,cree_le,maj_le) VALUES ('s','Basic-Fit',1,'halteres|barre|poulie',1,1),('m','Maison',0,'',1,1);
    INSERT INTO appareil (id,salle_id,nom,type,paliers_kg) VALUES ('a','s','Presse','pile','[5,10]');
    INSERT INTO seances (id,debut,fin,salle_id,maj_le,volume_kg,nb_series) VALUES ('x',1,2,'s',1,0,0);`);
  const avant = raw.prepare("SELECT id, nom, defaut, equipements FROM salle ORDER BY id").all().map((r) => ({ ...r }));
  assert.equal(await migrer(db), VERSION_COURANTE);
  const apres = raw.prepare("SELECT id, nom, defaut, equipements, type FROM salle ORDER BY id").all().map((r) => ({ ...r }));
  assert.deepEqual(apres, avant.map((r) => ({ ...r, type: "salle" })));
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM appareil WHERE salle_id = 's'").get() as { n: number }).n, 1);
  assert.equal((raw.prepare("SELECT salle_id FROM seances WHERE id = 'x'").get() as { salle_id: string }).salle_id, "s");
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
  assert.ok(tables.includes("lieu_activite"));
});

test("registre : capacités des types, type inconnu gardé tel quel sans capacité", () => {
  assert.deepEqual(TYPES_LIEU.map((x) => x.id), ["salle", "exterieur", "piscine", "terrain", "domicile"]);
  assert.ok(aCapacite("salle", "equipements") && aCapacite("domicile", "equipements"));
  assert.ok(!aCapacite("exterieur", "equipements") && aCapacite("exterieur", "activites"));
  assert.deepEqual(typeLieu("escalade"), { id: "escalade", picto: "place", capacites: [] });
});

test("lieu_activite est synchronisée, après salle et exercices", async () => {
  const { raw, db } = await baseDeTest(true);
  const i = TABLES_SYNC.findIndex((t) => t.nom === "lieu_activite");
  assert.ok(i > TABLES_SYNC.findIndex((t) => t.nom === "salle") && i > TABLES_SYNC.findIndex((t) => t.nom === "exercices"));
  const id = await creerLieu(db, { nom: "Quais de Seine", type: "exterieur", activites: ["cat:course"] });
  const j = raw.prepare("SELECT cle, supprime FROM sync_journal WHERE tab = 'lieu_activite'").all().map((r) => ({ ...r }));
  assert.deepEqual(j, [{ cle: `${id}|cat:course`, supprime: 0 }]);
  await supprimerSalle(db, id);
  const k = raw.prepare("SELECT supprime FROM sync_journal WHERE tab = 'lieu_activite'").get() as { supprime: number };
  assert.equal(k.supprime, 1);
});

test("créer un lieu : type, activités facultatives et multiples dans l'ordre de coche ; une salle n'en garde pas", async () => {
  const { db } = await baseDeTest(true);
  const acts = await listerActivites(db);
  assert.ok(acts.some((a) => a.id === "cat:course") && acts.some((a) => a.id === "cat:padel"));
  assert.ok(!acts.some((a) => a.id === "cat:developpe-couche"), "pas d'exercice de salle dans les activités");
  const quais = await creerLieu(db, { nom: "Quais de Seine", type: "exterieur", activites: ["cat:course", "cat:bicycling"] });
  const vide = await creerLieu(db, { nom: "Vallée", type: "exterieur" });
  const salle = await creerLieu(db, { nom: "Salle de l'immeuble", type: "salle", activites: ["cat:course"], equipements: ["halteres"] });
  const l = await listerSalles(db);
  const de = (id: string) => l.find((s) => s.id === id)!;
  assert.deepEqual(de(quais).activites.map((a) => a.id), ["cat:course", "cat:bicycling"]);
  assert.equal(de(quais).type, "exterieur");
  assert.deepEqual(de(vide).activites, []);
  assert.deepEqual(de(salle).activites, []);
  assert.deepEqual(de(salle).equipements, ["halteres"]);
  assert.equal(de(quais).defaut, true, "le premier lieu est le lieu par défaut");
  await definirActivitesLieu(db, quais, ["cat:bicycling", "cat:course"]);
  assert.deepEqual((await lireSalle(db, quais))!.activites.map((a) => a.id), ["cat:bicycling", "cat:course"]);
  assert.equal((await lireSalle(db, salle))!.type, "salle");
  assert.equal((await creerSalle(db, "Club")) && (await listerSalles(db)).find((s) => s.nom === "Club")!.type, "salle");
});

test("nombre de séances terminées par lieu", async () => {
  const { db } = await baseDeTest();
  const id = await creerLieu(db, { nom: "Quais", type: "exterieur" });
  const s = await demarrerSeance(db, null);
  await terminerSeance(db, s);
  await demarrerSeance(db, null);
  assert.equal((await listerSalles(db)).find((x) => x.id === id)!.nbSeances, 1);
});

test("D6 : une séance vide reçoit l'activité unique du lieu ; plusieurs activités, aucune ou séance commencée : rien", async () => {
  const { db } = await baseDeTest(true);
  const padel = await creerLieu(db, { nom: "Casa Padel", type: "terrain", activites: ["cat:padel"] });
  const quais = await creerLieu(db, { nom: "Quais", type: "exterieur", activites: ["cat:course", "cat:bicycling"] });
  const salle = await creerSalle(db, "Basic-Fit");
  const s = await demarrerSeance(db, null);
  assert.equal(await activiteAPreremplir(db, s, padel), "cat:padel");
  assert.equal(await activiteAPreremplir(db, s, quais), null);
  assert.equal(await activiteAPreremplir(db, s, salle), null);
  assert.equal(await activiteAPreremplir(db, s, null), null);
  await ajouterExerciceASeance(db, s, "cat:course", { nbSeries: 1 });
  assert.equal(await activiteAPreremplir(db, s, padel), null);
});

test("séance passée : photo d'abord, sinon picto d'un exercice seul ; D7 ; pas de numéro pour une ligne unique", async () => {
  const { vuePassee } = await import("../src/ecrans/seance-passee-vue.ts");
  const s = (distance_m: number | null = null, volume = 0, type = "normale") => ({ type, distance_m, volume });
  const padel = vuePassee([{ nom: "Padel", nature: "duree", series: [s()] }], "Padel", false);
  assert.equal(padel.heros, "picto");
  assert.deepEqual(padel.exercices[0], { cache: true, picto: false, nom: false, numeros: false });
  assert.equal(padel.avecVolume || padel.avecSeries, false, "ni volume ni séries pour un sport sans charge");
  const course = vuePassee([{ nom: "Course à pied", nature: "distance_duree", series: [s(8200)] }], "Course du soir", true);
  assert.equal(course.couverture, "photo");
  assert.equal(course.heros, "picto");
  assert.equal(course.distanceM, 8200);
  assert.deepEqual(course.exercices[0], { cache: false, picto: false, nom: true, numeros: false });
  const epaules = vuePassee([{ nom: "Développé épaules", nature: "poids_reps", series: [s(null, 120, "echauffement"), s(null, 200), s(null, 180)] }], "Épaules express", false);
  assert.deepEqual(epaules.exercices[0], { cache: false, picto: false, nom: true, numeros: true });
  assert.equal(epaules.volume, 380);
  assert.ok(epaules.avecVolume && epaules.avecSeries);
  const push = vuePassee(
    [{ nom: "Développé couché", nature: "poids_reps", series: [s(null, 640)] }, { nom: "Dips", nature: "reps", series: [s()] }],
    "Push A",
    false,
  );
  assert.equal(push.heros, null);
  assert.deepEqual(push.exercices.map((e) => [e.picto, e.numeros, e.cache]), [[true, true, false], [true, true, false]]);
});

test("séance passée : titre sans emoji de tête, note sans la ligne technique Whoop de l'import", async () => {
  const { noteAffichee, titreAffiche } = await import("../src/ecrans/seance-passee-vue.ts");
  assert.equal(titreAffiche("🏓 Padel"), "Padel");
  assert.equal(titreAffiche("22/10 — Push A"), "22/10 — Push A");
  assert.equal(titreAffiche("🏋️‍♂️ Legs"), "Legs");
  assert.equal(noteAffichee("🩸 Whoop: paddle-tennis | strain 15.2 | HR 126/164 bpm"), null);
  assert.equal(noteAffichee("Bonne séance\n🩸 Whoop: weightlifting_msk | strain 13.5 | HR 108/152 bpm"), "Bonne séance");
  assert.equal(noteAffichee("Je fais la dernière série en hypertrophie"), "Je fais la dernière série en hypertrophie");
  assert.equal(noteAffichee(null), null);
});

test("séance passée : date longue « Lundi 26 octobre, 18:30 »", async () => {
  const { dateLongueSeance } = await import("../src/ecrans/format.ts");
  assert.match(dateLongueSeance(new Date(2026, 9, 26, 18, 30).getTime()), /^Lundi 26 octobre, 18:30$/);
});

test("séance terminée : définir, changer puis retirer le lieu ; la synchro le note", async () => {
  const { raw, db } = await baseDeTest();
  const { lireSeance, modifierSeance } = await import("../src/db/depots/seances.ts");
  const quais = await creerLieu(db, { nom: "Quais", type: "exterieur" });
  const club = await creerSalle(db, "Club");
  raw.exec("UPDATE salle SET defaut = 0");
  const s = await demarrerSeance(db, null);
  await terminerSeance(db, s);
  assert.equal((await lireSeance(db, s))!.salle, null);
  raw.exec("DELETE FROM sync_journal");
  await modifierSeance(db, s, { salleId: quais });
  assert.deepEqual({ ...(await lireSeance(db, s))!.salle }, { id: quais, nom: "Quais", type: "exterieur" });
  assert.deepEqual(raw.prepare("SELECT tab, cle FROM sync_journal").all().map((r) => ({ ...r })), [{ tab: "seances", cle: s }]);
  await modifierSeance(db, s, { salleId: club });
  assert.equal((await lireSeance(db, s))!.salle!.id, club);
  await modifierSeance(db, s, { salleId: null });
  assert.equal((await lireSeance(db, s))!.salle, null);
  assert.ok((await lireSeance(db, s))!.seance.fin, "la séance reste terminée");
});

// Règle des témoins (27/10) : la migration des lieux, livrée en 25 sur le Fold d'un testeur avant la fusion, devient la 26
// (témoin salle.type) ; la 25 est celle des blessures (témoin blessure).
const LIEUX = MIGRATIONS.find((m) => m.nom === "lieux")!;
const BLESSURES = MIGRATIONS.find((m) => m.nom === "blessures-traitements")!;
const declencheurs = (raw: DatabaseSync, tab: string) =>
  (raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").get(tab) as { n: number }).n;

test("témoins : numéros et témoins des migrations 25 (blessures) et 26 (lieux)", () => {
  assert.equal(BLESSURES.version, 25);
  assert.equal(BLESSURES.temoin, "blessure");
  assert.equal(LIEUX.version, 26);
  assert.equal(LIEUX.temoin, "salle.type");
});

test("Fold d'un testeur : version 25 avec salle.type (lieux livrés en 25) ; blessures appliquées, lieux sautés, données intactes", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  // La base du Fold : l'appli de la branche lieux, où la migration des lieux portait le numéro 25.
  const livreeSurLeFold: Migration[] = [...MIGRATIONS.filter((m) => m.version <= 24), { ...LIEUX, version: 25, temoin: undefined }];
  assert.equal(await migrer(db, 25, livreeSurLeFold), 25);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('cat:padel','Padel',0,1,1);
    INSERT INTO salle (id,nom,defaut,equipements,type,cree_le,maj_le) VALUES ('lofting','Lofting',1,'halteres|machine','salle',1,1),
      ('lolol','Lolol',0,'','exterieur',1,1);
    INSERT INTO lieu_activite (lieu_id, exercice_id, ordre) VALUES ('lolol','cat:padel',0);
    INSERT INTO seances (id,debut,fin,salle_id,maj_le,volume_kg,nb_series) VALUES ('s',1,2,'lolol',1,0,0);`);
  const avant = raw.prepare("SELECT id, nom, defaut, equipements, type FROM salle ORDER BY id").all().map((r) => ({ ...r }));
  assert.ok(!(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'blessure'").get()));

  // L'appli fusionnée : 25 blessures (témoin absent, numéro passé : appliquée), 26 lieux (témoin présent : sautée).
  assert.equal(await migrer(db), VERSION_COURANTE);
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);
  for (const t of ["blessure", "blessure_statut", "blessure_journal", "traitement", "prise"]) {
    assert.ok(raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t), t);
  }
  assert.deepEqual(raw.prepare("SELECT id, nom, defaut, equipements, type FROM salle ORDER BY id").all().map((r) => ({ ...r })), avant);
  assert.deepEqual({ ...raw.prepare("SELECT lieu_id, exercice_id, ordre FROM lieu_activite").get() }, { lieu_id: "lolol", exercice_id: "cat:padel", ordre: 0 });
  assert.equal((raw.prepare("SELECT salle_id FROM seances WHERE id = 's'").get() as { salle_id: string }).salle_id, "lolol");
  assert.equal(declencheurs(raw, "lieu_activite"), 3, "déclencheurs de synchro des lieux, ni perdus ni doublés");
  assert.equal(declencheurs(raw, "blessure"), 3);
  // Relancer ne refait rien.
  assert.equal(await migrer(db), VERSION_COURANTE);
  // Les écritures suivent : la synchro note un nouveau lien, et une blessure s'écrit.
  raw.exec("DELETE FROM sync_journal");
  await definirActivitesLieu(db, "lolol", ["cat:padel"]);
  raw.exec("INSERT INTO lieu_activite (lieu_id, exercice_id, ordre) VALUES ('lofting','cat:padel',0)");
  assert.ok(raw.prepare("SELECT 1 FROM sync_journal WHERE tab = 'lieu_activite' AND cle = 'lofting|cat:padel'").get());
  raw.exec("INSERT INTO blessure (id,titre,debut,cree_le,maj_le) VALUES ('b','Épaule','2026-10-27',1,1)");
});

test("témoins : un téléphone qui a reçu les blessures en 25 reçoit les lieux en 26 ; une base v24 reçoit les deux", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  assert.equal(await migrer(db, 25), 25);
  assert.equal(raw.prepare("SELECT name FROM pragma_table_info('salle') WHERE name = 'type'").get(), undefined);
  raw.exec("INSERT INTO salle (id,nom,defaut,equipements,cree_le,maj_le) VALUES ('s','Club',1,'barre',1,1)");
  assert.equal(await migrer(db), VERSION_COURANTE);
  assert.equal((raw.prepare("SELECT type FROM salle WHERE id = 's'").get() as { type: string }).type, "salle");
  assert.equal(declencheurs(raw, "lieu_activite"), 3);

  const neuve = await baseDeTest();
  assert.equal((neuve.raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);
  assert.equal(declencheurs(neuve.raw, "lieu_activite"), 3);
  assert.equal(declencheurs(neuve.raw, "blessure"), 3);
});

test("lieu de départ de circuits : type de l'annuaire, jamais proposé dans « Nouveau lieu », libellé selon les activités", () => {
  assert.ok(!TYPES_LIEU.some((x) => x.id === "depart"), "pas dans la feuille « Nouveau lieu »");
  assert.equal(typeLieu("depart").picto, "exterieur");
  assert.ok(aCapacite("depart", "activites") && !aCapacite("depart", "autour") && !aCapacite("depart", "equipements"));
  assert.ok(estDepartDeRandonnee(["randonnee"]) && !estDepartDeRandonnee(["randonnee", "bicycling"]) && !estDepartDeRandonnee([]) && !estDepartDeRandonnee(null));
  assert.equal(libelleTypeLieu("depart", ["randonnee"]), "Départ de randonnée");
  assert.equal(libelleTypeLieu("depart", ["course"]), "Départ de parcours");
  assert.equal(libelleTypeLieu("depart"), "Départ de parcours");
});
