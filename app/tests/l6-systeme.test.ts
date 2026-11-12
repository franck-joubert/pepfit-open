// Lot L6 de l'audit global (28/10) : « ~ » unique (retiré le 31/10), jetons de typographie, rayons des puces, couleur de partie.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { approx } from "../src/ecrans/format.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
function fichiers(dossier = SRC): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => p.slice(SRC.length);

// 31/10, Alex : plus de « ~ » nulle part ; la justesse se lit dans la Précision pepfit.
test("« ~ » : approx() rend le texte tel quel, sans « ~ » ni « ≈ »", () => {
  assert.equal(approx("2 350 kcal"), "2 350 kcal");
  assert.equal(approx("72", false), "72");
});

test("« ~ » et « ≈ » : rien dans les dictionnaires FR et EN", async () => {
  const { fr } = await import("../src/i18n/fr.ts");
  const { en } = await import("../src/i18n/en.ts");
  for (const d of [fr, en]) for (const [cle, v] of Object.entries(d)) assert.doesNotMatch(String(v), /[~≈]/, cle);
});

test("« ~ » et « ≈ » : plus rien de tapé à la main dans les écrans, collé ou espacé (constat 24)", () => {
  const fautes: string[] = [];
  for (const p of fichiers()) {
    readFileSync(p, "utf8")
      .split("\n")
      .forEach((l, i) => {
        // chaîne, gabarit ou texte JSX qui commence par le signe (le filtre « sport"~ » d'OSM n'est pas un affichage)
        if (/["`>][~≈] ?["$`{]|"[~≈] \{|: "[~≈]\{|· [~≈] \$|^\s*[~≈] ?\{/.test(l) && !l.includes("sport\"~")) fautes.push(`${rel(p)}:${i + 1}`);
      });
  }
  assert.deepEqual(fautes, []);
});

test("couleur de partie : curseurs et cadres actifs hors du Sport ne sont plus orange (constat 41)", async () => {
  const { COULEUR_PARTIE, partieDe } = await import("../src/ui/partie.ts");
  assert.equal(COULEUR_PARTIE[partieDe("/account/code")], "partieAccueil");
  assert.equal(COULEUR_PARTIE[partieDe("/(tabs)/health")], "partieSante");
  for (const f of ["ecrans/FeuillePesee.tsx", "ecrans/Notes.tsx", "ecrans/parcours-ui.tsx", "ui/PageMois.tsx", "ui/Serie.tsx"]) {
    assert.doesNotMatch(readFileSync(join(SRC, f), "utf8"), /(cursorColor|selectionColor|borderColor)=?\{?[^\n]*couleurs\.action|couleur \?\? couleurs\.action/, f);
  }
});

test("typographie : échelle complétée (17, 14), rien sous 11 px, police plafonnée à 130 % (constat 42)", async () => {
  const { POLICE_MAX, TAILLE_MIN, typo } = await import("../src/theme/typo.ts");
  assert.equal(typo.titreBarre.fontSize, 17);
  assert.equal(typo.libelle.fontSize, 14);
  assert.equal(TAILLE_MIN, 11);
  assert.equal(POLICE_MAX, 1.3);
  for (const [nom, v] of Object.entries(typo)) assert.ok(v.fontSize >= TAILLE_MIN, nom);
  assert.match(readFileSync(join(SRC, "ui/Texte.tsx"), "utf8"), /maxFontSizeMultiplier = POLICE_MAX/);
  const petits: string[] = [];
  for (const p of fichiers()) {
    readFileSync(p, "utf8")
      .split("\n")
      .forEach((l, i) => {
        const m = /fontSize: (\d+(?:\.\d+)?)\b/.exec(l);
        // Champ du code e-mail posé sur les cases, invisible (fontSize: 1) : pas un texte lu.
        if (m && Number(m[1]) < 11 && !l.includes("opacity: 0.02")) petits.push(`${rel(p)}:${i + 1}`);
      });
  }
  assert.deepEqual(petits, []);
});
