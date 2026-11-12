// Notifications et appli ouverte : montrer ou non, retirer en arrivant (docs/NOTIFICATIONS.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aRetirer, cibleEcran, cibleNotif, retourNotif, routeAuToucher } from "../src/natif/notifications-regles.ts";

test("cible de chaque notification", () => {
  assert.equal(cibleNotif("fin-repos"), "seance");
  assert.equal(cibleNotif("fin-cible"), "seance");
  assert.equal(cibleNotif("planif-p1-2026-10-31"), "entrainements");
  assert.equal(cibleNotif("repas-dej-2026-10-31"), "nutrition");
  assert.equal(cibleNotif("traitement-12"), "traitements");
  assert.equal(cibleNotif("autre"), null);
});

test("écran affiché", () => {
  assert.equal(cibleEcran("/session"), "seance");
  assert.equal(cibleEcran("/train"), "entrainements");
  assert.equal(cibleEcran("/food"), "nutrition");
  assert.equal(cibleEcran("/traitements"), "traitements");
  assert.equal(cibleEcran("/traitements/4"), "traitements");
  assert.equal(cibleEcran("/"), null);
  assert.equal(cibleEcran("/history"), null);
});

test("appli en arrière-plan : la notification, avec son son", () => {
  assert.deepEqual(retourNotif({ premierPlan: false, identifiant: "fin-repos", ecran: null, sonne: true }), { systeme: true, son: true, vibration: false, bandeau: false });
  assert.deepEqual(retourNotif({ premierPlan: false, identifiant: "repas-a-1", ecran: "nutrition", sonne: false }), { systeme: true, son: false, vibration: false, bandeau: false });
});

test("repos terminé appli ouverte : pas de notification, le son seulement, pas de bandeau (la bulle montre la séance)", () => {
  for (const ecran of ["seance", "nutrition", null] as const) {
    assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "fin-repos", ecran, sonne: true, vibre: true }), { systeme: false, son: true, vibration: true, bandeau: false });
  }
  assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "fin-repos", ecran: "seance", sonne: false }), { systeme: false, son: false, vibration: false, bandeau: false });
  // Fin d'une série en durée : l'appli vibre déjà (useChronoSerie), pas une seconde fois.
  assert.equal(retourNotif({ premierPlan: true, identifiant: "fin-cible", ecran: "seance", sonne: true, vibre: true }).vibration, false);
  assert.equal(retourNotif({ premierPlan: true, identifiant: "fin-cible", ecran: null, sonne: true, vibre: true }).vibration, true);
});

test("rappel appli ouverte : bandeau seulement hors de l'écran concerné", () => {
  assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "repas-a-1", ecran: null, sonne: true }), { systeme: false, son: true, vibration: false, bandeau: true });
  assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "repas-a-1", ecran: "nutrition", sonne: true }), { systeme: false, son: true, vibration: false, bandeau: false });
  assert.equal(retourNotif({ premierPlan: true, identifiant: "planif-x", ecran: "entrainements", sonne: true }).bandeau, false);
  assert.equal(retourNotif({ premierPlan: true, identifiant: "planif-x", ecran: "seance", sonne: true }).bandeau, true);
  assert.equal(retourNotif({ premierPlan: true, identifiant: "inconnue", ecran: null, sonne: true }).bandeau, false);
});

test("retirer en arrivant : seulement les notifications de cet écran", () => {
  const affichees = ["fin-repos", "fin-cible", "repas-a-1", "planif-x", "traitement-2"];
  assert.deepEqual(aRetirer(affichees, "seance"), ["fin-repos", "fin-cible"]);
  assert.deepEqual(aRetirer(affichees, "nutrition"), ["repas-a-1"]);
  assert.deepEqual(aRetirer(affichees, "traitements"), ["traitement-2"]);
  assert.deepEqual(aRetirer(affichees, null), []);
  assert.deepEqual(aRetirer([], "seance"), []);
});

test("toucher : seul le rappel du cycle ouvre un écran ; les autres rouvrent l'appli là où elle était", () => {
  for (const id of ["fin-repos", "planif-p1-2026-10-31", "rappel-sieste", "fin-sieste", "0:a1b2c3", "coach-invitation", "social"]) assert.equal(routeAuToucher(id), null);
  assert.equal(cibleNotif("coach-invitation"), null);
});
