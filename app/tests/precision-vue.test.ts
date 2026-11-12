// Textes de la précision pepfit : ceux de la planche validée (planches/precision), sur les comptes inventés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculer, etapeRapide, type DonneesPrecision } from "../src/precision/modele.ts";
import { detailEtape, ligneCarte, lignesTout, manquesPour, sousCalcul, sousTitreFeuille, texteManque } from "../src/precision/vue.ts";
import type { FaitsPrecision } from "../src/precision/lire.ts";

const vide: DonneesPrecision = {
  naissance: null, sexe: false, taille: false, poidsJours: null, semainesPesees: 0, tourJours: null, navyJours: null, grasSource: null, grasJours: null,
  capteur: null, nuits14: 0, pas14: 0, fcSeances28: 0, fcMax: "defaut", vma: null,
  semainesActives: 0, seances8: 0, muscu8: null, choixReco: 0, nut30: 0, nut60: 0, nut28: 0, objectifPoids: false, semainesHistorique: 0,
};
const alex: DonneesPrecision = {
  ...vide, naissance: "date", sexe: true, taille: true, poidsJours: 5, semainesPesees: 3,
  capteur: "sc", nuits14: 6, nuitsAvant: 5, pas14: 13, pasAutorises: true, fcSeances28: 1, fcMax: "age", vma: "gps", court: true,
  semainesActives: 3, seances8: 11, muscu8: 6, choixReco: 2, nut30: 12, nut60: 8, nut28: 11, objectifPoids: true, semainesHistorique: 12,
};
const neuf: DonneesPrecision = { ...vide, naissance: "annee", sexe: true, taille: true, poidsJours: 0, semainesPesees: 1, fcMax: "age" };
const f: FaitsPrecision = { whoop: false, vmaDate: null, recalee: false, grasNavy: null, femme: false };

test("carte du volet : « Portrait, +5 % avec ton tour de taille »", () => {
  const r = calculer(alex);
  assert.deepEqual(ligneCarte(r, etapeRapide(alex)), { gain: "+5 %", texte: "avec ton tour de taille" });
});

test("tes calculs : ce que chaque calcul sait déjà (Alex et Noa)", () => {
  const r = calculer(alex);
  const s = (id: Parameters<typeof sousCalcul>[0]) => sousCalcul(id, alex, f, r);
  assert.equal(s("depense"), "Profil complet, pas de Santé Connect");
  assert.equal(s("objectifs"), "Calculés sur ton profil");
  assert.equal(s("bilan"), "12 jours de repas sur 30");
  assert.equal(s("zones"), "FC max d'après ton âge");
  assert.equal(s("effort"), "1 séance avec FC sur 4");
  assert.equal(s("vo2"), "Courses GPS sans FC");
  assert.equal(s("age"), "Il manque ton tour de taille ou 1 nuit");
  assert.equal(s("composition"), "Ni tour de taille, ni masse grasse");
  assert.equal(s("sommeil"), "6 nuits mesurées sur 14");
  assert.equal(s("rm"), "6 séances de muscu en 8 semaines");
  assert.equal(s("reco"), "2 choix appris");
  const n = calculer(neuf);
  assert.equal(sousCalcul("depense", neuf, f, n), "Profil, sans les pas");
  assert.equal(sousCalcul("depense", vide, f, calculer(vide)), "Profil incomplet");
  assert.equal(sousCalcul("age", vide, f, calculer(vide)), "Il faut ton profil et une montre");
  assert.equal(sousCalcul("bilan", neuf, f, n), "Aucun repas noté");
  assert.match(sousCalcul("age", neuf, f, n), /^Il faut une montre et /);
  assert.equal(sousCalcul("sommeil", neuf, f, n), "Pas de montre");
  assert.equal(sousCalcul("effort", neuf, f, n), "Sans montre, d'après la durée");
});

test("étapes : où l'on en est et le temps qu'il faut", () => {
  assert.equal(detailEtape("repas", alex), "12 jours sur 30, en 30 jours");
  assert.equal(detailEtape("tour", alex), "et ton cou, au mètre ruban");
  assert.equal(detailEtape("tour", alex, true), "ton cou et tes hanches, au mètre ruban");
  assert.equal(detailEtape("nuits", alex), "6 nuits sur 14, en 2 semaines");
  assert.equal(detailEtape("repas", alex, false, "depense"), "11 jours sur 28, recalage dès 14");
});

test("lecture en attente : l'une ou l'autre suffit (tour de taille, 1 nuit ; la planche disait 3, écrit à la main)", () => {
  const m = manquesPour(alex, "age", 60)!;
  assert.equal(m.mode, "seule");
  assert.deepEqual(m.l.map(texteManque), ["ton tour de taille", "1 nuit"]);
  assert.equal(manquesPour({ ...alex, tourJours: 0, navyJours: 0 }, "age", 60), null);
});

test("feuille du sommeil : « D'après 6 nuits de Santé Connect sur 14 »", () => {
  assert.equal(sousTitreFeuille("sommeil", alex, f, calculer(alex)), "D'après 6 nuits de Santé Connect sur 14");
  assert.equal(sousTitreFeuille("depense", alex, f, calculer(alex)), "D'après ton profil, tes pas et ton poids");
});

test("tout ce qui compte : chaque donnée, son état, son gain (planche, Alex)", () => {
  const l = lignesTout(alex);
  const g = Object.fromEntries(l.map((x) => [x.cle, x.gain?.affiche ?? null]));
  assert.deepEqual(g, { profil: null, poids: 2, tour: 5, pas: null, nuits: 5, fc: 7, semaines: null, repas: 10, vma: 4 });
  assert.equal(l.find((x) => x.cle === "poids")!.sous, "Pesé il y a 5 jours, 3 semaines sur 4");
  assert.equal(l.find((x) => x.cle === "vma")!.sous, "Jamais fait, courses GPS sans FC");
});
