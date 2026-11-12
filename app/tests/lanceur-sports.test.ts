import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { chargerCatalogue } from "../src/db/catalogue.ts";
import { demarrerSeanceSport, dernierSport, ecrireLanceur, lireLanceur, lireLieuProbable } from "../src/db/depots/lanceur.ts";
import { creerLieu } from "../src/db/depots/salles.ts";
import { migrer } from "../src/db/migrations.ts";
import {
  ajouter, descendre, deplacer, disposerTuiles, genreSport, hauteurTuiles, largeurs, lieuIci, lieuProbable, monter, pictoSport, RAYON_ICI_M, rangVise,
  retirer, routinesFeuille, sportsParDefaut,
} from "../src/ecrans/lanceur-sports.ts";
import { adapter, baseDeTest, catalogue } from "./aide.ts";

test("largeurs(n) : la règle de la planche v2, de 1 à 8 sports", () => {
  assert.deepEqual(largeurs(1), [6]);
  assert.deepEqual(largeurs(2), [3, 3]);
  assert.deepEqual(largeurs(3), [2, 2, 2]);
  assert.deepEqual(largeurs(4), [3, 3, 3, 3]);
  assert.deepEqual(largeurs(5), [2, 2, 2, 3, 3]);
  assert.deepEqual(largeurs(6), Array(6).fill(2));
  assert.deepEqual(largeurs(8), Array(8).fill(2));
});

test("disposerTuiles : 6 colonnes, rangées qui passent à la ligne, dernière rangée à gauche", () => {
  // 400 px, écart 8 : colonne de 60, tiers de 128, demi de 196.
  const p5 = disposerTuiles(5, 400, 8, 112);
  assert.deepEqual(p5.map((r) => [r.x, r.y, r.l]), [[0, 0, 128], [136, 0, 128], [272, 0, 128], [0, 120, 196], [204, 120, 196]]);
  const p7 = disposerTuiles(7, 400, 8, 112);
  assert.deepEqual(p7.at(-1), { x: 0, y: 240, l: 128, h: 112 });
  assert.deepEqual(disposerTuiles(1, 400, 8, 112), [{ x: 0, y: 0, l: 400, h: 112 }]);
  assert.equal(hauteurTuiles(0, 8), 0);
  assert.equal(hauteurTuiles(4, 8), 232);
  assert.equal(hauteurTuiles(7, 8), 352);
});

test("ajouter, retirer, monter, descendre, déplacer", () => {
  const l = ["a", "b", "c"];
  assert.deepEqual(ajouter(l, "d"), ["a", "b", "c", "d"]);
  assert.deepEqual(ajouter(l, "b"), l);
  assert.deepEqual(retirer(l, "b"), ["a", "c"]);
  assert.deepEqual(monter(l, "c"), ["a", "c", "b"]);
  assert.deepEqual(descendre(l, "a"), ["b", "a", "c"]);
  assert.deepEqual(monter(l, "a"), l);
  assert.deepEqual(deplacer(l, "a", 9), ["b", "c", "a"]);
});

test("rangVise : la tuile tenue prend la place la plus proche de son centre", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  assert.equal(rangVise(ids, "a", 64, 56, 400, 8), 0);
  assert.equal(rangVise(ids, "a", 336, 176, 400, 8), 5);
  assert.equal(rangVise(ids, "d", 200, 170, 400, 8), 4);
});

test("sportsParDefaut (D4) : Musculation, Course, Vélo, puis l'historique, jusqu'à 6", () => {
  const connus = new Set(["cat:musculation", "cat:course", "cat:bicycling", "cat:padel", "cat:yoga", "cat:boxe", "cat:hiit", "cat:natation"]);
  assert.deepEqual(sportsParDefaut(connus, []), ["cat:musculation", "cat:course", "cat:bicycling"]);
  assert.deepEqual(sportsParDefaut(connus, ["cat:padel", "cat:course", "cat:yoga", "cat:boxe", "cat:hiit"]), [
    "cat:musculation", "cat:course", "cat:bicycling", "cat:padel", "cat:yoga", "cat:boxe",
  ]);
  assert.deepEqual(sportsParDefaut(new Set(["cat:padel"]), ["cat:padel", "x"]), ["cat:padel"]);
});

test("genre, picto et lieu probable (D3)", () => {
  // Par famille (familles-sports, D3 du 30/10) : Force, routines et séance libre ; les quatre autres, le départ du suivi.
  assert.equal(genreSport("cat:musculation"), "muscu");
  assert.equal(genreSport("cat:cross-training"), "muscu");
  assert.equal(genreSport("cat:course"), "suivi");
  assert.equal(genreSport("cat:randonnee"), "suivi");
  assert.equal(genreSport("cat:padel"), "suivi");
  assert.equal(genreSport("cat:sauna"), "suivi");
  assert.equal(genreSport("cat:hiit"), "suivi", "HIIT : un sport et cours (D1 du 30/10)");
  assert.equal(pictoSport("musculation"), "couche");
  assert.equal(pictoSport("cross-training"), "kettlebell-swing");
  assert.equal(pictoSport("padel"), "padel");
  assert.equal(lieuProbable("cat:musculation", { dernier: "x", habituel: null, defaut: "salle" }), "salle");
  assert.equal(lieuProbable("cat:musculation", { dernier: "x", habituel: null, defaut: null }), "x");
  assert.equal(lieuProbable("cat:course", { dernier: "quais", habituel: "parc", defaut: "salle" }), "quais");
  assert.equal(lieuProbable("cat:course", { dernier: null, habituel: "parc", defaut: "salle" }), "parc");
  assert.equal(lieuProbable("cat:padel", { dernier: null, habituel: null, defaut: "salle" }), null);
});

test("routinesFeuille : la prévue en tête, puis par date, au plus 3", () => {
  const r = ["a", "b", "c", "d"].map((id) => ({ id }));
  const p = new Map([["c", { date: "2026-10-27" }], ["b", { date: "2026-10-28" }]]);
  assert.deepEqual(routinesFeuille(r, p).map((x) => x.id), ["c", "b", "a"]);
});

test("migration 28 : additive, rien ne bouge ; le lanceur se pose au premier passage avec l'historique", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 25);
  await chargerCatalogue(db, catalogue());
  raw.exec(`INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r1','Push',0,1,1);
    INSERT INTO salle (id,nom,equipements,defaut,ordre,cree_le,maj_le) VALUES ('g1','Basic-Fit','[]',1,0,1,1),('q1','Quais','[]',0,1,1,1);
    INSERT INTO seances (id,debut,fin,maj_le,routine_id,salle_id) VALUES ('s1',10,20,1,'r1','g1'),('s2',30,40,1,NULL,'q1'),('s3',50,60,1,NULL,NULL);
    INSERT INTO seance_exercices (seance_id,exercice_id,position) VALUES ('s2','cat:padel',0),('s3','cat:yoga',0);`);
  const avant = raw.prepare("SELECT * FROM seances ORDER BY id").all().map((r) => ({ ...r }));
  await migrer(db);
  // Colonnes ajoutées depuis (activite_id, reconnu : migration 43 ; score : migration 44) : nulles ; celles d'avant n'ont pas bougé.
  const cols = Object.keys(avant[0]!);
  const apres = raw.prepare("SELECT * FROM seances ORDER BY id").all() as Record<string, unknown>[];
  for (const r of apres) for (const c of ["activite_id", "reconnu", "score"]) assert.equal(r[c], null);
  assert.deepEqual(apres.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))), avant);
  const l = await lireLanceur(db);
  assert.deepEqual(l.map((s) => s.id), ["cat:musculation", "cat:course", "cat:bicycling", "cat:yoga", "cat:padel"]);
  // Tout retiré : la table reste vide, le défaut ne revient pas.
  await ecrireLanceur(db, []);
  assert.deepEqual(await lireLanceur(db), []);
  await ecrireLanceur(db, ["cat:padel", "cat:musculation"]);
  assert.deepEqual((await lireLanceur(db)).map((s) => s.id), ["cat:padel", "cat:musculation"]);
  // Lieu probable : padel au dernier lieu, muscu à la salle par défaut, yoga sans lieu (pas de lieu_activite).
  assert.equal(await lireLieuProbable(db, "cat:padel"), "q1");
  assert.equal(await lireLieuProbable(db, "cat:musculation"), "g1");
  assert.equal(await lireLieuProbable(db, "cat:yoga"), null);
});

test("dernierSport : l'activité de la séance la plus récente, Musculation pour des exercices, null sans historique", async () => {
  const { raw, db } = await baseDeTest(true);
  assert.equal(await dernierSport(db), null);
  raw.exec(`INSERT INTO seances (id,debut,fin,maj_le) VALUES ('s1',10,20,1),('s2',30,40,1);
    INSERT INTO seance_exercices (seance_id,exercice_id,position) VALUES ('s1','cat:padel',0),('s2','cat:squat',0);`);
  assert.equal(await dernierSport(db), "cat:musculation");
  raw.exec(`INSERT INTO seances (id,debut,fin,maj_le) VALUES ('s3',50,60,1);
    INSERT INTO seance_exercices (seance_id,exercice_id,position) VALUES ('s3','cat:squat',0),('s3','cat:yoga',1);`);
  assert.equal(await dernierSport(db), "cat:yoga");
});

test("lieu habituel : lu dans lieu_activite (migration 26, Lieux)", async () => {
  const { raw, db } = await baseDeTest(true);
  raw.exec(`INSERT INTO salle (id,nom,equipements,defaut,ordre,cree_le,maj_le) VALUES ('q1','Quais','[]',0,0,1,1);
    INSERT INTO lieu_activite VALUES ('q1','cat:course',0);`);
  assert.equal(await lireLieuProbable(db, "cat:course"), "q1");
});

test("demarrerSeanceSport : une séance en cours, ou saisie après coup et terminée", async () => {
  const { raw, db } = await baseDeTest(true);
  const id = await demarrerSeanceSport(db, { exerciceId: "cat:padel", titre: "Padel", salleId: null });
  const s = raw.prepare("SELECT titre, fin FROM seances WHERE id = ?").get(id) as { titre: string; fin: number | null };
  assert.deepEqual({ ...s }, { titre: "Padel", fin: null });
  const id2 = await demarrerSeanceSport(db, { exerciceId: "cat:padel", titre: "Padel", salleId: null, dureeS: 3600 });
  const s2 = raw.prepare("SELECT debut, fin FROM seances WHERE id = ?").get(id2) as { debut: number; fin: number };
  assert.equal(s2.fin - s2.debut, 3_600_000);
  const se = raw.prepare("SELECT duree_s, faite FROM series WHERE seance_id = ?").get(id2) as { duree_s: number; faite: number };
  assert.deepEqual({ ...se }, { duree_s: 3600, faite: 1 });
});

test("témoin lanceur_sport : numéro déjà passé sur une base d'une autre branche, la table est quand même créée", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 25);
  raw.exec("PRAGMA user_version = 28");
  await migrer(db);
  assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'lanceur_sport'").get());
  await chargerCatalogue(db, catalogue());
  assert.deepEqual((await lireLanceur(db)).map((s) => s.id), ["cat:musculation", "cat:course", "cat:bicycling"]);
});

test("DISPOSITION_SPORTS : la grille adaptative au format du glisser commun (GlisserAccueil)", async () => {
  const { DISPOSITION_SPORTS } = await import("../src/ecrans/lanceur-sports.ts");
  const b = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const m = DISPOSITION_SPORTS.disposer(b, {}, 400, 8);
  assert.deepEqual(m.get("d"), { x: 0, y: 120, l: 196, h: 112 });
  assert.deepEqual(DISPOSITION_SPORTS.deplacer(b, "a", 4).map((x) => x.id), ["b", "c", "d", "e", "a"]);
  assert.equal(DISPOSITION_SPORTS.rangVise(b, "a", 300, 176, {}, 400, 8), 4);
});

test("lieu où je suis (29/10) : à moins de 300 m, mes lieux d'abord, puis ceux d'« Autour de moi » déjà visités ; le dernier de ce sport", () => {
  // place de la République ; 0,001° de latitude ≈ 111 m
  const ici = { lat: 48.8674, lon: 5.8173 };
  const pres = (dLat: number) => ({ lat: ici.lat + dLat, lon: ici.lon });
  const osm = { id: "basic-fit", ...pres(0.001), perso: false, sportLe: 300, vuLe: 300 };
  const maison = { id: "maison", ...pres(0.0015), perso: true, sportLe: null, vuLe: 100 };
  const garage = { id: "garage", ...pres(0.0005), perso: true, sportLe: 200, vuLe: 200 };
  const loin = { id: "loin", ...pres(0.01), perso: true, sportLe: 999, vuLe: 999 };
  const jamaisVue = { id: "osm-jamais", ...pres(0), perso: false, sportLe: null, vuLe: null };
  assert.equal(lieuIci([osm, maison, garage, loin, jamaisVue], ici), "garage", "perso d'abord, le dernier de ce sport");
  assert.equal(lieuIci([osm, maison, loin], ici), "maison", "un lieu créé passe devant une salle OSM");
  assert.equal(lieuIci([osm, loin, jamaisVue], ici), "basic-fit", "puis la salle OSM déjà visitée");
  assert.equal(lieuIci([loin, jamaisVue], ici), null, "à plus de 300 m, ou jamais visitée : rien (règle sans GPS)");
  // à égalité, le plus proche
  const a = { id: "a", ...pres(0.002), perso: true, sportLe: null, vuLe: null };
  const b = { id: "b", ...pres(0.0002), perso: true, sportLe: null, vuLe: null };
  assert.equal(lieuIci([a, b], ici), "b");
  assert.ok(RAYON_ICI_M === 300);
});

test("lieu probable en base : position enregistrée à la création sur place, lieu proposé selon le GPS et le sport", async () => {
  const { raw, db } = await baseDeTest(true);
  const ici = { lat: 48.8674, lon: 5.8173 };
  const salle = await creerLieu(db, { nom: "Salle du quartier" });
  const parc = await creerLieu(db, { nom: "Parc", type: "exterieur", position: { lat: ici.lat + 0.001, lon: ici.lon } });
  assert.deepEqual({ ...((await db.getFirstAsync("SELECT lat, lon FROM salle WHERE id = ?", [parc])) ?? {}) }, { lat: ici.lat + 0.001, lon: ici.lon });
  assert.deepEqual({ ...((await db.getFirstAsync("SELECT lat, lon FROM salle WHERE id = ?", [salle])) ?? {}) }, { lat: null, lon: null });
  // course : sans GPS, aucun lieu de course ; au parc, le parc
  assert.equal(await lireLieuProbable(db, "cat:course"), null);
  assert.equal(await lireLieuProbable(db, "cat:course", ici), parc);
  // musculation loin de tout : la salle par défaut (la première créée)
  assert.equal(await lireLieuProbable(db, "cat:musculation", { lat: 45, lon: 5 }), salle);
  // une course faite ailleurs puis revenue ici : le lieu proche gagne sur le dernier lieu de ce sport
  const ailleurs = await creerLieu(db, { nom: "Quais" });
  await demarrerSeanceSport(db, { exerciceId: "cat:course", titre: "Course", salleId: ailleurs, dureeS: 1800 });
  assert.equal(await lireLieuProbable(db, "cat:course"), ailleurs);
  assert.equal(await lireLieuProbable(db, "cat:course", ici), parc);
  raw.close();
});
