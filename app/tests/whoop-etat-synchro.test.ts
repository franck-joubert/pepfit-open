// Synchro Whoop en cours vue de partout (29/10) : l'icône « actualiser » de Connexions tourne aussi pour la première synchro
// lancée au retour de la connexion ; l'état revient au repos même si la synchro échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { abonnerSynchro, pendantSynchro, synchroEnCours } from "../src/whoop/etat-synchro.ts";

test("en cours pendant la synchro, prévenu au début et à la fin, au repos même après un échec", async () => {
  const vus: boolean[] = [];
  const fin = abonnerSynchro(() => vus.push(synchroEnCours()));
  assert.equal(synchroEnCours(), false);
  let liberer!: () => void;
  const p = pendantSynchro(() => new Promise<string>((r) => (liberer = () => r("ok"))));
  assert.equal(synchroEnCours(), true);
  const q = pendantSynchro(async () => Promise.reject(new Error("panne"))).catch((e: Error) => e.message);
  assert.equal(await q, "panne");
  assert.equal(synchroEnCours(), true, "la première tourne encore");
  liberer();
  assert.equal(await p, "ok");
  assert.equal(synchroEnCours(), false);
  assert.deepEqual(vus, [true, true, true, false]);
  fin();
  await pendantSynchro(async () => 1);
  assert.equal(vus.length, 4, "désabonné");
});
