// Module i18n : dictionnaires identiques, détection, formats de date et de nombre dans les deux langues et deux fuseaux.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif, detecter, en, fr, resoudre, t, tp, PREFERENCES_AUTO } from "../src/i18n/index.ts";
import { debutJour, debutMois, nomMoisCourt, jourSemaineMoisAnnee, dateSeance, heure, jourMois, moisAnnee, nombre, distanceTexte, plage, ilYa, heureLue } from "../src/ecrans/format.ts";
import { deMurale, decalageMin, libelleDecalage, murale, parties } from "../src/i18n/temps.ts";

const actif = (langue: "fr" | "en", fuseau = "Europe/Paris", poids: "kg" | "lbs" = "kg", distance: "km" | "mi" = "km") => definirActif({ langue, fuseau, poids, distance });

test("fr.ts et en.ts ont exactement les mêmes clés, de la même forme", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const [k, v] of Object.entries(fr)) {
    const e = (en as Record<string, unknown>)[k];
    assert.equal(typeof e, typeof v, k);
    if (typeof v === "string") assert.notEqual(e, "", k);
    else assert.deepEqual(Object.keys(e as object).sort(), ["one", "other"], k);
  }
});

test("les paramètres {x} sont les mêmes dans les deux langues", () => {
  const ph = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().filter((x, i, a) => a.indexOf(x) === i);
  for (const [k, v] of Object.entries(fr)) assert.deepEqual(ph((en as Record<string, unknown>)[k]), ph(v), k);
});

test("détection : fr-FR → fr, en-US → en + lbs, de-DE → de + kg", () => {
  const z = "Europe/Paris";
  assert.deepEqual(detecter({ codeLangue: "fr", region: "FR", systeme: "metric", fuseau: z }), { langue: "fr", fuseau: z, poids: "kg", distance: "km" });
  assert.deepEqual(detecter({ codeLangue: "en", region: "US", systeme: "us", fuseau: "America/New_York" }), { langue: "en", fuseau: "America/New_York", poids: "lbs", distance: "mi" });
  assert.deepEqual(detecter({ codeLangue: "de", region: "DE", systeme: "metric", fuseau: "Europe/Berlin" }), { langue: "de", fuseau: "Europe/Berlin", poids: "kg", distance: "km" });
  assert.equal(detecter({ codeLangue: "fr-CA" }).langue, "fr");
  assert.equal(detecter({ codeLangue: "en", region: "GB", systeme: "uk" }).distance, "mi");
  assert.equal(detecter({ codeLangue: "en", region: "US" }).poids, "lbs");
});

test("résolution : auto suit la détection, un choix forcé l'emporte", () => {
  const d = detecter({ codeLangue: "en", region: "US", systeme: "us", fuseau: "America/Chicago" });
  assert.deepEqual(resoudre(PREFERENCES_AUTO, d), d);
  assert.deepEqual(resoudre({ langue: "fr", fuseau: "Asia/Tokyo", poids: "kg", distance: "km" }, d), { langue: "fr", fuseau: "Asia/Tokyo", poids: "kg", distance: "km" });
});

test("t et tp : paramètres et pluriels selon la langue", () => {
  actif("fr");
  assert.equal(t("communs.reps", { n: 8 }), "8 réps");
  assert.equal(tp("communs.seance", 0), "0 séance");
  assert.equal(tp("communs.seance", 2), "2 séances");
  actif("en");
  assert.equal(t("communs.reps", { n: 8 }), "8 reps");
  assert.equal(tp("communs.seance", 1), "1 workout");
  assert.equal(tp("communs.seance", 0), "0 workouts");
  actif("fr");
});

test("nombres : séparateurs selon la langue", () => {
  actif("fr");
  assert.equal(nombre(1234.56, 1), "1\u202f234,6");
  assert.equal(nombre(-72.5, 1), "−72,5");
  assert.equal(nombre(100, 1), "100");
  actif("en");
  assert.equal(nombre(1234.56, 1), "1,234.6");
  assert.equal(nombre(-72.5, 1), "−72.5");
  assert.equal(nombre(0.25, 2), "0.25");
  actif("fr");
});

// 2024-01-05 23:30 UTC = 6 janv. 00:30 à Paris, 5 janv. 18:30 à New York.
const T = Date.UTC(2024, 0, 5, 23, 30);

test("dates et heures : deux langues, deux fuseaux", () => {
  actif("fr", "Europe/Paris");
  assert.equal(heure(T), "0:30");
  assert.equal(jourMois(T), "6 janv.");
  assert.equal(moisAnnee(T), "janvier 2024");
  actif("fr", "America/New_York");
  assert.equal(heure(T), "18:30");
  assert.equal(jourMois(T), "5 janv.");
  actif("en", "Europe/Paris");
  assert.equal(heure(T), "12:30 AM");
  assert.equal(jourMois(T), "Jan 6");
  assert.equal(moisAnnee(T), "January 2024");
  actif("en", "America/New_York");
  assert.equal(heure(T), "6:30 PM");
  assert.equal(jourMois(T), "Jan 5");
  actif("fr");
});

test("fuseau : jour, murale et décalage", () => {
  actif("fr", "Asia/Tokyo");
  const d = debutJour(T);
  assert.equal(d.getTime(), Date.UTC(2024, 0, 5, 15, 0)); // 6 janv. 0 h à Tokyo
  assert.equal(parties(T).jour, 6);
  const m = murale(T);
  assert.equal(`${m.getDate()}/${m.getHours()}:${m.getMinutes()}`, "6/8:30");
  assert.equal(deMurale(m), T);
  assert.equal(decalageMin(T, "Asia/Tokyo"), 540);
  assert.equal(libelleDecalage(T, "Asia/Kolkata"), "UTC+5:30");
  assert.equal(libelleDecalage(T, "America/Sao_Paulo"), "UTC−3");
  actif("fr");
});

test("dateSeance, plage et ilYa suivent la langue", () => {
  actif("fr", "Europe/Paris");
  assert.equal(dateSeance(Date.UTC(2020, 0, 5, 9, 5)), "dim. 5 janv., 10:05");
  actif("en", "Europe/Paris");
  assert.equal(dateSeance(Date.UTC(2020, 0, 5, 9, 5)), "Sun, Jan 5, 10:05 AM");
  assert.equal(plage(new Date(Date.UTC(2020, 0, 6, 12)), new Date(Date.UTC(2020, 0, 12, 12))), "Jan 6 – Jan 12");
  assert.equal(ilYa(Date.now()), "today");
  // Depuis midi (heure locale) : 72 h en arrière restent à trois jours de calendrier même à travers un changement d'heure.
  const midi = new Date();
  midi.setHours(12, 0, 0, 0);
  assert.equal(ilYa(midi.getTime() - 3 * 86_400_000), "3 days ago");
  actif("fr");
});

test("heureLue : l'heure seule le jour même, sinon son jour (« selon Whoop 16:47 » lu la veille, 30/10)", () => {
  actif("fr", "Europe/Paris");
  const maintenant = Date.UTC(2026, 9, 30, 8, 58); // ven. 30 oct., 9:58 à Paris
  assert.equal(heureLue(Date.UTC(2026, 9, 30, 7, 12), maintenant), "8:12");
  assert.equal(heureLue(Date.UTC(2026, 9, 29, 15, 47), maintenant), "hier 16:47");
  assert.equal(heureLue(Date.UTC(2026, 9, 27, 15, 47), maintenant), "27 oct. 16:47");
  actif("fr");
});

test("distance : km ou miles", () => {
  actif("fr");
  assert.equal(distanceTexte(2000, "km"), "2\u202f000 m");
  assert.equal(distanceTexte(12000, "km"), "12 km");
  assert.equal(distanceTexte(16093.44, "mi"), "10 mi");
  actif("en");
  assert.equal(distanceTexte(12000, "km"), "12 km");
  actif("fr");
});

test("debutMois, nomMoisCourt et jourSemaineMoisAnnee suivent la langue et le fuseau", () => {
  actif("fr", "Asia/Tokyo");
  assert.equal(debutMois(T).getTime(), Date.UTC(2023, 11, 31, 15, 0)); // 1er janv. 0 h à Tokyo
  assert.equal(debutMois(T, -1).getTime(), Date.UTC(2023, 10, 30, 15, 0));
  assert.equal(debutMois(T, 1).getTime(), Date.UTC(2024, 0, 31, 15, 0));
  actif("fr");
  assert.equal(nomMoisCourt(0), "janv.");
  assert.equal(nomMoisCourt(11), "déc.");
  assert.equal(jourSemaineMoisAnnee(T), "sam. 6 janv. 2024");
  actif("en");
  assert.equal(nomMoisCourt(0), "Jan");
  assert.equal(jourSemaineMoisAnnee(T), "Sat, Jan 6, 2024");
  actif("fr");
});
