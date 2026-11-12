// Champ et bande de molette posés sur l'aura (retour du 30/10 : « le champ devrait être transparent un peu ») :
// blanc translucide la nuit, noir translucide le jour, jamais de gris opaque ; saisie et indication à 4,5:1 au pire point
// de l'aura, repère de focus à 3:1 sur le champ, quatre parties, jour et nuit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { champVerre, type Partie } from "../src/theme/effets.ts";
import { jour, nuit, type ModeCouleur } from "../src/theme/jetons.ts";
import { FOND_PARTIE } from "../src/ui/partie.ts";
import { cibleAura, HAUTEUR_AURA, nappesAura } from "../src/ui/aura-calc.ts";
import { jetonsDePartie } from "../src/theme/teintes.ts";
import { THEME } from "../src/ecrans/parcours-calc.ts";

const PARTIES = ["accueil", "entrainement", "nutrition", "sante"] as const satisfies readonly Partie[];
const LARGEUR = 412;

function couleur(c: string): [number[], number] {
  if (c.startsWith("#")) return [[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)), 1];
  const v = c.slice(c.indexOf("(") + 1, -1).split(",").map(Number);
  return [v.slice(0, 3), v[3] ?? 1];
}
const sur = (haut: number[], a: number, bas: number[]) => haut.map((v, i) => v * a + bas[i]! * (1 - a));
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (a: number[], b: number[]) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

/** Teintes de l'aura sur le fond de la page (même échantillonnage que tests/cartes-verre.test.ts), plus le fond nu. */
function teintesAura(partie: Partie, mode: ModeCouleur): number[][] {
  const fond = couleur(mode === "nuit" ? nuit.bg : jour[FOND_PARTIE[partie]])[0];
  const etat = cibleAura(partie, mode);
  const sortie: number[][] = [fond];
  for (let t = 0; t < 60; t += 4) {
    const nappes = nappesAura(etat, t, 1, LARGEUR).map((n) => ({ ...n, rvb: couleur(n.coeur)[0], al: couleur(n.coeur)[1] }));
    for (let x = 0; x <= LARGEUR; x += 12)
      for (let y = 0; y <= HAUTEUR_AURA; y += 12) {
        let c = fond;
        for (const n of nappes) {
          const d = Math.hypot(x - n.x, y - n.y) / n.r;
          const a = d < 0.45 ? n.al * (1 - d) : d < 1 ? n.al * 0.55 * (1 - (d - 0.45) / 0.55) : 0;
          c = sur(n.rvb, a, c);
        }
        sortie.push(c);
      }
  }
  return sortie;
}

/** Contraste le plus faible de `texte` sur le champ translucide posé sur l'aura. */
function pire(mode: ModeCouleur, partie: Partie, texte: (fond: number[], aura: number[]) => number): number {
  const [f, a] = couleur(champVerre[mode].fond);
  return teintesAura(partie, mode).reduce((m, aura) => Math.min(m, texte(sur(f, a, aura), aura)), Infinity);
}

test("champ translucide : blanc à faible opacité la nuit, noir à faible opacité le jour (pas de gris opaque)", () => {
  for (const [mode, base] of [["nuit", [255, 255, 255]], ["jour", [0, 0, 0]]] as const) {
    const [rvb, a] = couleur(champVerre[mode].fond);
    assert.deepEqual(rvb, base, mode);
    assert.ok(a > 0 && a <= 0.12, `${mode} : opacité ${a}`);
    assert.deepEqual(couleur(champVerre[mode].focus)[0], base, `${mode} : focus`);
  }
});

const pireTexte = (role: "t1" | "t2", mode: ModeCouleur, partie: Partie) => {
  const [t, at] = couleur(jetonsDePartie(partie, mode)[role]);
  return pire(mode, partie, (fond) => contraste(sur(t, at, fond), fond));
};

test("saisie (t1) à 4,5:1 sur le champ, au pire point de l'aura, quatre parties, jour et nuit", () => {
  for (const mode of ["nuit", "jour"] as const)
    for (const partie of PARTIES) {
      const r = pireTexte("t1", mode, partie);
      assert.ok(r >= 4.5, `${mode} ${partie} t1 ${r.toFixed(2)}`);
    }
});

test("indication du champ (« @ », exemple) en t2 : 4,5:1 au pire point de l'aura des étapes à champ (t3 n'y tient pas)", () => {
  for (const mode of ["nuit", "jour"] as const)
    for (const partie of new Set([THEME.prenom])) {
      const r = pireTexte("t2", mode, partie);
      assert.ok(r >= 4.5, `${mode} ${partie} t2 ${r.toFixed(2)}`);
    }
  const ui = readFileSync(new URL("../src/ecrans/parcours-ui.tsx", import.meta.url), "utf8");
  const champ = ui.slice(ui.indexOf("export function ChampParcours"), ui.indexOf("export function AgeVivant"));
  assert.doesNotMatch(champ, /couleurs\.t3/);
});

test("repère de focus : filet à 3:1 sur le champ et sur l'aura autour", () => {
  for (const mode of ["nuit", "jour"] as const)
    for (const partie of PARTIES) {
      const [t, at] = couleur(champVerre[mode].focus);
      const r = pire(mode, partie, (fond, aura) => Math.min(contraste(sur(t, at, fond), fond), contraste(sur(t, at, aura), aura)));
      assert.ok(r >= 3, `${mode} ${partie} focus ${r.toFixed(2)}`);
    }
});

test("le champ du parcours et la bande des molettes passent par le jeton, plus par le gris s2", () => {
  const ui = readFileSync(new URL("../src/ecrans/parcours-ui.tsx", import.meta.url), "utf8");
  const molette = readFileSync(new URL("../src/ui/Molette.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /couleurs\.s2/);
  assert.match(ui, /champVerre\[mode\]\.fond/);
  assert.match(ui, /champVerre\[mode\]\.focus/);
  assert.match(molette, /champVerre\[mode\]\.fond/);
});
