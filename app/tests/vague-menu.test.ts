// Vague du menu flottant : rien au départ, tout à la fin, bord fondu large, mélange sans gris, blanc lisible à chaque image.
import assert from "node:assert/strict";
import { test } from "node:test";
import { degrades, menu, opaciteVerre, type Partie } from "../src/theme/effets.ts";
import { BANDE, centreOnglet, couleursVague, melanger, oklch, poidsVague, rvbDe, type Rvb } from "../src/ui/vague-menu.ts";

const PARTIES = ["accueil", "entrainement", "nutrition", "sante"] as const satisfies readonly Partie[];
const arrets = (p: Partie) => degrades[p].arrets.map((a) => ({ offset: a.offset, rvb: rvbDe(a.couleur) }));
const c = menu.jour;

const lum = (x: Rvb) => {
  const l = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * l(x[0]) + 0.7152 * l(x[1]) + 0.0722 * l(x[2]);
};
const contrasteBlanc = (x: Rvb) => 1.05 / (lum(x) + 0.05);

test("la vague : rien au départ, tout à la fin, part de l'ancien onglet", () => {
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      if (a === b) continue;
      const depart = centreOnglet(a, 4);
      for (let i = 0; i <= 20; i++) {
        const x = i / 20;
        assert.ok(poidsVague(x, depart, b - a, 0) < 1e-9, `${a}→${b} x=${x} début`);
        assert.ok(poidsVague(x, depart, b - a, 1) > 1 - 1e-9, `${a}→${b} x=${x} fin`);
      }
      // Au premier quart, la nouvelle teinte est plus avancée à l'ancien onglet qu'au bord opposé au nouveau.
      const bordArriere = b > a ? 0 : 1;
      assert.ok(poidsVague(depart, depart, b - a, 0.25) > poidsVague(bordArriere, depart, b - a, 0.25));
    }
});

test("bord de la vague : fondu large (≥ 40 % de la pilule), jamais de ligne nette", () => {
  assert.ok(BANDE >= 0.4 && BANDE <= 0.6);
  // Entraînements → Santé, à mi-course : de 5 % à 95 % de nouvelle teinte sur au moins 40 % de la largeur.
  const depart = centreOnglet(1, 4);
  const pts = Array.from({ length: 1001 }, (_, i) => i / 1000);
  const w = pts.map((x) => poidsVague(x, depart, 2, 0.5));
  // Bord avant (côté du nouvel onglet) : à droite du départ.
  const debut = pts.find((x, i) => x >= depart && w[i]! < 0.95)!;
  const fin = pts.find((x, i) => x >= depart && w[i]! < 0.05)!;
  assert.ok(fin - debut >= 0.4, `${debut} → ${fin}`);
  for (let i = 1; i < w.length; i++) assert.ok(Math.abs(w[i]! - w[i - 1]!) < 0.01, `saut à ${pts[i]}`);
});

// Seuil 0,6 : entre bleu et vert, le cyan sort du gamut sRGB et perd de la saturation à l'écrêtage (0,11 contre 0,17).
test("mélange OKLCH : jamais gris, la saturation reste proche de celle des deux couleurs", () => {
  for (const a of PARTIES)
    for (const b of PARTIES) {
      if (a === b) continue;
      const ca = rvbDe(degrades[a].arrets[1]!.couleur);
      const cb = rvbDe(degrades[b].arrets[1]!.couleur);
      const min = Math.min(oklch(ca)[1], oklch(cb)[1]);
      for (const t of [0.25, 0.5, 0.75]) assert.ok(oklch(melanger(ca, cb, t))[1] >= 0.6 * min, `${a}→${b} ${t}`);
    }
});

test("blanc des icônes ≥ 3:1 (élément graphique) à chaque image de chaque vague, sur le fond le plus défavorable", () => {
  const verre = 1 - opaciteVerre(c.verre);
  for (const fondu of [false, true])
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++) {
        if (a === b) continue;
        const pa = PARTIES[a]!;
        const pb = PARTIES[b]!;
        for (let k = 0; k <= 12; k++) {
          const cols = couleursVague(arrets(pa), c.assombrir[pa], arrets(pb), c.assombrir[pb], centreOnglet(a, 4), b - a, k / 12, c.opacite, fondu);
          for (const [r, v, bl, al] of cols) {
            const fond: Rvb = [r! * al! + verre * (1 - al!), v! * al! + verre * (1 - al!), bl! * al! + verre * (1 - al!)];
            assert.ok(contrasteBlanc(fond) >= 3, `${pa}→${pb} e=${k / 12} ${contrasteBlanc(fond).toFixed(2)}`);
          }
        }
      }
});
