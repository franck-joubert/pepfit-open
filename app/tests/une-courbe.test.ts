// Une seule courbe de FC par séance de muscu (retour du 08/11 : « pourquoi j'ai deux courbes FC ici ? Et pas les
// mêmes ? »). La FC en direct (seance_fc, séance entière) et la séance Whoop (fenêtre de l'activité détectée) sont deux
// sources et deux fenêtres : quand la séance a sa FC découpée par exercice, seul ce bloc montre la courbe et les zones ; le
// bloc Cardio de Whoop ne se montre pas, et les kcal (celles de pepfit, sur la séance entière) passent dans la rangée du haut.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { lireSeance } from "../src/db/depots/seances.ts";
import { ecrireFcMuscu } from "../src/db/depots/fc-muscu.ts";
import { chargerEffort, chargerFcMuscu } from "../src/ecrans/effort-donnees.ts";
import type { Echantillon } from "../src/ecrans/fc-muscu-vue.ts";
import { cardioDansFcMuscu } from "../src/ecrans/fin-suivi.ts";
import { effortSeance } from "../src/ecrans/effort-charges.ts";
import { kcalSeance } from "../src/ecrans/kcal-seance.ts";
import { bmrA } from "../src/ecrans/sante-donnees.ts";

const S = 1000;
const MIN = 60 * S;
const DEBUT = jour(2026, 10, 7, 18, 0);
const FIN = DEBUT + 39 * MIN;
// la fenêtre que Whoop a détectée : 25 min au milieu des 39
const W_DEBUT = DEBUT + 8 * MIN;
const W_FIN = W_DEBUT + 25 * MIN;

/** 98 au chaud et au repos, 122 pendant l'activité que Whoop détecte. */
const bpmA = (t: number) => (t >= W_DEBUT && t <= W_FIN ? 122 : 98);
const echantillons = (debut: number, fin: number, pas: number): Echantillon[] => {
  const l: Echantillon[] = [];
  for (let t = debut; t <= fin; t += pas) l.push({ t, bpm: bpmA(t) });
  return l;
};
const direct = () => echantillons(DEBUT, FIN, S);
const whoopFc = () => echantillons(DEBUT, FIN, 6 * S);

/** Une séance de muscu de 39 min : `coches` séries cochées (0 : séance importée de Hevy, sans heure de coche). */
async function seance(opts: { direct?: boolean; whoop?: boolean; coches?: number }) {
  const { db } = await baseDeTest(true);
  const a = (await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices ORDER BY id LIMIT 1", []))!.id;
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('m', 'Push', ?, ?, 1)", [DEBUT, FIN]);
  await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('m', ?, 0)", [a]);
  const coches = opts.coches ?? 6;
  for (let i = 0; i < 6; i++) {
    await db.runAsync("INSERT INTO series (id, seance_id, exercice_id, position, type, reps, kg, faite, fait_le) VALUES (?, 'm', ?, ?, 'normale', 8, 60, 1, ?)", [
      `s${i}`, a, i, coches ? DEBUT + 10 * MIN + i * 3 * MIN : null,
    ]);
  }
  if (opts.direct) await ecrireFcMuscu(db, "m", DEBUT, direct(), "WHOOP 4A0");
  if (opts.whoop) {
    const moy = Math.round(whoopFc().filter((x) => x.t >= W_DEBUT && x.t <= W_FIN).reduce((s, x) => s + x.bpm, 0) / (25 * 10 + 1));
    await db.runAsync("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, seance_id, fc_moy, fc_max, zones, maj_le) VALUES ('w', ?, ?, 45, 'Weightlifting', 'm', ?, 122, '[0,0,25,0,0,0]', 1)", [W_DEBUT, W_FIN, moy]);
  }
  return { db, s: (await lireSeance(db, "m"))! };
}

/** Ce que la page charge : la FC en direct, Santé Connect pour les trous, puis `fc` de Santé Connect quand la séance n'a pas la sienne. */
async function page(opts: Parameters<typeof seance>[0]) {
  const { db, s } = await seance(opts);
  const src = opts.whoop ? { echantillons: whoopFc(), source: "sante" as const } : null;
  const fm0 = await chargerFcMuscu(db, s);
  const fm = fm0 ?? (src ? await chargerFcMuscu(db, s, src) : null);
  const effort = await chargerEffort(db, s, fm ? null : src);
  return { db, s, fm, effort, fondu: cardioDansFcMuscu(fm, effort) };
}

test("FC en direct seule : le bloc de la muscu, pas de Cardio", async () => {
  const { fm, effort, fondu } = await page({ direct: true });
  assert.ok(fm);
  assert.equal(effort, null);
  assert.equal(fondu, false); // rien à retirer : aucun second bloc
  assert.equal(fm.vue.dureeS, 39 * 60);
});

test("les deux : une seule courbe, celle de la séance entière ; le Cardio de Whoop ne se montre pas", async () => {
  const { fm, effort, fondu } = await page({ direct: true, whoop: true });
  assert.ok(fm && effort);
  assert.equal(fondu, true);
  // l'écart : la séance entière (39 min, avec l'échauffement et la fin) contre la fenêtre de Whoop (25 min, l'activité détectée)
  assert.equal(effort.vue.dureeS, 25 * 60);
  assert.ok(fm.vue.dureeS > 38 * 60);
  assert.ok(fm.vue.fcMoy! < effort.vue.fcMoy!, `${fm.vue.fcMoy} contre ${effort.vue.fcMoy}`);
  assert.deepEqual([fm.vue.fcMoy, effort.vue.fcMoy], [113, 122]);
});

test("les kcal de la muscu : celles de la séance entière (39 min), pas celles de la fenêtre de Whoop (25 min), jamais celles de Whoop", async () => {
  const { db, fm, effort } = await page({ direct: true, whoop: true });
  assert.ok(fm?.calories != null && effort?.calories != null);
  // Whoop : 25 min seulement : ses kcal étaient plus basses que celles de la page Énergie (39 min)
  assert.ok(fm.calories > effort.calories, `${fm.calories} contre ${effort.calories}`);
  const attendu = Math.round(
    kcalSeance({ minutes: 39, fcMoy: fm.vue.fcMoy, sportId: "cat:musculation" }, { sexe: null, kg: null, age: null }, await bmrA(db, FIN)).brutes,
  );
  // sans FC par minute gardée ici : la FC moyenne ; la même fonction que la page Énergie (kcalSeance), sur 39 min
  assert.equal(fm.calories, attendu);
});

test("Whoop seul (sans FC en direct) avec des séries cochées : la FC de Santé Connect découpée par exercice, un seul bloc", async () => {
  const { fm, effort, fondu } = await page({ whoop: true });
  assert.ok(fm && effort);
  assert.equal(fm.source, "Santé Connect");
  assert.equal(effort.vue.serieFc.length, 0); // ce bloc n'a que des zones : exactement ce qu'il faut retirer
  assert.equal(fondu, true);
});

test("séance Hevy importée (séries sans heure de coche) avec Whoop : pas de FC par exercice, le Cardio de Whoop reste", async () => {
  const { fm, effort, fondu } = await page({ whoop: true, coches: 0 });
  assert.equal(fm, null);
  assert.ok(effort);
  assert.equal(fondu, false);
  assert.equal(effort.source, "Whoop, Santé Connect");
});

test("séance Hevy importée sans aucune FC : ni l'un ni l'autre", async () => {
  const { fm, effort, fondu } = await page({ coches: 0 });
  assert.deepEqual([fm, effort, fondu], [null, null, false]);
});

test("ni FC ni Whoop : rien", async () => {
  const { fm, effort, fondu } = await page({});
  assert.deepEqual([fm, effort, fondu], [null, null, false]);
});

test("un suivi de pepfit (tracé, tapis) garde son bloc, même avec la FC de la muscu", () => {
  const vue = (n: number) => ({ trace: Array.from({ length: n }, () => ({})) }) as never;
  assert.equal(cardioDansFcMuscu({}, { vue: vue(5), saisie: undefined }), false);
  assert.equal(cardioDansFcMuscu({}, { vue: vue(0), saisie: { serieId: "x", distanceM: null } }), false);
  assert.equal(cardioDansFcMuscu({}, { vue: vue(0), saisie: undefined }), true);
  assert.equal(cardioDansFcMuscu(null, { vue: vue(0), saisie: undefined }), false);
});

test("l'Effort (le 5,1 du haut) lit une seule source de FC, sans kcal : la FC en direct d'abord, jamais les deux", async () => {
  const { db } = await seance({ direct: true, whoop: true });
  const e = (await effortSeance(db, "m"))!;
  assert.equal(e.sourceFc, "capteur");
  const sans = await seance({ whoop: true });
  assert.equal((await effortSeance(sans.db, "m"))!.sourceFc, "whoop");
  assert.equal("calories" in e || "kcal" in e, false);
});
