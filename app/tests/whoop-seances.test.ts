// Séances Whoop : chaque sport de la doc v2 a son activité pepfit (ou est ignoré exprès), nom propre et picto, marches de tous
// les jours jamais des séances, rattachement à la séance pepfit ou Hevy de même famille, retraitement des séances déjà importées.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { baseDeTest, catalogue, jour } from "./aide.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { enregistrerSeances, retraiterSeancesWhoop } from "../src/whoop/depot.ts";
import { convertirSeance } from "../src/whoop/convertir.ts";
import { resumesSeancesWhoop } from "../src/whoop/lecture.ts";
import { chargeWhoop, famillesCompatibles, idSport, sortSeance, SPORTS_DOC, SPORTS_IGNORES } from "../src/whoop/sports.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";

const MIN = 60_000;
const debut = jour(2026, 10, 22, 19, 0);

const w = (id: string, sportId: number | null, d: number, f: number, autre: Partial<SeanceConvertie> = {}): SeanceConvertie => ({
  id, debut: d, fin: f, sportId, sport: "Whoop", strain: 12, kj: 2500, fcMoy: 130, fcMax: 170, distanceM: null, zones: [0, 5, 20, 30, 10, 0], ...autre,
});
const compter = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"], sql: string, p: (string | number)[] = []) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`, p))!.n;

test("couverture : chaque sport de la doc v2 a une activité du catalogue, ou est ignoré exprès, jamais les deux", () => {
  const cat = catalogue();
  const ranges = new Map<number, string>();
  for (const e of cat.exercices) for (const id of e.whoop_ids ?? []) ranges.set(id, e.slug!);
  const doc = Object.keys(SPORTS_DOC).map(Number);
  for (const id of doc) assert.ok(ranges.has(id) !== SPORTS_IGNORES.has(id), `${id} ${SPORTS_DOC[id]}`);
  // rien dans le catalogue ni dans les ignorés qui ne soit pas dans la doc
  for (const id of [...ranges.keys(), ...SPORTS_IGNORES]) assert.ok(id in SPORTS_DOC, String(id));
  assert.equal(ranges.size, 100);
  // même liste que l'outil qui a rangé le catalogue
  const csv = readFileSync(new URL("./fixtures/whoop-activites.csv", import.meta.url), "utf8").trim().split("\n").slice(1);
  const ids = csv.flatMap((l) => l.split(",")[3]!.split("|").map(Number));
  assert.deepEqual([...ids, ...SPORTS_IGNORES].sort((a, b) => a - b), doc.sort((a, b) => a - b));
  assert.equal(ranges.get(45), "musculation");
  assert.equal(ranges.get(249), "padel");
});

test("sport_name de l'API v2 quand sport_id manque", () => {
  assert.equal(idSport(undefined, "weightlifting_msk"), 45);
  assert.equal(idSport(null, "paddle_tennis"), 106);
  assert.equal(idSport(null, "hiking_rucking"), 52);
  assert.equal(idSport(null, "track_&_field"), 35);
  assert.equal(idSport(null, "inconnu"), null);
  assert.equal(idSport(63, "running"), 63);
  const c = convertirSeance({ id: "x", start: new Date(debut).toISOString(), end: new Date(debut + 3_600_000).toISOString(), sport_name: "weightlifting_msk", score_state: "SCORED", score: { strain: 9, average_heart_rate: 110, max_heart_rate: 150, kilojoule: 900 } });
  assert.equal(c!.sportId, 45);
});

test("séance Whoop seule : nom de l'activité, activité posée (picto, durée, distance)", async () => {
  const { db } = await baseDeTest(true);
  const b = await enregistrerSeances(db, [w("m", 45, debut, debut + 60 * MIN, { sport: "Weightlifting msk" }), w("v", 1, debut + 3 * 3_600_000, debut + 4 * 3_600_000, { distanceM: 25_000 })]);
  assert.deepEqual(b, { enrichies: 0, creees: 2, ignorees: 0 });
  const l = await db.getAllAsync<{ titre: string; slug: string; duree_s: number; distance_m: number | null; faite: number }>(
    `SELECT s.titre, e.slug, x.duree_s, x.distance_m, x.faite FROM seances s JOIN series x ON x.seance_id = s.id JOIN exercices e ON e.id = x.exercice_id ORDER BY s.debut`,
    [],
  );
  assert.deepEqual(l.map((x) => ({ ...x })), [
    { titre: "Musculation", slug: "musculation", duree_s: 3600, distance_m: null, faite: 1 },
    { titre: "Vélo", slug: "bicycling", duree_s: 3600, distance_m: 25_000, faite: 1 },
  ]);
  assert.equal(await compter(db, "seance_exercices"), 2);
});

test("marche de tous les jours (sous 100 points d'Effort pepfit, jamais le score de Whoop) : jamais une séance ; randonnée et marche d'effort : séances", async () => {
  assert.equal(sortSeance(63, 40), "marche-auto");
  assert.equal(sortSeance(266, null), "marche-auto");
  assert.equal(sortSeance(63, 180), "seance");
  assert.equal(sortSeance(52, 30), "seance");
  assert.equal(sortSeance(269, 50), "ignoree"); // Cooking
  assert.equal(sortSeance(-1, 150), "ignoree");
  // la charge d'une activité Whoop : ses minutes par zone (la zone 0 ne compte pas), sinon sa durée au barème de la marche
  assert.equal(chargeWhoop({ debut: 0, fin: 25 * MIN, zones: [5, 20, 0, 0, 0, 0] }), 20);
  assert.equal(chargeWhoop({ debut: 0, fin: 60 * MIN, zones: [0, 0, 10, 30, 20, 0] }), 190);
  assert.equal(chargeWhoop({ debut: 0, fin: 30 * MIN, zones: null }), 30);
  const { db } = await baseDeTest(true);
  const b = await enregistrerSeances(db, [
    w("auto", 63, debut, debut + 25 * MIN, { strain: 12, zones: [5, 20, 0, 0, 0, 0] }),
    w("chien", 266, debut + 2 * 3_600_000, debut + 2.5 * 3_600_000, { strain: 3, zones: null }),
    w("rando", 52, jour(2026, 10, 23, 9), jour(2026, 10, 23, 13), { strain: 6, zones: [0, 30, 0, 0, 0, 0] }),
    w("vive", 63, jour(2026, 10, 24, 9), jour(2026, 10, 24, 10), { strain: 2, zones: [0, 0, 10, 30, 20, 0] }),
    w("cuisine", 269, jour(2026, 10, 25, 12), jour(2026, 10, 25, 13)),
  ]);
  assert.deepEqual(b, { enrichies: 0, creees: 2, ignorees: 3 });
  assert.deepEqual((await db.getAllAsync<{ titre: string }>("SELECT titre FROM seances ORDER BY debut", [])).map((x) => x.titre), ["Randonnée", "Marche"]);
  // gardées pour Whoop, sans séance
  assert.equal(await compter(db, "whoop_seance WHERE seance_id IS NULL"), 3);
  // resynchro : toujours rien de créé
  assert.deepEqual(await enregistrerSeances(db, [w("auto", 63, debut, debut + 25 * MIN, { strain: 12, zones: [5, 20, 0, 0, 0, 0] })]), { enrichies: 0, creees: 0, ignorees: 0 });
  assert.equal(await compter(db, "seances"), 2);
});

async function seancePepfit(db: Awaited<ReturnType<typeof baseDeTest>>["db"], id: string, d: number, f: number, exercice: string | null) {
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES (?,?,?,?,1)", [id, "Ma séance", d, f]);
  if (exercice) await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,0)", [id, exercice]);
}

test("fusion : même famille rattachée ; autre famille, séance à part ; séance sans exercice : rattachée", async () => {
  assert.ok(famillesCompatibles("padel", "padel"));
  assert.ok(famillesCompatibles("autre", "muscu"));
  assert.ok(!famillesCompatibles("course", "muscu"));
  assert.ok(!famillesCompatibles("marche", "padel"));
  const { db } = await baseDeTest(true);
  const padel = (await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE slug = 'padel'", []))!.id;
  const squat = (await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE slug = 'squat' OR slug LIKE '%squat%' AND categorie IN ('Force', 'Haltérophilie') LIMIT 1", []))!.id;
  await seancePepfit(db, "p", debut, debut + 90 * MIN, padel);
  await seancePepfit(db, "m", jour(2026, 10, 23, 18), jour(2026, 10, 23, 19), squat);
  await seancePepfit(db, "vide", jour(2026, 10, 24, 18), jour(2026, 10, 24, 19), null);
  const b = await enregistrerSeances(db, [
    w("wp", 249, debut + 3 * MIN, debut + 88 * MIN),
    w("wc", 0, jour(2026, 10, 23, 18, 5), jour(2026, 10, 23, 18, 50)),
    w("wv", 34, jour(2026, 10, 24, 18), jour(2026, 10, 24, 19)),
    // activité non nommée : enrichit, ne crée jamais
    w("wa", -1, debut + 5 * MIN, debut + 20 * MIN, { strain: 2 }),
    // la cuisine n'enrichit rien
    w("wk", 269, jour(2026, 10, 23, 18), jour(2026, 10, 23, 19)),
  ]);
  assert.deepEqual(b, { enrichies: 3, creees: 1, ignorees: 1 });
  const lien = new Map((await db.getAllAsync<{ id: string; seance_id: string | null }>("SELECT id, seance_id FROM whoop_seance", [])).map((x) => [x.id, x.seance_id]));
  assert.equal(lien.get("wp"), "p");
  assert.equal(lien.get("wv"), "vide");
  assert.equal(lien.get("wa"), "p");
  assert.equal(lien.get("wk"), null);
  assert.notEqual(lien.get("wc"), "m");
  // la séance de padel montre la séance Whoop la plus longue (le padel, pas l'activité de 15 min)
  assert.deepEqual((await resumesSeancesWhoop(db)).get("p"), { fcMoy: 130, fcMax: 170, kj: 2500, sport: "Whoop" });
});

const CSV_HEVY =
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\n' +
  '"Padel","22 Oct 2026, 19:00","22 Oct 2026, 20:30","","Padel","","","0","normal","","","","5400",""';

test("Hevy importé après Whoop : la séance Whoop se fond dans la séance Hevy, note gardée, aucun doublon", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [w("wp", 249, debut + 2 * MIN, debut + 87 * MIN)]);
  await db.runAsync("UPDATE seances SET note = 'super match' WHERE source_ref = 'whoop:wp'", []);
  assert.equal(await compter(db, "seances"), 1);
  await importerHevyTexte(db, CSV_HEVY);
  const l = await db.getAllAsync<{ id: string; source_ref: string; note: string | null }>("SELECT id, source_ref, note FROM seances", []);
  assert.equal(l.length, 1);
  assert.match(l[0]!.source_ref, /^hevy:/);
  assert.equal(l[0]!.note, "super match");
  assert.equal((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'wp'", []))!.seance_id, l[0]!.id);
  // stats et semainier ne voient qu'une séance de padel
  assert.equal(await compter(db, "seance_exercices"), 1);
});

test("retraitement des séances déjà importées : nom brut → activité, marches retirées sauf touchées, idempotent", async () => {
  const { db } = await baseDeTest(true);
  const ancienne = async (id: string, sportId: number | null, sport: string, d: number, f: number, strain: number, note: string | null = null) => {
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, note, source_ref, maj_le) VALUES (?,?,?,?,?,?,1)", [`s-${id}`, sport, d, f, note, `whoop:${id}`]);
    await db.runAsync("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, strain, kj, seance_id, maj_le) VALUES (?,?,?,?,?,?,?,?,1)", [id, d, f, sportId, sport, strain, 900, `s-${id}`]);
  };
  await ancienne("muscu", null, "Weightlifting msk", debut, debut + 60 * MIN, 9);
  await ancienne("renommee", 45, "Weightlifting msk", jour(2026, 10, 21, 18), jour(2026, 10, 21, 19), 9);
  await db.runAsync("UPDATE seances SET titre = 'Jambes' WHERE id = 's-renommee'", []);
  await ancienne("marche", 63, "Walking", jour(2026, 10, 23, 12), jour(2026, 10, 23, 12, 30), 3.1);
  await ancienne("marche-notee", 63, "Walking", jour(2026, 10, 24, 12), jour(2026, 10, 24, 12, 30), 3.1, "avec Camille");
  // une séance pepfit de padel saisie après coup sur un padel Whoop déjà importé seul
  await ancienne("padel", 249, "Padel", jour(2026, 10, 25, 19), jour(2026, 10, 25, 20, 30), 14);
  const padel = (await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE slug = 'padel'", []))!.id;
  await seancePepfit(db, "pp", jour(2026, 10, 25, 19, 4), jour(2026, 10, 25, 20, 28), padel);

  assert.deepEqual(await retraiterSeancesWhoop(db), { rattachees: 1, retirees: 1, completees: 2 });
  const s = new Map((await db.getAllAsync<{ id: string; titre: string }>("SELECT id, titre FROM seances", [])).map((x) => [x.id, x.titre]));
  assert.equal(s.get("s-muscu"), "Musculation");
  assert.equal(s.get("s-renommee"), "Jambes"); // titre choisi par l'utilisateur : gardé
  assert.ok(!s.has("s-marche"));
  assert.ok(s.has("s-marche-notee"));
  assert.ok(!s.has("s-padel"));
  assert.equal(s.size, 4);
  assert.equal((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'padel'", []))!.seance_id, "pp");
  assert.equal((await db.getFirstAsync<{ sport_id: number }>("SELECT sport_id FROM whoop_seance WHERE id = 'muscu'", []))!.sport_id, 45);
  // la séance Whoop de la marche reste (données Whoop), sans séance
  assert.equal(await compter(db, "whoop_seance"), 5);
  assert.equal(await compter(db, "seance_exercices WHERE seance_id = 's-muscu'"), 1);
  assert.deepEqual(await retraiterSeancesWhoop(db), { rattachees: 0, retirees: 0, completees: 0 });
});

test("fiche d'une séance Whoop seule : bloc d'effort Whoop (FC, zones, effort, kcal), pas de la séance", async () => {
  const { vueEffortWhoop } = await import("../src/ecrans/effort-vue.ts");
  const v = vueEffortWhoop({ dureeS: 3600, distanceM: null, fcMoy: 129.6, fcMax: 171, zones: [0, 5, 20, 30, 10, 0] }, 185);
  assert.deepEqual([v.fcMoy, v.fcMax, v.zonesS, v.trace.length, v.serieFc.length, v.distanceM], [130, 171, [0, 300, 1200, 1800, 600, 0], 0, 0, 0]);
  assert.equal(vueEffortWhoop({ dureeS: 60, distanceM: null, fcMoy: null, fcMax: null, zones: null }, 185).zonesS, null);
  // zones personnelles : les minutes restent celles de Whoop, les bornes affichées et la source sont les nôtres (Karvonen)
  const { zonesPersonnelles } = await import("../src/ecrans/zones-fc.ts");
  const z = zonesPersonnelles({ bpm: 185, source: "estimee", date: null, vue: null }, { bpm: 55, source: "whoop", n: 12 });
  const vz = vueEffortWhoop({ dureeS: 3600, distanceM: null, fcMoy: 129.6, fcMax: 171, zones: [0, 5, 20, 30, 10, 0] }, z);
  assert.deepEqual([vz.bornes, vz.fcMaxProfil, vz.zonesFc, vz.zonesS], [z.bornes, 185, z, v.zonesS]);
  assert.equal(v.zonesFc, null);

  const { chargerEffort } = await import("../src/ecrans/effort-donnees.ts");
  const { lireSeance } = await import("../src/db/depots/seances.ts");
  const { sourcesSeance } = await import("../src/ecrans/seance-sources.ts");
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [w("m", 45, debut, debut + 60 * MIN, { kj: 1255.2, strain: 9.4 })]);
  const id = (await db.getFirstAsync<{ id: string }>("SELECT id FROM seances", []))!.id;
  const e = (await chargerEffort(db, (await lireSeance(db, id))!))!;
  // les kcal se calculent chez nous (kcal-seance.ts, Keytel à la FC moyenne de Whoop, 130, coefficient de la muscu) : jamais les 300 kcal de Whoop
  const { kcalSeance } = await import("../src/ecrans/kcal-seance.ts");
  const { bmrA } = await import("../src/ecrans/sante-donnees.ts");
  const attendu = Math.round(kcalSeance({ minutes: 60, fcMoy: 130, sportId: "cat:musculation" }, { sexe: null, kg: null, age: null }, await bmrA(db, debut + 60 * MIN)).brutes);
  assert.notEqual(attendu, 300);
  assert.deepEqual([e.source, e.calories, e.vue.fcMoy, e.vue.zonesS?.[3]], ["Whoop", attendu, 130, 1800]);
  assert.equal("effort" in e, false, "le score de Whoop n'est jamais repris");
  // pas : plus jamais de prorata des pas du jour (« ~ 600 ») ; sans source de la séance, rien, et le geste pour l'avoir
  await db.runAsync("INSERT INTO whoop_jour (jour, pas, maj_le) VALUES (?, 9600, 1)", [new Date(2026, 9, 22).getTime()]);
  const rien = { autorisees: async () => [], pasEntre: async () => null, fcEntre: async () => null };
  const src = await sourcesSeance(db, { id, debut, fin: debut + 60 * MIN }, { sante: rien, maintenant: debut + 5 * 3_600_000 });
  assert.deepEqual([src.pas, src.fc, src.manque], [null, null, { pas: true, fc: true, geste: "sante" }]);
});
