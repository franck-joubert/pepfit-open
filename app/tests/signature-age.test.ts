import { test } from "node:test";
import assert from "node:assert/strict";
import { allureRythme, couleurTexteAge, hexVersRvb, sensAffiche, teintesAge, versOklab, type Rvb } from "../src/ui/signature-age/couleur";

const teinte = (c: Rvb) => {
  const [, a, b] = versOklab(c);
  return { h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, chroma: Math.hypot(a, b) };
};
const ecarts = Array.from({ length: 301 }, (_, i) => -15 + i * 0.1);

test("aux repères : très jeune vert, 0 bleu pep, +3 bleu avec un liseré orange, +8 orange", () => {
  const vert = teintesAge(-10);
  assert.ok(vert.froidVif[1] > vert.froidVif[0] && vert.froidVif[1] > vert.froidVif[2], "−10 : le vert domine");
  assert.equal(teintesAge(-10).chaud, 0);
  assert.equal(couleurTexteAge(0), "#3d8bff");
  const zero = teintesAge(0);
  assert.equal(zero.chaud, 0);
  const plus3 = teintesAge(3);
  assert.ok(plus3.chaud > 0.15 && plus3.chaud < 0.4, `+3 : liseré orange (${plus3.chaud})`);
  assert.ok(plus3.froidVif[2] > plus3.froidVif[0], "+3 : corps encore bleu");
  assert.ok(teintesAge(8).chaud > 0.85, "+8 : l'orange domine");
});

test("jamais de rouge : toute teinte chaude reste orange (≥ 40° en OKLCH)", () => {
  for (const e of ecarts) {
    const t = teintesAge(e);
    for (const c of [t.chaudProfond, t.chaudVif]) {
      const { h } = teinte(c);
      assert.ok(h >= 40 && h <= 75, `écart ${e.toFixed(1)} : teinte ${h.toFixed(1)}°`);
    }
  }
});

test("continue : pas de saut de couleur d'un dixième d'année au suivant", () => {
  let avant = teintesAge(-15);
  for (const e of ecarts.slice(1)) {
    const t = teintesAge(e);
    for (const k of ["froidProfond", "froidVif", "chaudProfond", "chaudVif"] as const) {
      const d = Math.max(...t[k].map((v, i) => Math.abs(v - avant[k][i]!)));
      assert.ok(d < 0.04, `écart ${e.toFixed(1)} ${k} : saut ${d.toFixed(3)}`);
    }
    assert.ok(Math.abs(t.chaud - avant.chaud) < 0.03);
    avant = t;
  }
});

test("bornes : au-delà de ±15 ans, la couleur ne bouge plus", () => {
  assert.deepEqual(teintesAge(-40), teintesAge(-15));
  assert.deepEqual(teintesAge(40), teintesAge(15));
});

test("rythme : plus rapide et plus agité quand on vieillit vite, calme sous 0,6×", () => {
  assert.ok(allureRythme(3).vitesse > allureRythme(1).vitesse);
  assert.ok(allureRythme(1).vitesse > allureRythme(-1).vitesse);
  assert.equal(allureRythme(0.5).agitation, 0);
  assert.equal(allureRythme(3).agitation, 1);
});

test("texte d'écart lisible : ≥ 4,5:1 sur le fond de jour, ≥ 4,5:1 sur le fond de nuit", () => {
  const lum = (c: Rvb) => {
    const l = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
  };
  const contraste = (a: Rvb, b: Rvb) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x! + 0.05) / (y! + 0.05);
  };
  for (const e of ecarts) {
    const j = contraste(hexVersRvb(couleurTexteAge(e, true)), hexVersRvb("#ffffff"));
    const n = contraste(hexVersRvb(couleurTexteAge(e)), hexVersRvb("#000000"));
    assert.ok(j >= 4.5, `jour, écart ${e.toFixed(1)} : ${j.toFixed(2)}`);
    assert.ok(n >= 4.5, `nuit, écart ${e.toFixed(1)} : ${n.toFixed(2)}`);
    if (e >= 0.5) {
      const h = teinte(hexVersRvb(couleurTexteAge(e, true))).h;
      assert.ok(h >= 40, `jour, écart ${e.toFixed(1)} : texte orange, pas rouge (${h.toFixed(1)}°)`);
    }
  }
});

test("daltonisme : très jeune (−10) et plus vieux (+8) restent distincts en protanopie, deutéranopie, tritanopie", () => {
  // Machado 2009, sévérité 1, en sRGB linéaire ; couleur perçue = encre vive dominante × éclat (comme le shader)
  const M = [
    [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
    [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  ];
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const gam = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  const forme = (e: number): Rvb => {
    const t = teintesAge(e);
    return t.froidVif.map((v, i) => Math.min(1, (v * (1 - t.chaud) + t.chaudVif[i]! * t.chaud) * t.eclat)) as Rvb;
  };
  for (const m of M) {
    const [a, b] = [forme(-10), forme(8)].map((c) => {
      const l = c.map(lin);
      return versOklab(m.map((r) => gam(r[0]! * l[0]! + r[1]! * l[1]! + r[2]! * l[2]!)) as Rvb);
    });
    const dE = Math.hypot(a![0] - b![0], a![1] - b![1], a![2] - b![2]) * 100;
    assert.ok(dE >= 20, `ΔE OKLab ${dE.toFixed(1)}`);
  }
});

test("sens affiché : celui de la valeur animée, celui de la cible seulement près de 0", () => {
  assert.equal(sensAffiche(-9.9, 0), -1); // départ de −10 vers 0 : encore « de moins »
  assert.equal(sensAffiche(-0.02, 0), 0); // arrivée : « pile votre âge »
  assert.equal(sensAffiche(0.01, 3), 1); // traversée de 0 vers +3 : pas de « pile » fugitif
  assert.equal(sensAffiche(2.5, 3), 1);
});
