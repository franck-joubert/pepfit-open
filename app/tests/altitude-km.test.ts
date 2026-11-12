// Lot 4 de la planche seance-duree (retour du 29/10) : altitude recalée sur le GPS, lissée, échelle d'au moins
// 20 m ; « Par km » et allure du résumé en temps de mouvement (8'50" par km pour 12'15" au total : l'attente du premier
// point GPS et les arrêts ne comptent pas).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lisserAltitude, parKm, tempsMouvementCumule, distancesCumulees } from "../src/natif/suivi/logique.ts";
import { altitudesRecalees } from "../src/ecrans/suivi-direct-vue.ts";
import { echelleAltitude, vueEffort } from "../src/ecrans/effort-vue.ts";
import type { Point } from "../src/natif/suivi/types.ts";

const M = 1 / 111320;
// Un point par seconde ; `v(s)` : vitesse (m/s) à la seconde s ; vers le nord.
function trace(duree: number, v: (s: number) => number, alt: (s: number) => { baro: number | null; gps: number | null } = () => ({ baro: null, gps: 35 })): Point[] {
  let d = 0;
  return Array.from({ length: duree + 1 }, (_, s) => {
    if (s) d += v(s);
    const a = alt(s);
    return { t: s * 1000, s: s * 1000, lat: 48.85 + d * M, lon: 5.8037, altBaro: a.baro, altGps: a.gps, precision: 4, vitesse: v(s) };
  });
}

test("altitude recalée : le baromètre (-109 m, haute pression) ancré sur le GPS par la médiane des écarts", () => {
  const pts = trace(60, () => 3, (s) => ({ baro: -109 + (s % 3) * 0.5, gps: 35 + ((s * 7) % 9) - 4 }));
  const a = altitudesRecalees(pts) as number[];
  assert.ok(a.every((x) => x > 30 && x < 40), JSON.stringify(a.slice(0, 5)));
  // Les écarts du baromètre (au demi-mètre) restent ceux du baromètre.
  assert.ok(Math.abs(a[1]! - a[0]! - 0.5) < 1e-9);
  // Sans GPS d'altitude : le baromètre brut ; sans baromètre : le GPS.
  assert.deepEqual(altitudesRecalees([{ altBaro: -100, altGps: null, precision: 4 }]), [-100]);
  assert.deepEqual(altitudesRecalees([{ altBaro: null, altGps: 42, precision: 4 }]), [42]);
});

test("lissage : plus long au GPS seul qu'au baromètre ; échelle d'altitude d'au moins 20 m, centrée", () => {
  const bruit = Array.from({ length: 61 }, (_, i) => 35 + (i % 2 ? 8 : -8));
  const lisse = lisserAltitude(bruit, false) as number[];
  assert.ok(Math.abs(lisse[30]! - 35) < 1);
  assert.deepEqual(echelleAltitude(107, 109), { lo: 98, hi: 118 });
  assert.deepEqual(echelleAltitude(20, 80), { lo: 19, hi: 81 });
});

test("temps en mouvement : l'arrêt de 60 s au milieu ne compte pas, le bruit à l'arrêt non plus", () => {
  // 120 s à 3 m/s, 60 s arrêté (0,1 m/s de bruit), 120 s à 3 m/s.
  const pts = trace(300, (s) => (s > 120 && s <= 180 ? 0.1 : 3));
  const mvt = tempsMouvementCumule(pts, distancesCumulees(pts));
  const total = mvt[mvt.length - 1]!;
  assert.ok(total > 235 && total < 250, String(total));
});

test("Par km : l'allure se compte en mouvement ; la FC du km se lit toujours sur ses bornes en temps de séance", () => {
  // 1 km à 4 m/s (250 s), puis 100 s arrêté, puis 1 km à 4 m/s.
  const pts = trace(600, (s) => (s > 250 && s <= 350 ? 0 : 4));
  const km = parKm(pts, 1000);
  // Chaque km garde son allure de course (≈ 250 s/km), même celui qui contient l'arrêt de 100 s…
  for (const k of km.filter((x) => !x.partiel)) assert.ok(Math.abs(k.allure! - 250) < 12, String(k.allure));
  // … dont les bornes, en temps de séance, enjambent l'arrêt (la FC du km s'y lit).
  assert.ok(km.some((k) => k.finS - k.debutS > 340), "bornes en temps de séance (arrêt compris)");
});

test("résumé : allure en mouvement, sans l'attente du premier point (cas d'Alex : 6:09 au total, 0,50 km)", () => {
  // Premier point à 104 s (1:44 sans GPS), puis 0,5 km en 265 s.
  const pts = trace(265, () => 500 / 265).map((p) => ({ ...p, t: p.t + 104000, s: p.s + 104000 }));
  const v = vueEffort({ points: pts, fc: [], bornes: [], denivelePlusM: null, barometre: false }, 369, 181);
  assert.ok(Math.abs(v.dureeMouvementS - 265) < 2);
  assert.ok(Math.abs(v.allure! - 530) < 6, String(v.allure));
  assert.equal(v.dureeS, 369);
});
