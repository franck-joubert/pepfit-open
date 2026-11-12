// Le rappel « Tes règles sont-elles arrivées ? » (backlog 14 et 31) : la date des rappels, « Oui », « Non » deux fois puis
// l'arrêt, le suivi éteint, et aucune sortie réseau.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { isoLocal, lireJoursCycle, lireReglagesCycle, noterRegles, ecrireReglageCycle } from "../src/cycle/donnees.ts";
import { ACTION_REGLES_NON, ACTION_REGLES_OUI, HEURE_RAPPEL_REGLES, idRappelRegles, rappelsRegles, reponseRegles } from "../src/cycle/rappel-regles.ts";
import { etatCycle } from "../src/cycle/modele.ts";
import { cibleNotif } from "../src/natif/notifications-regles.ts";

const L = (a: number, m: number, j: number, h = 12) => new Date(a, m - 1, j, h).getTime();
const TOUT = { suivi: true, rappel: true, prevision: true };

/** Quatre débuts à 28 jours : 1er juin, 29 juin, 27 juillet, 24 août ; le suivant est estimé au 21 septembre. */
async function baseCycles() {
  const { db } = await baseDeTest();
  await ecrireReglageCycle(db, "suivi", true);
  for (const [m, j] of [[6, 1], [6, 29], [7, 27], [8, 24]] as const) await noterRegles(db, { debut: isoLocal(L(2026, m, j)), fin: isoLocal(L(2026, m, j + 4 > 30 && m === 6 ? 30 : j + 4)), flux: 2 }, L(2026, m, j + 4 > 30 && m === 6 ? 30 : j + 4));
  return db;
}

test("la date : trois rappels à 9 h, le jour estimé puis deux jours de suite", async () => {
  const db = await baseCycles();
  const jours = await lireJoursCycle(db);
  const pv = etatCycle(jours, "2026-09-10").prevision;
  assert.ok(pv.possible && pv.centre === "2026-09-21");
  const r = rappelsRegles(jours, TOUT, L(2026, 9, 10));
  assert.deepEqual(r.map((x) => x.id), [idRappelRegles(0), idRappelRegles(1), idRappelRegles(2)]);
  assert.deepEqual(r.map((x) => x.quand), [21, 22, 23].map((j) => L(2026, 9, j, HEURE_RAPPEL_REGLES)));
});

test("Non : le rappel revient 2 fois en tout, puis s'arrête", async () => {
  const db = await baseCycles();
  const jours = await lireJoursCycle(db);
  // Non ne change rien aux données : la liste restante, jour après jour, est celle des rappels pas encore passés
  assert.equal(reponseRegles(ACTION_REGLES_NON), "non");
  assert.deepEqual(rappelsRegles(jours, TOUT, L(2026, 9, 21, 9) + 5 * 60000).map((x) => x.id), [idRappelRegles(1), idRappelRegles(2)], "après le 1er rappel : il en reste 2");
  assert.deepEqual(rappelsRegles(jours, TOUT, L(2026, 9, 22, 9) + 5 * 60000).map((x) => x.id), [idRappelRegles(2)], "après le 2e : il en reste 1");
  assert.deepEqual(rappelsRegles(jours, TOUT, L(2026, 9, 23, 9) + 5 * 60000), [], "après le 3e : rien, jusqu'à la prévision suivante");
  assert.deepEqual(rappelsRegles(jours, TOUT, L(2026, 9, 25)), []);
});

test("Oui : le début est noté à la date du jour, la prévision se recalcule, les anciens rappels tombent", async () => {
  const db = await baseCycles();
  const maintenant = L(2026, 9, 22, 9);
  assert.equal(reponseRegles(ACTION_REGLES_OUI), "oui");
  assert.equal(reponseRegles("expo.modules.notifications.actions.DEFAULT"), null);
  await noterRegles(db, { debut: isoLocal(maintenant), fin: null, flux: 0 }, maintenant);
  const jours = await lireJoursCycle(db);
  assert.ok(jours.some((j) => j.jour === "2026-09-22" && j.flux === 0 && j.source === "saisie"));
  const e = etatCycle(jours, "2026-09-22");
  assert.equal(e.cycles[e.cycles.length - 1]!.debut, "2026-09-22");
  const pv = e.prevision;
  assert.ok(pv.possible && pv.centre > "2026-10-15");
  const r = rappelsRegles(jours, TOUT, maintenant);
  assert.deepEqual(r.map((x) => x.id), [idRappelRegles(0), idRappelRegles(1), idRappelRegles(2)]);
  assert.ok(r.every((x) => x.quand > L(2026, 10, 15)), "reprogrammés à la nouvelle prévision");
});

test("rien sans suivi, sans rappel, sans prévision", async () => {
  const db = await baseCycles();
  const jours = await lireJoursCycle(db);
  const t0 = L(2026, 9, 10);
  assert.equal(rappelsRegles(jours, { ...TOUT, suivi: false }, t0).length, 0);
  assert.equal(rappelsRegles(jours, { ...TOUT, rappel: false }, t0).length, 0);
  assert.equal(rappelsRegles(jours, { ...TOUT, prevision: false }, t0).length, 0);
  assert.equal(rappelsRegles([], TOUT, t0).length, 0, "aucun cycle : pas de prévision");
  // le réglage : allumé par défaut avec le suivi, jamais sans lui, coupable
  assert.equal((await lireReglagesCycle(db)).rappel, true);
  await ecrireReglageCycle(db, "rappel", false);
  assert.equal((await lireReglagesCycle(db)).rappel, false);
  await ecrireReglageCycle(db, "rappel", true);
  await ecrireReglageCycle(db, "suivi", false);
  assert.equal((await lireReglagesCycle(db)).rappel, false);
});

test("le toucher du rappel ouvre le suivi du cycle", () => {
  assert.equal(cibleNotif(idRappelRegles(1)), "cycle");
});

test("aucune sortie réseau : ni le module du rappel ni sa logique n'appellent le serveur", () => {
  for (const f of ["../src/cycle/rappel-regles.ts", "../src/natif/rappel-regles/index.native.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/fetch\(|XMLHttpRequest|\.requete\(|acces\(|WebSocket|sync\/|majJetonNotif/.test(src), f);
  }
  // le réglage ne voyage pas non plus
  const schema = readFileSync(new URL("../src/sync/schema.ts", import.meta.url), "utf8");
  assert.ok(!schema.includes("cycle_rappel_regles"));
});
