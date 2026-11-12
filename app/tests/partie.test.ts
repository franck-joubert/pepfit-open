// Parties de l'appli : répartition des routes et dégradé du geste principal de chacune.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { partieDe } from "../src/ui/partie.ts";
import { ONGLETS } from "../src/ui/menu-flottant.ts";
import { degrades, type Partie } from "../src/theme/effets.ts";

test("chaque onglet est sa propre partie : Moi, Sport, Nutrition", () => {
  assert.deepEqual(
    ONGLETS.map((o) => partieDe(o.chemin)),
    ["sante", "entrainement", "nutrition"],
  );
});

test("tout ce qui découle d'Entraînements est orange, d'où qu'on vienne", () => {
  for (const r of [
    "/train",
    "/routine/3",
    "/routine/view/3",
    "/session",
    "/history",
    "/history/12",
    "/history/edit/12",
    "/done",
    "/pick?mode=remplacer",
    "/swap",
    "/progress/squat",
    "/3d/squat",
    "/gyms",
    "/gym/2",
    "/gym/machine",
  ])
    assert.equal(partieDe(r), "entrainement", r);
});

test("Accueil et global : l'entrée, le profil et toute route inconnue", () => {
  for (const r of ["/", "", "/me", "/settings/phrase", "/inconnue"])
    assert.equal(partieDe(r), "accueil", r);
});

test("le groupe « (tabs) » des onglets n'entre pas dans la partie", () => {
  assert.equal(partieDe("(tabs)/train"), "entrainement");
  assert.equal(partieDe("(tabs)/food"), "nutrition");
  assert.equal(partieDe("(tabs)/index"), "accueil");
});

test("Nutrition et Santé gardent leurs futures sous-routes", () => {
  assert.equal(partieDe("/food/meal/1"), "nutrition");
  assert.equal(partieDe("/health/weight"), "sante");
});

test("les noms d'écran de la pile (sans « / ») donnent la même partie que les chemins", () => {
  assert.equal(partieDe("index"), "accueil");
  assert.equal(partieDe("routine/view/[id]"), "entrainement");
  assert.equal(partieDe("history/edit/[id]"), "entrainement");
  assert.equal(partieDe("settings/phrase"), "accueil");
  assert.equal(partieDe("sante/effort?x=1"), "entrainement");
  assert.equal(partieDe("health"), "sante");
  assert.equal(partieDe("history/index"), "entrainement");
});

test("chaque écran du dossier app/ a une partie connue", () => {
  const racine = new URL("../src/app/", import.meta.url).pathname;
  const ecrans: string[] = [];
  const parcourir = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (f.endsWith(".tsx") && !f.startsWith("_") && !f.startsWith("+")) ecrans.push(relative(racine, p).replace(/\.tsx$/, ""));
    }
  };
  parcourir(racine);
  const attendu: Record<Partie, number> = { accueil: 0, entrainement: 0, nutrition: 0, sante: 0, fil: 0 };
  for (const e of ecrans) attendu[partieDe(e)]++;
  // Accueil : la porte d'entrée (index), les réglages et leurs pages (aide, connexions, identifiants API, agenda, zones…),
  // les retours des connexions (whoop, withings, polar), le premier lancement (welcome, qui impose lui-même la partie de chaque
  // étape), la Précision pepfit (profil/precision) et l'ancien Accueil (tableau-de-bord) : 34.
  assert.equal(attendu.accueil, 34, ecrans.filter((e) => partieDe(e) === "accueil").join(", "));
  assert.equal(attendu.nutrition, 15); // l'onglet + ajouter, produit, scan, creer, aliments, objectifs, mensurations, mesure, repas, mois ; + fibres (la page de suivi des fibres, planche fibres-page : la teinte Nutrition)
  // l'onglet + blessures (liste, fiche, zone), traitements (liste, fiche, prises) et sante (composition, mesure, sommeil, métabolisme,
  // et les pages de mesure du 28/10 : pas, poids, gras, énergie, récupération, âge pepfit ; du 29/10 : agenda, VFC,
  // fréquence cardiaque au repos ; VO2max et VMA, planche vma-vo2max ; du 30/10 : tour, la page d'un tour de la page Poids, et
  // mensurations, le parcours guidé des tours, planche mensurations). La page Effort est passée en teinte Sport (planche
  // effort-pepfit, 31/10), puis Énergie et Pas (rattachées à Sport, halo marié, 31/10 : pages-partagees.ts). Du 31/10 : mois,
  // la page du mois de Santé (docs/SANTE-CALENDRIER.md). Du 31/10 encore : cycle et cycle-mois (planche cycle : la page Cycle et son
  // calendrier vertical). Planche recuperer (31/10) : recuperer/en-cours, recuperer/fin, recuperer/respiration, et
  // sante/ce-qui-marche. Planche sommeil (03/11) : sante/heure (changement d'heure), sante/voyage et sante/rappel-coucher (D12 à D15) ; sante/endormir (Aider à s'endormir, B2 à B7) : 32.
  assert.equal(attendu.sante, 32);
  assert.equal(partieDe("sante/recuperation"), "sante");
  assert.equal(partieDe("sante/effort"), "entrainement");
  // Teinte du Fil : les Circuits (la page d'un circuit, sa carte plein écran, créer, importer, Mes circuits) : 5.
  assert.equal(attendu.fil, 5, ecrans.filter((e) => partieDe(e) === "fil").join(", "));
  assert.equal(partieDe("/circuit/x"), "fil");
});

const luminance = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

test("quatre dégradés de la même famille : 135°, 3 arrêts, texte blanc, même reflet, ombre teintée", () => {
  for (const [nom, d] of Object.entries(degrades)) {
    assert.deepEqual(d.arrets.map((a) => a.offset), [0, 0.48, 1], nom);
    assert.equal(d.sur, "#ffffff", nom);
    assert.equal(d.reflet, degrades.accueil.reflet, nom);
    assert.match(d.ombre, /^0px 6px 18px -8px rgba\(\d+,\d+,\d+,0\.55\)$/, nom);
  }
  assert.deepEqual(
    degrades.entrainement.arrets.map((a) => a.couleur),
    ["#ff8a1f", "#f2610f", "#e0391a"],
    "l'orange d'Entraînements ne change pas",
  );
});

test("libellé blanc : au moins 3:1 au centre du bouton (arrêt du milieu), comme l'orange validé", () => {
  for (const [nom, d] of Object.entries(degrades)) assert.ok(contraste(d.sur, d.arrets[1]!.couleur) >= 3, nom);
  // Bleu et rose tiennent 3:1 dès l'arrêt clair.
  for (const nom of ["accueil", "sante"] as const) assert.ok(contraste("#ffffff", degrades[nom].arrets[0]!.couleur) >= 3, nom);
});
