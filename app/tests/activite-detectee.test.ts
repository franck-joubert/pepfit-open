// Activités détectées : effort net d'après la FC et les pas (seuils), aucune marche ordinaire, sources Whoop et Santé
// Connect sans sport, sans doublon ni séance déjà là, ignorées ; kcal d'après la FC ; kcal d'une activité ignorée comptées
// une fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activesDepuisBrutes, activitesDuJour, chevauchement, kcalBrutesSelonFc, detecterEfforts, estMarcheOrdinaire, kcalQuotidienIgnorees, kcalSelonFc, pasSur, SEUILS, type Effort,
} from "../src/ecrans/activite-detectee.ts";

const MIN = 60_000;
const T0 = new Date(2026, 9, 27, 18, 0).getTime();
const profil = { fcRepos: 55, fcMax: 185 };
// seuil : 55 + 0,4 × 130 = 107 bpm ; marche : 55 + 0,5 × 130 = 120 bpm

/** FC toutes les `pas` minutes de `de` à `a` (minutes depuis T0). */
const serie = (de: number, a: number, bpm: (m: number) => number, pas = 1) =>
  Array.from({ length: Math.floor((a - de) / pas) + 1 }, (_, i) => ({ t: T0 + (de + i * pas) * MIN, bpm: bpm(de + i * pas) }));
const pasMinute = (de: number, a: number, parMin: number) => [{ debut: T0 + de * MIN, fin: T0 + a * MIN, n: parMin * (a - de) }];

test("padel d'une heure, FC 140, peu de pas : un effort de 18 h 05 à 19 h 05", () => {
  const fc = [...serie(0, 4, () => 72), ...serie(5, 65, () => 140), ...serie(66, 80, () => 80)];
  const l = detecterEfforts(fc, pasMinute(5, 65, 25), profil);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.debut, T0 + 5 * MIN);
  assert.equal(l[0]!.fin, T0 + 65 * MIN);
  assert.equal(l[0]!.fcMoy, 140);
  assert.equal(l[0]!.pas, 1500);
});

test("marche ordinaire de 45 min (FC 100, 105 pas/min) : rien ; marche rapide en côte (FC 128) : un effort", () => {
  assert.equal(detecterEfforts(serie(0, 45, () => 100), pasMinute(0, 45, 105), profil).length, 0);
  // FC au-dessus du seuil d'effort mais sous celui de la marche : toujours une marche de tous les jours
  assert.equal(detecterEfforts(serie(0, 45, () => 115), pasMinute(0, 45, 105), profil).length, 0);
  assert.equal(detecterEfforts(serie(0, 45, () => 128), pasMinute(0, 45, 110), profil).length, 1);
  assert.equal(estMarcheOrdinaire(105, 0.45), true);
  assert.equal(estMarcheOrdinaire(30, 0.45), false);
  assert.equal(estMarcheOrdinaire(null, 0.3), false);
});

test("seuils : 14 min d'effort ne suffisent pas, 15 oui ; sous 40 % de la réserve, rien", () => {
  assert.equal(detecterEfforts(serie(0, 14, () => 130), [], profil).length, 0);
  assert.equal(detecterEfforts(serie(0, 15, () => 130), [], profil).length, 1);
  assert.equal(detecterEfforts(serie(0, 60, () => 105), [], profil).length, 0);
  assert.equal(SEUILS.DUREE_MIN, 15 * MIN);
});

test("pauses : 3 min sous le seuil ne coupent pas l'effort, 5 min oui (deux efforts trop courts)", () => {
  const avecPause = (p: number) => [...serie(0, 10, () => 135), ...serie(11, 10 + p, () => 95), ...serie(11 + p, 22 + p, () => 135)];
  assert.equal(detecterEfforts(avecPause(3), [], profil).length, 1);
  assert.equal(detecterEfforts(avecPause(5), [], profil).length, 0);
});

test("FC trop rare (toutes les 10 min) : pas de détection, on n'invente rien", () => {
  assert.equal(detecterEfforts(serie(0, 60, () => 140, 10), [], profil).length, 0);
  assert.equal(detecterEfforts(serie(0, 60, () => 140, 5), [], profil).length, 1);
});

test("près d'une séance (échauffement, retour au calme) ou pendant le sommeil : rien", () => {
  const fc = serie(0, 40, () => 135);
  assert.equal(detecterEfforts(fc, [], profil, [{ debut: T0 + 45 * MIN, fin: T0 + 100 * MIN }]).length, 0);
  assert.equal(detecterEfforts(fc, [], profil, [{ debut: T0 + 60 * MIN, fin: T0 + 100 * MIN }]).length, 1);
});

const whoop = (o: Partial<Parameters<typeof activitesDuJour>[0]["whoop"][number]> = {}) => ({
  id: "w1", debut: T0, fin: T0 + 65 * MIN, sportId: -1, charge: 200, fcMoy: 138, fcMax: 171, kcal: 540, seanceId: null, ...o,
});
const vide = { whoop: [], sante: [], pepfit: [], seances: [], ignorees: [] };

test("Whoop : une activité non nommée devient une activité détectée ; nommée, rattachée ou courte, non", () => {
  const [a] = activitesDuJour({ ...vide, whoop: [whoop()] });
  assert.equal(a!.cle, "whoop:w1");
  assert.equal(a!.source, "whoop");
  assert.equal(a!.fcMoy, 138);
  assert.equal(a!.sportBrut, "whoop:-1");
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop({ sportId: 71 })] }).length, 1);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop({ sportId: 249 })] }).length, 0);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop({ seanceId: "s1" })] }).length, 0);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop({ fin: T0 + 8 * MIN })] }).length, 0);
});

test("Whoop non nommée faite en marchant et sous 100 points d'Effort pepfit : marche de tous les jours, pas une activité", () => {
  const pasJour = pasMinute(0, 65, 100);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop({ charge: 65 })], pasJour }).length, 0);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop({ charge: 150 })], pasJour }).length, 1);
});

test("Santé Connect : « autre entraînement » d'une autre appli ; un sport nommé ou une séance de pepfit, non", () => {
  const sc = { debut: T0, fin: T0 + 40 * MIN, type: 0, origine: "com.sec.android.app.shealth", kcal: 310, pas: 900 };
  const [a] = activitesDuJour({ ...vide, sante: [sc] });
  assert.equal(a!.source, "sante");
  assert.equal(a!.kcal, 310);
  assert.equal(a!.pas, 900);
  assert.equal(activitesDuJour({ ...vide, sante: [{ ...sc, type: 56 }] }).length, 0);
  assert.equal(activitesDuJour({ ...vide, sante: [{ ...sc, origine: "fit.pep" }] }).length, 0);
});

test("une même activité vue par Whoop, la montre et pepfit n'en fait qu'une (Whoop), complétée des pas de la montre", () => {
  const sc = { debut: T0 + 2 * MIN, fin: T0 + 63 * MIN, type: 0, origine: "com.sec.android.app.shealth", kcal: 500, pas: 1400 };
  const p: Effort = { debut: T0 + 4 * MIN, fin: T0 + 60 * MIN, fcMoy: 136, fcMax: 168, pas: 1300 };
  const l = activitesDuJour({ ...vide, whoop: [whoop()], sante: [sc], pepfit: [p] });
  assert.equal(l.length, 1);
  assert.equal(l[0]!.source, "whoop");
  assert.equal(l[0]!.kcal, 540);
  assert.equal(l[0]!.pas, 1400);
});

test("une activité qui touche une séance (à 10 min près) est cette séance ; une ignorée ne revient pas", () => {
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop()], seances: [{ debut: T0 + 70 * MIN, fin: T0 + 120 * MIN }] }).length, 0);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop()], seances: [{ debut: T0 + 80 * MIN, fin: T0 + 120 * MIN }] }).length, 1);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop()], ignorees: [{ debut: T0 + 5 * MIN, fin: T0 + 60 * MIN }] }).length, 0);
  assert.equal(activitesDuJour({ ...vide, whoop: [whoop()], ignorees: [{ debut: T0 + 50 * MIN, fin: T0 + 90 * MIN }] }).length, 1);
});

test("plusieurs activités dans la journée : dans l'ordre", () => {
  const matin = whoop({ id: "w0", debut: T0 - 10 * 60 * MIN, fin: T0 - 10 * 60 * MIN + 25 * MIN });
  assert.deepEqual(activitesDuJour({ ...vide, whoop: [whoop(), matin] }).map((a) => a.cle), ["whoop:w0", "whoop:w1"]);
});

test("chevauchement et pas d'une plage au prorata", () => {
  assert.equal(chevauchement({ debut: 0, fin: 10 }, { debut: 5, fin: 30 }), 0.5);
  assert.equal(chevauchement({ debut: 0, fin: 10 }, { debut: 10, fin: 30 }), 0);
  assert.equal(pasSur({ debut: 0, fin: 30 * MIN }, [{ debut: 0, fin: 60 * MIN, n: 6000 }]), 3000);
  assert.equal(pasSur({ debut: 0, fin: 30 * MIN }, []), null);
});

test("kcal d'après la FC (Keytel 2005) : homme de 39 ans, 79 kg, FC 138 pendant 65 min ; sans âge, null", () => {
  // brut : (−55,0969 + 0,6309 × 138 + 0,1988 × 79 + 0,2017 × 39) / 4,184 ≈ 13,27 kcal/min × 65 ≈ 863 ; moins 79 kcal de
  // métabolisme (1 750 kcal/j) : 784
  assert.equal(kcalSelonFc(138, 65, { kg: 79, age: 39, sexe: "h" }, 1750), 784);
  assert.equal(kcalSelonFc(138, 65, { kg: 79, age: null, sexe: "h" }, 1750), null);
  // FC basse : jamais négatif
  assert.equal(kcalSelonFc(60, 30, { kg: 79, age: 39, sexe: "f" }, 1750), 0);
  // brutes gardées en base, actives au calcul de la journée
  const brutes = kcalBrutesSelonFc(138, 65, { kg: 79, age: 39, sexe: "h" })!;
  assert.equal(Math.round(activesDepuisBrutes(brutes, 65, 1750)), 784);
});

test("activité ignorée : ses kcal restent dans la journée, comptées une fois (au-delà de ses pas)", () => {
  // 540 kcal mesurées, 1 400 pas à 0,04 kcal = 56 kcal déjà dans les pas : 484 de plus au quotidien
  assert.equal(kcalQuotidienIgnorees([{ kcal: 540, pas: 1400 }], 0.04), 484);
  // une marche dont les pas valent plus que les kcal mesurées n'ajoute rien
  assert.equal(kcalQuotidienIgnorees([{ kcal: 60, pas: 3000 }], 0.04), 0);
  assert.equal(kcalQuotidienIgnorees([{ kcal: null, pas: 800 }], 0.04), 0);
});
