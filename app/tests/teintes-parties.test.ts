// Teinte par partie et Nutrition turquoise (v2.2.17, planche teintes-parties, retour du 29/10) : plus de gris
// opaque, fond de page teinté et cartes blanches le jour, cartes teintées la nuit ; contrastes ; vert réservé au validé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { degrades, ombreCarte, type Partie } from "../src/theme/effets.ts";
import { jour, nuit, recettePartie, type ModeCouleur } from "../src/theme/jetons.ts";
import { avecOpacite, jetonsDePartie, meler, rvba } from "../src/theme/teintes.ts";
import { COULEURS_MACROS, DEGRADES_MACROS } from "../src/nutrition/calculs.ts";
import { COULEUR_PARTIE, FOND_PARTIE } from "../src/ui/partie.ts";

const PARTIES = ["accueil", "entrainement", "nutrition", "sante"] as const satisfies readonly Partie[];
const MODES = ["jour", "nuit"] as const satisfies readonly ModeCouleur[];
const base = (m: ModeCouleur) => (m === "nuit" ? nuit : jour);

const lin = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const lum = (c: readonly number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
/** Couleur (hexadécimale ou rgba) posée sur un fond opaque [r, v, b]. */
const sur = (c: string, fond: readonly number[]) => {
  const [r, v, b, a] = rvba(c);
  return [r, v, b].map((x, i) => x * a + fond[i]! * (1 - a));
};
const contraste = (a: readonly number[], b: readonly number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
/** Contraste d'un texte (translucide ou non) sur une surface (translucide ou non) posée sur le fond de la page. */
const texteSur = (texte: string, surface: string, page: string) => {
  const s = sur(surface, sur(page, [0, 0, 0]));
  return contraste(sur(texte, s), s);
};

// ΔE 2000 (écart de couleur perçu) : deux couleurs côte à côte se confondent en dessous de 10.
function lab(h: string) {
  const [r, g, b] = rvba(h).slice(0, 3).map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [X, Y, Z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))] as const;
}
function deltaE(c1: string, c2: string): number {
  const rad = Math.PI / 180;
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const [a1p, a2p] = [a1 * (1 + G), a2 * (1 + G)];
  const [C1p, C2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const h = (b: number, a: number) => ((Math.atan2(b, a) / rad) % 360 + 360) % 360;
  const [h1p, h2p] = [h(b1, a1p), h(b2, a2p)];
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p !== 0) hb = Math.abs(h1p - h2p) > 180 ? (hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2) : hb / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dth = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dth * rad) * Rc;
  return Math.sqrt(((L2 - L1) / Sl) ** 2 + ((C2p - C1p) / Sc) ** 2 + (dH / Sh) ** 2 + Rt * ((C2p - C1p) / Sc) * (dH / Sh));
}

test("outils : mélange opaque et opacité d'un hexadécimal comme d'un rgba", () => {
  assert.equal(meler("#ffffff", "#000000", 0.5), "#808080");
  assert.equal(avecOpacite("#0ca291", 0.08), "rgba(12,162,145,0.08)");
  assert.equal(avecOpacite("rgba(0,0,0,0.9)", 0.5), "rgba(0,0,0,0.45)");
  assert.deepEqual(rvba("rgba(255,255,255,0.94)"), [255, 255, 255, 0.94]);
});

test("jour : fond de page de la partie, cartes et surfaces levées blanches, éléments à la teinte de la partie", () => {
  for (const p of PARTIES) {
    const j = jetonsDePartie(p, "jour");
    const c = jour[COULEUR_PARTIE[p]];
    assert.equal(j.bg, jour[FOND_PARTIE[p]], p);
    assert.equal(j.feuilleFond, j.bg, `${p} : une feuille est une page`);
    for (const k of ["s1", "verreCarte", "carteOpaque", "feuilleGroupe", "reposFond"] as const) assert.equal(j[k], "#ffffff", `${p} ${k}`);
    assert.equal(j.s2, meler("#ffffff", c, recettePartie.jour.s2), p);
    assert.equal(j.s3, meler("#ffffff", c, recettePartie.jour.s3), p);
    assert.equal(j.btnTonalFond, j.s2);
    assert.equal(j.line, avecOpacite(c, recettePartie.jour.line));
  }
});

test("plus de gris : surfaces et filets teintés, jamais un gris neutre (r = v = b), jour et nuit, quatre parties", () => {
  for (const m of MODES)
    for (const p of PARTIES) {
      const j = jetonsDePartie(p, m);
      for (const k of ["s2", "s3", "line", "line2", "verreFilet", "segmentPiste", "btnTonalFond", "feuillePoignee", "navActifPastille", "anneauLibre", "inter", "interrupteurPisteEteint"] as const) {
        const [r, v, b] = rvba(j[k]);
        assert.ok(!(r === v && v === b), `${m} ${p} ${k} ${j[k]}`);
      }
      if (m === "nuit") for (const k of ["s1", "verreCarte", "feuilleFond", "feuilleGroupe"] as const) assert.notEqual(j[k], nuit[k], `${p} ${k} teinté`);
    }
});

test("nuit : la carte est un cran plus claire que le noir, teintée de sa partie ; la même carte opaque pour une ligne qu'on glisse", () => {
  for (const p of PARTIES) {
    const j = jetonsDePartie(p, "nuit");
    const carte = sur(j.verreCarte, [0, 0, 0]);
    assert.ok(contraste(carte, [0, 0, 0]) > 1.1, p);
    assert.deepEqual(rvba(j.carteOpaque).slice(0, 3), carte.map(Math.round), p);
    // la teinte suit la partie : son canal le plus fort est celui de la couleur de la partie
    const c = rvba(nuit[COULEUR_PARTIE[p]]);
    assert.equal(carte.indexOf(Math.max(...carte)), c.slice(0, 3).indexOf(Math.max(...c.slice(0, 3))), p);
  }
});

test("textes t1, t2, t3 à 4,5:1 sur s1, s2, s3 et la carte opaque teintés (sur la page), jour et nuit, quatre parties", () => {
  for (const m of MODES)
    for (const p of PARTIES) {
      const j = jetonsDePartie(p, m);
      for (const s of ["s1", "s2", "s3", "carteOpaque"] as const)
        for (const t of ["t1", "t2", "t3"] as const) {
          const r = texteSur(j[t], j[s], j.bg);
          assert.ok(r >= 4.5, `${m} ${p} ${t} sur ${s} ${r.toFixed(2)}`);
        }
    }
});

test("segmenté : t2 sur la piste et t1 sur le choix à 4,5:1 ; le jour, le choix est blanc", () => {
  for (const m of MODES)
    for (const p of PARTIES) {
      const j = jetonsDePartie(p, m);
      for (const fond of [j.bg, j.verreCarte]) {
        const page = fond === j.bg ? j.bg : (m === "nuit" ? "#000000" : j.bg);
        const piste = sur(j.segmentPiste, sur(fond, sur(page, [0, 0, 0])));
        assert.ok(contraste(sur(j.t2, piste), piste) >= 4.5, `${m} ${p} t2 sur la piste`);
        const choix = sur(j.segmentChoisi, piste);
        assert.ok(contraste(sur(j.t1, choix), choix) >= 4.5, `${m} ${p} t1 sur le choix`);
      }
      if (m === "jour") assert.equal(j.segmentChoisi, "#ffffff");
    }
});

test("interrupteur éteint, le jour : piste teintée, liseré noir à 45 % toujours à 3:1 sur le fond et sur une carte", () => {
  for (const p of PARTIES) {
    const j = jetonsDePartie(p, "jour");
    for (const fond of [j.bg, j.s1]) {
      const f = sur(fond, [255, 255, 255]);
      assert.ok(contraste(sur(j.interrupteurLisereEteint, f), f) >= 3, `${p} liseré sur ${fond}`);
    }
  }
});

test("ombre douce sous les cartes blanches du jour, teintée de la partie ; aucune la nuit", () => {
  for (const p of PARTIES) {
    assert.equal(ombreCarte(p, "nuit"), null);
    const f = rvba(degrades[p].arrets[2]!.couleur).slice(0, 3).join(",");
    assert.ok(ombreCarte(p, "jour")!.includes(`rgba(${f},`), p);
  }
});

test("jetons d'une partie calculés une fois (jamais par ligne d'une liste)", () => {
  assert.equal(jetonsDePartie("sante", "nuit"), jetonsDePartie("sante", "nuit"));
});

test("Nutrition turquoise (A2 « Lagon vif et profond ») : dégradé, couleurs à plat, fond ; le vert reste au validé", () => {
  assert.deepEqual(degrades.nutrition.arrets.map((a) => a.couleur), ["#1bd8bb", "#0ca291", "#007c82"]);
  assert.deepEqual([nuit.partieNutrition, jour.partieNutrition, jour.fondNutrition], ["#1bd8bb", "#0ca291", "#f4fdfc"]);
  assert.ok(contraste(rvba("#ffffff"), rvba(degrades.nutrition.arrets[1]!.couleur)) >= 3, "libellé blanc au centre du bouton");
  assert.ok(contraste(rvba(jour.partieNutrition), rvba("#ffffff")) >= 3, "icône de jour sur blanc");
  for (const m of MODES) {
    assert.ok(deltaE(base(m).partieNutrition, base(m).valide) >= 15, `${m} : loin du vert validé`);
    assert.ok(deltaE(base(m).partieNutrition, base(m).partieAccueil) >= 15, `${m} : loin du bleu de l'Accueil`);
  }
});

test("kcal à la teinte : 4,5:1 sur la carte et le fond, loin des protéines ; jauge au dégradé turquoise", () => {
  assert.equal(COULEURS_MACROS.nuit.kcal, nuit.partieNutrition);
  const j = jetonsDePartie("nutrition", "jour");
  for (const fond of [j.verreCarte, j.bg]) assert.ok(contraste(rvba(COULEURS_MACROS.jour.kcal), rvba(fond)) >= 4.5, fond);
  const n = jetonsDePartie("nutrition", "nuit");
  assert.ok(contraste(rvba(COULEURS_MACROS.nuit.kcal), sur(n.verreCarte, [0, 0, 0])) >= 4.5);
  for (const m of MODES) assert.ok(deltaE(COULEURS_MACROS[m].kcal, COULEURS_MACROS[m].proteines) >= 10, `${m} kcal / protéines`);
  assert.deepEqual(DEGRADES_MACROS.nuit.kcal, ["#1bd8bb", "#0ca291", "#007c82"]);
  assert.equal(DEGRADES_MACROS.jour.kcal[1], COULEURS_MACROS.jour.kcal);
});

test("jauges : piste en noir à 10 % le jour (D2), inchangée la nuit ; pictos des repas sur fond blanc", () => {
  assert.equal(jour.jaugePiste, "rgba(0,0,0,0.1)");
  assert.equal(nuit.jaugePiste, "rgba(255,255,255,0.21)");
  assert.equal(jour.pictoRepas, "#ffffff");
  assert.equal(nuit.pictoRepas, "rgba(255,255,255,0.1)");
});

test("t1 translucide comme t2 et t3 : noir à 90 % le jour, blanc à 94 % la nuit, 4,5:1 sur chaque fond", () => {
  assert.equal(jour.t1, "rgba(0,0,0,0.9)");
  assert.equal(nuit.t1, "rgba(255,255,255,0.94)");
  for (const p of PARTIES) assert.ok(texteSur(jour.t1, jour[FOND_PARTIE[p]], jour[FOND_PARTIE[p]]) >= 4.5, p);
});

/** Fichiers .tsx du dossier src. */
function sources(d = new URL("../src/", import.meta.url).pathname): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

test("en-têtes : l'avatar seulement sur l'Accueil ; plus de suffixe hexadécimal sur t1 (translucide)", () => {
  const avecAvatar = sources().filter((f) => /<TeteOnglet\s+avatar\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(avecAvatar.map((f) => f.slice(f.indexOf("/src/") + 5)), ["ecrans/AccueilAncien.tsx"]);
  const suffixes = sources().filter((f) => /\$\{couleurs\.t[123]\}[0-9a-fA-F]{2}/.test(readFileSync(f, "utf8")));
  assert.deepEqual(suffixes, []);
});
