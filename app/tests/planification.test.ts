// Planification des séances (planche v7, 27/10) : dates, occurrences, prochaine séance, manquées, saisie libre.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ajouterJ, deplacerSerie, faite, grilleMois, jourSem, laPlusProche, manquees, marqueDuJour, nemeJourDuMois, occurrences, prochaines, quand,
  semaineDe, type Exception, type InfoRoutine, type Programmation, type Regle, type SeanceJour,
} from "../src/ecrans/planification.ts";
import { analyser, phraseRegle, rapprocher, texteMorceaux, texteRegle } from "../src/i18n/planif-saisie.ts";

// Mardi 27 octobre 2026, 8 h 06 (données de la planche).
const AUJ = "2026-10-27";
const H = 8 * 60 + 6;
const regle = (r: Partial<Regle>): Regle => ({ freq: "semaine", intervalle: 1, jours: [], heure: null, debut: "2026-10-01", ...r });
const prog = (id: string, routineId: string, r: Partial<Regle>, actif = true): Programmation => ({
  id, routineId, texte: "", regle: regle(r), actif, rappelMin: null, ordre: 0,
});
const dates = (p: Programmation[], de: string, a: string, e: Exception[] = []) => occurrences(p, e, de, a, "18:00").map((o) => o.date);

test("dates : jour de la semaine, lundi, mois, n-ième jour du mois", () => {
  assert.equal(jourSem(AUJ), 1); // mardi
  assert.deepEqual(semaineDe(AUJ), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(ajouterJ("2026-12-31", 1), "2027-01-01");
  assert.equal(nemeJourDuMois("2026-11-01", 5, 1), "2026-11-07"); // 1er samedi de novembre
  assert.equal(nemeJourDuMois("2026-10-01", 6, -1), "2026-10-25"); // dernier dimanche d'octobre
  assert.equal(nemeJourDuMois("2026-02-01", 0, 5), null);
  const g = grilleMois("2026-10-01"); // commence un jeudi
  assert.deepEqual(g.slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.equal(g.length, 3 + 31);
});

test("occurrences : hebdomadaire, un sur deux, tous les jours, mensuel, unique", () => {
  assert.deepEqual(dates([prog("a", "r", { jours: [1, 4] })], "2026-10-26", "2026-11-08"), ["2026-10-27", "2026-10-30", "2026-11-03", "2026-11-06"]);
  // Un mercredi sur deux depuis le mardi 27 : mer. 28 oct, 11 nov, 25 nov (planche, écran 8).
  assert.deepEqual(dates([prog("a", "r", { intervalle: 2, jours: [2], debut: AUJ })], AUJ, "2026-11-30"), ["2026-10-28", "2026-11-11", "2026-11-25"]);
  assert.deepEqual(dates([prog("a", "r", { freq: "jour", intervalle: 2, debut: AUJ })], AUJ, "2026-11-02"), ["2026-10-27", "2026-10-29", "2026-10-31", "2026-11-02"]);
  assert.deepEqual(dates([prog("a", "r", { freq: "mois", jours: [5], ordinal: 1 })], AUJ, "2026-12-31"), ["2026-11-07", "2026-12-05"]);
  assert.deepEqual(dates([prog("a", "r", { freq: "unique", date: "2026-10-31" })], "2026-10-26", "2026-11-01"), ["2026-10-31"]);
  // Rien avant le début de la règle ; rien d'une règle éteinte (« En pause »).
  assert.deepEqual(dates([prog("a", "r", { jours: [0], debut: AUJ })], "2026-10-19", "2026-11-02"), ["2026-11-02"]);
  assert.deepEqual(dates([prog("a", "r", { jours: [0] }, false)], "2026-10-19", "2026-11-02"), []);
});

test("occurrences : exceptions retirée et décalée, heure par défaut et heure propre", () => {
  const p = [prog("a", "r", { jours: [1, 4] })];
  const e: Exception[] = [
    { programmationId: "a", dateOrigine: "2026-10-27", type: "retiree", nouvelleDate: null, nouvelleHeure: null },
    { programmationId: "a", dateOrigine: "2026-10-30", type: "decalee", nouvelleDate: "2026-10-29", nouvelleHeure: "07:30" },
  ];
  const o = occurrences(p, e, "2026-10-26", "2026-11-01", "18:00");
  assert.deepEqual(o.map((x) => [x.date, x.origine, x.heure]), [["2026-10-29", "2026-10-30", "07:30"]]);
  // Décalée dans une semaine voisine : elle apparaît là où elle a été posée.
  const loin: Exception[] = [{ programmationId: "a", dateOrigine: "2026-10-27", type: "decalee", nouvelleDate: "2026-11-02", nouvelleHeure: null }];
  assert.deepEqual(dates(p, "2026-11-02", "2026-11-08", loin), ["2026-11-02", "2026-11-03", "2026-11-06"]);
  assert.equal(occurrences([prog("b", "r", { jours: [1], heure: "07:00" })], [], AUJ, AUJ, "18:00")[0]!.heure, "07:00");
});

test("prochaine séance : par routine, la séance du jour déjà faite passe à la suivante ; la plus proche", () => {
  const p = [prog("a", "pull", { jours: [1, 4] }), prog("b", "push", { jours: [0], heure: "07:00" }), prog("c", "haut", { jours: [2] })];
  const s: SeanceJour[] = [];
  let pr = prochaines(p, [], s, AUJ, "18:00");
  assert.equal(pr.get("pull")!.date, AUJ);
  assert.equal(pr.get("push")!.date, "2026-11-02");
  assert.equal(pr.get("haut")!.date, "2026-10-28");
  assert.equal(laPlusProche(pr), "pull");
  pr = prochaines(p, [], [{ id: "s", routineId: "pull", date: AUJ, faite: true }], AUJ, "18:00");
  assert.equal(pr.get("pull")!.date, "2026-10-30");
  assert.equal(laPlusProche(pr), "haut");
  // Même jour : la plus tôt dans la journée.
  const meme = prochaines([prog("x", "soir", { jours: [2] }), prog("y", "matin", { jours: [2], heure: "07:00" })], [], [], AUJ, "18:00");
  assert.equal(laPlusProche(meme), "matin");
  assert.equal(laPlusProche(new Map()), null);
});

test("étiquette « Prochaine » : aujourd'hui, demain, nom du jour dans les 6 jours, puis jj/mm", () => {
  assert.deepEqual(quand(AUJ, AUJ), { genre: "aujourdhui" });
  assert.deepEqual(quand("2026-10-28", AUJ), { genre: "demain" });
  assert.deepEqual(quand("2026-11-02", AUJ), { genre: "jour", jour: 0 });
  assert.deepEqual(quand("2026-11-03", AUJ), { genre: "date", jj: 3, mm: 11 });
});

test("séances manquées et marques : faite > à venir > manquée, une seule par jour", () => {
  const p = [prog("a", "pull", { jours: [1, 2] })];
  const o = occurrences(p, [], "2026-10-19", "2026-10-28", "18:00");
  const s: SeanceJour[] = [
    { id: "1", routineId: "pull", date: "2026-10-20", faite: true },
    { id: "2", routineId: null, date: "2026-10-21", faite: true }, // séance libre, ne rattrape pas la séance prévue
  ];
  assert.deepEqual(manquees(o, s, AUJ).map((x) => x.date), ["2026-10-21"]);
  assert.equal(marqueDuJour("2026-10-20", o, s, AUJ), "faite");
  assert.equal(marqueDuJour("2026-10-21", o, s, AUJ), "faite"); // une séance faite l'emporte sur la manquée
  assert.equal(marqueDuJour(AUJ, o, s, AUJ), "prevue");
  assert.equal(marqueDuJour("2026-10-22", o, s, AUJ), null);
  assert.equal(marqueDuJour("2026-10-21", o, [], AUJ), "manquee");
});

// ——— Séance prévue faite par une séance détectée ou importée (sans routine) ———

// Lundi 2 novembre 2026 : « Padel 1 h 30 » prévue à 11:00 et une autre à 14:00 ; padel de 1 h 39 détecté (Whoop) vers 11:00.
const LUN = "2026-11-02";
const INFOS = new Map<string, InfoRoutine>([
  ["padel", { sport: "cat:padel", dureeMin: 90 }],
  ["padel2", { sport: "cat:padel", dureeMin: 90 }],
  ["push", { sport: "cat:musculation", dureeMin: 60 }],
]);
const prevues = (...ps: [string, string, string][]) =>
  occurrences(ps.map(([id, routine, heure]) => prog(id, routine, { freq: "unique", date: LUN, heure })), [], LUN, LUN, "18:00", INFOS);
const detectee = (id: string, h: number, min: number, duree: number, o: Partial<SeanceJour> = {}): SeanceJour => ({
  id, routineId: null, date: LUN, faite: true, sport: "cat:padel", debutMin: h * 60 + min, finMin: h * 60 + min + duree, ...o,
});

test("séance prévue faite par une séance détectée : le cas d'Alex (11:00 faite, 14:00 à venir)", () => {
  const occ = prevues(["a", "padel", "11:00"], ["b", "padel2", "14:00"]);
  const s = [detectee("w", 11, 2, 99)];
  assert.deepEqual(occ.map((o) => faite(o, s, occ)), [true, false]);
  assert.deepEqual(manquees(occ, s, "2026-11-03").map((o) => o.heure), ["14:00"]);
  assert.deepEqual(aVenirHeures(occ, s, LUN), ["14:00"]);
  assert.equal(marqueDuJour(LUN, occ, s, LUN), "faite");
  assert.equal(marqueDuJour(LUN, occ, [], LUN), "prevue");
});

test("séance prévue faite : début dans les 90 min, ou chevauchement du créneau", () => {
  const occ = prevues(["a", "padel", "11:00"]);
  assert.equal(faite(occ[0]!, [detectee("w", 9, 35, 30)], occ), true); // 85 min avant
  assert.equal(faite(occ[0]!, [detectee("w", 12, 29, 30)], occ), true); // 89 min après
  assert.equal(faite(occ[0]!, [detectee("w", 12, 31, 30)], occ), false); // 91 min après, hors de [11:00, 12:30]
  assert.equal(faite(occ[0]!, [detectee("w", 8, 0, 200)], occ), true); // commencée tôt, elle recoupe 11:00
  assert.equal(faite(occ[0]!, [detectee("w", 8, 0, 120)], occ), false); // finie à 10:00
});

test("séance prévue : une séance ne valide jamais deux séances prévues, la plus proche en heure l'emporte", () => {
  const occ = prevues(["a", "padel", "11:00"], ["b", "padel2", "12:00"]);
  assert.deepEqual(occ.map((o) => faite(o, [detectee("w", 11, 50, 60)], occ)), [false, true]); // 11:50 est plus près de 12:00
  const deux = [detectee("w1", 11, 0, 60), detectee("w2", 11, 55, 60)];
  assert.deepEqual(occ.map((o) => faite(o, deux, occ)), [true, true]);
  // Une seule séance, deux créneaux voisins : l'un reste à venir.
  const un = [detectee("w", 11, 30, 60)];
  assert.equal(occ.filter((o) => faite(o, un, occ)).length, 1);
});

test("séance prévue : mauvais sport, autre jour, séance non terminée, sport inconnu", () => {
  const occ = prevues(["a", "padel", "11:00"]);
  assert.equal(faite(occ[0]!, [detectee("w", 11, 0, 60, { sport: "cat:musculation" })], occ), false);
  assert.equal(faite(occ[0]!, [detectee("w", 11, 0, 60, { sport: null })], occ), false);
  assert.equal(faite(occ[0]!, [detectee("w", 11, 0, 60, { date: "2026-11-01" })], occ), false);
  assert.equal(faite(occ[0]!, [detectee("w", 11, 0, 60, { faite: false })], occ), false);
  // Même famille (Sports et cours) : un tennis au créneau du padel le valide.
  assert.equal(faite(occ[0]!, [detectee("w", 11, 0, 60, { sport: "cat:tennis" })], occ), true);
});

test("séance prévue : la routine muscu reste faite par la même routine, à n'importe quelle heure", () => {
  const occ = prevues(["a", "push", "07:00"]);
  const s: SeanceJour[] = [{ id: "m", routineId: "push", date: LUN, faite: true }]; // sans sport ni heure, comme avant
  assert.equal(faite(occ[0]!, s, occ), true);
  assert.equal(faite(occ[0]!, [{ ...s[0]!, faite: false }], occ), false);
  // Une séance de la routine ne sert pas aussi à valider un autre créneau du même sport.
  const deux = prevues(["a", "push", "07:00"], ["b", "padel", "08:00"]);
  const m: SeanceJour[] = [{ id: "m", routineId: "push", date: LUN, faite: true, sport: "cat:musculation", debutMin: 480, finMin: 540 }];
  assert.deepEqual(deux.map((o) => faite(o, m, deux)), [true, false]);
});

const aVenirHeures = (occ: ReturnType<typeof prevues>, s: SeanceJour[], auj: string) =>
  occ.filter((o) => o.date >= auj && !faite(o, s, occ)).map((o) => o.heure);

test("toute la série : la règle hebdomadaire change de jour", () => {
  const r = regle({ jours: [1, 4] });
  assert.deepEqual(deplacerSerie(r, "2026-10-30", "2026-10-29").jours, [1, 3]);
  assert.equal(deplacerSerie(regle({ freq: "unique", date: "2026-10-31" }), "2026-10-31", "2026-11-01").date, "2026-11-01");
});

// ——— Saisie libre ———

const lu = (s: string) => {
  const a = analyser(s, AUJ, H);
  return a && { ...a.regle, debut: undefined };
};

test("saisie FR : jours, fréquences, mois, dates, heures", () => {
  assert.deepEqual(lu("tous les lundis"), { freq: "semaine", intervalle: 1, jours: [0], heure: null, debut: undefined });
  assert.deepEqual(lu("le lundi")?.jours, [0]);
  assert.deepEqual(lu("chaque lundi")?.jours, [0]);
  assert.deepEqual(lu("lundi et jeudi à 18h"), { freq: "semaine", intervalle: 1, jours: [0, 3], heure: "18:00", debut: undefined });
  assert.deepEqual(lu("tous les mardis et vendredis")?.jours, [1, 4]);
  assert.deepEqual(lu("Un mercredi sur deux"), { freq: "semaine", intervalle: 2, jours: [2], heure: null, debut: undefined });
  assert.deepEqual(lu("toutes les 2 semaines le lundi")?.intervalle, 2);
  assert.deepEqual(lu("tous les jours")?.freq, "jour");
  assert.deepEqual(lu("tous les 2 jours")?.intervalle, 2);
  assert.deepEqual(lu("le 1er samedi du mois à 10h"), { freq: "mois", intervalle: 1, jours: [5], ordinal: 1, heure: "10:00", debut: undefined });
  assert.equal(lu("le 2e mardi du mois")?.ordinal, 2);
  assert.equal(lu("le dernier dimanche du mois")?.ordinal, -1);
  assert.equal(lu("samedi prochain")?.date, "2026-10-31");
  assert.equal(lu("demain")?.date, "2026-10-28");
  assert.equal(lu("après-demain")?.date, "2026-10-29");
  assert.equal(lu("18 oct")?.date, "2027-10-18"); // passé cette année : l'an prochain
  assert.equal(lu("18 nov")?.date, "2026-11-18");
  assert.equal(lu("18/11")?.date, "2026-11-18");
  assert.equal(lu("7h30")?.heure, "07:30");
  assert.equal(lu("lundi 18h30")?.heure, "18:30");
  // L'heure seule : aujourd'hui si elle n'est pas passée, demain sinon.
  assert.deepEqual([lu("à 18h")?.freq, lu("à 18h")?.date], ["unique", AUJ]);
  assert.equal(lu("à 7h")?.date, "2026-10-28");
});

test("saisie EN", () => {
  assert.deepEqual(lu("every monday")?.jours, [0]);
  assert.deepEqual(lu("mondays")?.jours, [0]);
  assert.deepEqual(lu("monday and thursday")?.jours, [0, 3]);
  assert.deepEqual([lu("every other wednesday")?.intervalle, lu("every other wednesday")?.jours], [2, [2]]);
  assert.equal(lu("every 2 weeks on monday")?.intervalle, 2);
  assert.equal(lu("every day")?.freq, "jour");
  assert.equal(lu("daily")?.freq, "jour");
  assert.equal(lu("first saturday of the month")?.ordinal, 1);
  assert.equal(lu("last sunday of the month")?.ordinal, -1);
  assert.equal(lu("next saturday")?.date, "2026-10-31");
  assert.equal(lu("tomorrow")?.date, "2026-10-28");
  assert.equal(lu("oct 18")?.date, "2027-10-18");
  assert.equal(lu("at 6pm")?.heure, "18:00");
  assert.equal(lu("monday 6:30pm")?.heure, "18:30");
  assert.equal(lu("monday 18:00")?.heure, "18:00");
});

test("saisie : fautes de frappe rapprochées, saisie incomprise refusée", () => {
  const a = analyser("tous les lundy à 18h", AUJ, H)!;
  assert.deepEqual(a.regle.jours, [0]);
  assert.deepEqual(a.corrections, [{ de: "lundy", vers: "lundi" }]);
  assert.deepEqual(phraseRegle(a.regle, "fr", a.corrections), [{ texte: "Tous les " }, { texte: "lundis", corrige: true }]);
  assert.equal(rapprocher("mecredi"), "mercredi");
  assert.equal(rapprocher("tusday"), "tuesday");
  assert.deepEqual(lu("un mecredi sur deux")?.jours, [2]);
  assert.equal(analyser("quand j'ai le temps", AUJ, H), null);
  assert.equal(analyser("", AUJ, H), null);
  assert.equal(analyser("lundi à 25h", AUJ, H), null);
});

test("phrase normalisée et texte réécrit", () => {
  const p = (s: string, l: "fr" | "en" = "fr") => texteMorceaux(phraseRegle(analyser(s, AUJ, H)!.regle, l));
  assert.equal(p("un mercredi sur deux"), "Un mercredi sur deux");
  assert.equal(p("samedi prochain"), "Samedi 31 octobre");
  assert.equal(p("lundi et jeudi à 7h"), "Lundi et jeudi");
  assert.equal(p("le 1er samedi du mois"), "Le 1er samedi du mois");
  assert.equal(p("tous les lundis", "en"), "Every Monday");
  assert.equal(p("samedi prochain", "en"), "Saturday, October 31");
  assert.equal(texteRegle(regle({ jours: [1, 3], heure: "18:00" }), "fr"), "Mardi et jeudi à 18h");
  assert.equal(texteRegle(regle({ jours: [0], heure: "07:30" }), "en"), "Every Monday at 7:30am");
});

// ——— Base (migration 23) ———

test("base : règles, exceptions, rappel de la routine, réglages ; journal de synchro ; suppression en cascade", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const d = await import("../src/db/depots/programmations.ts");
  const { creerRoutine, supprimerRoutine } = await import("../src/db/depots/routines.ts");
  const { raw, db } = await baseDeTest();
  const r = await creerRoutine(db, "Pull A", []);
  const a = await d.ajouterProgrammation(db, r, " mardi et vendredi ", regle({ jours: [1, 4] }));
  await d.reglerRappelRoutine(db, r, 0);
  const b = await d.ajouterProgrammation(db, r, "le 1er samedi du mois", regle({ freq: "mois", jours: [5], ordinal: 1 }));
  const l = await d.listerProgrammations(db, r);
  assert.deepEqual(l.map((p) => [p.id, p.texte, p.ordre, p.rappelMin, p.actif]), [[a, "mardi et vendredi", 0, 0, true], [b, "le 1er samedi du mois", 1, 0, true]]);
  await d.activerProgrammation(db, b, false);
  assert.equal((await d.listerProgrammations(db))[1]!.actif, false);
  await d.poserException(db, a, "2026-10-30", { type: "retiree" });
  await d.poserException(db, a, "2026-10-30", { type: "decalee", nouvelleDate: "2026-10-29" });
  assert.deepEqual(await d.listerExceptions(db), [{ programmationId: a, dateOrigine: "2026-10-30", type: "decalee", nouvelleDate: "2026-10-29", nouvelleHeure: null }]);
  const tabs = raw.prepare("SELECT DISTINCT tab FROM sync_journal WHERE tab LIKE 'programmation%' ORDER BY tab").all().map((x) => x.tab);
  assert.deepEqual(tabs, ["programmation_exceptions", "programmations"]);
  assert.deepEqual(await d.lireReglagesPlanif(db), { heureDefaut: "18:00", rappelDefautMin: 30 });
  await d.ecrireReglagesPlanif(db, { heureDefaut: "07:15", rappelDefautMin: 0 });
  assert.deepEqual(await d.lireReglagesPlanif(db), { heureDefaut: "07:15", rappelDefautMin: 0 });
  // Lot AF (règle 5) : retirer une routine programmée de Mes routines la masque, ses séances prévues restent.
  assert.equal(await supprimerRoutine(db, r), "masquee");
  assert.equal((await d.listerProgrammations(db)).length, 2);
  // La base garde sa cascade : une routine vraiment supprimée emporte ses règles et leurs exceptions.
  await db.runAsync("DELETE FROM routines WHERE id = ?", [r]);
  assert.equal((await d.listerProgrammations(db)).length, 0);
  assert.equal((await d.listerExceptions(db)).length, 0);
});
