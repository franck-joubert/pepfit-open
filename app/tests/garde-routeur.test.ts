// Plantage du routeur après une recréation de l'activité (audit du 28/10, n° 1) : on rejoue l'ordre d'expo-router
// (global-state/routingQueueContext : le pont lie le `router` global au montage, le remet à « indisponible » au démontage).
import assert from "node:assert/strict";
import { test } from "node:test";
import { garderRouteur } from "../src/ui/garde-routeur.ts";

const indisponible = () => {
  throw new Error("The imperative router is unavailable before the first render has finished.");
};
const delie = { navigate: indisponible, push: indisponible, setTransitionMode: () => {} };
const racine = (nom: string, journal: string[]) => ({
  navigate: (h: string) => journal.push(`${nom} navigate ${h}`),
  push: (h: string) => journal.push(`${nom} push ${h}`),
  setTransitionMode: () => {},
});

/** Activité recréée : B se monte, puis A se démonte (le pont de A délie le routeur après que B l'a lié). */
function recreer(router: Record<string, unknown>, garde: boolean, journal: string[]) {
  const a = racine("A", journal);
  const lacherA = garde ? garderRouteur(router, a) : () => {};
  Object.assign(router, a);
  const b = racine("B", journal);
  const lacherB = garde ? garderRouteur(router, b) : () => {};
  Object.assign(router, b);
  Object.assign(router, delie);
  lacherA();
  return lacherB;
}

test("sans garde : la racine démontée en dernier délie le routeur, le toucher suivant plante", () => {
  const router: Record<string, unknown> = { ...delie };
  recreer(router, false, []);
  assert.throws(() => (router.navigate as (h: string) => void)("/food"), /unavailable before the first render/);
});

test("avec la garde : le routeur reste à la racine vivante ; sans racine, il redevient indisponible", () => {
  const journal: string[] = [];
  const router: Record<string, unknown> = { ...delie };
  const avertir = console.warn;
  console.warn = () => {};
  try {
    const lacherB = recreer(router, true, journal);
    (router.navigate as (h: string) => void)("/food");
    (router.push as (h: string) => void)("/session");
    assert.deepEqual(journal, ["B navigate /food", "B push /session"]);
    lacherB();
    assert.throws(() => (router.navigate as (h: string) => void)("/"), /unavailable/);
  } finally {
    console.warn = avertir;
  }
});
