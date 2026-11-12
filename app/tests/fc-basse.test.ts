// FC anormalement basse d'une séance de muscu (retour du 30/10 : « courbe BPM » trop basse, séance avec la Whoop en
// direct). Données inventées, réalistes : 15 séries, FC qui monte pendant la série, culmine 5 s après la coche, redescend au
// repos ; Whoop toutes les 6 s. Causes (docs/FC-BASSE.md) : la FC d'avant le début et d'après la fin (repos, maison) entrait
// dans la séance ; le capteur coupé pendant les séries (écran éteint) ne laissait que le repos, sans le complément de Whoop ;
// les 0 du contact perdu comptaient.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { lireSeance } from "../src/db/depots/seances.ts";
import { ecrireFcMuscu, lireFcMuscu } from "../src/db/depots/fc-muscu.ts";
import { chargerFcMuscu, comblerTrous, plageSeance } from "../src/ecrans/effort-donnees.ts";
import { bandeFc, vueFcMuscu, type Echantillon } from "../src/ecrans/fc-muscu-vue.ts";

const S = 1000;
const MIN = 60 * S;
const DEBUT = jour(2026, 10, 29, 18, 0);
const FIN = DEBUT + 47 * MIN;
const COCHES = Array.from({ length: 15 }, (_, k) => DEBUT + 2 * MIN + k * 3 * MIN);
const SERIE_S = 45;

/** FC vraie à l'instant t : 100 → 150 pendant la série (45 s), 158 au pic 5 s après la coche, retour vers 100 au repos. */
function vraie(t: number): number {
  if (t < DEBUT) return 72;
  if (t > FIN) return 65;
  const prochaine = COCHES.find((c) => c >= t);
  if (prochaine != null && t >= prochaine - SERIE_S * S) return 100 + (50 * (t - (prochaine - SERIE_S * S))) / (SERIE_S * S);
  const derniere = COCHES.findLast((c) => c < t);
  if (derniere == null) return 95;
  const dt = t - derniere;
  if (dt <= 5 * S) return 150 + (8 * dt) / (5 * S);
  return 100 + 58 * Math.exp(-(dt - 5 * S) / (40 * S));
}

const serie = (debut: number, fin: number, pas: number, garder: (t: number) => boolean = () => true): Echantillon[] => {
  const l: Echantillon[] = [];
  for (let t = debut; t <= fin; t += pas) if (garder(t)) l.push({ t, bpm: Math.round(vraie(t)) });
  return l;
};

/** Capteur en direct : téléphone en main au repos seulement (lien repris 10 s après la coche, perdu au départ de la série
 *  suivante, écran éteint) ; ouvert 10 min avant le début (début avancé ensuite) et resté 40 min après la fin (durée corrigée
 *  sur l'écran de fin) ; trois 0 au contact perdu. */
function direct(): Echantillon[] {
  const enMain = (t: number) => {
    if (t < DEBUT || t > FIN) return true;
    const derniere = COCHES.findLast((c) => c <= t);
    const prochaine = COCHES.find((c) => c > t);
    return derniere != null && t >= derniere + 10 * S && (prochaine == null || t < prochaine - SERIE_S * S);
  };
  const l = serie(DEBUT - 10 * MIN, FIN + 40 * MIN, S, enMain);
  for (const x of l) if (x.t >= COCHES[3]! + 30 * S && x.t < COCHES[3]! + 33 * S) x.bpm = 0;
  return l;
}

const whoop = () => serie(DEBUT - 10 * MIN, FIN + 40 * MIN, 6 * S);

/** La référence : la FC vraie, chaque seconde, sur la séance seule. */
const reference = () => vueFcMuscu({ fc: serie(DEBUT, FIN, S), repos: [], debut: DEBUT }, [], [], 190);

async function seance() {
  const { db } = await baseDeTest(true);
  const [a, b] = (await db.getAllAsync<{ id: string }>("SELECT id FROM exercices ORDER BY id LIMIT 2", [])).map((x) => x.id);
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('m', 'Push A', ?, ?, 1)", [DEBUT, FIN]);
  await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('m', ?, 0), ('m', ?, 1)", [a!, b!]);
  for (const [i, c] of COCHES.entries()) {
    await db.runAsync("INSERT INTO series (id, seance_id, exercice_id, position, type, reps, kg, faite, fait_le) VALUES (?, 'm', ?, ?, 'normale', 8, 60, 1, ?)", [
      `s${i}`, i < 8 ? a! : b!, i < 8 ? i : i - 8, c,
    ]);
  }
  await ecrireFcMuscu(db, "m", DEBUT, direct(), "WHOOP 4A0");
  return { db, s: (await lireSeance(db, "m"))! };
}

test("cause : la FC brute du capteur donne une moyenne, un max et une courbe trop bas", async () => {
  const { db } = await seance();
  const ref = reference();
  assert.equal(ref.fcMax, 158);
  const brute = vueFcMuscu({ fc: (await lireFcMuscu(db, "m"))!.fc, repos: [], debut: DEBUT }, [], [], 190);
  // hors séance (72, 65) et 0 du contact perdu comptés, pic jamais vu (le lien revient 10 s après la coche)
  assert.ok(brute.fcMoy! < ref.fcMoy! - 15, `moyenne brute ${brute.fcMoy} contre ${ref.fcMoy}`);
  assert.ok(brute.fcMax! < 155, `max brut ${brute.fcMax}`);
  assert.equal(Math.min(...brute.serieFc.map((p) => p.bpm)), 0);
  assert.ok(brute.dureeS > 90 * 60, "la courbe déborde de la séance");
});

test("correctif, fin de séance : capteur seul, FC de la séance seulement (ni avant, ni après, ni 0)", async () => {
  const { db, s } = await seance();
  const r = (await chargerFcMuscu(db, s))!;
  assert.equal(r.source, "Whoop, en direct");
  assert.ok(r.vue.serieFc.every((p) => p.s >= 0 && p.s <= 47 * 60 && p.bpm >= 95), "courbe dans la séance, sans 0 ni repos");
  assert.ok(r.vue.dureeS <= 47 * 60);
  // reste le biais du lien coupé pendant les séries : sans Whoop, le pic manque
  assert.ok(r.vue.fcMax! < 155);
});

test("correctif, fin de séance : trous du capteur comblés par Santé Connect ; moyenne, max, courbe et séries justes", async () => {
  const { db, s } = await seance();
  const ref = reference();
  const r = (await chargerFcMuscu(db, s, { echantillons: whoop(), source: "sante" }))!;
  assert.equal(r.source, "Whoop, en direct, complétée par Santé Connect");
  assert.ok(Math.abs(r.vue.fcMoy! - ref.fcMoy!) <= 2, `moyenne ${r.vue.fcMoy} contre ${ref.fcMoy}`);
  assert.ok(r.vue.fcMax! >= 156 && r.vue.fcMax! <= 158, `max ${r.vue.fcMax}`);
  assert.ok(r.vue.serieFc.every((p) => p.s >= 0 && p.s <= 47 * 60 && p.bpm >= 95));
  assert.ok(Math.max(...r.vue.serieFc.map((p) => p.bpm)) >= 156, "la courbe garde ses pics");
  // chaque série : sa fenêtre couverte, son pic vu
  assert.equal(r.vue.series.length, 15);
  for (const x of r.vue.series) {
    assert.ok(x.max != null && x.max >= 156, `série ${x.id} : max ${x.max}`);
    assert.ok(x.moy != null && x.moy >= 105, `série ${x.id} : moyenne ${x.moy}`);
  }
  assert.deepEqual(r.vue.exercices.map((e) => e.max), [Math.max(...r.vue.series.slice(0, 8).map((x) => x.max!)), Math.max(...r.vue.series.slice(8).map((x) => x.max!))]);
});

test("Santé Connect seule (sans capteur en direct) : même plage, même justesse", async () => {
  const { db, s } = await seance();
  await db.runAsync("DELETE FROM suivi_seance WHERE seance_id = 'm'", []);
  const ref = reference();
  const r = (await chargerFcMuscu(db, s, { echantillons: whoop(), source: "sante" }))!;
  assert.equal(r.source, "Santé Connect");
  assert.ok(Math.abs(r.vue.fcMoy! - ref.fcMoy!) <= 2, `moyenne ${r.vue.fcMoy} contre ${ref.fcMoy}`);
  assert.ok(r.vue.fcMax! >= 156);
  assert.ok(r.vue.serieFc.every((p) => p.s >= 0 && p.s <= 47 * 60));
});

test("plage de la séance : sa fin plus ses pauses (la fin ne compte pas les pauses, l'heure de la FC si)", () => {
  assert.deepEqual(plageSeance({ debut: DEBUT, fin: FIN, pause_cumul_s: 300 }), { debut: DEBUT, fin: FIN + 5 * MIN });
  assert.deepEqual(plageSeance({ debut: DEBUT, fin: null, pause_cumul_s: 0 }), { debut: DEBUT, fin: Infinity });
});

test("comblerTrous : seuls les silences de plus de 20 s, bords de la séance compris, prennent l'autre source", () => {
  const plage = { debut: 0, fin: 100 * S };
  const direct = [10, 11, 12, 50, 51].map((x) => ({ t: x * S, bpm: 120 }));
  const autre = Array.from({ length: 17 }, (_, i) => ({ t: i * 6 * S, bpm: 140 }));
  const r = comblerTrous(direct, autre, plage);
  // 0 → 10 s : pas un trou ; 12 → 50 s : trou (18 à 48) ; 51 → 96 s : trou (54 à 96)
  assert.deepEqual(r.filter((x) => x.bpm === 140).map((x) => x.t / S), [18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96]);
  assert.deepEqual(comblerTrous(direct, [], plage), direct);
});

test("en séance : un 0 du capteur (contact perdu) n'est pas affiché comme une FC", () => {
  const o = { active: true, appareils: true, etat: "connecte" as const, vue: true, depuisMs: 60_000, fcMax: 190, pic: 150 };
  assert.deepEqual(bandeFc({ ...o, bpm: 0 }), { genre: "perdue" });
  assert.equal(bandeFc({ ...o, bpm: 132 }).genre, "fc");
});
