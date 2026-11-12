// Socle visuel de la refonte (lot 1) : jetons du jour, record en or, dégradé du geste principal, médaille.
import assert from "node:assert/strict";
import { test } from "node:test";
import { axeDegrade, degrades, or } from "../src/theme/effets.ts";
import { jour, nuit } from "../src/theme/jetons.ts";
import { boucleMedaille, reflet } from "../src/theme/mouvement.ts";

// Jetons de base, hors d'une partie : dans un écran, theme/teintes.ts les teinte de sa partie (tests/teintes-parties).
test("jetons du jour : fond blanc, gris froids ; textes et filets en noir translucide (27/10, t1 aussi depuis le 29/10)", () => {
  assert.deepEqual(
    { bg: jour.bg, s1: jour.s1, s2: jour.s2, s3: jour.s3, line: jour.line, line2: jour.line2, t1: jour.t1, t2: jour.t2, t3: jour.t3, valideVoile: jour.valideVoile, inter: jour.inter },
    { bg: "#ffffff", s1: "#f4f5f7", s2: "#e8ebef", s3: "#dce0e5", line: "rgba(0,0,0,0.09)", line2: "rgba(0,0,0,0.18)", t1: "rgba(0,0,0,0.9)", t2: "rgba(0,0,0,0.7)", t3: "rgba(0,0,0,0.58)", valideVoile: "#e2f2e7", inter: "#cdd3da" },
  );
  assert.equal(jour.action, "#e8590c");
});

test("feuilles du bas en jour : blanches, éléments en s1 ; interrupteur à pastille blanche", () => {
  assert.equal(jour.feuilleFond, jour.bg);
  assert.equal(jour.feuilleGroupe, jour.s1);
  assert.equal(jour.reposFond, jour.bg);
  assert.equal(jour.interrupteurPiste, jour.t1);
  assert.equal(jour.interrupteurPisteEteint, jour.inter);
  assert.equal(jour.interrupteurBouton, "#ffffff");
  assert.equal(jour.interrupteurBoutonEteint, "#ffffff");
});

test("nuit inchangée, sauf le record et t1 translucide (29/10)", () => {
  assert.deepEqual([nuit.bg, nuit.s1, nuit.s2, nuit.s3, nuit.t1, nuit.feuilleFond], ["#000000", "#141312", "#1f1d1b", "#2c2926", "rgba(255,255,255,0.94)", "#141312"]);
  assert.equal(nuit.interrupteurPisteEteint, nuit.s3);
  assert.equal(nuit.interrupteurBoutonEteint, nuit.t3);
});

test("record en or, nuit et jour", () => {
  assert.equal(nuit.record, "#eec25a");
  assert.equal(jour.record, "#8a6100");
});

test("dégradé du geste principal d'Entraînements : 135°, #ff8a1f → #f2610f (48 %) → #e0391a, texte blanc", () => {
  assert.deepEqual(degrades.entrainement.arrets.map((a) => [a.offset, a.couleur]), [[0, "#ff8a1f"], [0.48, "#f2610f"], [1, "#e0391a"]]);
  assert.equal(degrades.entrainement.sur, "#ffffff");
});

test("axe du dégradé façon CSS : les coins opposés tombent sur les arrêts extrêmes", () => {
  const proche = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  const carre = axeDegrade(135, 1, 1);
  [carre.x1, carre.y1, carre.x2, carre.y2].forEach((v, i) => proche(v, [0, 0, 1, 1][i]!));
  for (const [l, h] of [[360, 52], [40, 40], [120, 44]] as const) {
    const a = axeDegrade(135, l, h);
    const ax = { x: (a.x2 - a.x1) * l, y: (a.y2 - a.y1) * h };
    const n2 = ax.x * ax.x + ax.y * ax.y;
    // Position (0 à 1) d'un point projeté sur l'axe du dégradé.
    const t = (x: number, y: number) => ((x - a.x1 * l) * ax.x + (y - a.y1 * h) * ax.y) / n2;
    proche(t(0, 0), 0);
    proche(t(l, h), 1);
    proche(t(l / 2, h / 2), 0.5);
  }
  const vertical = axeDegrade(180, 100, 50);
  proche(vertical.x1, 0.5);
  proche(vertical.y1, 0);
  proche(vertical.y2, 1);
});

test("reflets : un passage court, la médaille repasse toutes les 6 s", () => {
  assert.ok(reflet.appui < reflet.apparition);
  const b = boucleMedaille();
  assert.equal(b.passage + b.pause, 6000);
  assert.equal(b.passage, 900);
  assert.ok(b.delai > 0);
  assert.deepEqual(boucleMedaille({ medailleDelai: 0, medaille: 900, medaillePeriode: 500 }).pause, 0);
});

test("médaille dorée : disque or, étoile claire, reflet blanc", () => {
  assert.deepEqual(or.disque.map((a) => a.couleur), ["#fff0b8", "#eec25a", "#b98621"]);
  assert.equal(or.etoile, "#fff8e1");
  assert.ok(or.reflet.some((a) => (a.opacite ?? 1) > 0.5));
});
