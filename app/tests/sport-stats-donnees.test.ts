// L'Effort pepfit en base (planche effort-pepfit) : la charge de chaque séance gardée dans seance_charge (FC du capteur, de
// Whoop, de Santé Connect ; ressenti des séries ; barème), jamais le score ; le recalcul quand la séance change ou quand les
// paramètres changent ; la cible du jour, la semaine, l'historique ; la comparaison du labo. Whoop n'entre jamais dans le
// calcul, même connecté et noté.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { rpeDeRir } from "../src/boutique/poids.ts";
import { correlation, effortSeance, effortsConnus, effortsSeancesJour, lireComparaison, partsSeanceEnCours, recalculerCharges } from "../src/ecrans/effort-charges.ts";
import { COURBE_EFFORT, partsSeance, scoreEffort } from "../src/ecrans/effort-pepfit.ts";
import { lireCible, lireEffortJour, lireHistoriqueEffort, lireSemaineEffort } from "../src/ecrans/sport-stats-donnees.ts";

const MAINTENANT = new Date(2026, 9, 30, 19, 10).getTime();
const MIN = 60_000;
const jour = (n: number) => new Date(2026, 9, 30 + n).getTime();
const a = (h: number, m: number, n = 0) => jour(n) + (h * 60 + m) * MIN;
const proche = (x: number, y: number, eps = 1) => assert.ok(Math.abs(x - y) <= eps, `${x} ≈ ${y}`);

/**
 * La journée de la planche : FC max 190 (sans âge), zones en tranches de la FC max (Z3 de 133 à 152). Cinq semaines de
 * footings de 40 min un jour sur deux (FC 145, Z3 : 120 points) ; ce vendredi, mobilité (récupération), Push A (muscu, FC 120
 * et ressenti « Bien » sur ses séries) et un footing de 47 min (FC 145, 141 points), vu aussi par Whoop.
 */
async function semer({ whoop = true } = {}) {
  const { db, raw } = await baseDeTest();
  if (whoop) await ecrireReglage(db, "whoop_connecte", "1");
  for (let n = -40; n <= 0; n++) raw.prepare("INSERT INTO whoop_jour (jour, recup, fc_repos, strain, maj_le) VALUES (?,?,?,?,?)").run(jour(n), 70, 52, 11, MAINTENANT);
  raw.prepare("INSERT INTO routines (id, nom, ordre, cree_le, maj_le, type) VALUES ('r-f', 'Footing', 0, 0, 0, 'course')").run();
  raw.prepare("INSERT INTO exercices (id, nom, cree_le, maj_le) VALUES ('dc', 'Développé couché', 0, 0)").run();
  const seance = (id: string, debut: number, min: number, routine: string | null, activite: string | null) =>
    raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, routine_id, activite_id) VALUES (?,?,?,?,?,?,?)").run(id, id, debut, debut + min * MIN, 0, routine, activite);
  const fc = raw.prepare("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)");
  const fcDe = (id: string, debut: number, min: number, bpm: number) => {
    for (let k = 0; k < min * 60; k += 5) fc.run(id, debut + k * 1000, k * 1000, bpm);
  };
  for (let n = -34; n <= -2; n += 2) {
    seance(`f${n}`, a(18, 0, n), 40, "r-f", "cat:course");
    fcDe(`f${n}`, a(18, 0, n), 40, 145);
  }
  seance("mobilite", a(7, 40), 14, null, "cat:yoga");
  seance("push", a(12, 15), 52, null, "cat:musculation");
  fcDe("push", a(12, 15), 52, 120);
  const serie = raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, rpe) VALUES (?,?,?,?,?,?,?,?,?)");
  serie.run("s0", "push", "dc", 0, "echauffement", 20, 10, 1, rpeDeRir(5));
  [2, 2, 1, 2].forEach((rir, i) => serie.run(`s${i + 1}`, "push", "dc", i + 1, "normale", 70, 8, 1, rpeDeRir(rir)));
  seance("footing", a(18, 4), 47, "r-f", "cat:course");
  fcDe("footing", a(18, 4), 47, 145);
  raw.prepare("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, strain, seance_id, maj_le) VALUES ('w', ?, ?, 0, 'Running', 9.8, 'footing', 0)").run(a(18, 3), a(18, 52));
  return { db, raw };
}

test("chaque séance : la récupération n'a pas d'effort ; la muscu à ses séries, son ressenti et sa FC ; la course par la FC", async () => {
  const { db, raw } = await semer();
  const e = await effortsSeancesJour(db, jour(0));
  assert.equal(e.get("mobilite"), null);
  const push = e.get("push")!;
  assert.deepEqual([push.methode, push.ressenti, push.estime, push.series], ["fc", "bien", false, 4]);
  // 4 séries de 70 kg × 8 (réserves 2, 2, 1, 2 dites), sans passé : 8 × 0,8^0,5 × (1 + 1 + 1,1 + 1) ; moitié « Bien » × 52 min
  const series = 8 * Math.pow(0.8, 0.5) * 4.1;
  proche(push.muscu!, (series + 130) / 2, 1e-6);
  // la FC (120 bpm, zone 2 : 104 points) s'ajoute en entier
  proche(push.charge, push.muscu! + 104, 0.5);
  assert.equal(Math.round(push.score * 10) / 10, 5.8);
  const foot = e.get("footing")!;
  assert.deepEqual([foot.methode, foot.sourceFc], ["fc", "capteur"]);
  proche(foot.charge, 47 * 3);
  // la charge brute est stockée, jamais le score ; Whoop (9,8) n'y est pour rien
  const l = raw.prepare("SELECT * FROM seance_charge WHERE seance_id = 'footing'").get() as Record<string, unknown>;
  assert.equal(Object.keys(l).some((k) => /score|strain/.test(k)), false);
  proche(l.charge as number, 47 * 3);
});

test("fin de séance : les parts musculaire et cardio de la séance encore en cours, avec sa FC ; sans FC ou hors muscu, rien", async () => {
  const { db, raw } = await semer();
  const fini = partsSeance((await effortsSeancesJour(db, jour(0))).get("push")!)!;
  const fc = raw.prepare("SELECT t, bpm FROM seance_fc WHERE seance_id = 'push' ORDER BY t").all() as { t: number; bpm: number }[];
  const fin = a(12, 15) + 52 * MIN;
  raw.prepare("UPDATE seances SET fin = NULL WHERE id = 'push'").run();
  const enCours = (await partsSeanceEnCours(db, "push", fin, fc, MAINTENANT))!;
  proche(enCours.musculaire, fini.musculaire, 0.01);
  proche(enCours.musculaire + enCours.cardio, 1, 1e-9);
  assert.equal(await partsSeanceEnCours(db, "push", fin, [], MAINTENANT), null, "sans FC");
  assert.equal(await partsSeanceEnCours(db, "footing", a(18, 51), fc, MAINTENANT), null, "la course");
});

test("l'effort du jour additionne les charges, jamais les scores, même avec Whoop connecté et noté", async () => {
  const { db } = await semer();
  const j = (await lireEffortJour(db, jour(0)))!;
  const e = await effortsSeancesJour(db, jour(0));
  const charges = [...e.values()].filter((x) => x != null).map((x) => x.charge);
  assert.equal(j.seances, 2);
  proche(j.charge, charges.reduce((x, y) => x + y, 0), 1e-9);
  assert.equal(j.score, scoreEffort(j.charge));
  assert.ok(j.score < e.get("push")!.score + e.get("footing")!.score);
  assert.equal(await lireEffortJour(db, jour(-1)), null, "jour sans séance");
});

test("recalcul : une séance qui change est recalculée ; une nouvelle version des paramètres recalcule tout", async () => {
  const { db, raw } = await semer();
  await effortsSeancesJour(db, jour(0));
  raw.prepare("UPDATE series SET rpe = ? WHERE seance_id = 'push' AND type = 'normale'").run(rpeDeRir(1));
  const dur = (await effortSeance(db, "push"))!;
  assert.equal(dur.ressenti, "dur");
  proche(dur.muscu!, (8 * Math.pow(0.8, 0.5) * 4 * 1.1 + 52 * 3.5) / 2, 1e-6);
  // une ligne d'une ancienne version (paramètres changés) : recalculée au passage suivant
  raw.prepare("UPDATE seance_charge SET charge = 1, empreinte = '0|ancienne' WHERE seance_id = 'footing'").run();
  const r = await recalculerCharges(db, { maintenant: MAINTENANT });
  assert.ok(r.calculees >= 1);
  proche((await effortSeance(db, "footing"))!.charge, 47 * 3);
  // rien n'a bougé : rien à refaire
  assert.equal((await recalculerCharges(db, { maintenant: MAINTENANT })).calculees, 0);
});

test("un exercice de la séance sans série notée : une série prudente lue en base, « ~ » sans ressenti ; les sports ne comptent pas", async () => {
  const { db, raw } = await semer();
  const avant = (await effortSeance(db, "push"))!;
  raw.prepare("INSERT INTO exercices (id, nom, slug, muscle, equipement, cree_le, maj_le) VALUES ('rowing', 'Rowing poulie assis', 'seated-cable-rows', 'Milieu du dos', 'poulie', 0, 0)").run();
  raw.prepare("INSERT INTO exercices (id, nom, cree_le, maj_le, whoop_ids) VALUES ('cat:course', 'Course', 0, 0, '0') ON CONFLICT(id) DO UPDATE SET whoop_ids = '0'").run();
  const exo = raw.prepare("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,?)");
  exo.run("push", "dc", 0);
  exo.run("push", "rowing", 1);
  exo.run("push", "cat:course", 2);
  // une série prévue, pas cochée : le rowing n'a pas de série notée
  raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite) VALUES ('r1', 'push', 'rowing', 5, 'normale', 60, 12, 0)").run();
  const apres = (await effortSeance(db, "push"))!;
  // 1 série de 10 à 3 en réserve, polyarticulaire : 8 × 0,85 = 6,8 points, pour moitié (le ressenti « Bien » fait l'autre)
  proche(apres.muscu!, avant.muscu! + 6.8 / 2, 1e-6);
  assert.deepEqual([apres.series, apres.estime], [4, false]);
  // sans ressenti dit : « ~ »
  raw.prepare("UPDATE series SET rpe = NULL WHERE seance_id = 'push'").run();
  assert.equal((await effortSeance(db, "push"))!.estime, true);
});

test("changer la courbe change les scores lus, pas les charges stockées", async () => {
  const { db, raw } = await semer();
  const avant = (await effortSeance(db, "push"))!;
  const courbe = { ...COURBE_EFFORT, version: COURBE_EFFORT.version + 1, milieu: 200 };
  const apres = (await effortSeance(db, "push", courbe))!;
  assert.equal(apres.charge, avant.charge);
  assert.ok(apres.score < avant.score);
  assert.equal((raw.prepare("SELECT charge FROM seance_charge WHERE seance_id = 'push'").get() as { charge: number }).charge, avant.charge);
});

test("FC venue d'ailleurs : Whoop (ses minutes par zone), puis Santé Connect au recalcul de fond, une seule fois", async () => {
  const { db, raw } = await semer();
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('padel', 'Padel', ?, ?, 0, 'cat:padel')").run(a(9, 0, -1), a(10, 30, -1));
  raw
    .prepare("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, strain, zones, seance_id, maj_le) VALUES ('wp', ?, ?, 0, 'Padel', 14, ?, 'padel', 0)")
    .run(a(9, 0, -1), a(10, 30, -1), JSON.stringify([5, 15, 30, 35, 10, 0]));
  const padel = (await effortSeance(db, "padel"))!;
  assert.deepEqual([padel.methode, padel.sourceFc, padel.charge], ["fc", "whoop", 15 + 60 + 105 + 40]);
  // une séance sans FC en base : Santé Connect, lu par le recalcul de fond seulement
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('velo', 'Vélo', ?, ?, 0, 'cat:bicycling')").run(a(8, 0, -3), a(9, 0, -3));
  assert.equal((await effortSeance(db, "velo"))!.methode, "bareme");
  let appels = 0;
  const fcSante = async (d: number, f: number) => {
    appels++;
    return Array.from({ length: Math.floor((f - d) / 5000) }, (_, i) => ({ t: d + i * 5000, bpm: 150 }));
  };
  await recalculerCharges(db, { maintenant: MAINTENANT, fcSante });
  const velo = (await effortSeance(db, "velo"))!;
  assert.deepEqual([velo.methode, velo.sourceFc], ["fc", "sante"]);
  const apres = appels;
  assert.ok(apres >= 1);
  await recalculerCharges(db, { maintenant: MAINTENANT, fcSante });
  assert.equal(appels, apres, "déjà lue, la séance n'est pas redemandée");
  assert.equal((await effortSeance(db, "velo"))!.sourceFc, "sante", "l'affichage garde la FC de Santé Connect");
});

test("cible du jour : l'habitude des 28 jours, la forme de la Récupération ; pas de cible sans 7 jours ; sans nuit, l'habituelle", async () => {
  const { db, raw } = await semer();
  const c = (await lireCible(db, jour(0), MAINTENANT))!;
  // footings de 40 min en Z3 (120 points), forme 1 (aucune nuit notée : pas de Récupération), base : la séance prévue faite 4 fois et plus
  assert.equal(c.base, "seance");
  proche(c.habitude, 120);
  assert.equal(c.m, 1);
  assert.ok(c.bas < c.haut);
  assert.equal(await lireCible(db, jour(1), MAINTENANT), null, "jour à venir");
  raw.prepare("DELETE FROM whoop_jour").run();
  assert.equal((await lireCible(db, jour(0), MAINTENANT))!.m, 1, "rien de la nuit : la cible habituelle");
  const jeune = await semer();
  jeune.raw.prepare("DELETE FROM seances WHERE debut < ?").run(jour(-5));
  assert.equal(await lireCible(jeune.db, jour(0), MAINTENANT), null, "moins de 7 jours depuis la première séance");
});

test("la semaine : une charge par jour, l'effort de la semaine sur la même courbe, le rythme ; l'historique de 12 semaines", async () => {
  const { db } = await semer();
  const lundi = new Date(2026, 9, 26).getTime();
  const s = await lireSemaineEffort(db, lundi, MAINTENANT);
  assert.equal(s.jours.length, 7);
  assert.equal(s.jours[5]!.charge, null, "samedi à venir");
  assert.equal(s.jours[4]!.seances, 2);
  assert.ok(s.score > 0 && s.score < scoreEffort(s.charge), "la semaine se lit au milieu de 700");
  assert.ok(s.rythme && s.rythme.r > 0);
  const h = await lireHistoriqueEffort(db, MAINTENANT);
  assert.equal(h.semaines.length, 12);
  assert.ok(h.habitude != null && h.moyenne != null);
  assert.equal(h.jourMax!.jour, jour(0), "vendredi, deux séances");
});

test("labo : notre Effort face à Whoop, séance par séance, et leur corrélation ; l'historique lit les efforts connus", async () => {
  const { db } = await semer();
  await recalculerCharges(db, { maintenant: MAINTENANT });
  const l = await lireComparaison(db);
  assert.deepEqual(l.map((x) => [x.seanceId, x.whoop]), [["footing", 9.8]]);
  assert.equal(correlation([[1, 2], [2, 4], [3, 6]])!.toFixed(3), "1.000");
  assert.equal(correlation([[1, 2], [2, 2], [3, 2]]), null);
  const connus = await effortsConnus(db, ["push", "footing", "mobilite"]);
  assert.deepEqual([...connus.keys()].sort(), ["footing", "push"]);
});
