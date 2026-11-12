// Reconnaissance apprise : ressemblance des activités, trois paliers (suggestion dès 2 choix semblables, automatique dès 5
// et une confiance élevée, jamais d'automatique entre deux sports proches), corrections, oubli des vieilles habitudes,
// « pourquoi » (comme tes mardis soir à Casa Padel).
import assert from "node:assert/strict";
import { test } from "node:test";
import { contexteDe, ecartMinutes, reconnaitre, ressemblance, scores, SEUILS_RECO, type Choix, type Contexte } from "../src/ecrans/reconnaissance.ts";

const JOUR = 86_400_000;
const MAINTENANT = new Date(2026, 9, 29, 21, 0).getTime();
// Padel du mardi soir à Casa Padel : 19 h, 1 h 10, FC à 62 % de la réserve, 30 pas/min, vu par Whoop sans sport
const mardi: Contexte = { jour: 1, minute: 19 * 60, dureeMin: 70, lieuId: "casa-padel", position: null, reserve: 0.62, cadence: 30, sportBrut: "whoop:-1" };
const choix = (n: number, sport: string, c: Partial<Contexte> = {}, o: Partial<Choix> = {}): Choix[] =>
  Array.from({ length: n }, (_, i) => ({ contexte: { ...mardi, minute: mardi.minute + (i % 3) * 10, ...c }, sport, le: MAINTENANT - (i + 1) * 7 * JOUR, ...o }));
// l'activité du soir à reconnaître : mardi, 19 h 05, Casa Padel
const ce: Contexte = { ...mardi, minute: 19 * 60 + 5, dureeMin: 65 };

test("ressemblance : même habitude ≈ 1 ; samedi matin ailleurs, loin ; heures autour de minuit", () => {
  assert.ok(ressemblance(ce, mardi) > 0.95);
  const samedi: Contexte = { ...mardi, jour: 5, minute: 10 * 60, lieuId: "parc", reserve: 0.4, cadence: 120 };
  assert.ok(ressemblance(ce, samedi) < 0.3);
  assert.equal(ecartMinutes(23 * 60 + 30, 30), 60);
  // un indice qu'un seul des deux a ne compte pas (ni pour, ni contre)
  assert.ok(ressemblance({ ...ce, reserve: null }, mardi) > 0.95);
});

test("aucun choix ou un seul : rien ; deux choix semblables : suggestion pré-cochée, avec le pourquoi", () => {
  assert.deepEqual(reconnaitre(ce, [], MAINTENANT), { palier: "aucun" });
  assert.deepEqual(reconnaitre(ce, choix(1, "cat:padel"), MAINTENANT), { palier: "aucun" });
  const r = reconnaitre(ce, choix(2, "cat:padel"), MAINTENANT);
  assert.equal(r.palier, "suggestion");
  if (r.palier !== "suggestion") return;
  assert.equal(r.sport, "cat:padel");
  assert.deepEqual(r.pourquoi, { n: 2, lieuId: "casa-padel", jour: 1, moment: "soir" });
});

test("quatre choix : toujours une suggestion ; cinq : automatique (« Reconnu : Padel ») ", () => {
  assert.equal(reconnaitre(ce, choix(4, "cat:padel"), MAINTENANT).palier, "suggestion");
  const r = reconnaitre(ce, choix(5, "cat:padel"), MAINTENANT);
  assert.equal(r.palier, "auto");
  if (r.palier === "auto") assert.ok(r.confiance >= SEUILS_RECO.AUTO_CONFIANCE, String(r.confiance));
});

test("deux sports proches au même endroit, même soir : jamais d'automatique, les deux en tête", () => {
  const r = reconnaitre(ce, [...choix(6, "cat:padel"), ...choix(3, "cat:tennis")], MAINTENANT);
  assert.equal(r.palier, "ambigu");
  if (r.palier === "ambigu") {
    assert.deepEqual(r.sports, ["cat:padel", "cat:tennis"]);
    // chaque sport dit ses propres choix (« 6 mardis soir », « 3 mardis soir »), pas le total
    assert.deepEqual(r.n, [6, 3]);
  }
  // un tennis de temps en temps (1 sur 9) ne bloque pas l'automatique
  assert.equal(reconnaitre(ce, [...choix(8, "cat:padel"), ...choix(1, "cat:tennis")], MAINTENANT).palier, "auto");
});

test("une correction fait baisser la confiance : plus d'automatique ; d'autres corrections : plus de suggestion", () => {
  const appris = choix(6, "cat:padel");
  const avant = scores(ce, appris, MAINTENANT)[0]!;
  const corrige = [...appris, ...choix(1, "cat:tennis", {}, { refuse: "cat:padel", le: MAINTENANT - JOUR })];
  const apres = scores(ce, corrige, MAINTENANT).find((s) => s.sport === "cat:padel")!;
  assert.ok(apres.confiance < avant.confiance - 0.2, `${avant.confiance} → ${apres.confiance}`);
  assert.equal(reconnaitre(ce, appris, MAINTENANT).palier, "auto");
  assert.equal(reconnaitre(ce, corrige, MAINTENANT).palier, "suggestion");
  const deux = [...appris, ...choix(2, "cat:tennis", {}, { refuse: "cat:padel", le: MAINTENANT - JOUR })];
  assert.notEqual(reconnaitre(ce, deux, MAINTENANT).palier, "suggestion");
  assert.notEqual(reconnaitre(ce, deux, MAINTENANT).palier, "auto");
});

test("ailleurs, un autre jour, à une autre heure : les habitudes du mardi ne disent rien", () => {
  const dimanche: Contexte = { ...ce, jour: 6, minute: 9 * 60, lieuId: "foret", reserve: 0.45, cadence: 110 };
  assert.equal(reconnaitre(dimanche, choix(8, "cat:padel"), MAINTENANT).palier, "aucun");
});

test("le sport brut du capteur s'apprend : Whoop « Tennis » (34) toujours changé en padel, même sans lieu", () => {
  const sansLieu = { lieuId: null, sportBrut: "whoop:34" };
  const r = reconnaitre({ ...ce, ...sansLieu }, choix(5, "cat:padel", sansLieu), MAINTENANT);
  assert.equal(r.palier, "auto");
  if (r.palier === "auto") assert.equal(r.pourquoi.sportBrut, "whoop:34");
});

test("D4 : les séances lancées soi-même aident la suggestion, jamais l'automatique", () => {
  const lancees = choix(8, "cat:padel", {}, { detectee: false });
  assert.equal(reconnaitre(ce, lancees, MAINTENANT).palier, "suggestion");
  assert.equal(reconnaitre(ce, [...lancees, ...choix(5, "cat:padel")], MAINTENANT).palier, "auto");
});

test("les vieilles habitudes s'effacent : cinq padels d'il y a deux ans ne suffisent plus", () => {
  const vieux = choix(5, "cat:padel").map((c) => ({ ...c, le: c.le - 2 * 365 * JOUR }));
  assert.equal(reconnaitre(ce, vieux, MAINTENANT).palier, "aucun");
});

test("contexte d'une activité : jour (lundi = 0) et heure locale, part de la réserve, pas par minute", () => {
  const debut = new Date(2026, 9, 27, 19, 5).getTime();
  const c = contexteDe({ debut, fin: debut + 65 * 60_000, fcMoy: 136, pas: 1950, sportBrut: "whoop:-1", lieuId: "casa-padel" }, { fcRepos: 55, fcMax: 185 });
  assert.equal(c.jour, 1);
  assert.equal(c.minute, 19 * 60 + 5);
  assert.equal(c.dureeMin, 65);
  assert.ok(Math.abs(c.reserve! - 81 / 130) < 1e-9);
  assert.equal(c.cadence, 30);
  assert.equal(contexteDe({ debut, fin: debut + 60_000, fcMoy: null, pas: null, sportBrut: null }, null).reserve, null);
});
