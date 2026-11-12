// Le prévu de la page Énergie (energie-prevu.ts) : réel en plein, prévu en pointillé, jamais compté deux fois ni dans le
// solde réel. Séances prévues : faite (même routine, ou autre appli sur le créneau), annulée, décalée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bilanJour, choisirBmr, eatSeance } from "../src/ecrans/energie-calc.ts";
import { pasRestants, prevuAffiche, prevuJour, seancesPrevuesRestantes } from "../src/ecrans/energie-prevu.ts";
import { occurrences, type Exception, type Programmation } from "../src/ecrans/planification.ts";

const P = { sexe: "h" as const, kg: 78, cm: 183, age: 39 };
const T = new Date(2026, 10, 4, 12, 0).getTime();
const BMR = choisirBmr("mifflin", { balance: null, maigre: null, profil: P }, T);
const CORPS = { sexe: "h" as const, kg: 78, age: 39 };
const prog = (id: string, routineId: string, jours: number[], heure = "18:00"): Programmation => ({
  id, routineId, texte: "", actif: true, rappelMin: null, ordre: 0,
  regle: { freq: "semaine", intervalle: 1, jours, heure, debut: "2026-10-01" },
});
const INFOS = new Map([["padel", { sport: "cat:padel", dureeMin: 60 }], ["muscu", { sport: "cat:musculation", dureeMin: 45 }]]);
const NOMS = new Map([["padel", "Padel"], ["muscu", "Haut du corps"]]);
// le 04/11/2026 est un mercredi (2)
const PROGS = [prog("p1", "padel", [2]), prog("p2", "muscu", [2], "07:00")];
const occDu = (exc: Exception[] = []) => occurrences(PROGS, exc, "2026-11-02", "2026-11-08", "18:00", INFOS);

test("séances prévues du jour : les deux, avec durée et sport de la routine", () => {
  const l = seancesPrevuesRestantes(occDu(), [], "2026-11-04", NOMS);
  assert.deepEqual(l.map((s) => [s.nom, s.minutes, s.sportId, s.heure]), [["Haut du corps", 45, "cat:musculation", "07:00"], ["Padel", 60, "cat:padel", "18:00"]]);
});

test("séance prévue déjà faite (même routine) : plus dans le prévu", () => {
  const faite = { id: "s1", routineId: "muscu", date: "2026-11-04", faite: true, debutMin: 7 * 60 + 5, finMin: 7 * 60 + 50 };
  const l = seancesPrevuesRestantes(occDu(), [faite], "2026-11-04", NOMS);
  assert.deepEqual(l.map((s) => s.nom), ["Padel"]);
});

test("séance en cours (pas terminée) : encore prévue, ses kcal arriveront au réel à la fin", () => {
  const enCours = { id: "s1", routineId: "muscu", date: "2026-11-04", faite: false, debutMin: 7 * 60 };
  assert.equal(seancesPrevuesRestantes(occDu(), [enCours], "2026-11-04", NOMS).length, 2);
});

test("séance faite ailleurs (autre appli, même sport, sur le créneau) : comptée au réel, pas au prévu", () => {
  const reelle = { debut: new Date(2026, 10, 4, 18, 10).getTime(), minutes: 55, sportId: "cat:padel" };
  const l = seancesPrevuesRestantes(occDu(), [], "2026-11-04", NOMS, [reelle]);
  assert.deepEqual(l.map((s) => s.nom), ["Haut du corps"]);
  // un autre sport à la même heure ne la vaut pas
  const autre = { debut: new Date(2026, 10, 4, 18, 10).getTime(), minutes: 55, sportId: "cat:velo" };
  assert.equal(seancesPrevuesRestantes(occDu(), [], "2026-11-04", NOMS, [autre]).length, 2);
});

test("séance annulée : rien ; déplacée : au nouveau jour seulement", () => {
  const retiree: Exception = { programmationId: "p1", dateOrigine: "2026-11-04", type: "retiree", nouvelleDate: null, nouvelleHeure: null };
  assert.deepEqual(seancesPrevuesRestantes(occDu([retiree]), [], "2026-11-04", NOMS).map((s) => s.nom), ["Haut du corps"]);
  const decalee: Exception = { programmationId: "p1", dateOrigine: "2026-11-04", type: "decalee", nouvelleDate: "2026-11-06", nouvelleHeure: "10:00" };
  assert.deepEqual(seancesPrevuesRestantes(occDu([decalee]), [], "2026-11-04", NOMS).map((s) => s.nom), ["Haut du corps"]);
  assert.deepEqual(seancesPrevuesRestantes(occDu([decalee]), [], "2026-11-06", NOMS).map((s) => [s.nom, s.heure]), [["Padel", "10:00"]]);
});

test("pas restants : défaut, rythme heure par heure, journée moyenne, rien", () => {
  assert.equal(pasRestants(0.5, true, null), 2500);
  const horaire = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 20 ? 1000 : 0));
  assert.equal(pasRestants(0.5, false, { horaire, jour: null }), 8000);
  assert.equal(pasRestants(0.75, false, { horaire, jour: 9000 }), 2000);
  assert.equal(pasRestants(0.75, false, { horaire: null, jour: 8000 }), 2000);
  assert.equal(pasRestants(0.5, false, null), 0);
  assert.equal(pasRestants(1, true, null), 0);
});

const entree = (av: number, o: { apports?: number | null; seances?: Parameters<typeof bilanJour>[0]["seances"] } = {}) =>
  bilanJour({ bmr: BMR, seances: o.seances ?? [], pas: 4000, apports: o.apports ?? null, kg: 78, corps: CORPS, enCours: av < 1, avancement: av, kcalParPas: 0.04 });

test("jour en cours : réel + prévu = la journée entière ; le solde réel ne bouge pas", () => {
  const reel = entree(0.5, { apports: 900 });
  const padel = { routineId: "padel", nom: "Padel", heure: "18:00", minutes: 60, sportId: "cat:padel" };
  const p = prevuJour({ reel, bmrJour: BMR.kcal, avancement: 0.5, seances: [padel], corps: CORPS, pas: 3000, kcalParPas: 0.04, habitudes: 2400 })!;
  assert.ok(p);
  // le métabolisme de base : moitié au réel, moitié au prévu
  assert.equal(Math.round(reel.bmr.kcal + p.bmr), Math.round(BMR.kcal));
  // la séance prévue : la même formule que l'activité faite
  assert.equal(Math.round(p.sport), Math.round(eatSeance({ nom: "Padel", minutes: 60, sportId: "cat:padel", origine: null, pas: null }, BMR.kcal, CORPS).kcal));
  assert.ok(p.sport > 200);
  assert.equal(Math.round(p.neat), 120);
  // apports : 900 notés, 1 500 habituels encore à venir ; leur digestion attendue
  assert.equal(p.apports, 1500);
  assert.equal(Math.round(p.digestion), 150);
  assert.equal(Math.round(p.depense), Math.round(p.bmr + p.sport + p.neat + p.digestion));
  assert.equal(Math.round(p.depenseMinuit), Math.round(reel.depense.kcal + p.depense));
  assert.equal(p.apportsMinuit, 2400);
  assert.equal(Math.round(p.soldeMinuit!), Math.round(2400 - p.depenseMinuit));
  // le solde réel : apports notés − dépense réelle, sans rien du prévu
  assert.equal(Math.round(reel.solde!), Math.round(900 - reel.depense.kcal));
});

test("journal vide : les habitudes au prévu seulement ; sans habitude, pas de solde prévu", () => {
  const reel = entree(0.25);
  const p = prevuJour({ reel, bmrJour: BMR.kcal, avancement: 0.25, seances: [], corps: CORPS, pas: 0, habitudes: 2000 })!;
  assert.equal(p.apports, 2000);
  assert.equal(p.apportsMinuit, 2000);
  assert.equal(Math.round(p.digestion), Math.round(2000 * 0.1 * 0.75));
  const sans = prevuJour({ reel, bmrJour: BMR.kcal, avancement: 0.25, seances: [], corps: CORPS, pas: 0, habitudes: null })!;
  assert.equal(sans.apports, 0);
  assert.equal(sans.apportsMinuit, null);
  assert.equal(sans.soldeMinuit, null);
  assert.ok(sans.digestion > 0, "digestion : la part de la dépense, comme le réel");
});

test("journal plus garni que l'habitude : rien de plus à venir côté apports", () => {
  const reel = entree(0.8, { apports: 3000 });
  const p = prevuJour({ reel, bmrJour: BMR.kcal, avancement: 0.8, seances: [], corps: CORPS, pas: 0, habitudes: 2400 })!;
  assert.equal(p.apports, 0);
  assert.equal(p.digestion, 0);
  assert.equal(p.apportsMinuit, 3000);
});

test("jour passé : aucun prévu ; jour à venir : tout au prévu, affiché seulement avec une séance prévue", () => {
  assert.equal(prevuJour({ reel: entree(1, { apports: 2000 }), bmrJour: BMR.kcal, avancement: 1, seances: [], corps: CORPS, pas: 0, habitudes: 2000 }), null);
  const padel = { routineId: "padel", nom: "Padel", heure: "18:00", minutes: 60, sportId: "cat:padel" };
  const demain = prevuJour({ reel: null, bmrJour: BMR.kcal, avancement: 0, seances: [padel], corps: CORPS, pas: 8000, kcalParPas: 0.04, habitudes: 2400 })!;
  assert.equal(Math.round(demain.bmr), Math.round(BMR.kcal));
  assert.equal(Math.round(demain.digestion), 240);
  assert.equal(Math.round(demain.depenseMinuit), Math.round(demain.depense));
  assert.ok(prevuAffiche(demain, true));
  const vide = prevuJour({ reel: null, bmrJour: BMR.kcal, avancement: 0, seances: [], corps: CORPS, pas: 8000, habitudes: 2400 });
  assert.equal(prevuAffiche(vide, true), null);
  assert.ok(prevuAffiche(vide, false), "aujourd'hui : le prévu même sans séance (le reste du métabolisme)");
});

test("dépense recalée sur le poids : le prévu suit le même facteur", () => {
  const reel = bilanJour({ bmr: BMR, seances: [], pas: 4000, apports: 1000, kg: 78, corps: CORPS, enCours: true, avancement: 0.5, recalage: { facteur: 1.1, sigmaRel: 0.05 } });
  const p = prevuJour({ reel, bmrJour: BMR.kcal, avancement: 0.5, seances: [], corps: CORPS, pas: 0, habitudes: null })!;
  assert.equal(Math.round(p.bmr), Math.round(BMR.kcal * 0.5 * 1.1));
});
