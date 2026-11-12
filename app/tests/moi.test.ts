// Moi (Social v4, A ; planche cercles-etablissements-v4/moi.html) : l'écran Santé sous son nouveau nom, la rangée
// Récupération · Pas · Effort sous le semainier, taille et IMC à droite de la date, la durée du sommeil à côté du libellé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { casesSante, resumeSante } from "../src/ecrans/sante-vue.ts";

const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const sante = lire("ecrans/Sante.tsx");
const corps = lire("ecrans/corps/BlocCorps.tsx");

test("Moi : titre « Moi », la rangée de Sport sous le semainier puis le corps, plus de ScoresSante ni de −2,1 sur la case", () => {
  assert.match(sante, /TeteOnglet titre=\{t\("ui\.onglet\.moi"\)\}/);
  assert.match(sante, /<RangeeSport date=\{date\} \/>/);
  assert.ok(sante.indexOf("<BandeSemaine") < sante.indexOf("<RangeeSport") && sante.indexOf("<RangeeSport") < sante.indexOf("<BlocCorps"));
  assert.match(lire("ecrans/corps/ZoneCorps.tsx"), /<CorpsSante/, "le personnage est dans la zone du bloc Corps");
  assert.ok(!/<ScoresSante/.test(sante), "Récupération et Effort sont dans la rangée");
  assert.ok(!/ans1\(k\.ecart\)/.test(sante), "l'écart de l'âge n'est plus écrit sur la case");
  // les pages restent atteignables : la rangée ouvre Récupération, Pas, Effort ; le bilan ouvre Énergie
  const rangee = lire("ecrans/RangeeSport.tsx");
  for (const p of ["/sante/recuperation", "/sante/pas", "/sante/effort"]) assert.ok(rangee.includes(p), p);
  assert.ok(corps.includes('pathname: "/sante/energie"'));
});

test("Moi : taille et IMC à droite de « Aujourd'hui » (prop droite du semainier), jamais le sexe", () => {
  assert.match(sante, /droite=\{/);
  assert.match(lire("ui/BandeSemaine.tsx"), /serie \? <Serie n=\{serie\} couleur=\{couleur\} \/> : droite/);
  assert.equal(resumeSante({ sexe: "f", tailleCm: 168, poidsKg: 60 }), "1,68 m, IMC 21,3");
  assert.equal(resumeSante({ sexe: "f", tailleCm: null, poidsKg: 60 }), "");
});

test("Moi : « Sommeil 7 h 12 » avec la performance en valeur ; la case Pas n'est plus sur le corps", () => {
  const d = { sommeilMin: 432, performance: 87, fcRepos: 54, pas: 8420, vfc: 62 };
  const cases = casesSante(null, d, "kg");
  const sommeil = cases.find((c) => c.id === "sommeil")!;
  assert.deepEqual([sommeil.valeur, sommeil.aCote, sommeil.suite], ["87 %", "7 h 12", null]);
  assert.ok(!cases.some((c) => c.id === "pas"));
  assert.match(lire("ecrans/corps/ZoneCorps.tsx"), /k\.aCote/);
});
