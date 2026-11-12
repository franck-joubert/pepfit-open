// Cartes de verre des quatre onglets : texte principal et secondaire à 4,5:1 au pire point de l'aura, jour et nuit.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Partie } from "../src/theme/effets.ts";
import { jour, nuit, type ModeCouleur } from "../src/theme/jetons.ts";
import { FOND_PARTIE } from "../src/ui/partie.ts";
import { cibleAura, HAUTEUR_AURA, nappesAura } from "../src/ui/aura-calc.ts";
import { jetonsDePartie } from "../src/theme/teintes.ts";

const PARTIES = ["accueil", "entrainement", "nutrition", "sante"] as const satisfies readonly Partie[];
const LARGEUR = 412;

/** [r, v, b] 0-255 et opacité d'un « #rrggbb » ou d'un « rgba(r,v,b,a) ». */
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

/**
 * Teintes de l'aura sur le fond, sur une grille de 12 px, toutes les 2 s d'une minute de dérive en pleine amplitude :
 * les trois nappes dans l'ordre de dessin (cœur, tiers à 55 %, bord nul). Sans le fondu du bas ni l'effacement au
 * défilement, qui ne font qu'éclaircir (nuit) ou blanchir (jour) : majorant.
 */
const cache = new Map<string, number[][]>();
function teintesAura(partie: Partie, mode: ModeCouleur): number[][] {
  const deja = cache.get(partie + mode);
  if (deja) return deja;
  // le jour, l'aura se pose sur le fond teinté de la partie (retour du 27/10)
  const fond = couleur(mode === "nuit" ? nuit.bg : jour[FOND_PARTIE[partie]])[0];
  const etat = cibleAura(partie, mode);
  const sortie: number[][] = [];
  for (let t = 0; t < 60; t += 2) {
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
  cache.set(partie + mode, sortie);
  return sortie;
}

/** Contraste le plus faible d'un texte sur la carte de la partie (teintée, v2.2.17), au pire point de son aura. */
function pireContraste(texte: string, partie: Partie, mode: ModeCouleur): number {
  const [verre, a] = couleur(jetonsDePartie(partie, mode).verreCarte);
  const [t, at] = couleur(texte);
  return teintesAura(partie, mode).reduce((m, c) => {
    const fond = sur(verre, a, c);
    return Math.min(m, contraste(sur(t, at, fond), fond));
  }, Infinity);
}

test("cartes : blanches le jour (v2.2.17, « les cartes sont blanches »), verre translucide la nuit ; filet très léger", () => {
  assert.equal(jour.verreCarte, "#ffffff");
  const a = couleur(nuit.verreCarte)[1];
  assert.ok(a > 0.3 && a < 0.85, `opacité du verre de nuit ${a}`);
  for (const j of [nuit, jour]) assert.ok(couleur(j.verreFilet)[1] <= 0.1, "filet très léger");
  assert.deepEqual(couleur(nuit.verreCarte)[0], couleur(nuit.s1)[0], "hors d'une partie, la nuit, le verre est le s1 translucide");
});

/** Rôle de chaque texte d'une carte de verre (les métas sont en t2 depuis le 27/10 ; t3 translucide y tiendrait aussi). */
const TEXTES_CARTE = { principal: "t1", secondaire: "t2", meta: "t2" } as const;

test("texte principal, secondaire et méta à 4,5:1 sur le verre, au pire point de l'aura, jour et nuit, quatre parties", () => {
  for (const mode of ["nuit", "jour"] as const)
    for (const partie of PARTIES)
      for (const [texte, role] of Object.entries(TEXTES_CARTE)) {
        const r = pireContraste(jetonsDePartie(partie, mode)[role], partie, mode);
        assert.ok(r >= 4.5, `${mode} ${partie} ${texte} (${role}) ${r.toFixed(2)}`);
      }
});

test("t2 et t3 translucides : 4,5:1 sur le verre au pire point de l'aura, t2 nettement au-dessus de t3", () => {
  for (const mode of ["nuit", "jour"] as const)
    for (const partie of PARTIES) {
      const j = jetonsDePartie(partie, mode);
      const [t2, t3] = [pireContraste(j.t2, partie, mode), pireContraste(j.t3, partie, mode)];
      assert.ok(t3 >= 4.5, `${mode} ${partie} t3 ${t3.toFixed(2)}`);
      assert.ok(t2 >= 1.3 * t3, `${mode} ${partie} t2 ${t2.toFixed(2)} / t3 ${t3.toFixed(2)}`);
    }
});
