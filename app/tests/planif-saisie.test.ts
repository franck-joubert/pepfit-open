// Saisie libre de la planification, retour du 29/10 : fautes et homophones (« Tout lé jour »), singulier ou
// pluriel, termes vagues (matin, midi, après-midi, soir, nuit), en semaine, le week-end, un jour sur deux ; et la
// proposition « Tu veux dire : … ? » quand la saisie reste incomprise. Mardi 27 octobre 2026, 8h06.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyser, suggerer, texteRegle } from "../src/i18n/planif-saisie.ts";

const AUJ = "2026-10-27";
const H = 8 * 60 + 6;
const SEMAINE = [0, 1, 2, 3, 4];

/** Ce qu'on attend d'une saisie : fréquence, intervalle, jours, date, heure (null : celle du profil). */
type Attendu = { freq: string; intervalle?: number; jours?: number[]; date?: string; heure: string | null };
const quotidien = (heure: string | null, intervalle = 1): Attendu => ({ freq: "jour", intervalle, jours: [], heure });
const hebdo = (jours: number[], heure: string | null, intervalle = 1): Attendu => ({ freq: "semaine", intervalle, jours, heure });
const le = (date: string, heure: string | null): Attendu => ({ freq: "unique", date, heure });

const TABLE: [string, Attendu][] = [
  // Fautes, homophones, singulier et pluriel (captures d'Alex).
  ["Tous les jours", quotidien(null)],
  ["Tous les jour", quotidien(null)],
  ["Tout lé jour", quotidien(null)],
  ["tout les jours", quotidien(null)],
  ["tou les jours", quotidien(null)],
  ["toute les jours à 7h", quotidien("07:00")],
  ["tous le jour", quotidien(null)],
  ["chaque jour", quotidien(null)],
  ["tous les lundi", hebdo([0], null)],
  ["tout les lundis à 18h", hebdo([0], "18:00")],
  ["tous les mecredis", hebdo([2], null)],
  ["lundi et jeudi", hebdo([0, 3], null)],
  ["le samedi et le dimanche", hebdo([5, 6], null)],
  ["un jeudi sur deux", hebdo([3], null, 2)],
  // Termes vagues.
  ["Tous les matins 9h", quotidien("09:00")],
  ["tous les matins", quotidien("08:00")],
  ["chaque soir", quotidien("19:00")],
  ["tous les soirs à 21h", quotidien("21:00")],
  ["lundi soir", hebdo([0], "19:00")],
  ["lundi le soir 9h", hebdo([0], "21:00")],
  ["mardi 9h le soir", hebdo([1], "21:00")],
  ["jeudi 9h du soir", hebdo([3], "21:00")],
  ["mercredi matin 9h", hebdo([2], "09:00")],
  ["vendredi midi", hebdo([4], "12:00")],
  ["samedi après-midi", hebdo([5], "15:00")],
  ["dimanche 3h de l'après-midi", hebdo([6], "15:00")],
  ["tous les jours la nuit", quotidien("22:00")],
  ["demain matin", le("2026-10-28", "08:00")],
  ["ce soir", le(AUJ, "19:00")],
  ["9h", le(AUJ, "09:00")], // 8h06 : 9h n'est pas passée
  ["vers 18h", le(AUJ, "18:00")],
  ["7h", le("2026-10-28", "07:00")], // passée : demain
  ["lundi 18 h 30", hebdo([0], "18:30")],
  ["mardi 7 heures", hebdo([1], "07:00")],
  // En semaine, week-end, un jour sur deux.
  ["en semaine", hebdo(SEMAINE, null)],
  ["en semaine à 7h", hebdo(SEMAINE, "07:00")],
  ["du lundi au vendredi", hebdo(SEMAINE, null)],
  ["le week-end", hebdo([5, 6], null)],
  ["tous les week-ends à 10h", hebdo([5, 6], "10:00")],
  ["un jour sur deux", quotidien(null, 2)],
  ["tous les deux jours", quotidien(null, 2)],
  // Anglais.
  ["every day", quotidien(null)],
  ["everyday at 7am", quotidien("07:00")],
  ["evry day", quotidien(null)],
  ["every morning", quotidien("08:00")],
  ["every evening at 8", quotidien("20:00")],
  ["monday evening", hebdo([0], "19:00")],
  ["tuesday 6 in the evening", hebdo([1], "18:00")],
  ["weekdays", hebdo(SEMAINE, null)],
  ["on weekends", hebdo([5, 6], null)],
  ["every other day", quotidien(null, 2)],
  ["tonight", le(AUJ, "19:00")],
  ["tomorrow morning", le("2026-10-28", "08:00")],
  ["mondays and thursdays at 6pm", hebdo([0, 3], "18:00")],
  ["around 6pm", le(AUJ, "18:00")],
  ["9 o'clock", le(AUJ, "09:00")],
];

test(`saisie libre : ${TABLE.length} saisies (fautes, homophones, termes vagues, anglais)`, () => {
  assert.ok(TABLE.length >= 40);
  const fautes: string[] = [];
  for (const [saisie, voulu] of TABLE) {
    const a = analyser(saisie, AUJ, H);
    const lu = a && {
      freq: a.regle.freq,
      ...(voulu.intervalle != null ? { intervalle: a.regle.intervalle } : {}),
      ...(voulu.jours != null ? { jours: a.regle.jours } : {}),
      ...(voulu.date != null ? { date: a.regle.date } : {}),
      heure: a.regle.heure,
    };
    try {
      assert.deepEqual(lu, voulu);
    } catch {
      fautes.push(`« ${saisie} » : ${JSON.stringify(lu)} au lieu de ${JSON.stringify(voulu)}`);
    }
  }
  assert.deepEqual(fautes, []);
});

test("les corrections sont gardées (soulignées dans l'aperçu) : tout → tous, lé → les", () => {
  const a = analyser("Tout lé jour", AUJ, H)!;
  assert.deepEqual(a.corrections, [
    { de: "tout", vers: "tous" },
    { de: "le", vers: "les" },
  ]);
});

test("un moment de la journée compte comme une heure saisie ; sans rien, l'heure du profil", () => {
  assert.equal(analyser("tous les matins", AUJ, H)!.heureSaisie, true);
  assert.equal(analyser("tous les jours", AUJ, H)!.heureSaisie, false);
});

test("toujours refusé : ce qui n'est pas une date", () => {
  for (const s of ["quand j'ai le temps", "", "lundi à 25h", "bonjour", "à 9h je veux"]) assert.equal(analyser(s, AUJ, H), null, s);
});

test("proposition d'une saisie incomprise : la lecture la plus proche, réécrite et relue telle quelle", () => {
  const cas: [string, string][] = [
    ["tos ls jous", "Tous les jours"],
    ["tous les jours stp", "Tous les jours"],
    ["lundi s'il te plait à 18h", "Tous les lundis à 18h"],
    ["every mondy pls", "Every Monday"],
    ["mrdi et jedi", "Mardi et jeudi"],
  ];
  for (const [saisie, phrase] of cas) {
    assert.equal(analyser(saisie, AUJ, H), null, `${saisie} : déjà compris`);
    const s = suggerer(saisie, AUJ, H);
    assert.ok(s, saisie);
    const langue = /every|monday/i.test(phrase) ? "en" : "fr";
    const texte = texteRegle(s.regle, langue);
    assert.equal(texte, phrase, saisie);
    // Toucher la proposition remplit le champ avec ce texte : il doit se relire en la même règle.
    const relu = analyser(texte, AUJ, H)!;
    assert.deepEqual({ ...relu.regle, debut: null }, { ...s.regle, debut: null }, texte);
  }
  assert.equal(suggerer("", AUJ, H), null);
  assert.equal(suggerer("quand j'ai le temps", AUJ, H), null);
});
