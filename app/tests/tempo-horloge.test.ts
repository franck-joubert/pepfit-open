// Tempos par défaut (D5), horloge du tempo (planche idee-plein-ecran, lots 2 et 3) et courbe du ruban (planche tempo-courbe, A).
import assert from "node:assert/strict";
import { test } from "node:test";
import { dureeRepDefaut, dureeTempo, familleExercice, lireTempo, tempoDefaut, TEMPOS_USINE } from "../src/ecrans/tempo.ts";
import { dureeSerie, etatA, hauteurA, phasesSerie, reperesDepuisHauteurs, repsPrevues, segmentsCourbe, tempsClip, type SegmentCourbe } from "../src/ecrans/tempo-horloge.ts";

test("D5 : 3-0-1-0 polyarticulaire, 2-0-1-0 isolation, mêmes durées que l'estimation", () => {
  const squat = { nom: "Squat (Barre)", slug: "barbell-squat", muscle: "quadriceps" };
  const curl = { nom: "Curl Biceps", slug: null, muscle: "biceps" };
  assert.equal(familleExercice(squat), "poly");
  assert.equal(familleExercice(curl), "isolation");
  assert.equal(tempoDefaut(squat), "3-0-1-0");
  assert.equal(tempoDefaut(curl), "2-0-1-0");
  for (const e of [squat, curl]) assert.equal(dureeTempo(lireTempo(tempoDefaut(e))!), dureeRepDefaut(e));
  // Réglé dans « Guidage » : il prime ; un réglage illisible retombe sur l'usine.
  assert.equal(tempoDefaut(squat, { poly: "4-1-1-0" }), "4-1-1-0");
  assert.equal(tempoDefaut(squat, { poly: "n'importe" }), TEMPOS_USINE.poly);
});

test("phases d'une série : ordre de la notation, phases de 0 s sautées", () => {
  const p = phasesSerie([3, 1, 2, 0], 2);
  assert.deepEqual(p.map((x) => [x.type, x.rep, x.debut, x.duree]), [
    ["descente", 0, 0, 3], ["pauseBas", 0, 3, 1], ["montee", 0, 4, 2],
    ["descente", 1, 6, 3], ["pauseBas", 1, 9, 1], ["montee", 1, 10, 2],
  ]);
  assert.equal(dureeSerie(p), 12);
  assert.deepEqual(phasesSerie([0, 0, 0, 0], 3), []);
});

test("D6 : un clip qui part en bas commence par la montée", () => {
  const p = phasesSerie([2, 0, 1, 1], 1, "bas");
  assert.deepEqual(p.map((x) => x.type), ["montee", "pauseHaut", "descente"]);
});

test("horloge : décompte 3, 2, 1 par phase, avancement, fin de série", () => {
  const p = phasesSerie([3, 1, 2, 0], 8);
  assert.equal(etatA(p, 0)!.restant, 3);
  assert.equal(etatA(p, 0.99)!.restant, 3);
  assert.equal(etatA(p, 1)!.restant, 2);
  assert.equal(etatA(p, 2.5)!.restant, 1);
  const pause = etatA(p, 3.2)!;
  assert.equal(pause.phase.type, "pauseBas");
  assert.equal(pause.restant, 1);
  const montee = etatA(p, 5)!;
  assert.equal(montee.phase.type, "montee");
  assert.ok(Math.abs(montee.p - 0.5) < 1e-9);
  // Rép 2 sur 8 à 6 s.
  assert.equal(etatA(p, 6)!.phase.rep, 1);
  const fin = etatA(p, 48)!;
  assert.ok(fin.fini);
  assert.equal(fin.restant, 0);
  assert.equal(etatA([], 1), null);
});

test("repères d'un clip : point haut et point bas, départ, mouvement trop petit", () => {
  // Squat : part en haut (1), descend au milieu (0), remonte.
  const squat = Array.from({ length: 36 }, (_, i) => Math.cos((i / 36) * 2 * Math.PI) * 0.3 + 1);
  const r = reperesDepuisHauteurs(squat, 2.5)!;
  assert.equal(r.depart, "haut");
  assert.equal(r.haut, 0);
  assert.ok(Math.abs(r.bas - 1.25) < 1e-9);
  // Traction : part bras tendus (bas).
  const traction = squat.map((h) => 2 - h);
  assert.equal(reperesDepuisHauteurs(traction, 2.5)!.depart, "bas");
  // Gainage : rien ne bouge, boucle libre.
  assert.equal(reperesDepuisHauteurs(Array(36).fill(1), 2.5), null);
});

test("temps du clip : descente du haut au bas, pauses figées, montée du bas au haut", () => {
  const r = { haut: 0, bas: 1.25, duree: 2.5, depart: "haut" as const };
  assert.equal(tempsClip(r, "descente", 0), 0);
  assert.ok(Math.abs(tempsClip(r, "descente", 0.5) - 0.625) < 1e-9);
  assert.equal(tempsClip(r, "pauseBas", 0.7), 1.25);
  assert.ok(Math.abs(tempsClip(r, "montee", 0.5) - 1.875) < 1e-9);
  assert.equal(tempsClip(r, "pauseHaut", 0), 0);
  // Point haut en fin de boucle (clip décalé) : la descente passe par la fin et repart du début.
  const d = { haut: 2.0, bas: 0.75, duree: 2.5, depart: "haut" as const };
  assert.ok(Math.abs(tempsClip(d, "descente", 0.5) - 0.125) < 1e-9);
});

// Courbe : [phase, palier, x0, h0, x1, h1].
const traits = (s: SegmentCourbe[]) => s.map((x) => [x.i, x.pause, x.x0, x.h0, x.x1, x.h1]);

test("courbe d'un squat 3-1-2-0 : descend 3 s, tient en bas 1 s, monte 2 s ; la répétition suivante repart d'en haut", () => {
  assert.deepEqual(traits(segmentsCourbe(phasesSerie([3, 1, 2, 0], 2))), [
    [0, false, 0, 1, 3, 0], [1, true, 3, 0, 4, 0], [2, false, 4, 0, 6, 1],
    [3, false, 6, 1, 9, 0], [4, true, 9, 0, 10, 0], [5, false, 10, 0, 12, 1],
  ]);
});

test("courbe d'une traction 3-0-1-1 : part en bas, monte 1 s, tient en haut 1 s, descend 3 s", () => {
  assert.deepEqual(traits(segmentsCourbe(phasesSerie([3, 0, 1, 1], 2, "bas"))), [
    [0, false, 0, 0, 1, 1], [1, true, 1, 1, 2, 1], [2, false, 2, 1, 5, 0],
    [3, false, 5, 0, 6, 1], [4, true, 6, 1, 7, 1], [5, false, 7, 1, 10, 0],
  ]);
});

test("courbe : largeurs proportionnelles au tempo ; une phase à 0 s n'a ni largeur ni palier", () => {
  for (const tempo of [[3, 1, 2, 0], [2, 0, 1, 0], [4, 2, 1, 3], [10, 10, 10, 10]] as const) {
    const s = segmentsCourbe(phasesSerie([...tempo], 1));
    assert.equal(s.reduce((a, x) => a + (x.x1 - x.x0), 0), dureeTempo([...tempo]));
    assert.ok(s.every((x) => x.x1 > x.x0));
    for (let k = 1; k < s.length; k++) assert.deepEqual([s[k]!.x0, s[k]!.h0], [s[k - 1]!.x1, s[k - 1]!.h1]);
  }
  // Tempo d'usine 3-0-1-0 : une rampe qui descend, une qui monte, aucun palier.
  assert.deepEqual(traits(segmentsCourbe(phasesSerie([3, 0, 1, 0], 1))), [[0, false, 0, 1, 3, 0], [1, false, 3, 0, 4, 1]]);
});

test("courbe : une descente à 0 s (0-0-2-0) devient un trait vertical, compté dans la montée qui suit", () => {
  assert.deepEqual(traits(segmentsCourbe(phasesSerie([0, 0, 2, 0], 2))), [[0, false, 0, 0, 2, 1], [1, false, 2, 1, 2, 0], [1, false, 2, 0, 4, 1]]);
  // Montée à 0 s (2-1-0-1) : le saut va dans la pause en haut, mais reste un trait de mouvement.
  assert.deepEqual(traits(segmentsCourbe(phasesSerie([2, 1, 0, 1], 1))), [[0, false, 0, 1, 2, 0], [1, true, 2, 0, 3, 0], [2, false, 3, 0, 3, 1], [2, true, 3, 1, 4, 1]]);
});

test("point du ruban : suit la courbe, se pose au début de la phase (mouvement réduit), reste à la fin après la série", () => {
  const p = phasesSerie([3, 1, 2, 0], 2);
  const proche = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  proche(hauteurA(p, 0), 1);
  proche(hauteurA(p, 1.5), 0.5);
  proche(hauteurA(p, 3), 0);
  proche(hauteurA(p, 3.5), 0);
  proche(hauteurA(p, 5), 0.5);
  proche(hauteurA(p, 6), 1);
  proche(hauteurA(p, 99), 1);
  // Traction : part en bas.
  proche(hauteurA(phasesSerie([3, 0, 1, 1], 1, "bas"), 0), 0);
  // Saut d'une descente à 0 s : au début de la répétition suivante, le point est déjà en bas.
  proche(hauteurA(phasesSerie([0, 0, 2, 0], 2), 2), 0);
  assert.equal(hauteurA([], 1), 0);
});

test("reps prévues : la saisie, sinon le haut de la plage, sinon la série précédente, sinon 10 (▶ jamais mort)", () => {
  const vide = { reps: null, plage_min: null, plage_max: null, precedent_reps: null };
  assert.equal(repsPrevues({ ...vide, reps: 6, plage_max: 12, precedent_reps: 8 }), 6);
  assert.equal(repsPrevues({ ...vide, plage_min: 8, plage_max: 12, precedent_reps: 5 }), 12);
  assert.equal(repsPrevues({ ...vide, plage_min: 8 }), 8);
  assert.equal(repsPrevues({ ...vide, precedent_reps: 7 }), 7);
  assert.equal(repsPrevues(vide), 10);
  assert.equal(repsPrevues({ ...vide, reps: 0, precedent_reps: 7 }), 7);
  assert.ok(phasesSerie([3, 0, 1, 0], repsPrevues(vide)).length > 0);
});
