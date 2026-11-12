// Fonds du jour par partie (retour du 27/10) : quasi-blancs teintés de la partie, pas du blanc pur ; textes
// à 4,5:1 ; la nuit, le noir de toujours.
import assert from "node:assert/strict";
import { test } from "node:test";
import { degrades, type Partie } from "../src/theme/effets.ts";
import { jour, nuit } from "../src/theme/jetons.ts";
import { FOND_PARTIE } from "../src/ui/partie.ts";
import { rvbDe } from "../src/ui/vague-menu.ts";

const PARTIES = ["accueil", "entrainement", "nutrition", "sante"] as const satisfies readonly Partie[];
const rvb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** Texte rgba posé sur un fond opaque, contraste WCAG. */
function contraste(texte: string, fond: number[]): number {
  const v = texte.startsWith("#") ? [...rvb(texte), 1] : texte.slice(texte.indexOf("(") + 1, -1).split(",").map(Number);
  const t = fond.map((f, i) => v[i]! * v[3]! + f * (1 - v[3]!));
  const [x, y] = [lum(t), lum(fond)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

test("jour : chaque partie a son quasi-blanc, teinté de sa couleur, distinct du blanc des cartes", () => {
  const vus = new Set<string>();
  for (const p of PARTIES) {
    const f = jour[FOND_PARTIE[p]];
    assert.notEqual(f.toLowerCase(), "#ffffff", p);
    vus.add(f);
    const c = rvb(f);
    // quasi-blanc : chaque canal à 240 au moins, et au moins un sous 252 (on le distingue du blanc)
    assert.ok(c.every((v) => v >= 240) && c.some((v) => v <= 251), `${p} : ${f}`);
    // la teinte suit la partie : le canal le plus fort de la couleur claire de la partie est le plus fort du fond
    const clair = rvbDe(degrades[p].arrets[0]!.couleur);
    const fort = clair.indexOf(Math.max(...clair));
    assert.equal(c[fort], Math.max(...c), `${p} : teinte`);
  }
  assert.equal(vus.size, 4);
});

test("jour : t1, t2, t3 à 4,5:1 sur chaque fond ; nuit : le noir", () => {
  for (const p of PARTIES) {
    const f = rvb(jour[FOND_PARTIE[p]]);
    for (const t of ["t1", "t2", "t3"] as const) assert.ok(contraste(jour[t], f) >= 4.5, `${p} ${t}`);
    assert.equal(nuit[FOND_PARTIE[p]], nuit.bg);
  }
});

test("jour : libellés « Z » des zones de FC à 4,5:1 sur chaque fond, le blanc des cartes et s1 (v2.2.20)", () => {
  const fonds = [...PARTIES.map((p) => jour[FOND_PARTIE[p]]), jour.bg, jour.verreCarte, jour.s1];
  for (const z of ["zone1", "zone2", "zone3", "zone4", "zone5"] as const)
    for (const f of fonds) assert.ok(contraste(jour[z], rvb(f)) >= 4.5, `${z} ${jour[z]} sur ${f}`);
});
