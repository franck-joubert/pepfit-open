// VMA, allures et VO2max (NOTES-VMA.md) : test demi-Cooper, estimation depuis les courses GPS, VO2max (3,5 × VMA, Uth),
// catégorie pour l'âge et le sexe (FRIEND 2015).
import assert from "node:assert/strict";
import { test } from "node:test";
import { allureTexte } from "../src/natif/suivi/logique.ts";
import {
  allureA, allures, categorieVo2, estimerVma, FRIEND_2015, ligneNormes, meilleurePortion, partTenue, percentileVo2, vmaDemiCooper,
  vmaEnCours, vmaRetenue, vo2maxDeVma, vo2maxRetenue, vo2maxUth, type CourseGps,
} from "../src/ecrans/mesures/vma-calc.ts";

const JOUR = 86_400_000;
const T0 = new Date(2026, 9, 24, 9, 0).getTime();
const M_PAR_DEGRE = (6_371_008.8 * Math.PI) / 180;

/** Course vers le nord, un point par seconde : des morceaux [durée (s), vitesse (km/h)] ; vitesse null = pause (rien
 *  d'enregistré, l'horloge avance, le temps de séance non). */
function course(morceaux: [number, number | null][], depart = T0): CourseGps["points"][number][] {
  const pts: CourseGps["points"][number][] = [];
  let t = depart;
  let s = 0;
  let m = 0;
  for (const [duree, kmh] of morceaux) {
    for (let k = 0; k < duree; k++) {
      t += 1000;
      if (kmh == null) continue;
      s += 1000;
      m += kmh / 3.6;
      pts.push({ t, s, lat: 48.85 + m / M_PAR_DEGRE, lon: 5.8037, altBaro: null, altGps: null, precision: 5, vitesse: kmh / 3.6 });
    }
  }
  return pts;
}

const fcConstante = (pts: readonly { t: number }[], bpm: number) => pts.map((p) => ({ t: p.t, bpm }));
const proche = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b} (±${eps})`);

test("demi-Cooper : VMA = distance des 6 min ÷ 100 ; hors de 6 à 26 km/h, rien", () => {
  assert.equal(vmaDemiCooper(1500), 15);
  assert.equal(vmaDemiCooper(1520), 15.2);
  assert.equal(vmaDemiCooper(400), null);
  assert.equal(vmaDemiCooper(2700), null);
  // en direct : la VMA si tu gardes ta vitesse moyenne (750 m en 3 min → 15 km/h) ; rien avant 30 s
  proche(vmaEnCours(750, 180)!, 15, 1e-9);
  assert.equal(vmaEnCours(60, 20), null);
});

test("allures : 95 % de la VMA (exemple d'Alex, 4'12\"/km), cinq allures de la plus lente à la plus rapide", () => {
  assert.equal(allureTexte(allureA(15, 0.95)), "4'13\"");
  assert.equal(allureTexte(allureA(15.04, 0.95)), "4'12\"");
  const l = allures(15);
  assert.deepEqual(l.map((x) => x.id), ["footing", "marathon", "seuil", "long", "court"]);
  assert.deepEqual(l.map((x) => `${allureTexte(x.lente)}–${allureTexte(x.rapide)}`), [
    "6'40\"–5'43\"", "5'00\"–5'00\"", "4'42\"–4'27\"", "4'27\"–4'13\"", "4'00\"–3'49\"",
  ]);
  for (let i = 1; i < l.length; i++) assert.ok(l[i]!.rapide < l[i - 1]!.rapide);
});

test("part de la VMA tenue (Péronnet-Thibault, ancré à 6 min) : 5 min 101 %, 10 min 97 %, 15 min 94 %", () => {
  assert.equal(partTenue(360), 1);
  proche(partTenue(300), 1.0117, 0.0001);
  proche(partTenue(600), 0.9673, 0.0001);
  proche(partTenue(900), 0.9414, 0.0001);
});

test("meilleure portion : les 6 min rapides au milieu d'un footing ; une pause ne gonfle jamais la vitesse", () => {
  const pts = course([[600, 10], [360, 15], [600, 10]]);
  const p = meilleurePortion(pts, [], 360)!;
  proche(p.vitesseKmH, 15, 0.05);
  proche(p.debutS, 600, 2);
  // 3 min à 15, 2 min de pause, 3 min à 15 : sur 6 min d'horloge, jamais plus de 15 km/h
  const avecPause = course([[180, 15], [120, null], [180, 15]]);
  const q = meilleurePortion(avecPause, [], 360)!;
  assert.ok(q.vitesseKmH < 15, `${q.vitesseKmH}`);
  // trop courte pour la portion
  assert.equal(meilleurePortion(course([[200, 15]]), [], 300), null);
});

test("meilleure portion : un saut du GPS (500 m en une seconde) ne compte pas", () => {
  const pts = course([[400, 12]]);
  pts[200] = { ...pts[200]!, lat: pts[200]!.lat + 500 / M_PAR_DEGRE };
  proche(meilleurePortion(pts, [], 360)!.vitesseKmH, 12, 0.1);
});

test("VMA estimée : la meilleure portion corrigée de sa durée ; 10 min à 14,5 km/h → 15,0 km/h", () => {
  const pts = course([[600, 9], [600, 14.5], [300, 9]]);
  const e = estimerVma([{ id: "a", date: T0, points: pts, fc: [] }], 181, T0 + JOUR)!;
  proche(e.vma, 14.5 / partTenue(600), 0.05);
  proche(e.vma, 15.0, 0.05);
  assert.equal(e.portion.dureeS, 600);
  assert.equal(e.courseId, "a");
  assert.equal(e.courses, 1);
});

test("VMA estimée : FC moyenne sous 85 % de la FC max = pas couru à fond, ne compte pas ; au-dessus, compte", () => {
  const pts = course([[600, 9], [600, 13], [300, 9]]);
  const facile: CourseGps = { id: "f", date: T0, points: pts, fc: fcConstante(pts, 140) };
  assert.equal(estimerVma([facile], 181, T0 + JOUR), null);
  const dure: CourseGps = { ...facile, fc: fcConstante(pts, 165) };
  assert.ok(estimerVma([dure], 181, T0 + JOUR));
});

test("VMA estimée : affinée à chaque course (la plus rapide des 90 jours), une course de plus de 90 jours ne compte plus", () => {
  const vieille: CourseGps = { id: "v", date: T0 - 100 * JOUR, points: course([[600, 16]], T0 - 100 * JOUR), fc: [] };
  const lente: CourseGps = { id: "l", date: T0 - 10 * JOUR, points: course([[600, 13]], T0 - 10 * JOUR), fc: [] };
  const rapide: CourseGps = { id: "r", date: T0, points: course([[600, 14]]), fc: [] };
  assert.equal(estimerVma([vieille, lente], 181, T0 + JOUR)!.courseId, "l");
  const e = estimerVma([vieille, lente, rapide], 181, T0 + JOUR)!;
  assert.equal(e.courseId, "r");
  assert.equal(e.courses, 2);
});

test("VMA retenue : un test de moins de 6 mois d'abord ; une estimée plus haute de 3 % propose de le refaire", () => {
  const test6 = { date: T0 - 30 * JOUR, distanceM: 1500 };
  const estimee = (vma: number) => ({ vma, courseId: "r", date: T0, portion: { dureeS: 600, vitesseKmH: vma, debutS: 0, fcMoy: null }, courses: 3 });
  assert.deepEqual(vmaRetenue([test6], estimee(15.2), T0), { vma: 15, source: "test", date: test6.date, refaire: false });
  assert.equal(vmaRetenue([test6], estimee(15.6), T0)!.refaire, true);
  // test de plus de 6 mois : l'estimée prend la place ; sans estimée, le vieux test reste, à refaire
  const vieux = { date: T0 - 200 * JOUR, distanceM: 1500 };
  assert.equal(vmaRetenue([vieux], estimee(14), T0)!.source, "estimee");
  assert.deepEqual(vmaRetenue([vieux], null, T0), { vma: 15, source: "test", date: vieux.date, refaire: true });
  // le plus récent des tests
  assert.equal(vmaRetenue([vieux, test6], null, T0)!.date, test6.date);
  assert.equal(vmaRetenue([], null, T0), null);
});

test("VO2max : 3,5 × VMA quand la VMA existe, sinon Uth (15,3 homme, 14,5 femme, 14,9 sans sexe)", () => {
  assert.equal(vo2maxDeVma(15), 52.5);
  proche(vo2maxUth(181, 50, "h"), 55.39, 0.01);
  proche(vo2maxUth(181, 50, "f"), 52.49, 0.01);
  proche(vo2maxUth(181, 50, null), 53.94, 0.01);
  const vma = { vma: 15, source: "test" as const, date: T0, refaire: false };
  assert.deepEqual(vo2maxRetenue(vma, 181, 50, "h"), { valeur: 52.5, methode: "vma-test" });
  assert.equal(vo2maxRetenue({ ...vma, source: "estimee" }, 181, 50, "h")!.methode, "vma-estimee");
  assert.equal(vo2maxRetenue(null, 181, 50, "h")!.methode, "uth");
  assert.equal(vo2maxRetenue(null, 181, null, "h"), null);
});

test("normes FRIEND 2015 (tableau 3) : médianes du papier, homme 20-29 ans 48,0, femme 70-79 ans 18,3", () => {
  assert.equal(FRIEND_2015.h[0]![3], 48.0);
  assert.equal(FRIEND_2015.f[0]![3], 37.6);
  assert.equal(FRIEND_2015.h[5]![3], 24.4);
  assert.equal(FRIEND_2015.f[5]![3], 18.3);
  for (const s of ["h", "f"] as const) for (const l of FRIEND_2015[s]) for (let k = 1; k < l.length; k++) assert.ok(l[k]! > l[k - 1]!);
});

test("catégorie : Alex (39 ans, 52,5) mieux que 81 % des hommes de son âge, « très bonne » ; la même valeur à 25 ans, « bonne »", () => {
  proche(percentileVo2(52.5, 39, "h"), 81.8, 0.1);
  assert.equal(categorieVo2(52.5, 39, "h"), "tresBonne");
  assert.equal(categorieVo2(52.5, 25, "h"), "bonne");
  // femme de 39 ans, 52,5 : au-delà du 95e percentile
  assert.equal(percentileVo2(52.5, 39, "f"), 95);
  assert.equal(categorieVo2(52.5, 39, "f"), "excellente");
  assert.equal(categorieVo2(30, 39, "h"), "faible");
  assert.equal(percentileVo2(20, 39, "h"), 5);
});

test("normes : moins de 20 ans → ligne 20-29, plus de 79 → 70-79, sans âge 40 ans, sans sexe la moyenne des deux", () => {
  assert.deepEqual(ligneNormes(17, "h"), FRIEND_2015.h[0]);
  assert.deepEqual(ligneNormes(85, "f"), FRIEND_2015.f[5]);
  assert.deepEqual(ligneNormes(null, "h"), FRIEND_2015.h[2]);
  proche(ligneNormes(45, null)[3]!, (37.8 + 26.7) / 2, 1e-9);
});

test("rampe : cinq segments égaux, le repère interpolé dans le sien (52,9 chez un homme de 39 ans : dans « très bonne »)", async () => {
  const { bornesRampe, positionRampe } = await import("../src/ecrans/mesures/vma-calc.ts");
  assert.deepEqual(bornesRampe(39, "h"), [27.2, 35.9, 42.4, 49.2, 56.5, 59.8]);
  const p = positionRampe(52.9, 39, "h");
  assert.ok(p > 0.6 && p < 0.8, `${p}`);
  proche(p, (3 + (52.9 - 49.2) / (56.5 - 49.2)) / 5, 1e-9);
  assert.equal(positionRampe(10, 39, "h"), 0);
  assert.equal(positionRampe(80, 39, "h"), 1);
});
