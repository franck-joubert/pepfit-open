// Pas et FC d'une séance passée (retour du 30/10, padel du 28/10 : « ~ 1 192 » pas dans pepfit ; pas de courbe de FC).
// Cause, priorité des sources (Santé Connect sur la plage de la séance), geste qui manque, courbe d'une séance Whoop,
// découpage par exercice d'une muscu cochée, bilan d'énergie.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { lireSeance } from "../src/db/depots/seances.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { chargerEffort, chargerFcMuscu } from "../src/ecrans/effort-donnees.ts";
import { repartirPas } from "../src/ecrans/pas-seances.ts";
import { sourcesSeance, type DepsSources } from "../src/ecrans/seance-sources.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";

const MIN = 60_000;
const H = 60 * MIN;
const DEBUT = jour(2026, 10, 28, 19, 5);
const FIN = DEBUT + 119 * MIN;
const APRES = FIN + 3 * H;

/** FC inventée toutes les 6 s : des pics de padel entre 110 et 160. */
const serieFc = (debut: number, fin: number) =>
  Array.from({ length: Math.floor((fin - debut) / 6000) }, (_, i) => ({ t: debut + i * 6000, bpm: Math.round(135 + 25 * Math.sin(i / 20)) }));

test("cause : « ~ 1 192 » était 9 619 pas du jour × 119 min ÷ 960 min éveillées ; plus de prorata, même dans le bilan (08/11)", () => {
  assert.deepEqual(repartirPas(9619, [{ minutes: 119, mesures: null }]), [null]);
  // les vrais pas de la séance passent
  assert.deepEqual(repartirPas(9619, [{ minutes: 119, mesures: 6396 }]), [{ pas: 6396 }]);
});

/** Base avec la séance Whoop du padel (créée pour Whoop, rattachée à une séance pepfit). */
async function padel() {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [
    { id: "w-padel", debut: DEBUT, fin: FIN, sportId: 249, sport: "Padel", strain: 16, kj: 5030, fcMoy: 131, fcMax: 164, distanceM: null, zones: [0.2, 25, 62, 29, 3, 0] },
  ]);
  const id = (await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'w-padel'", []))!.seance_id;
  await db.runAsync("INSERT INTO whoop_jour (jour, pas, maj_le) VALUES (?, 9619, 1)", [jour(2026, 10, 28, 0, 0)]);
  return { db, id };
}

const santeVide: DepsSources["sante"] = { autorisees: async () => [], pasEntre: async () => null, fcEntre: async () => null };

test("priorité des sources : Santé Connect sur la plage, sinon rien et le geste", async () => {
  // Santé Connect autorisé (cas du Fold le 30/10) : ses pas et sa FC sur la plage de la séance
  {
    const { db, id } = await padel();
    const plages: [number, number][] = [];
    const sc: DepsSources["sante"] = {
      autorisees: async () => ["pas", "fc-montre"],
      pasEntre: async (d, f) => (plages.push([d, f]), 6120),
      fcEntre: async () => serieFc(DEBUT, FIN).reverse(),
    };
    const r = await sourcesSeance(db, { id, debut: DEBUT, fin: FIN }, { sante: sc, maintenant: APRES });
    assert.deepEqual([r.pas, r.fc?.source, r.manque, plages], [{ pas: 6120, source: "sante" }, "sante", null, [[DEBUT, FIN]]]);
    assert.ok(r.fc!.echantillons[0]!.t < r.fc!.echantillons[1]!.t);
  }
  // Rien (Santé Connect non autorisé) : ni pas ni courbe, jamais le prorata ; Whoop connecté ou non, le geste propose Santé
  // Connect (la montre y écrit les deux), jamais de reconnecter Whoop
  for (const connecte of [true, false]) {
    const { db, id } = await padel();
    if (connecte) await ecrireReglage(db, REGLAGE.connecte, "1");
    const r = await sourcesSeance(db, { id, debut: DEBUT, fin: FIN }, { sante: santeVide, maintenant: APRES });
    assert.deepEqual([r.pas, r.fc, r.manque], [null, null, { pas: true, fc: true, geste: "sante" }]);
  }
  // Séance pepfit sans Whoop : Santé Connect seul, et aucun geste proposé
  {
    const { db } = await baseDeTest(true);
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('p', 'Course', ?, ?, 1)", [DEBUT, FIN]);
    const r = await sourcesSeance(db, { id: "p", debut: DEBUT, fin: FIN }, { sante: santeVide, maintenant: APRES });
    assert.deepEqual([r.pas, r.fc, r.manque], [null, null, null]);
  }
});

test("séance qui a sa propre FC (capteur en direct) : elle la garde, rien d'autre n'est lu pour la courbe", async () => {
  const { db, id } = await padel();
  await ecrireReglage(db, REGLAGE.connecte, "1");
  // sans trou (une mesure toutes les 10 s jusqu'à la fin) : rien à combler (FC coupée : tests/fc-trous.test.ts)
  for (let t = DEBUT; t <= FIN; t += 10_000) await db.runAsync("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES (?, ?, ?, 120)", [id, t, t - DEBUT]);
  let lue = false;
  const sc: DepsSources["sante"] = { autorisees: async () => ["fc-montre"], pasEntre: async () => null, fcEntre: async () => ((lue = true), serieFc(DEBUT, FIN)) };
  const r = await sourcesSeance(db, { id, debut: DEBUT, fin: FIN }, { sante: sc, maintenant: APRES });
  assert.deepEqual([r.fc, lue, r.manque], [null, false, { pas: true, fc: false, geste: "sante" }]);
});

test("courbe d'une séance Whoop : les échantillons dans le bloc d'effort (zones de Whoop gardées), source dite", async () => {
  const { db, id } = await padel();
  const s = (await lireSeance(db, id))!;
  const sans = (await chargerEffort(db, s))!;
  assert.deepEqual([sans.vue.serieFc.length, sans.vue.zonesS?.[2], sans.source], [0, 62 * 60, "Whoop"]);
  // 1 190 points de 6 s : réduits pour le dessin, pics gardés, en secondes depuis le début ; un point hors séance est écarté
  const fc = { echantillons: [{ t: DEBUT - 5 * MIN, bpm: 80 }, ...serieFc(DEBUT, FIN)], source: "sante" as const };
  const avec = (await chargerEffort(db, s, fc))!;
  assert.ok(avec.vue.serieFc.length >= 2 && avec.vue.serieFc.length <= 600, String(avec.vue.serieFc.length));
  assert.equal(avec.vue.serieFc[0]!.s, 0);
  assert.equal(Math.max(...avec.vue.serieFc.map((p) => p.bpm)), Math.max(...fc.echantillons.map((p) => p.bpm)));
  assert.deepEqual([avec.vue.zonesS?.[2], avec.vue.fcMoy, avec.source], [62 * 60, 131, "Whoop, Santé Connect"]);
  // une séance Whoop seule (une série) n'est pas une muscu à découper
  assert.equal(await chargerFcMuscu(db, s, fc), null);
});

test("muscu cochée avec la FC de Santé Connect : courbe découpée par exercice (fenêtres, coches, numéros, FC par exercice)", async () => {
  const { db } = await baseDeTest(true);
  const exos = await db.getAllAsync<{ id: string }>("SELECT id FROM exercices WHERE slug IN ('bench-press', 'lateral-raise') ORDER BY slug", []);
  const [a, b] = exos.length === 2 ? exos.map((x) => x.id) : (await db.getAllAsync<{ id: string }>("SELECT id FROM exercices LIMIT 2", [])).map((x) => x.id);
  const debut = jour(2026, 10, 27, 18, 2);
  const fin = debut + 30 * MIN;
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('m', 'Push A', ?, ?, 1)", [debut, fin]);
  await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('m', ?, 0), ('m', ?, 1)", [a!, b!]);
  const coches = [5, 8, 11, 18, 21, 24].map((m) => debut + m * MIN);
  for (const [i, c] of coches.entries()) {
    await db.runAsync("INSERT INTO series (id, seance_id, exercice_id, position, type, reps, kg, faite, fait_le) VALUES (?, 'm', ?, ?, 'normale', 8, 60, 1, ?)", [
      `s${i}`, i < 3 ? a! : b!, i % 3, c,
    ]);
  }
  // FC inventée : 95 au repos, 150 dans la minute qui précède chaque coche
  const fc = Array.from({ length: 300 }, (_, i) => {
    const t = debut + i * 6000;
    return { t, bpm: coches.some((c) => t > c - MIN && t <= c) ? 150 : 95 };
  });
  const s = (await lireSeance(db, "m"))!;
  const r = (await chargerFcMuscu(db, s, { echantillons: fc, source: "sante" }))!;
  assert.equal(r.source, "Santé Connect");
  assert.deepEqual(r.vue.exercices.map((e) => [e.exerciceId, e.series.length, e.max]), [[a, 3, 150], [b, 3, 150]]);
  assert.equal(r.vue.coches.length, 6);
  assert.deepEqual(r.vue.numeros.map((n) => n.n), [1, 2]);
  assert.ok(r.vue.serieFc.length >= 2);
  // sans FC venue d'ailleurs ni capteur : pas de bloc
  assert.equal(await chargerFcMuscu(db, s), null);
});

test("bilan d'énergie : les pas Whoop de la séance gardés dans le journal (sauvegarde relue) remplacent l'absence de pas", async () => {
  const { jourEnergie } = await import("../src/ecrans/sante-donnees.ts");
  const { db } = await padel();
  const minuit = jour(2026, 10, 28, 0, 0);
  const avant = (await jourEnergie(db, minuit, minuit + 30 * H)).bilan.sport.seances[0]!;
  assert.equal(avant.pas, null);
  assert.equal((await jourEnergie(db, minuit, minuit + 30 * H)).bilan.neat!.seancesSansPas, true);
  await db.runAsync("INSERT INTO whoop_seance_detail (whoop_id, pas, fc, lu_le) VALUES ('w-padel', 6396, NULL, ?)", [APRES]);
  const e = await jourEnergie(db, minuit, minuit + 30 * H);
  const s = e.bilan.sport.seances[0]!;
  assert.equal(s.pas, 6396);
  assert.equal(e.bilan.neat!.pasHorsSport, 9619 - 6396);
});

test("muscu du 30/10 : séries dans leur ordre même cochées 2, 1, 3 ; la première cochée tôt a sa FC ; repères sur toute la séance", async () => {
  const { vueFcMuscu, COCHES_SERREES_S } = await import("../src/ecrans/fc-muscu-vue.ts");
  const debut = jour(2026, 10, 30, 14, 4);
  const S = 1000;
  // FC inventée à 1 Hz sur 20 min : 75 au repos, 110 dans les 40 s qui précèdent une coche
  const coches = { b2: debut + 20 * S, b1: debut + 150 * S, b3: debut + 330 * S, s1: debut + 900 * S, s2: debut + 1080 * S };
  const fc = Array.from({ length: 1200 }, (_, i) => {
    const t = debut + i * S;
    return { t, bpm: Object.values(coches).some((c) => t > c - 40 * S && t <= c) ? 110 : 75 };
  });
  const series = [
    { id: "b1", exerciceId: "banc", coche: coches.b1, rang: 0 },
    { id: "b2", exerciceId: "banc", coche: coches.b2, rang: 1 },
    { id: "b3", exerciceId: "banc", coche: coches.b3, rang: 2 },
    { id: "s1", exerciceId: "epaules", coche: coches.s1, rang: 0 },
    { id: "s2", exerciceId: "epaules", coche: coches.s2, rang: 1 },
  ];
  const v = vueFcMuscu({ fc, repos: [], debut }, series, ["banc", "epaules"], 181);
  // ordre des séries : 1, 2, 3 (pas l'ordre des coches 2, 1, 3)
  assert.deepEqual(v.exercices.map((e) => e.series.map((s) => s.id)), [["b1", "b2", "b3"], ["s1", "s2"]]);
  // la série 2, cochée 20 s après le début : sa fenêtre commence au début de la séance (avant : 60 s dont 40 sans FC, « — »)
  const b2 = v.series.find((s) => s.id === "b2")!;
  assert.equal(b2.debut, debut);
  assert.deepEqual([b2.moy == null, b2.max], [false, 110]);
  // chaque série a sa FC : 40 s d'effort dans sa fenêtre
  for (const s of v.series) assert.equal(s.max, 110, s.id);
  // repères : une coche par série, les numéros des exercices là où ils commencent, jusqu'à la fin de la séance
  assert.deepEqual(v.coches, [20, 150, 330, 900, 1080]);
  assert.deepEqual(v.numeros.map((n) => n.n), [1, 2]);
  assert.ok(v.numeros[1]!.s > 600, String(v.numeros[1]!.s));
  // deux coches à moins de 15 s : la seconde reste « — » (règle validée, D8 de la planche)
  const serrees = vueFcMuscu({ fc, repos: [], debut }, [
    { id: "a", exerciceId: "banc", coche: coches.b1, rang: 0 },
    { id: "b", exerciceId: "banc", coche: coches.b1 + (COCHES_SERREES_S - 5) * S, rang: 1 },
  ], ["banc"], 181);
  assert.deepEqual(serrees.series.map((s) => [s.id, s.douteuse, s.moy == null]), [["a", false, false], ["b", true, true]]);
});

test("FC toutes les 6 s découpée par exercice : tout le temps compté dans les zones (pas 5 s sur 6)", async () => {
  const { densifier } = await import("../src/ecrans/effort-donnees.ts");
  const l = densifier([{ t: 0, bpm: 100 }, { t: 6000, bpm: 110 }, { t: 30_000, bpm: 120 }]);
  assert.deepEqual(l, [{ t: 0, bpm: 100 }, { t: 3000, bpm: 100 }, { t: 6000, bpm: 110 }, { t: 30_000, bpm: 120 }]);
  const { db } = await baseDeTest(true);
  const [a] = (await db.getAllAsync<{ id: string }>("SELECT id FROM exercices LIMIT 1", [])).map((x) => x.id);
  const debut = jour(2026, 10, 27, 18, 0);
  await db.runAsync("INSERT INTO seances (id, debut, fin, maj_le) VALUES ('m', ?, ?, 1)", [debut, debut + 10 * MIN]);
  await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('m', ?, 0)", [a!]);
  for (const k of [0, 1]) await db.runAsync("INSERT INTO series (id, seance_id, exercice_id, position, type, reps, kg, faite, fait_le) VALUES (?, 'm', ?, ?, 'normale', 8, 60, 1, ?)", [`s${k}`, a!, k, debut + (3 + 4 * k) * MIN]);
  const r = (await chargerFcMuscu(db, (await lireSeance(db, "m"))!, { echantillons: serieFc(debut, debut + 10 * MIN), source: "sante" }))!;
  const total = r.vue.zonesS.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(total - 600) <= 6, String(total));
});
