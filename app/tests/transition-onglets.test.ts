// Transition entre les parties : variantes, sens du glissé, « Réduire les animations ». Où s'affiche la bulle de séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { delaiGel, etatEcran, TRANSITION_ONGLETS, TRANSITIONS, varianteEffective } from "../src/ui/transition-onglets.ts";
import { BULLE_SUR, bulleSur } from "../src/ui/bulle-seance.ts";

test("variante par défaut : aucune transition (changement de partie instantané) ; le glissé court reste réglable", () => {
  assert.equal(TRANSITION_ONGLETS, "aucune");
  assert.deepEqual(TRANSITIONS.glisse, { dureeMs: 220, decalage: 24 });
  assert.equal(TRANSITIONS.fondu.dureeMs, 180);
});

test("délai de gel de l'onglet quitté : court sans transition, la durée de la transition sinon", () => {
  assert.equal(delaiGel("aucune"), 60);
  for (const v of ["fondu", "glisse"] as const) assert.ok(delaiGel(v) > TRANSITIONS[v].dureeMs, v);
});

test("l'écran affiché est plein et immobile ; celui qui s'éloigne (aux deux bouts) est effacé", () => {
  for (const v of ["fondu", "glisse"] as const) {
    assert.deepEqual(etatEcran(v, 0), { opacite: 1, decalageX: 0 }, v);
    assert.equal(etatEcran(v, 1).opacite, 0, v);
    assert.equal(etatEcran(v, -1).opacite, 0, v);
  }
});

test("fondu et glissé n'enchaînent jamais deux écrans à moitié transparents : plein dès la mi-course", () => {
  // Fondu enchaîné linéaire : à mi-course, deux écrans à 50 % (presque rien de lisible, mesuré le 5/11). Ici l'écran qui arrive
  // est plein dès |p| = 0,5, et celui qui part (dessous, plein jusque-là) ne s'efface qu'ensuite.
  for (const v of ["fondu", "glisse"] as const) {
    for (const p of [-0.5, -0.25, 0, 0.25, 0.5]) assert.equal(etatEcran(v, p).opacite, 1, `${v} p=${p}`);
    for (const p of [0.6, 0.75, 0.9]) {
      const o = etatEcran(v, p).opacite;
      assert.ok(o > 0 && o < 1, `${v} p=${p} : ${o}`);
    }
    // Deux écrans en même temps (arrive à `a`, part à `1 - a` du même temps) : au moins un est plein tant qu'ils se croisent.
    for (const a of [0.05, 0.2, 0.4, 0.5, 0.6, 0.8, 0.95]) {
      const arrive = etatEcran(v, 1 - a).opacite;
      const part = etatEcran(v, a).opacite;
      assert.ok(Math.max(arrive, part) === 1 || arrive + part >= 1, `${v} a=${a} : ${arrive} + ${part}`);
    }
  }
});

test("le sens du glissé suit l'ordre des onglets : à droite pour un onglet suivant, à gauche pour un précédent", () => {
  assert.equal(etatEcran("glisse", 1).decalageX, 24);
  assert.equal(etatEcran("glisse", -1).decalageX, -24);
  assert.equal(etatEcran("glisse", 5).decalageX, 24);
});

test("le fondu ne glisse pas ; « aucune » n'en montre qu'un", () => {
  assert.equal(etatEcran("fondu", 1).decalageX, 0);
  assert.deepEqual(etatEcran("aucune", 1), { opacite: 0, decalageX: 0 });
  assert.deepEqual(etatEcran("aucune", 0), { opacite: 1, decalageX: 0 });
});

test("« Réduire les animations » force « aucune »", () => {
  assert.equal(varianteEffective("glisse", true), "aucune");
  assert.equal(varianteEffective("fondu", true), "aucune");
  assert.equal(varianteEffective("glisse", false), "glisse");
});

test("la bulle s'affiche sur l'Accueil (le fil), Sport, Moi, les routines et les programmes (D7), pas dans la séance", () => {
  for (const c of ["/train", "/health", "/routines", "/routine/view/42", "/programmes"]) assert.ok(bulleSur(c), c);
  for (const c of ["/", "/session", "/done", "/suivi/direct", "/routine/42", "/routine/view", "/routine/view/42/x", "/history", "/history/42", "/settings"]) assert.ok(!bulleSur(c), c);
  // Leur bas n'est pas encore prêt (bouton à la place de la bulle) : pas encore de bulle.
  for (const c of ["/food", "/boutique", "/boutique/c5", "/plan/42"]) assert.ok(!bulleSur(c), c);
});

test("la liste s'étend d'une ligne (Nutrition, boutique, plan)", () => {
  const liste = [...BULLE_SUR, "/food", "/boutique", "/boutique/*", "/plan/*"];
  for (const c of ["/food", "/boutique", "/boutique/c5", "/plan/42"]) assert.ok(bulleSur(c, liste), c);
  assert.ok(!bulleSur("/plan", liste));
});
