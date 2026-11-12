// Course guidée (planche seance-duree § 3) : étapes depuis la routine, avancement à la distance ou au temps, reste, annonce.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annonceEtape, avancer, cibleEtape, ETAT_INITIAL, etapesDeRoutine, etatDesTours, fini, lignesCourse, lignesFeuille, nomEtape, passer, resteEtape, verdictZone, type LigneCourse,
} from "../src/ecrans/etapes-course.ts";

// « Fractionné 6 × 1 km » (Marathon) : 15 min Z2, 6 × 1 km Z4 récup 1:30, 10 min Z2.
const FRACTIONNE: LigneCourse[] = [
  { reposS: 0, zone: 2, cibles: [{ distanceM: null, dureeS: 900 }] },
  { reposS: 90, zone: 4, cibles: Array.from({ length: 6 }, () => ({ distanceM: 1000, dureeS: null })) },
  { reposS: 0, zone: 2, cibles: [{ distanceM: null, dureeS: 600 }] },
];

test("étapes : échauffement, 6 efforts numérotés et 5 récups entre eux, retour au calme (13 étapes)", () => {
  const e = etapesDeRoutine(FRACTIONNE);
  assert.equal(e.length, 13);
  assert.deepEqual(e.map(nomEtape), ["Échauffement", "1/6", "Récup", "2/6", "Récup", "3/6", "Récup", "4/6", "Récup", "5/6", "Récup", "6/6", "Retour au calme"]);
  assert.deepEqual([cibleEtape(e[0]!), cibleEtape(e[1]!), cibleEtape(e[2]!)], ["15:00", "1 km", "1:30"]);
  assert.deepEqual([e[1]!.zone, e[2]!.zone], [4, 1]);
});

test("avancement : au temps pour l'échauffement, à la distance pour les efforts ; la suivante part de la cible", () => {
  const e = etapesDeRoutine(FRACTIONNE);
  let r = avancer(e, ETAT_INITIAL, 2500, 899);
  assert.equal(r.change, false);
  r = avancer(e, r.etat, 2610, 905);
  assert.deepEqual([r.change, r.etat.i, r.etat.debutS, r.etat.debutM], [true, 1, 900, 2610]);
  assert.deepEqual(resteEtape(e, r.etat, 2610 + 580, 1150), { reste: 420, unite: "m", part: 0.42 });
  r = avancer(e, r.etat, 3612, 1146);
  assert.deepEqual([r.change, r.etat.i, r.etat.debutM], [true, 2, 3610]);
  // Récup au temps : 1:30 depuis la fin du km.
  assert.deepEqual(resteEtape(e, r.etat, 3700, 1146 + 42), { reste: 48, unite: "s", part: 48 / 90 });
});

test("« Étape » passe à la suivante maintenant ; après la dernière, fini", () => {
  const e = etapesDeRoutine(FRACTIONNE);
  let x = passer(ETAT_INITIAL, 1200, 420);
  assert.deepEqual(x, { i: 1, debutM: 1200, debutS: 420 });
  for (let k = 0; k < 12; k++) x = passer(x, 0, 0);
  assert.ok(fini(e, x));
  assert.equal(resteEtape(e, x, 0, 0), null);
});

test("annonces vocales : nom, cible dite en mots, zone (pas pour la récup), fin", () => {
  const e = etapesDeRoutine(FRACTIONNE);
  assert.equal(annonceEtape(e[0]), "Échauffement, 15 minutes en zone 2.");
  assert.equal(annonceEtape(e[5]), "3 sur 6, 1 kilomètre en zone 4.");
  assert.equal(annonceEtape(e[6]), "Récup, 1 minute 30.");
  assert.equal(annonceEtape(undefined), "Séance terminée, bravo.");
  assert.equal(annonceEtape({ genre: "effort", rang: null, nom: null, distanceM: 400, dureeS: null, zone: 5, ligne: 0 }), "Effort, 400 mètres en zone 5.");
  assert.equal(annonceEtape({ genre: "effort", rang: null, nom: "Sauts légers", distanceM: null, dureeS: null, zone: null, ligne: 1 }), "Sauts légers.");
});

// Lecture d'une routine (forme de lireRoutine) : zone de la ligne ou de sa note, nom de l'exercice, note.
const ligne = (nom: string, series: { d?: number; s?: number }[], o: { repos?: number; zone?: number | null; note?: string } = {}) => ({
  repos_s: o.repos ?? 0, zone: o.zone ?? null, exercice: { nom }, notes: o.note ? [{ texte: o.note }] : [],
  cibles: series.map((x) => ({ distance_m: x.d ?? null, duree_s: x.s ?? null })),
});

test("course continue 20 min : la marche notée « pour t'échauffer » échauffe, la course qui suit est un effort (pas un retour au calme)", () => {
  const e = etapesDeRoutine(lignesCourse({ blocs: [{ lignes: [ligne("Marche", [{ s: 300 }], { zone: 1, note: "marche rapide pour t'échauffer" })] }, { lignes: [ligne("Course", [{ s: 1200 }], { zone: 2 })] }] }));
  assert.deepEqual(e.map(nomEtape), ["Échauffement", "Course"]);
  assert.equal(annonceEtape(e[1]), "Course, 20 minutes en zone 2.");
});

test("footing et lignes droites : le footing sans note reste un effort ; zone lue dans la note « Z5 » d'un ancien plan", () => {
  const e = etapesDeRoutine(lignesCourse({ blocs: [{ lignes: [ligne("Course", [{ s: 2700 }], { zone: 2 }), ligne("Course", [{ s: 20 }, { s: 20 }], { repos: 60, note: "lignes droites Z5" })] }] }));
  assert.deepEqual(e.map(nomEtape), ["Course", "1/2", "Récup", "2/2"]);
  assert.deepEqual(e.map((x) => x.zone), [2, 5, 1, 5]);
});

test("l'étape en cours se lit sur les tours du suivi (un tour par changement d'étape)", () => {
  assert.deepEqual(etatDesTours([]), ETAT_INITIAL);
  assert.deepEqual(etatDesTours([{ s: 900_400, d: 2610 }, { s: 1_146_000, d: 3612 }]), { i: 2, debutM: 3612, debutS: 1146 });
});

test("verdict : dans la zone, ralentis, accélère ; les 45 premières secondes la FC redescend ou monte", () => {
  assert.deepEqual(verdictZone(4, 4, 200), { genre: "zone", zone: 4 });
  assert.deepEqual(verdictZone(3, 1, 12), { genre: "redescend", zone: 3 });
  assert.deepEqual(verdictZone(3, 1, 60), { genre: "haut", zone: 3 });
  assert.deepEqual(verdictZone(2, 4, 10), { genre: "monte", zone: 2 });
  assert.deepEqual(verdictZone(2, 4, 90), { genre: "bas", zone: 2 });
  assert.equal(verdictZone(0, 4, 90), null);
  assert.equal(verdictZone(3, null, 90), null);
});

test("feuille des étapes : faites une par une, l'étape en cours, puis les efforts à venir d'un bloc sur une ligne", () => {
  const e = etapesDeRoutine(FRACTIONNE);
  const l = lignesFeuille(e, 5);
  assert.deepEqual(l.map((x) => [x.i, x.etat, nomEtape(x.etape), x.jusqua ? nomEtape(x.jusqua) : null]), [
    [0, "faite", "Échauffement", null], [1, "faite", "1/6", null], [2, "faite", "Récup", null], [3, "faite", "2/6", null], [4, "faite", "Récup", null],
    [5, "en_cours", "3/6", null], [6, "a_venir", "Récup", null], [7, "a_venir", "4/6", "6/6"], [12, "a_venir", "Retour au calme", null],
  ]);
  // 4/6 à 6/6 : trois km à 6'00" et deux récups de 1:30.
  assert.equal(l[7]!.prevueS, 3 * 360 + 2 * 90);
  assert.equal(l[7]!.recupS, 90);
});
