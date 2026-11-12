// Lot L6 de la revue finale (30/10) : une seule page pour le poids (D2). Santé › Poids porte les tours ; Composition et la
// route Nutrition › Mensurations y mènent ; la pesée suit l'unité des réglages ; la dernière pesée se supprime comme toute
// ligne (glissée, désintégration, « Annuler »), sans corbeille ; une décimale partout.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { lireTours, TOURS } from "../src/ecrans/mesures/corps-donnees.ts";
import { kgSaisi } from "../src/ecrans/poids.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
function fichiers(dossier = SRC): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("tours : tous les types sauf la taille, seulement ceux mesurés, du plus récent au plus ancien", async () => {
  const { db } = await baseDeTest();
  assert.ok(!(TOURS as readonly string[]).includes("taille"));
  assert.deepEqual(await lireTours(db), {});
  await ajouterMensuration(db, "taille", 178, 1_000);
  await ajouterMensuration(db, "tour_taille", 86, 1_000);
  await ajouterMensuration(db, "tour_taille", 84.5, 2_000);
  await ajouterMensuration(db, "bras", 35, 1_500);
  const t = await lireTours(db);
  assert.deepEqual(Object.keys(t).sort(), ["bras", "tour_taille"]);
  assert.deepEqual(t.tour_taille!.map((m) => m.valeur), [84.5, 86]);
});

test("pesée saisie dans l'unité des réglages, enregistrée en kg (constat 45)", () => {
  assert.equal(kgSaisi("78,5", "kg"), 78.5);
  assert.equal(kgSaisi("78.5", "kg"), 78.5);
  assert.ok(Math.abs(kgSaisi("172", "lbs")! - 78.018) < 0.001);
  assert.equal(kgSaisi("0", "kg"), null);
  assert.equal(kgSaisi("600", "kg"), null);
  assert.equal(kgSaisi("1200", "lbs"), null);
  assert.equal(kgSaisi("", "kg"), null);
});

test("une seule page : Composition et Nutrition › Mensurations mènent à Santé › Poids (D2)", () => {
  assert.match(lire("app/sante/composition.tsx"), /<Redirect href="\/sante\/poids" \/>/);
  assert.match(lire("app/nutrition/mensurations.tsx"), /pathname: "\/sante\/poids", params: \{ section: "tours" \}/);
  assert.ok(!existsSync(join(SRC, "ecrans/nutrition/Mensurations.tsx")));
  assert.doesNotMatch(lire("ecrans/Composition.tsx"), /export function Composition\b/);
  assert.match(lire("app/sante/poids.tsx"), /tours=\{section === "tours"\}/);
  assert.match(lire("ecrans/mesures/Corps.tsx"), /<SectionTours /);
  // Les tours ouvrent leur historique sous /sante (rose), plus sous /nutrition (turquoise).
  assert.match(lire("ecrans/mesures/Tours.tsx"), /pathname: "\/sante\/tour"/);
  // planche mensurations (M6) : la page d'un tour au gabarit de Poids, plus la liste nue de la planche 25
  assert.match(lire("app/sante/tour.tsx"), /<PageTour /);
  assert.match(lire("app/nutrition/mesure.tsx"), /pathname: "\/sante\/tour"/);
  const versNutrition = fichiers().filter((p) => /["']\/nutrition\/mensurations["']/.test(readFileSync(p, "utf8")));
  assert.deepEqual(versNutrition, []);
});

test("poids : une décimale partout sur la page (D2), plus de « 77,96 kg »", () => {
  const corps = lire("ecrans/mesures/Corps.tsx");
  assert.doesNotMatch(corps, /u === "lbs" \? 1 : 2/);
  assert.doesNotMatch(corps, /decKg/);
});

test("suppression : plus de corbeille sur la pesée ; glisser, « Annuler » et différé, sur la feuille et sur la page (constat 8)", () => {
  const feuille = lire("ecrans/FeuillePoids.tsx");
  assert.doesNotMatch(feuille, /nom="trash"/);
  assert.match(feuille, /<GlisserSupprimer /);
  assert.match(feuille, /<ListeDesintegrable/);
  assert.match(feuille, /<BandeauAnnuler /);
  assert.match(feuille, /new SuppressionDifferee/);
  const corps = lire("ecrans/mesures/Corps.tsx");
  assert.match(corps, /<BandeauAnnuler /);
  assert.match(corps, /new SuppressionDifferee/);
  assert.doesNotMatch(corps, /void supprimer(Pesee|Gras)\(db, id\)/);
});

test("pesée : curseur à la couleur de la partie, unité des réglages ; champ de Corps plafonné à 130 % (constats 38, 44, 45)", () => {
  const feuille = lire("ecrans/FeuillePoids.tsx");
  assert.doesNotMatch(feuille, /couleurs\.action/);
  assert.match(feuille, /cursorColor=\{partie\}/);
  assert.doesNotMatch(feuille, />\s*kg\s*</);
  assert.doesNotMatch(feuille, /" kg"/);
  const corps = lire("ecrans/mesures/Corps.tsx");
  for (const m of corps.matchAll(/<TextInput[\s\S]*?\/>/g)) assert.match(m[0], /maxFontSizeMultiplier=\{POLICE_MAX\}/);
});

test("erreurs : plus aucune avalée dans les fichiers du poids (constat 16)", () => {
  for (const f of ["ecrans/mesures/Corps.tsx", "ecrans/mesures/Tours.tsx", "ecrans/FeuillePoids.tsx", "ecrans/Composition.tsx"]) {
    assert.doesNotMatch(lire(f), /\.catch\(\(\) => \{\}\)/, f);
  }
});
