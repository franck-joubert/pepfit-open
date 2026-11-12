// Padel du 02/11 (retours) : la séance « Padel 1 h 30 » lancée depuis une routine ne recevait rien de l'activité Whoop du même
// créneau ; pas de picto du padel en tête. Règles : l'activité Whoop du même créneau est rattachée à la séance pepfit ; les pas
// viennent de Santé Connect, lus sur la plage de l'activité ; image du sport.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { lireSportSeance } from "../src/db/depots/activites.ts";
import { sportDeType } from "../src/db/programmes.ts";
import { memeCreneau } from "../src/ecrans/planification.ts";
import { vuePassee } from "../src/ecrans/seance-passee-vue.ts";
import { rattacherWhoop, sourcesSeance, type DepsSources } from "../src/ecrans/seance-sources.ts";
import { sportDeLaSeance, sportDuNom, type SportCatalogue } from "../src/ecrans/sport-seance.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";

const J = (h: number, m = 0) => jour(2026, 11, 2, h, m);
/** Le padel de 14 h : lancé à la main depuis la routine « Padel 1 h 30 » (14:02 → 15:32) ; Whoop l'a vu de 14:00 à 15:25. */
const SEANCE = { debut: J(14, 2), fin: J(15, 32) };
const WHOOP = { debut: J(14, 0), fin: J(15, 25) };
const APRES = J(18);
const PADEL = 249;

const whoop = (id: string, debut: number, fin: number, sportId = PADEL, sport = "Padel") =>
  ({ id, debut, fin, sportId, sport, strain: 14, kj: 4000, fcMoy: 128, fcMax: 162, distanceM: null, zones: null }) as const;

/** Séance pepfit « Padel 1 h 30 » issue d'une routine de type « autre », sans exercice fait ni coché. */
async function seancePadel(db: Awaited<ReturnType<typeof baseDeTest>>["db"], id = "p1", debut = SEANCE.debut, fin = SEANCE.fin) {
  await db.runAsync("INSERT OR IGNORE INTO routines (id, nom, ordre, type, cree_le, maj_le) VALUES ('r-padel', 'Padel 1 h 30', 0, 'autre', 1, 1)", []);
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, routine_id, maj_le) VALUES (?, 'Padel 1 h 30', ?, ?, 'r-padel', 1)", [id, debut, fin]);
  return { id, debut, fin };
}

/** Santé Connect : 5 753 pas sur la plage de l'activité Whoop, 223 sur celle de la séance (téléphone posé pendant le jeu). */
const plages: [number, number][] = [];
const sc: DepsSources["sante"] = { autorisees: async () => ["pas"], pasEntre: async (d, f) => (plages.push([d, f]), d === WHOOP.debut ? 5753 : 223), fcEntre: async () => null };

test("cause : l'activité Whoop avait sa propre séance, la séance de la routine (sans exercice, famille « autre ») n'en recevait rien", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [whoop("w1", WHOOP.debut, WHOOP.fin)]);
  const s = await seancePadel(db);
  const propre = (await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'w1'", []))!.seance_id;
  assert.notEqual(propre, s.id, "Whoop a rangé l'activité dans une séance à son nom");
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances", []))!.n, 2);

  // la page de la séance la rattache (même sport, créneau recoupé) : la séance « détectée » s'y fond, une seule reste ; les pas
  // sont lus sur la plage de l'activité
  plages.length = 0;
  const r = await sourcesSeance(db, s, { sante: sc, maintenant: APRES });
  assert.deepEqual([r.pas, plages], [{ pas: 5753, source: "sante" }, [[WHOOP.debut, WHOOP.fin]]]);
  assert.equal((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'w1'", []))!.seance_id, s.id);
  assert.deepEqual((await db.getAllAsync<{ id: string }>("SELECT id FROM seances", [])).map((x) => x.id), [s.id]);
});

test("sans activité Whoop : Santé Connect sur la plage de la séance ; Santé Connect non autorisé, séance Whoop : le geste « sante »", async () => {
  {
    const { db } = await baseDeTest(true);
    const s = await seancePadel(db);
    const r = await sourcesSeance(db, s, { sante: sc, maintenant: APRES });
    assert.deepEqual([r.pas, r.manque], [{ pas: 223, source: "sante" }, null]);
  }
  {
    const { db } = await baseDeTest(true);
    await enregistrerSeances(db, [whoop("w1", WHOOP.debut, WHOOP.fin)]);
    const s = await seancePadel(db);
    const rien: DepsSources["sante"] = { autorisees: async () => [], pasEntre: async () => null, fcEntre: async () => null };
    const r = await sourcesSeance(db, s, { sante: rien, maintenant: APRES });
    assert.deepEqual([r.pas, r.manque], [null, { pas: true, fc: true, geste: "sante" }]);
  }
});

test("rattachement : même sport et créneau recoupé ; deux padels le même jour ; rien de volé ; autre sport refusé", async () => {
  const { db } = await baseDeTest(true);
  // deux padels le même jour (10:55 et 14:02) : chaque séance prend le sien
  await enregistrerSeances(db, [whoop("matin", J(10, 55), J(12, 20)), whoop("aprem", WHOOP.debut, WHOOP.fin)]);
  const s = await seancePadel(db);
  const a = await rattacherWhoop(db, s, "cat:padel");
  assert.equal(a?.id, "aprem");
  assert.equal((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'aprem'", []))!.seance_id, s.id);
  assert.notEqual((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'matin'", []))!.seance_id, s.id);
  // une autre séance pepfit au même créneau ne vole pas l'activité déjà prise
  const autre = await seancePadel(db, "p2", J(14, 5), J(15, 20));
  assert.equal(await rattacherWhoop(db, autre, "cat:padel"), null);

  // une activité d'un autre sport (course) ne se rattache pas à un padel
  const { db: db2 } = await baseDeTest(true);
  await enregistrerSeances(db2, [whoop("c1", WHOOP.debut, WHOOP.fin, 0, "Running")]);
  const s2 = await seancePadel(db2);
  assert.equal(await rattacherWhoop(db2, s2, "cat:padel"), null);
  // sans sport connu pour la séance : rien
  assert.equal(await rattacherWhoop(db2, s2, null), null);
});

test("règle de `faite` réutilisée : même sport, début à 90 min près ou chevauchement, même jour", () => {
  const s = { debut: SEANCE.debut, fin: SEANCE.fin, sport: "cat:padel" };
  assert.equal(memeCreneau({ ...WHOOP, sport: "cat:padel" }, s), true);
  assert.equal(memeCreneau({ ...WHOOP, sport: undefined }, s), true, "une activité sans sport prend celui de la séance");
  assert.equal(memeCreneau({ debut: J(10, 55), fin: J(12, 20), sport: "cat:padel" }, s), false);
  assert.equal(memeCreneau({ ...WHOOP, sport: "cat:course" }, s), false);
});

// ---- Image en tête --------------------------------------------------------------------------------------------------------

const catalogue: SportCatalogue[] = [
  { id: "cat:padel", slug: "padel", nom: "Padel", nom_en: "Paddle tennis", categorie: "sport" },
  { id: "cat:course", slug: "course", nom: "Course à pied", nom_en: "Running", categorie: "cardio" },
  { id: "cat:bicycling", slug: "bicycling", nom: "Vélo", nom_en: "Cycling", categorie: "cardio" },
];

test("sport d'un nom : mots entiers, accents et casse ignorés, le plus long nom l'emporte, rien sous 3 lettres", () => {
  assert.equal(sportDuNom("Padel 1 h 30", catalogue)?.id, "cat:padel");
  assert.equal(sportDuNom("COURSE A PIED du soir", catalogue)?.id, "cat:course");
  assert.equal(sportDuNom("Running 10 km", catalogue)?.id, "cat:course");
  assert.equal(sportDuNom("Padelistes", catalogue), null, "pas de mot coupé");
  assert.equal(sportDuNom("Pull A", catalogue), null);
  assert.equal(sportDuNom(null, catalogue), null);
  assert.equal(sportDuNom("Course à pied et vélo", catalogue)?.id, "cat:course", "le plus long nom l'emporte");
});

test("sport d'une séance : marque, puis exercice, puis type de la routine, puis nom", () => {
  const padel = { id: "cat:padel", slug: "padel", nom: "Padel", categorie: "sport" };
  const course = { id: "cat:course", slug: "course", nom: "Course à pied", categorie: "cardio" };
  const vide = { marque: null, exercice: null, typeRoutine: null, noms: [] as string[] };
  assert.equal(sportDeLaSeance({ ...vide, marque: padel, exercice: course, typeRoutine: "velo" }, catalogue)?.id, "cat:padel");
  assert.equal(sportDeLaSeance({ ...vide, exercice: course, typeRoutine: "velo" }, catalogue)?.id, "cat:course");
  assert.equal(sportDeLaSeance({ ...vide, typeRoutine: "velo", noms: ["Padel"] }, catalogue)?.id, "cat:bicycling");
  assert.equal(sportDeLaSeance({ ...vide, typeRoutine: "autre", noms: [null, "Padel 1 h 30"] }, catalogue)?.id, "cat:padel");
  assert.equal(sportDeLaSeance({ ...vide, typeRoutine: "muscu", noms: ["Pull A"] }, catalogue), null);
  assert.equal(sportDeType("course"), "cat:course");
  assert.equal(sportDeType("muscu"), null);
});

test("séance créée depuis une routine « Padel 1 h 30 » sans exercice fait : le picto du padel, comme une activité détectée", async () => {
  const { db } = await baseDeTest(true);
  const s = await seancePadel(db);
  assert.equal((await lireSportSeance(db, s.id))?.slug, "padel");
  // type de routine : la course
  await db.runAsync("INSERT INTO routines (id, nom, ordre, type, cree_le, maj_le) VALUES ('r-c', 'Sortie du matin', 1, 'course', 1, 1)", []);
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, routine_id, maj_le) VALUES ('p-c', 'Sortie du matin', ?, ?, 'r-c', 1)", [J(8), J(9)]);
  assert.equal((await lireSportSeance(db, "p-c"))?.slug, "course");
  // musculation : pas de sport
  await db.runAsync("INSERT INTO routines (id, nom, ordre, type, cree_le, maj_le) VALUES ('r-m', 'Pull A', 2, 'muscu', 1, 1)", []);
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, routine_id, maj_le) VALUES ('p-m', 'Pull A', ?, ?, 'r-m', 1)", [J(18), J(19)]);
  assert.equal(await lireSportSeance(db, "p-m"), null);

  // la vue : picto sans exercice fait dès que la séance a un sport ; une muscu vide reste sans visuel ; la photo l'emporte
  assert.equal(vuePassee([], "Padel 1 h 30", false, true).heros, "picto");
  assert.equal(vuePassee([], "Pull A", false, false).heros, null);
  // la photo est en tête (couverture), le picto du sport reste, en petit
  const avecPhoto = vuePassee([], "Padel 1 h 30", true, true);
  assert.deepEqual([avecPhoto.couverture, avecPhoto.heros, avecPhoto.pictoPetit], ["photo", "picto", true]);
});
