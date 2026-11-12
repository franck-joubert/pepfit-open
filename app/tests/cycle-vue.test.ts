// Ce que montrent les écrans du cycle (planche cycle, écrans 1, 2a, 7) : la frise (règles, première moitié, seconde moitié
// jusqu'à aujourd'hui, piste neutre, fourchette), les dates en mots, et la moyenne lissée du poids ajustée telle que la page
// Poids la calcule (corps-calc.ts), avec la tendance qui lit la moyenne ajustée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatCycle } from "../src/cycle/modele.ts";
import { ajustementPoids } from "../src/cycle/poids.ts";
import { fourchetteCourte, fourchetteLongue, geometrieFrise, motPhase } from "../src/ecrans/cycle/cycle-vue.ts";
import { jourEtat, serieJours } from "../src/ecrans/mesures/corps-calc.ts";
import { definirActif } from "../src/i18n/index.ts";
import { AUJ, JOURS, PESEES } from "./fixtures/cycle-planche.ts";

const midi = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 7).getTime();

test("la frise de la planche : règles 1-5, première moitié 6-16, seconde 17-19, piste 20-27, fourchette 28-32", () => {
  const g = geometrieFrise(etatCycle(JOURS, AUJ))!;
  assert.equal(g.n, 32);
  assert.equal(g.j, 19);
  assert.deepEqual(g.segments, [
    { de: 1, a: 5, sorte: "regles" },
    { de: 6, a: 16, sorte: "premiere" },
    { de: 17, a: 19, sorte: "seconde" },
    { de: 20, a: 27, sorte: "avenir" },
  ]);
  assert.deepEqual(g.fourchette, { de: 28, a: 32 });
  assert.equal(g.dateSeconde, "2026-10-28");
  // sans prévision (un seul début) : pas de fourchette, pas de seconde moitié devinée
  const seul = geometrieFrise(etatCycle(JOURS.filter((j) => j.jour >= "2026-10-12"), AUJ))!;
  assert.equal(seul.fourchette, null);
  assert.equal(seul.seconde, null);
  assert.ok(seul.segments.every((s) => s.sorte !== "seconde"));
});

test("les mots : phases, « 8 – 12 nov. », « entre le 8 et le 12 nov. »", () => {
  definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  const e = etatCycle(JOURS, AUJ);
  assert.ok(e.prevision.possible);
  if (!e.prevision.possible) return;
  assert.equal(fourchetteCourte(e.prevision), "8 – 12 nov.");
  assert.equal(fourchetteLongue(e.prevision), "entre le 8 et le 12 nov.");
  assert.equal(motPhase("seconde"), "Seconde moitié du cycle");
  assert.equal(motPhase("inconnue"), "");
});

test("la page Poids : la moyenne lissée ajustée (61,8) et l'habituelle (61,9), la tendance lit l'ajustée", () => {
  const releves = PESEES.map((p, i) => ({ id: `p${i}`, date: midi(p.jour), valeur: p.kg, manuel: false, origine: null }));
  const aj = ajustementPoids(releves, JOURS, AUJ)!;
  assert.equal(aj.ecart!.toFixed(1), "0.6");
  const jour = midi(AUJ);
  const avec = jourEtat(releves, jour, aj.ajustement);
  const sans = jourEtat(releves, jour);
  assert.equal(avec.l!.toFixed(1), "61.8");
  assert.equal(sans.l!.toFixed(1), "61.9");
  assert.notEqual(avec.tendance, sans.tendance);
  // le 13 octobre (fenêtre des règles) : 62,05 au lieu de 62,27
  const le13 = serieJours(releves, midi("2026-10-13"), midi("2026-10-13"), aj.ajustement)[0]!;
  assert.equal(le13.l!.toFixed(2), "62.05");
  // sans jour de règles : rien n'est ajusté
  assert.equal(ajustementPoids(releves, [], AUJ), null);
});
