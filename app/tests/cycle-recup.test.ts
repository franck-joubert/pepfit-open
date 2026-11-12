// La Récupération ajustée à la phase (planche cycle, NOTES § 3.4, D13) : la norme de la VFC et de la FC faite des nuits de la
// même moitié des 3 derniers cycles (39 nuits dans la planche), dès 20 nuits ; le score sans ajustement toujours gardé ; rien
// d'ajusté sans l'usage « Récupération » du suivi, ni en dessous de 20 nuits.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { ecrireReglageCycle, noterRegles } from "../src/cycle/donnees.ts";
import { lireRecupJour, phaseRecup } from "../src/ecrans/recup-donnees.ts";
import { partEcart, scoreParts, scoreRecup, type DonneesRecup, type NuitRecup } from "../src/ecrans/recup-pepfit.ts";
import { AUJ, JOURS, NUITS, REGLES } from "./fixtures/cycle-planche.ts";

const nuit = (vfc: number | null, fc: number | null): NuitRecup => ({ rmssd: vfc, fcRepos: fc, sommeilMin: null, milieuMin: null, besoinMin: null, sourceSommeil: null });
const donnees = (phase: DonneesRecup["phase"]): DonneesRecup => ({
  nuits: new Map(NUITS.map((n) => [n.jour, nuit(n.vfc, n.fc)])),
  charges: new Map(),
  objectifSommeil: 460,
  phase,
});

test("la planche : zones 47 à 55 ms et 52 à 56 bpm sur 39 nuits de seconde moitié, au lieu de 51 à 63 et 51 à 55", () => {
  const sans = scoreRecup(AUJ, donnees(null));
  const avec = scoreRecup(AUJ, donnees(phaseRecup(JOURS, AUJ)));
  assert.equal(sans.ajuste, null);
  assert.deepEqual(sans.detail.vfc.norme!.zone.map((x) => x.toFixed(1)), ["51.3", "63.1"]);
  assert.deepEqual(sans.detail.fc.norme!.zone.map((x) => x.toFixed(1)), ["51.1", "55.1"]);
  assert.deepEqual(avec.detail.vfc.norme!.zone.map((x) => x.toFixed(1)), ["47.3", "55.0"]);
  assert.deepEqual(avec.detail.fc.norme!.zone.map((x) => x.toFixed(1)), ["52.4", "56.4"]);
  assert.deepEqual(avec.ajuste, { moitie: "seconde", vfc: 39, fc: 39, sans: sans.score });
  // les parts de NOTES § 3.4 : VFC 39 puis 64, FC 47 puis 63
  const pV = (r: typeof sans) => partEcart(50, r.detail.vfc.norme!, 1).part;
  const pF = (r: typeof sans) => partEcart(55, r.detail.fc.norme!, -1).part;
  assert.deepEqual([pV(sans), pF(sans), pV(avec), pF(avec)].map((x) => x.toFixed(1)), ["38.9", "46.8", "63.5", "62.6"]);
  // avec le sommeil (86) et la charge (71) de la planche : 55 % sans ajustement, 70 % ajustée (la planche arrondit chaque
  // apport et écrit 56 et 71 ; l'appli fait la somme exacte puis l'arrondit, comme toute Récupération : docs/CODE-CYCLE.md)
  const score = (v: number, f: number) => scoreParts({ vfc: { part: v, q: 1 }, fc: { part: f, q: 1 }, sommeil: { part: 86, q: 1 }, charge: { part: 71, q: 1 } }).valeur;
  assert.equal(score(pV(sans), pF(sans)), 55);
  assert.equal(score(pV(avec), pF(avec)), 70);
});

test("en dessous de 20 nuits de la même moitié, la norme habituelle reste ; la phase inconnue n'ajuste rien", () => {
  // seulement les 30 dernières nuits : la seconde moitié des cycles d'avant en a moins de 20
  const peu: DonneesRecup = { ...donnees(phaseRecup(JOURS, AUJ)), nuits: new Map(NUITS.slice(-30).map((n) => [n.jour, nuit(n.vfc, n.fc)])) };
  assert.equal(scoreRecup(AUJ, peu).ajuste, null);
  // un seul épisode (pas de prévision) : la phase est inconnue après les règles
  assert.equal(scoreRecup(AUJ, donnees(phaseRecup(JOURS.filter((j) => j.jour >= "2026-10-12"), AUJ))).ajuste, null);
  // la norme de la phase ne contient jamais la nuit du jour ni le cycle en cours
  const ph = phaseRecup(JOURS, AUJ)!(AUJ)!;
  assert.ok(![...ph.jours].some((j) => j >= REGLES.at(-1)!.debut));
});

test("en base : ajustée seulement avec le suivi et l'usage « Récupération » allumés", async () => {
  const { db, raw } = await baseDeTest();
  const ins = raw.prepare("INSERT INTO recup_nuit (jour, rmssd, fc_repos, rang, maj_le) VALUES (?, ?, ?, 6, 0)");
  for (const n of NUITS) ins.run(n.jour, n.vfc, n.fc);
  for (const r of REGLES) await noterRegles(db, { debut: r.debut, fin: r.fin, flux: 2 }, new Date(2026, 9, 30, 19).getTime());
  const auj = new Date(2026, 9, 30).getTime();
  assert.equal((await lireRecupJour(db, auj)).ajuste, null, "suivi éteint (profil sans sexe)");
  await ecrireReglage(db, "sexe", "f");
  const r = await lireRecupJour(db, auj);
  assert.equal(r.ajuste?.moitie, "seconde");
  assert.equal(r.ajuste?.vfc, 39);
  await ecrireReglageCycle(db, "recup", false);
  assert.equal((await lireRecupJour(db, auj)).ajuste, null, "usage coupé : rien d'ajusté");
});
