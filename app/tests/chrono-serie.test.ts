// Chrono d'une série en durée (D16) : bug du 29/10 (série prévue 1:00, le chrono comptait 1:01, 1:02… et la durée prévue
// s'ajoutait au temps fait ; plein écran : le grand ▶ ne lançait pas le chrono).
import assert from "node:assert/strict";
import { test } from "node:test";
import { affichageChrono, aUnChrono, arreterChrono, basculerChrono, chronoDe, cibleAtteinte, ecartCible, ecouleS, ecouterChronos, prochaineFinCible, toucherChrono } from "../src/ecrans/chrono-serie.ts";

const T0 = 1_000_000;
const s = (n: number) => n * 1000;

test("série prévue 1:00 : le chrono part de zéro, la durée enregistrée est le temps fait, jamais ajouté à la cible", () => {
  // La case affiche la cible (1:00) ; ▶ ne la reprend pas comme point de départ.
  basculerChrono("a", 60, T0);
  assert.equal(ecouleS(chronoDe("a")!, T0 + s(1)), 1);
  assert.equal(arreterChrono("a", T0 + s(45)), 45);
  // Arrêté : plus rien à arrêter (la coche valide alors la valeur saisie).
  assert.equal(chronoDe("a"), undefined);
  assert.equal(arreterChrono("a", T0 + s(50)), null);
});

test("la vibration part quand le temps fait atteint la cible, une seule fois, pas au lancement", () => {
  basculerChrono("b", 60, T0);
  assert.equal(cibleAtteinte("b", 60, T0 + s(1)), false);
  assert.equal(cibleAtteinte("b", 60, T0 + s(59.9)), false);
  assert.equal(cibleAtteinte("b", 60, T0 + s(60)), true);
  assert.equal(cibleAtteinte("b", 60, T0 + s(61)), false);
  // Le dépassement continue de compter.
  assert.equal(arreterChrono("b", T0 + s(72)), 72);
  // Sans cible : pas de vibration.
  basculerChrono("b2", null, T0);
  assert.equal(cibleAtteinte("b2", null, T0 + s(600)), false);
  arreterChrono("b2", T0 + s(600));
});

test("pause et reprise : le temps en pause ne compte pas", () => {
  basculerChrono("c", 60, T0);
  basculerChrono("c", 60, T0 + s(20));
  assert.equal(chronoDe("c")!.debut, null);
  assert.equal(ecouleS(chronoDe("c")!, T0 + s(25)), 20);
  basculerChrono("c", 60, T0 + s(30));
  assert.equal(arreterChrono("c", T0 + s(50)), 40);
});

test("toucher le chrono l'arrête pour corriger ; relancé, il repart du temps corrigé (et seulement dans ce cas)", () => {
  basculerChrono("d", 60, T0);
  assert.equal(toucherChrono("d", T0 + s(47)), 47);
  assert.equal(chronoDe("d"), undefined);
  // Corrigé à 0:45 dans la case : ▶ reprend à 45 s. La case (la cible lue par la vibration) vaut maintenant le temps
  // mesuré : pas de vibration aussitôt la reprise.
  basculerChrono("d", 45, T0 + s(100));
  assert.equal(cibleAtteinte("d", 45, T0 + s(101)), false);
  assert.equal(arreterChrono("d", T0 + s(110)), 55);
  // Validée : la reprise est oubliée ; un nouveau ▶ sur la même série repart de zéro.
  basculerChrono("d", 55, T0 + s(200));
  assert.equal(arreterChrono("d", T0 + s(203)), 3);
});

test("une seconde au moins ; une série jamais lancée n'a pas de chrono", () => {
  basculerChrono("e", 30, T0);
  assert.equal(arreterChrono("e", T0 + 200), 1);
  assert.equal(arreterChrono("jamais", T0), null);
  assert.equal(toucherChrono("jamais", T0), null);
});

test("les écrans sont prévenus à chaque lancement, pause et arrêt (ligne et grand ▶ du plein écran partagent le chrono)", () => {
  let n = 0;
  const fin = ecouterChronos(() => n++);
  basculerChrono("f", 60, T0);
  basculerChrono("f", 60, T0 + s(5));
  arreterChrono("f", T0 + s(6));
  assert.equal(n, 3);
  fin();
  basculerChrono("f", 60, T0);
  assert.equal(n, 3);
  arreterChrono("f", T0 + s(1));
});

test("grand ▶ du plein écran : chrono pour les natures avec un temps, pas pour les répétitions ni poids et distance", () => {
  assert.deepEqual(
    (["poids_reps", "reps", "leste", "assiste", "duree", "duree_poids", "distance_duree", "poids_distance"] as const).filter(aUnChrono),
    ["duree", "duree_poids", "distance_duree"],
  );
});

test("compte à rebours (planche seance-duree, D1 A) : depuis la cible, puis le dépassement à part, en vert", () => {
  basculerChrono("g", 60, T0, 60);
  assert.deepEqual(affichageChrono("g", T0), { texte: "1:00", depasse: false, ecouleS: 0, reste: 1, marche: true });
  assert.equal(affichageChrono("g", T0 + 900)!.texte, "1:00");
  const a = affichageChrono("g", T0 + s(18))!;
  assert.equal(a.texte, "0:42");
  assert.ok(Math.abs(a.reste! - 0.7) < 1e-9);
  assert.deepEqual(affichageChrono("g", T0 + s(60)), { texte: "+0:00", depasse: true, ecouleS: 60, reste: 0, marche: true });
  assert.equal(affichageChrono("g", T0 + s(67))!.ecouleS, 67);
  assert.equal(affichageChrono("g", T0 + s(67))!.texte, "+0:07");
  // Le temps enregistré est le temps réel : 1:07, pas 1:00 + 1:07.
  assert.equal(arreterChrono("g", T0 + s(67)), 67);
  assert.equal(affichageChrono("g", T0), null);
});

test("sans cible, le chrono monte ; en pause, il le dit ; une reprise après correction n'a plus de cible", () => {
  basculerChrono("h", null, T0);
  assert.deepEqual(affichageChrono("h", T0 + s(5)), { texte: "0:05", depasse: false, ecouleS: 5, reste: null, marche: true });
  basculerChrono("h", null, T0 + s(5));
  assert.equal(affichageChrono("h", T0 + s(9))!.marche, false);
  arreterChrono("h", T0 + s(9));
  basculerChrono("k", 60, T0, 60);
  toucherChrono("k", T0 + s(20));
  basculerChrono("k", 20, T0 + s(30), 20);
  assert.deepEqual(affichageChrono("k", T0 + s(32)), { texte: "0:22", depasse: false, ecouleS: 22, reste: null, marche: true });
  arreterChrono("k", T0 + s(32));
});

test("échéance de l'alerte (son, écran verrouillé) : le premier chrono en marche avant sa cible, aucune en pause", () => {
  assert.equal(prochaineFinCible(T0), null);
  basculerChrono("m", 60, T0, 60);
  basculerChrono("n", 45, T0 + s(10), 45);
  assert.equal(prochaineFinCible(T0 + s(10)), T0 + s(55));
  basculerChrono("n", 45, T0 + s(20));
  assert.equal(prochaineFinCible(T0 + s(20)), T0 + s(60));
  assert.ok(cibleAtteinte("m", 60, T0 + s(60)));
  assert.equal(prochaineFinCible(T0 + s(61)), null);
  arreterChrono("m", T0 + s(61));
  arreterChrono("n", T0 + s(61));
});

test("écart à la cible sous le temps enregistré : +7 s, −12 s, +1:05 ; rien sans cible ou à la seconde près", () => {
  assert.equal(ecartCible(67, 60), "+7 s");
  assert.equal(ecartCible(48, 60), "−12 s");
  assert.equal(ecartCible(125, 60), "+1:05");
  assert.equal(ecartCible(60, 60), "");
  assert.equal(ecartCible(67, null), "");
  assert.equal(ecartCible(null, 60), "");
});
