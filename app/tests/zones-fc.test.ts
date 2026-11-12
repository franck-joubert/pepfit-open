// Zones de FC personnelles (NOTES-VMA.md § 4) : FC max (saisie, mesurée, Tanaka), FC au repos (médiane des 30 nuits),
// zones de Karvonen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bornesZones } from "../src/ecrans/suivi-direct-vue.ts";
import {
  bornesDe, bornesFcMax, bornesKarvonen, fcMaxTanaka, fcMaxVue, maxDe, milieuxReserve, picLisse, picTenu, plagesZones, resoudreFcMax, resoudreFcRepos, zoneDans,
  zonesPersonnelles,
} from "../src/ecrans/zones-fc.ts";

const JOUR = 86_400_000;
const T0 = new Date(2026, 9, 29, 12).getTime();
const serie = (l: number[]) => l.map((bpm) => ({ bpm }));

test("Tanaka : 208 − 0,7 × âge (39 ans → 181)", () => {
  assert.equal(fcMaxTanaka(39), 181);
  assert.equal(fcMaxTanaka(60), 166);
});

test("pic lissé : un pic isolé du capteur ne compte pas, un vrai pic tenu compte", () => {
  assert.equal(picLisse(serie([150, 151, 230, 152, 150, 151])), 151);
  assert.equal(picLisse(serie([170, 178, 179, 180, 179, 178, 170])), 179);
  assert.equal(picLisse(serie([150, 160])), null);
});

test("FC max vue : la plus haute des séances de 12 mois (résumé Whoop ou capteur), artefacts au-delà de 220 écartés", () => {
  const seances = [
    { date: T0 - 10 * JOUR, fcMax: 176 },
    { date: T0 - 400 * JOUR, fcMax: 195 },
    { date: T0 - 5 * JOUR, fcMax: 240 },
    { date: T0 - 3 * JOUR, fc: serie([170, 182, 183, 184, 183, 182, 170]) },
  ];
  assert.deepEqual(fcMaxVue(seances, T0), { bpm: 183, date: T0 - 3 * JOUR, test: false });
  assert.equal(fcMaxVue([], T0), null);
});

test("pic tenu : la 5e plus haute valeur (un pic isolé ne compte pas), et il compte dans la FC max vue", () => {
  assert.equal(picTenu([150, 230, 182, 183, 184, 181, 185, 140]), 181);
  assert.equal(picTenu([150, 160, 170]), null);
  assert.deepEqual(fcMaxVue([{ date: T0 - JOUR, pic: 184, test: true }], T0), { bpm: 184, date: T0 - JOUR, test: true });
});

test("FC max retenue : saisie si on l'a choisie, sinon mesurée (au-dessus de l'estimée, ou test VMA), puis Tanaka, puis 190", () => {
  const base = { saisie: null, age: 39, maintenant: T0 };
  // la Whoop d'Alex, saisie : 181 ; choisie, elle prime
  assert.equal(resoudreFcMax({ ...base, mode: "saisie", saisie: 181, seances: [{ date: T0, fcMax: 186 }] }).source, "saisie");
  // D2 : « Automatique » par défaut, la saisie d'avant ne compte plus (elle reste pour « Saisie »)
  assert.equal(resoudreFcMax({ ...base, saisie: 181, seances: [{ date: T0, fcMax: 186 }] }).bpm, 186);
  // « D'après ton âge » : Tanaka même avec une FC vue plus haute
  assert.deepEqual(resoudreFcMax({ ...base, mode: "age", saisie: 181, seances: [{ date: T0, fcMax: 186 }] }), { bpm: 181, source: "estimee", date: null, vue: 186 });
  // vue 186 > Tanaka 181 : mesurée
  assert.deepEqual(resoudreFcMax({ ...base, seances: [{ date: T0 - JOUR, fcMax: 186 }] }), { bpm: 186, source: "mesuree", date: T0 - JOUR, vue: 186 });
  // vue 172 < 181 sans test : on garde l'estimée, la page dira « la plus haute vue : 172 »
  assert.deepEqual(resoudreFcMax({ ...base, seances: [{ date: T0 - JOUR, fcMax: 172 }] }), { bpm: 181, source: "estimee", date: null, vue: 172 });
  // un test VMA donne la FC max même sous l'estimée
  assert.equal(resoudreFcMax({ ...base, seances: [{ date: T0 - JOUR, fcMax: 178, test: true }] }).bpm, 178);
  assert.equal(resoudreFcMax({ ...base, age: null, seances: [] }).bpm, 190);
  assert.equal(resoudreFcMax({ ...base, age: null, seances: [] }).source, "defaut");
  // saisie choisie mais hors de 100 à 240 : ignorée
  assert.equal(resoudreFcMax({ ...base, mode: "saisie", saisie: 60, seances: [] }).source, "estimee");
});

test("FC au repos : médiane des nuits des 30 derniers jours, Whoop d'abord ; rien sans nuit", () => {
  const nuits = [
    { date: T0 - 1 * JOUR, bpm: 50, source: "whoop" as const },
    { date: T0 - 2 * JOUR, bpm: 48, source: "whoop" as const },
    { date: T0 - 3 * JOUR, bpm: 62, source: "whoop" as const },
    { date: T0 - 2 * JOUR, bpm: 58, source: "sante_connect" as const },
    { date: T0 - 40 * JOUR, bpm: 70, source: "whoop" as const },
  ];
  assert.deepEqual(resoudreFcRepos(nuits, T0), { bpm: 50, source: "whoop", n: 3 });
  assert.deepEqual(resoudreFcRepos(nuits.filter((n) => n.source === "sante_connect"), T0), { bpm: 58, source: "sante_connect", n: 1 });
  assert.equal(resoudreFcRepos([], T0), null);
});

test("Karvonen : FC repos + 50 à 90 % de la réserve (181 et 50 → 116, 129, 142, 155, 168)", () => {
  assert.deepEqual(bornesKarvonen(181, 50), [116, 129, 142, 155, 168]);
  // sans FC au repos : les tranches de 10 % de la FC max d'avant, à l'identique
  assert.deepEqual(bornesFcMax(181), bornesZones(181));
});

test("zones personnelles : Karvonen avec une FC au repos, sinon la part de la FC max ; plages affichées", () => {
  const fcMax = { bpm: 181, source: "saisie" as const, date: null, vue: null };
  const z = zonesPersonnelles(fcMax, { bpm: 50, source: "whoop", n: 28 });
  assert.equal(z.methode, "karvonen");
  assert.deepEqual(plagesZones(z), [
    { bas: 116, haut: 128 }, { bas: 129, haut: 141 }, { bas: 142, haut: 154 }, { bas: 155, haut: 167 }, { bas: 168, haut: 181 },
  ]);
  const sans = zonesPersonnelles(fcMax, null);
  assert.equal(sans.methode, "fcmax");
  assert.deepEqual(sans.bornes, [91, 109, 127, 145, 163]);
  // FC au repos invraisemblable (à moins de 20 bpm de la FC max) : pas de Karvonen
  assert.equal(zonesPersonnelles(fcMax, { bpm: 170, source: "whoop", n: 1 }).methode, "fcmax");
});

test("zone d'un bpm : 0 sous Z1, puis 1 à 5", () => {
  const b = bornesKarvonen(181, 50);
  assert.equal(zoneDans(110, b), 0);
  assert.equal(zoneDans(116, b), 1);
  assert.equal(zoneDans(141, b), 2);
  assert.equal(zoneDans(168, b), 5);
});

test("méthode « % de la FC max » choisie : les tranches de la FC max, même avec une FC au repos", () => {
  const fcMax = { bpm: 181, source: "estimee" as const, date: null, vue: null };
  const z = zonesPersonnelles(fcMax, { bpm: 46, source: "whoop", n: 28 }, "fcmax");
  assert.equal(z.methode, "fcmax");
  assert.deepEqual(z.bornes, bornesFcMax(181));
  assert.equal(z.fcRepos, null);
});

test("références de zones : un nombre (tranches de cette FC max, comme avant) ou les zones ; milieux en part de la réserve", () => {
  const z = zonesPersonnelles({ bpm: 184, source: "mesuree", date: T0, vue: 184 }, { bpm: 46, source: "whoop", n: 28 });
  assert.deepEqual(bornesDe(181), [91, 109, 127, 145, 163]);
  assert.deepEqual(bornesDe(z), [115, 129, 143, 157, 171]);
  assert.equal(maxDe(181), 181);
  assert.equal(maxDe(z), 184);
  // Karvonen : les milieux sont déjà des parts de la réserve
  assert.deepEqual(milieuxReserve(z, 60).map((x) => Math.round(x * 100)), [55, 65, 75, 85, 95]);
  // tranches de la FC max : le milieu de Z3 (75 % de 190) en part de la réserve (repos 60)
  assert.equal(Math.round(milieuxReserve(190, 60)[2]! * 1000), Math.round(((0.75 * 190 - 60) / 130) * 1000));
});

test("base : FC max automatique (pic tenu d'un test VMA, résumé Whoop), FC au repos des nuits, méthode choisie", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { ecrireReglage } = await import("../src/db/depots/reglages.ts");
  const { ajouterMesures } = await import("../src/db/depots/mesures.ts");
  const { lireZonesFc, ecrireMethodeZones, ecrireModeFcMax, TYPE_TEST_VMA } = await import("../src/db/depots/zones-fc.ts");
  const { db } = await baseDeTest();
  await ecrireReglage(db, "naissance", "1987-05-14");
  await ecrireReglage(db, "fc_max", "181"); // la saisie d'avant : ignorée en automatique (D2)
  // sans rien d'autre : Tanaka (39 ans), tranches de la FC max (pas de nuit)
  let z = await lireZonesFc(db, T0);
  assert.deepEqual([z.fcMax.bpm, z.fcMax.source, z.methode], [181, "estimee", "fcmax"]);
  // nuits Whoop : médiane 46 → réserve cardiaque
  for (const [k, v] of [44, 46, 47, 46, 45].entries()) await ajouterMesures(db, "fc", [{ valeur: v, date: T0 - (k + 1) * JOUR }], "whoop");
  // une séance pepfit, test VMA : pic tenu 184 (un pic isolé à 230 ne compte pas)
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('t1', 'Test VMA', ?, ?, ?)", [T0 - JOUR, T0 - JOUR + 1_800_000, T0]);
  for (const [k, bpm] of [150, 230, 183, 184, 185, 186, 184, 170].entries()) await db.runAsync("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES ('t1', ?, ?, ?)", [T0 - JOUR + k * 1000, k * 1000, bpm]);
  await ajouterMesures(db, TYPE_TEST_VMA, [{ valeur: 1512, date: T0 - JOUR, origine: "t1" }], "pepfit");
  z = await lireZonesFc(db, T0);
  assert.deepEqual([z.fcMax.bpm, z.fcMax.source, z.methode, z.fcRepos?.bpm, z.fcRepos?.source], [184, "mesuree", "karvonen", 46, "whoop"]);
  assert.deepEqual(z.bornes, bornesKarvonen(184, 46));
  // « % de la FC max » choisi, puis « Saisie »
  await ecrireMethodeZones(db, "fcmax");
  assert.equal((await lireZonesFc(db, T0)).methode, "fcmax");
  await ecrireModeFcMax(db, "saisie");
  assert.deepEqual([(await lireZonesFc(db, T0)).fcMax.bpm, (await lireZonesFc(db, T0)).fcMax.source], [181, "saisie"]);
});
