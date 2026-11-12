// Page d'un exercice et fin de séance (refonte du 26/10) : résumé des séries, défilement, cartes de record, écarts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RecordExercice } from "../src/db/types.ts";
import { etatDefilement, longueurTrace, resumeSeries, traceMini } from "../src/ecrans/exercice-vue.ts";
import { cartesRecords, ecartExercice, ecartRecord, meilleureSerie, mesureRecord, valeurRecord } from "../src/ecrans/fin-seance-vue.ts";

const s = (kg: number | null, reps: number | null) => ({ kg, reps, duree_s: null, distance_m: null });

test("resumeSeries : une charge pour plusieurs séries, PC au poids du corps, réps seules", () => {
  assert.equal(resumeSeries([s(82.5, 8), s(82.5, 7), s(82.5, 7)], ["kg", "reps"], "kg"), "82,5 × 8, 7, 7");
  assert.equal(resumeSeries([s(82.5, 8), s(80, 7)], ["kg", "reps"], "kg"), "82,5 × 8, 80 × 7");
  assert.equal(resumeSeries([s(null, 12), s(0, 10), s(null, 9)], ["kg", "reps"], "kg"), "PC × 12, 10, 9");
  assert.equal(resumeSeries([s(null, 12), s(null, 10)], ["reps"], "kg"), "12, 10 réps");
  assert.equal(resumeSeries([], ["kg", "reps"], "kg"), "");
});

test("etatDefilement : fond quand la 3D passe sous la barre, titre ensuite, courbe repliée en dernier", () => {
  const b = { bas3d: 340, basTitre: 400, basCourbe: 640, barre: 56 };
  assert.deepEqual(etatDefilement(0, b), { fond: false, titre: false, mini: false });
  assert.deepEqual(etatDefilement(300, b), { fond: true, titre: false, mini: false });
  assert.deepEqual(etatDefilement(350, b), { fond: true, titre: true, mini: false });
  assert.deepEqual(etatDefilement(600, b), { fond: true, titre: true, mini: true });
  // Courbe pas encore mesurée : jamais repliée.
  assert.equal(etatDefilement(2000, { ...b, basCourbe: 0 }).mini, false);
});

test("traceMini : du premier au dernier point, plus haut = mieux, inversé pour l'allure", () => {
  assert.equal(traceMini([1, 3], 104, 24), "M2.0 22.0 L102.0 2.0");
  assert.equal(traceMini([1, 3], 104, 24, true), "M2.0 2.0 L102.0 22.0");
  assert.equal(traceMini([5, 5], 104, 24), "M2.0 12.0 L102.0 12.0");
  assert.equal(traceMini([], 104, 24), "");
  assert.equal(longueurTrace([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]), 11);
});

const r = (type: RecordExercice["type"], valeur: number, seance: string, t: number): RecordExercice => ({
  id: `${type}${t}`, exercice_id: "e", type, valeur, serie_id: `s${t}`, seance_id: seance, atteint_le: t, actuel: 0,
});

test("cartesRecords : le record le plus parlant, l'ancien record d'une autre séance pour l'écart", () => {
  const histo = { e: [r("reps", 9, "auj", 30), r("e1rm", 104.5, "auj", 30), r("e1rm", 102, "avant", 20), r("e1rm", 98, "loin", 10)], d: [r("reps", 8, "auj", 31)] };
  const c = cartesRecords("auj", [{ id: "e", nom: "Développé couché", records: ["reps", "e1rm"] }, { id: "d", nom: "Dips", records: ["reps"] }, { id: "x", nom: "Rien", records: [] }], histo);
  assert.deepEqual(c.map((x) => [x.nom, x.type, x.valeur, x.precedent]), [["Développé couché", "e1rm", 104.5, 102], ["Dips", "reps", 8, null]]);
  assert.equal(c[0]!.serieId, "s30");
});

test("valeurRecord, ecartRecord, mesureRecord : chiffres de la carte", () => {
  assert.deepEqual(valeurRecord("e1rm", 104.5, "kg"), { valeur: "104,5", unite: "kg" });
  assert.equal(ecartRecord({ type: "e1rm", valeur: 104.5, precedent: 102 }, "kg"), "+2,5 kg");
  assert.equal(ecartRecord({ type: "reps", valeur: 8, precedent: 6 }, "kg"), "+2 réps");
  assert.equal(ecartRecord({ type: "allure", valeur: 295, precedent: 300 }, "kg"), "−0:05");
  assert.equal(ecartRecord({ type: "reps", valeur: 8, precedent: null }, "kg"), null);
  assert.equal(mesureRecord("charge", true), "Aide minimale");
  assert.equal(mesureRecord("reps"), "Meilleure série");
});

const sc = (kg: number | null, reps: number, pkg: number | null, preps: number | null, type: "normale" | "echauffement" = "normale") =>
  ({ type, faite: 1, kg, reps, precedent_kg: pkg, precedent_reps: preps, e1rm: kg ? kg * (1 + reps / 30) : null });

test("ecartExercice : réps gagnées à charge égale, rien si la charge change ou sans précédent", () => {
  assert.deepEqual(ecartExercice([sc(10, 12, 10, 12), sc(10, 12, 10, 11)]), { texte: "+1 rép", signe: 1 });
  assert.deepEqual(ecartExercice([sc(30, 10, 30, 10)]), { texte: "Stable", signe: 0 });
  assert.deepEqual(ecartExercice([sc(25, 11, 25, 12), sc(40, 1, 40, 9, "echauffement")]), { texte: "−1 rép", signe: -1 });
  assert.equal(ecartExercice([sc(82.5, 8, 80, 8)]), null);
  assert.equal(ecartExercice([sc(82.5, 8, null, null)]), null);
});

test("meilleureSerie : meilleur 1RM estimé, l'échauffement à part", () => {
  const l = [sc(40, 10, null, null, "echauffement"), sc(82.5, 8, null, null), sc(82.5, 7, null, null), sc(75, 10, null, null)];
  assert.equal(meilleureSerie(l), l[1]);
  assert.equal(meilleureSerie([]), null);
});
