// Écran Sommeil : stades et parts du temps au lit, réveils, efficacité calculée, historique par nuit, respiration.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyserNuit, historiqueNuits, moyenneMinutes, moyennePendant } from "../src/ecrans/sommeil-calc.ts";
import { nuit, nuitsParJour } from "../src/natif/sante/logique.ts";

const M = 60_000;
const COUCHE = new Date(2026, 9, 26, 23, 32).getTime();

/** Nuit du 26 au 27/10 (Whoop) recomposée en tranches : 7 h 28 au lit, 2 h 51 éveillé dont l'endormissement. */
function session() {
  const tranches: [number, number][] = [[1, 70], [4, 50], [5, 60], [1, 20], [6, 30], [4, 50], [1, 41], [5, 57], [6, 30], [1, 40], [4, 0]];
  let t = COUCHE;
  const etapes = tranches.filter(([, m]) => m > 0).map(([type, m]) => {
    const e = { debut: t, fin: t + m * M, type };
    t += m * M;
    return e;
  });
  return { debut: COUCHE, fin: t, origine: "com.whoop.android", etapes };
}

test("nuit : stades, parts du temps au lit, réveils entre deux sommeils, efficacité", () => {
  const n = nuit([session()])!;
  const a = analyserNuit(n);
  assert.equal(a.auLitMin, 7 * 60 + 28);
  assert.equal(a.stades!.eveil.minutes, 2 * 60 + 51);
  assert.equal(a.stades!.leger.minutes, 100);
  assert.equal(a.stades!.profond.minutes, 117);
  assert.equal(a.stades!.paradoxal.minutes, 60);
  assert.equal(a.sommeilMin, 100 + 117 + 60);
  assert.equal(a.stades!.leger.part, Math.round((100 / 448) * 100));
  // éveils au milieu : 20 et 41 min (pas l'endormissement, pas le lever)
  assert.equal(a.reveils, 2);
  // endormissement : la première tranche d'éveil (70 min)
  assert.equal(a.latenceMin, 70);
  assert.equal(a.efficacite, Math.round((277 / 448) * 100));
});

test("nuit sans stades : durée seule, ni stades ni réveils", () => {
  const a = analyserNuit(nuit([{ debut: COUCHE, fin: COUCHE + 420 * M, origine: "x", etapes: [] }])!);
  assert.equal(a.stades, null);
  assert.equal(a.reveils, null);
  assert.equal(a.latenceMin, null);
  assert.equal(a.sommeilMin, 420);
  assert.equal(a.efficacite, 100);
});

test("une nuit par jour de réveil, la plus longue ; historique avec les trous", () => {
  // novembre : pas de changement d'heure dans la fenêtre
  const j = (k: number, h: number) => new Date(2026, 10, k, h).getTime();
  const nuits = nuitsParJour([
    { debut: j(24, 23), fin: j(25, 7), origine: "a", etapes: [] },
    { debut: j(25, 1), fin: j(25, 6), origine: "b", etapes: [] },
    { debut: j(26, 0), fin: j(26, 6), origine: "a", etapes: [] },
    { debut: j(26, 14), fin: j(26, 14) + 20 * M, origine: "a", etapes: [] },
  ]);
  assert.equal(nuits.length, 2);
  assert.equal(nuits[0]!.minutes, 480);
  assert.equal(nuits[1]!.minutes, 360);
  const h = historiqueNuits(nuits, 4, j(27, 9));
  assert.deepEqual(h, [null, 480, 360, null]);
  assert.equal(moyenneMinutes(h), 420);
  assert.equal(moyenneMinutes([null]), null);
});

test("respiration : moyenne des mesures de la nuit seulement", () => {
  const n = session();
  assert.equal(moyennePendant([{ valeur: 12, date: n.debut + M }, { valeur: 14, date: n.fin - M }, { valeur: 30, date: n.fin + 3600 * M }], n.debut, n.fin), 13);
  assert.equal(moyennePendant([], n.debut, n.fin), null);
});
