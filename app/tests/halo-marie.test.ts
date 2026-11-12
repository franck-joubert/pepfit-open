// Halo marié des pages partagées (31/10 : « l'un et l'autre mariés », couleur principale = section de rattachement) :
// une table unique page → { section, halo }, d'où découlent la partie de la route et le couple de teintes ; les deux teintes
// présentes à chaque image (rendu au pixel), textes à 4,5:1 au pire point, accent jamais moins lisible que sur l'aura de sa
// partie, nuit et jour ; couleur principale de la visite : l'onglet d'origine s'il est une des deux teintes, sinon la section.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Partie } from "../src/theme/effets.ts";
import { jour, nuit, type ModeCouleur } from "../src/theme/jetons.ts";
import { jetonsDePartie } from "../src/theme/teintes.ts";
import { COULEUR_PARTIE, FOND_PARTIE, partieDe } from "../src/ui/partie.ts";
import { ouvrirVisite, pagePartageeDe, PAGES_PARTAGEES, partieDeVisite, visiteEnCours, type PagePartagee } from "../src/ui/pages-partagees.ts";
import { cibleAura, etatHalo, etatMarie, FONDU_AURA, HALOS_PAGES, HAUTEUR_AURA, nappesAura, pageHaloDe } from "../src/ui/aura-calc.ts";

const PAGES = Object.keys(PAGES_PARTAGEES) as PagePartagee[];
const LARGEUR = 412;
const PHASES = Array.from({ length: 24 }, (_, i) => i / 24);

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
/** Teinte (degrés) d'une couleur rvb, et sa chroma (max − min). */
function teinte([r, v, b]: number[]): { h: number; chroma: number } {
  const max = Math.max(r!, v!, b!), min = Math.min(r!, v!, b!), c = max - min;
  if (c === 0) return { h: 0, chroma: 0 };
  const h = max === r ? ((v! - b!) / c) % 6 : max === v ? (b! - r!) / c + 2 : (r! - v!) / c + 4;
  return { h: (h * 60 + 360) % 360, chroma: c };
}
const ecart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

const fondDe = (visite: Partie, mode: ModeCouleur) => couleur(mode === "nuit" ? nuit.bg : jour[FOND_PARTIE[visite]])[0];

/** Pixels de la zone pleinement visible du halo marié (avant le fondu vers le bas), sur le fond de la page. */
function pixels(page: PagePartagee, mode: ModeCouleur, phase: number, visite: Partie = PAGES_PARTAGEES[page].section): number[][] {
  const [A, B] = HALOS_PAGES[page];
  const fond = fondDe(visite, mode);
  const nappes = nappesAura(etatMarie(cibleAura(A, mode), cibleAura(B, mode), phase), 0, 0, LARGEUR).map((n) => ({
    ...n,
    rvb: couleur(n.coeur)[0],
    al: couleur(n.coeur)[1],
  }));
  const sortie: number[][] = [];
  for (let x = 0; x <= LARGEUR; x += 8)
    for (let y = 0; y <= HAUTEUR_AURA * FONDU_AURA; y += 8) {
      let c = fond;
      for (const n of nappes) {
        const d = Math.hypot(x - n.x, y - n.y) / n.r;
        const a = d < 0.45 ? n.al * (1 - d) : d < 1 ? n.al * 0.55 * (1 - (d - 0.45) / 0.55) : 0;
        c = sur(n.rvb, a, c);
      }
      sortie.push(c);
    }
  return sortie;
}

test("table unique : Énergie et Pas rattachées à Sport, halos orange et turquoise / orange et rose ; tout en découle", () => {
  assert.deepEqual(PAGES_PARTAGEES.energie, { section: "entrainement", halo: ["entrainement", "nutrition"] });
  assert.deepEqual(PAGES_PARTAGEES.pas, { section: "entrainement", halo: ["entrainement", "sante"] });
  assert.deepEqual(PAGES_PARTAGEES.effort, { section: "entrainement", halo: ["entrainement", "sante"] });
  assert.deepEqual(PAGES_PARTAGEES.recuperation, { section: "sante", halo: ["sante", "entrainement"] });
  for (const page of PAGES) {
    // la couleur principale (boutons, cartes, accents, barre de titre) est celle de la partie de la route
    assert.equal(partieDe(`/sante/${page}`), PAGES_PARTAGEES[page].section, page);
    assert.equal(partieDe(`sante/${page}`), PAGES_PARTAGEES[page].section, page);
    assert.deepEqual(HALOS_PAGES[page], PAGES_PARTAGEES[page].halo, page);
    assert.equal(pageHaloDe(`/sante/${page}`), page);
  }
  // les autres pages de Santé restent roses
  assert.equal(partieDe("/sante/sommeil"), "sante");
  assert.equal(partieDe("/sante/metabolisme"), "sante");
});

test("mélange : les deux teintes toujours dans l'état, aucune opacité de teinte qui s'éteigne", () => {
  for (const page of PAGES)
    for (const mode of ["nuit", "jour"] as const) {
      const [A, B] = HALOS_PAGES[page];
      const a = cibleAura(A, mode), b = cibleAura(B, mode);
      for (const ph of PHASES) {
        const e = etatMarie(a, b, ph);
        assert.equal(e.length, 21);
        assert.deepEqual(e.slice(9, 12), a.slice(9, 12), "nappe 0 : A");
        assert.deepEqual(e.slice(12, 15), b.slice(9, 12), "nappe 1 : B");
        // chaque teinte garde au moins 60 % de son opacité
        assert.ok(e[18]! >= a[19]! * 0.6 - 1e-9 && e[19]! >= b[19]! * 0.6 - 1e-9, `${page} ${mode} ${ph}`);
      }
      // ça bouge : deux moments du cycle diffèrent
      assert.notDeepEqual(etatMarie(a, b, 0), etatMarie(a, b, 0.25));
    }
});

test("rendu au pixel : à chaque moment du cycle, chaque teinte couvre au moins 9 % de la zone visible (10 % avant l’aura plus haute du 06/11 : 9,5 % mesuré sur Pas, nuit)", () => {
  for (const page of PAGES)
    for (const mode of ["nuit", "jour"] as const) {
      const [A, B] = HALOS_PAGES[page];
      const hA = teinte(cibleAura(A, mode).slice(9, 12)).h;
      const hB = teinte(cibleAura(B, mode).slice(9, 12)).h;
      for (const ph of PHASES) {
        const px = pixels(page, mode, ph);
        const seuil = mode === "nuit" ? 24 : 8;
        let nA = 0, nB = 0;
        for (const p of px) {
          const { h, chroma } = teinte(p);
          if (chroma < seuil) continue;
          if (ecart(h, hA) < ecart(h, hB)) nA++;
          else nB++;
        }
        assert.ok(nA / px.length >= 0.09, `${page} ${mode} phase ${ph} : ${A} ${((nA / px.length) * 100).toFixed(0)} %`);
        assert.ok(nB / px.length >= 0.09, `${page} ${mode} phase ${ph} : ${B} ${((nB / px.length) * 100).toFixed(0)} %`);
      }
    }
});

test("entrée : l'aura de l'onglet glisse vers le mélange (mi-chemin entre les deux)", () => {
  const sante = cibleAura("sante", "nuit");
  const a = cibleAura("entrainement", "nuit"), b = cibleAura("nutrition", "nuit");
  const fin = etatMarie(a, b, 0);
  const mi = etatHalo(sante, a, b, 0, 0.5);
  mi.forEach((v, i) => assert.ok(v >= Math.min(sante[i]!, fin[i]!) - 1e-9 && v <= Math.max(sante[i]!, fin[i]!) + 1e-9, `indice ${i}`));
});

/** Pixels de l'aura simple de la section (référence : la page Sport d'aujourd'hui), sur 60 s de dérive. */
function pixelsSection(visite: Partie, mode: ModeCouleur): number[][] {
  const fond = fondDe(visite, mode);
  const sortie: number[][] = [];
  for (let t = 0; t < 60; t += 4) {
    const nappes = nappesAura(cibleAura(visite, mode), t, 1, LARGEUR).map((n) => ({ ...n, rvb: couleur(n.coeur)[0], al: couleur(n.coeur)[1] }));
    for (let x = 0; x <= LARGEUR; x += 8)
      for (let y = 0; y <= HAUTEUR_AURA * FONDU_AURA; y += 8) {
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

test("contraste : t1 et t2 à 4,5:1 au pire point du halo marié ; l'accent jamais moins lisible que sur l'aura de sa partie", () => {
  for (const page of PAGES)
    for (const visite of HALOS_PAGES[page])
      for (const mode of ["nuit", "jour"] as const) {
        const jetons = jetonsDePartie(visite, mode);
        // l'accent de la page (PALETTE de gabarit.tsx) est la couleur de la partie
        const acc = couleur((mode === "nuit" ? nuit : jour)[COULEUR_PARTIE[visite]])[0];
        const reference = Math.min(...pixelsSection(visite, mode).map((f) => contraste(acc, f)));
        for (const ph of PHASES) {
          const px = pixels(page, mode, ph, visite);
          for (const role of ["t1", "t2"] as const) {
            const [t, at] = couleur(jetons[role]);
            const r = Math.min(...px.map((f) => contraste(sur(t, at, f), f)));
            assert.ok(r >= 4.5, `${page} ${visite} ${mode} ${role} ${r.toFixed(2)}`);
          }
          const r = Math.min(...px.map((f) => contraste(acc, f)));
          assert.ok(r >= reference, `${page} ${visite} ${mode} accent ${r.toFixed(2)} < ${reference.toFixed(2)}`);
        }
      }
});

test("couleur de la visite : l'onglet d'origine s'il est une des deux teintes, sinon la section ; lue sur la route", () => {
  assert.equal(partieDeVisite("pas", "sante"), "sante");
  assert.equal(partieDeVisite("pas", "entrainement"), "entrainement");
  assert.equal(partieDeVisite("pas", "nutrition"), "entrainement");
  assert.equal(partieDeVisite("pas", "accueil"), "entrainement");
  assert.equal(partieDeVisite("pas", null), "entrainement");
  assert.equal(partieDeVisite("energie", "nutrition"), "nutrition");
  assert.equal(partieDeVisite("energie", "sante"), "entrainement");
  // Récupération (31/10) : depuis Sport, orange ; depuis Santé, rose ; par lien direct, Santé
  assert.equal(partieDeVisite("recuperation", "entrainement"), "entrainement");
  assert.equal(partieDeVisite("recuperation", "sante"), "sante");
  assert.equal(partieDeVisite("recuperation", null), "sante");
  assert.equal(partieDeVisite("recuperation", "nutrition"), "sante");
  for (const page of PAGES) {
    assert.equal(pagePartageeDe(`sante/${page}`), page, "nom d'écran");
    assert.equal(pagePartageeDe(`/sante/${page}`), page, "chemin");
    assert.equal(pagePartageeDe(`/sante/${page}?jour=3`), page, "avec paramètres");
  }
  assert.equal(pagePartageeDe("sante/sommeil"), null);
  assert.equal(pagePartageeDe("sante/pas/heures"), null);
  assert.equal(pagePartageeDe("train"), null);
});

test("pages filles : la couleur de la visite en cours, la dernière ouverte ; rien une fois toutes fermées", () => {
  assert.equal(visiteEnCours(), null);
  const fermerEffort = ouvrirVisite("entrainement");
  assert.equal(visiteEnCours(), "entrainement", "page fille d'Effort");
  const fermerPas = ouvrirVisite("sante"); // Pas ouverte depuis Effort, mais l'onglet d'origine était Santé
  assert.equal(visiteEnCours(), "sante", "page fille de Pas");
  const fermerFille = ouvrirVisite(visiteEnCours()!); // la fille s'inscrit à son tour
  fermerPas(); // fermée dans le désordre : la fille garde sa couleur
  assert.equal(visiteEnCours(), "sante");
  fermerFille();
  assert.equal(visiteEnCours(), "entrainement");
  fermerEffort();
  fermerEffort(); // deux fois sans effet
  assert.equal(visiteEnCours(), null);
});
