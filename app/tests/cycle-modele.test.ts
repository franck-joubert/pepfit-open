// Le modèle du suivi du cycle (planche cycle, NOTES § 2 et § 3) : les épisodes déduits des jours, les cycles, les
// statistiques, la prévision (le tableau des exemples de NOTES § 3.3), les phases, les jours de la même moitié pour la
// Récupération et la moyenne lissée du poids ajustée, recalculés depuis les données de la planche.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CYCLE, cycles, ecartAppris, episodes, etatCycle, joursFourchette, joursMemeMoitie, joursRegles, phase, plus, poidsAjuste, prevision, stats,
  type Episode, type JourCycle,
} from "../src/cycle/modele.ts";
import { AUJ, JOURS, PESEES, REGLES } from "./fixtures/cycle-planche.ts";

const j = (jour: string, o: Partial<JourCycle> = {}): JourCycle => ({ jour, flux: 2, fin: false, energie: null, humeur: null, gene: null, source: "saisie", ...o });

test("la planche : 9 cycles, jour 19, seconde moitié depuis 3 jours, prochaines règles du 8 au 12 nov.", () => {
  const e = etatCycle(JOURS, AUJ);
  assert.equal(e.cycles.length, 9);
  assert.deepEqual(e.cycles.map((c) => c.duree), [28, 30, 29, 28, 31, 27, 29, 29, null]);
  assert.deepEqual(e.cycles.map((c) => c.regles), [5, 4, 5, 5, 6, 5, 5, 5, 5]);
  assert.equal(e.stats.n, 6);
  assert.equal(e.stats.moyenne!.toFixed(2), "28.83");
  assert.equal(e.stats.sd!.toFixed(2), "1.33");
  assert.equal(e.stats.mot, "regulier");
  assert.equal(Math.round(e.stats.regles!), 5);
  assert.deepEqual([e.stats.min, e.stats.max], [27, 31]);
  assert.deepEqual(e.prevision, { possible: true, centre: "2026-11-10", du: "2026-11-08", au: "2026-11-12", fourchette: 2, n: 6, duree: 29 });
  assert.equal(e.phase!.j, 19);
  assert.equal(e.phase!.nom, "seconde");
  assert.equal(e.phase!.debutSeconde, 17);
  assert.equal(e.depuis, 3);
  assert.deepEqual(joursFourchette(e.prevision), ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
  // les 4 plus anciens viennent de Santé Connect
  assert.deepEqual(e.cycles.map((c) => c.source), [...REGLES.map((r) => r.source)]);
});

/** Les cas de NOTES § 3.3 : cycle en cours commencé le 12 octobre, règles de 5 jours, durées du plus ancien au plus récent. */
function cas(durees: number[]) {
  const eps: Episode[] = [{ debut: "2026-10-12", fin: "2026-10-16", jours: 5, ouvert: false, source: "saisie" }];
  for (let i = durees.length - 1; i >= 0; i--) eps.unshift({ debut: plus(eps[0]!.debut, -durees[i]!), fin: plus(eps[0]!.debut, -durees[i]! + 4), jours: 5, ouvert: false, source: "saisie" });
  const cs = cycles(eps);
  return { s: stats(cs), p: prevision(cs) };
}

test("le tableau des prévisions de NOTES § 3.3", () => {
  const planche = cas([29, 28, 31, 27, 29, 29]);
  assert.equal(planche.s.mot, "regulier");
  assert.deepEqual(planche.p.possible && [planche.p.du, planche.p.au, planche.p.fourchette], ["2026-11-08", "2026-11-12", 2]);
  const un = cas([29]);
  assert.equal(un.s.sd, null);
  assert.equal(un.s.mot, null);
  assert.deepEqual(un.p.possible && [un.p.du, un.p.au, un.p.fourchette], ["2026-11-06", "2026-11-14", 4]);
  const deux = cas([27, 31]);
  assert.equal(deux.s.sd!.toFixed(1), "2.8");
  assert.equal(deux.s.mot, "assez");
  assert.deepEqual(deux.p.possible && [deux.p.du, deux.p.au, deux.p.fourchette], ["2026-11-06", "2026-11-14", 4]);
  const assez = cas([26, 31, 28, 33, 27, 30]);
  assert.equal(assez.s.moyenne!.toFixed(1), "29.2");
  assert.equal(assez.s.mot, "assez");
  assert.deepEqual(assez.p.possible && [assez.p.du, assez.p.au, assez.p.fourchette], ["2026-11-06", "2026-11-14", 4]);
  const variable = cas([24, 35, 28, 40, 26, 33]);
  assert.equal(variable.s.moyenne, 31);
  assert.equal(variable.s.mot, "variable");
  assert.deepEqual(variable.p, { possible: false, raison: "variable", fourchette: 10 });
  const oubli = cas([29, 28, 70, 30, 29]);
  assert.equal(oubli.s.n, 4);
  assert.equal(oubli.s.moyenne, 29);
  assert.equal(oubli.s.mot, "regulier");
  assert.deepEqual(oubli.p.possible && [oubli.p.du, oubli.p.au], ["2026-11-08", "2026-11-12"]);
  assert.deepEqual(cas([]).p, { possible: false, raison: "aucun" });
});

test("les épisodes : un jour sans marque au plus entre deux ; « pas encore » reste ouvert 10 jours", () => {
  // un trou d'un jour : même épisode ; deux jours : un autre
  const e = episodes([j("2026-10-01"), j("2026-10-03"), j("2026-10-06"), j("2026-10-07", { fin: true })], "2026-10-30");
  assert.deepEqual(e.map((x) => [x.debut, x.fin, x.jours, x.ouvert]), [["2026-10-01", "2026-10-03", 3, false], ["2026-10-06", "2026-10-07", 2, false]]);
  // les notes seules (flux null) ne font pas de règles
  assert.equal(episodes([j("2026-10-01", { flux: null })], "2026-10-02").length, 0);
  // fin « pas encore » : ouvert, puis fermé seul au bout de 10 jours sur le dernier jour noté
  assert.equal(episodes([j("2026-10-20")], "2026-10-29")[0]!.ouvert, true);
  assert.equal(episodes([j("2026-10-20")], "2026-10-30")[0]!.ouvert, false);
  // une saisie dans l'épisode l'emporte sur Santé Connect
  assert.equal(episodes([j("2026-10-01", { source: "sante_connect" }), j("2026-10-02")], "2026-10-30")[0]!.source, "saisie");
  assert.deepEqual([...joursRegles(e)], ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-06", "2026-10-07"]);
});

test("les phases : règles de 5 jours si la fin manque, inconnue sans prévision, cycle terminé relu avec son vrai début suivant", () => {
  // un seul début, ouvert : jours 1 à 5 « règles », puis « inconnue » (rien n'est deviné)
  const seul = cycles(episodes([j("2026-10-12")], "2026-10-14"));
  assert.equal(phase("2026-10-14", seul)!.nom, "regles");
  assert.equal(phase("2026-10-16", seul)!.nom, "regles");
  const ferme = cycles(episodes([j("2026-10-12", { fin: true })], "2026-10-30"));
  assert.equal(phase("2026-10-20", ferme)!.nom, "inconnue");
  assert.equal(phase("2026-10-20", ferme)!.certaine, false);
  assert.equal(phase("2026-10-11", ferme), null);
  // la planche : le 10 octobre (cycle terminé de 29 jours commencé le 13 sept.) est en seconde moitié, le 20 sept. en première
  const cs = etatCycle(JOURS, AUJ).cycles;
  assert.equal(phase("2026-10-10", cs)!.nom, "seconde");
  assert.equal(phase("2026-09-20", cs)!.nom, "premiere");
  assert.equal(phase("2026-09-14", cs)!.nom, "regles");
});

test("la Récupération : les jours de la même moitié dans les 3 derniers cycles terminés, jamais dans le cycle du jour", () => {
  const cs = etatCycle(JOURS, AUJ).cycles;
  const m = joursMemeMoitie(AUJ, cs)!;
  assert.equal(m.moitie, "seconde");
  // 13 jours de seconde moitié dans chacun des 3 cycles d'avant (27, 29, 29 jours)
  assert.equal(m.jours.size, 39);
  assert.ok(![...m.jours].some((d) => d >= "2026-10-12"));
  assert.ok(m.jours.has("2026-10-11") && m.jours.has("2026-09-29") && !m.jours.has("2026-09-28"));
  // première moitié : règles comprises
  const p = joursMemeMoitie("2026-10-14", cs)!;
  assert.equal(p.moitie, "premiere");
  assert.ok(p.jours.has("2026-09-13") && p.jours.has("2026-09-28") && !p.jours.has("2026-09-29"));
  // sans prévision possible, la phase est inconnue : rien n'est ajusté
  assert.equal(joursMemeMoitie("2026-10-20", cycles(episodes([j("2026-10-12", { fin: true })], "2026-10-30"))), null);
});

test("le poids : 61,8 kg ajustés au lieu de 61,9 ; l'écart appris de 0,6 kg autour du 1er jour ; 3 fois moins avant l'apprentissage", () => {
  const e = etatCycle(JOURS, AUJ);
  const pv = e.prevision;
  assert.ok(pv.possible);
  const l = poidsAjuste(PESEES, [...e.episodes.map((x) => x.debut), pv.centre]);
  const d = l.at(-1)!;
  assert.equal(d.kg, 61.6);
  assert.equal(d.ajuste.toFixed(1), "61.8");
  assert.equal(d.brut.toFixed(1), "61.9");
  assert.equal(ecartAppris(l)!.toFixed(1), "0.6");
  const le13 = l.find((x) => x.jour === "2026-10-13")!;
  assert.equal(le13.brut.toFixed(2), "62.27");
  assert.equal(le13.ajuste.toFixed(2), "62.05");
  // avant 3 cycles pesés : la pesée de la fenêtre compte 3 fois moins (3,3 % au lieu de 10 %)
  const court = poidsAjuste([{ jour: "2026-10-01", kg: 60 }, { jour: "2026-10-11", kg: 63 }], ["2026-10-12"]);
  assert.equal(court[1]!.ecart, null);
  assert.equal(court[1]!.ajuste.toFixed(3), (60 + 0.1 * CYCLE.poids.poidsReduit * 3).toFixed(3));
  assert.equal(court[1]!.brut.toFixed(2), "60.30");
});

test("changer CYCLE recalcule tout sans toucher aux jours", () => {
  const avant = etatCycle(JOURS, AUJ);
  const p = { ...CYCLE, version: 2, secondeMoitie: 14 };
  const apres = etatCycle(JOURS, AUJ, AUJ, p);
  assert.equal(avant.phase!.debutSeconde, 17);
  assert.equal(apres.phase!.debutSeconde, 16);
  assert.equal(apres.depuis, 4);
});
