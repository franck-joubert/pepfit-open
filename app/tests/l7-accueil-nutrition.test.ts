// Lot L7 de la revue finale (30/10) : Accueil et Nutrition. Un seul bouton tonal, textes des bandeaux et des cartes, erreurs
// d'écriture qui se disent.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
function fichiers(dossier = SRC): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => p.slice(SRC.length);
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

const FICHIERS_L7 = [
  "ecrans/BlocsAccueil.tsx",
  "app/(tabs)/index.tsx",
  "ecrans/nutrition/Journal.tsx",
  "ecrans/nutrition/commun.tsx",
  "ecrans/nutrition/MesAliments.tsx",
  "ecrans/nutrition/Objectifs.tsx",
  "ui/BoutonTonal.tsx",
];

test("bouton tonal : un seul, dans ui/BoutonTonal (n° 7)", () => {
  // Profil public : lot L8, il importera ui/BoutonTonal à son tour.
  const ailleurs = new Set(["ecrans/profil-public/Briques.tsx"]);
  const copies = fichiers()
    .filter((p) => rel(p) !== "ui/BoutonTonal.tsx" && !ailleurs.has(rel(p)))
    .filter((p) => /function BoutonTonal\b/.test(readFileSync(p, "utf8")))
    .map(rel);
  assert.deepEqual(copies, []);
  assert.match(lire("ecrans/BlocsAccueil.tsx"), /import \{ BoutonTonal \} from "\.\.\/ui\/BoutonTonal"/);
  assert.match(lire("ecrans/nutrition/commun.tsx"), /export \{ BoutonTonal \} from "\.\.\/\.\.\/ui\/BoutonTonal"/);
});

test("bandeau « Annuler » : « Supprimé : Banane », l'accord ne dépend plus du nom (n° 30)", () => {
  for (const cle of ["nutrition.supprime", "nutrition.retire"] as const) {
    assert.equal(fr[cle], "Supprimé : {nom}");
    assert.equal(en[cle], "Deleted: {nom}");
  }
});

test("Accueil : titre court « Semaine », « Effort » en anglais, unité de la pesée lue des réglages (n° 29, 43, 45)", () => {
  assert.equal(fr["accueil.blocs.semaine"], "Semaine");
  assert.equal(en["accueil.blocs.semaine"], "Week");
  assert.equal(en["accueil.blocs.effort"], "Effort");
  for (const d of [fr, en]) {
    assert.doesNotMatch(d["accueil.poids.pesee"], /\} kg/);
    assert.match(d["accueil.poids.pesee"], /\{kg\} \{u\}/);
  }
});

test("cartes : ni « ~ » ni « ≈ » (n° 42, puis plus de « ~ » nulle part le 31/10), la valeur gardée", () => {
  for (const d of [fr, en]) {
    for (const cle of ["cartes.semaineEnergie", "cartes.objectifDate"] as const) {
      assert.doesNotMatch(d[cle], /[~≈]/);
      assert.match(d[cle], /\{\w+\}/);
    }
  }
});

test("Objectifs : rythme « −0,25 », signe collé au chiffre (n° 19)", () => {
  assert.match(lire("ecrans/nutrition/Objectifs.tsx"), /(\$\{signe < 0 \? "−" : "\+"\}|`−)\$\{nombre\(r, 2\)\}/);
});

test("Accueil et Nutrition : aucune erreur avalée, aucun tilde tapé à la main (n° 16, 42)", () => {
  const fautes: string[] = [];
  for (const f of FICHIERS_L7) {
    lire(f)
      .split("\n")
      .forEach((l, i) => {
        if (/\.catch\(\(\) => \{\}\)/.test(l)) fautes.push(`${f}:${i + 1} erreur avalée`);
        if (/["`>][~≈] ?["$`{]|"[~≈] \{|: "[~≈]\{|· [~≈] \$|^\s*[~≈] ?\{/.test(l)) fautes.push(`${f}:${i + 1} tilde à la main`);
      });
  }
  assert.deepEqual(fautes, []);
});
