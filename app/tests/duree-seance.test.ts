// Feuille « Durée » : durée avec pauses, début depuis des minutes, roues de date.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avecDebut, avecDuree, debutDepuisRoues, dureeMinutesLue, dureeMinutesTexte, dureeSeanceS, ecartJours, finSansPauses,
  libelleJour, mettreEnPause, reprendre, valeursJours, valeursMinutesDuree, type Chrono,
} from "../src/ecrans/duree-seance.ts";

const T = new Date(2026, 9, 26, 14, 30, 20).getTime();
const base: Chrono = { debut: T - 3_725_000, pauseDebut: null, pauseCumulS: 0 };

test("durée écoulée, secondes comprises", () => {
  assert.equal(dureeSeanceS(base, T), 3725);
  assert.equal(dureeSeanceS({ ...base, debut: T + 5000 }, T), 0);
});

test("pause : le temps est figé, la reprise ne compte pas la pause", () => {
  const p = mettreEnPause(base, T);
  assert.equal(dureeSeanceS(p, T + 600_000), 3725);
  const r = reprendre(p, T + 600_000);
  assert.equal(r.pauseDebut, null);
  assert.equal(r.pauseCumulS, 600);
  assert.equal(dureeSeanceS(r, T + 610_000), 3735);
  assert.equal(mettreEnPause(p, T + 5), p);
  assert.equal(reprendre(base, T), base);
});

test("fin enregistrée : fin − début exclut les pauses, même en pause", () => {
  const r = reprendre(mettreEnPause(base, T), T + 300_000);
  const maintenant = T + 400_000;
  assert.equal(Math.floor((finSansPauses(r, maintenant) - r.debut) / 1000), dureeSeanceS(r, maintenant));
  const p = mettreEnPause(r, maintenant);
  assert.equal(Math.floor((finSansPauses(p, maintenant + 90_000) - p.debut) / 1000), dureeSeanceS(p, maintenant));
});

test("durée réglée : le début ne bouge pas, sauf si la durée dépasse le temps écoulé", () => {
  const c = avecDuree(base, 45, T);
  assert.equal(c.debut, base.debut);
  assert.equal(dureeSeanceS(c, T), 2700);
  assert.equal(dureeSeanceS(c, T + 60_000), 2760);
  const long = avecDuree(base, 90, T);
  assert.equal(long.debut, T - 90 * 60_000);
  assert.equal(dureeSeanceS(long, T), 5400);
  const p = { ...base, pauseDebut: T - 10_000, pauseCumulS: 60 };
  assert.equal(dureeSeanceS(avecDuree(p, 30, T), T + 99_000), 1800);
  assert.equal(dureeSeanceS(avecDuree(base, 9999, T), T), 600 * 60);
});

test("début déplacé : la durée ne change pas", () => {
  const avant = avecDebut(base, T - 5 * 86_400_000, T);
  assert.equal(avant.debut, T - 5 * 86_400_000);
  assert.equal(dureeSeanceS(avant, T), 3725);
  const r = reprendre(mettreEnPause(base, T), T + 300_000);
  const plusTard = avecDebut(r, T - 3_600_000, T + 400_000);
  assert.equal(dureeSeanceS(plusTard, T + 400_000), dureeSeanceS(r, T + 400_000));
  assert.equal(Math.floor((finSansPauses(avant, T) - avant.debut) / 1000), 3725);
});

test("début avancé, même dans le futur : borné à maintenant, la durée ne bouge pas et continue de défiler", () => {
  const futur = avecDebut(base, T + 10_000, T);
  assert.equal(futur.debut, T);
  assert.equal(dureeSeanceS(futur, T), 3725);
  const tard = avecDebut(base, T - 600_000, T);
  assert.equal(dureeSeanceS(tard, T), 3725);
  assert.equal(dureeSeanceS(tard, T + 60_000), 3785);
  assert.equal(Math.floor((finSansPauses(tard, T) - tard.debut) / 1000), 3725);
});

test("roues : valeurs et libellés", () => {
  assert.equal(valeursMinutesDuree().length, 601);
  assert.deepEqual(valeursJours(), [-6, -5, -4, -3, -2, -1, 0]);
  assert.equal(libelleJour(0, T), "Aujourd'hui");
  assert.equal(libelleJour(-1, T), "Hier");
  assert.equal(libelleJour(-2, T), "24 oct. 2026");
  assert.equal(libelleJour(-26, T), "30 sept. 2026");
  assert.deepEqual(dureeMinutesTexte(45), { attenue: "", plein: "45 min" });
  assert.deepEqual(dureeMinutesTexte(65), { attenue: "", plein: "1 h 05" });
  assert.equal(dureeMinutesLue(60), "1 heure");
  assert.equal(dureeMinutesLue(125), "2 heures 5 minutes");
  assert.equal(dureeMinutesLue(1), "1 minute");
});

test("début depuis les trois roues, et retour", () => {
  const d = debutDepuisRoues(-2, 9, 5, T);
  assert.equal(new Date(d).getDate(), 24);
  assert.equal(new Date(d).getHours(), 9);
  assert.equal(new Date(d).getMinutes(), 5);
  assert.equal(new Date(d).getSeconds(), 0);
  assert.equal(ecartJours(d, T), -2);
  assert.equal(ecartJours(T, T), 0);
  assert.equal(ecartJours(T - 30 * 86_400_000, T), -6);
});

test("migration 6 : séances existantes sans pause, réglage du chrono persisté", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { migrer } = await import("../src/db/migrations.ts");
  const { reglerChrono, seanceEnCours } = await import("../src/db/depots/seances.ts");
  const { adapter } = await import("./aide.ts");
  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db, 5);
  raw.exec("INSERT INTO seances (id, debut, maj_le) VALUES ('s', 1000, 1000)");
  await migrer(db);
  const avant = await seanceEnCours(db);
  assert.equal(avant?.pause_debut, null);
  assert.equal(avant?.pause_cumul_s, 0);
  await reglerChrono(db, "s", { pauseDebut: 5000, pauseCumulS: 30 });
  await reglerChrono(db, "s", { debut: 2000 });
  const apres = await seanceEnCours(db);
  assert.deepEqual([apres?.debut, apres?.pause_debut, apres?.pause_cumul_s], [2000, 5000, 30]);
  await reglerChrono(db, "s", { pauseDebut: null });
  assert.equal((await seanceEnCours(db))?.pause_debut, null);
});
