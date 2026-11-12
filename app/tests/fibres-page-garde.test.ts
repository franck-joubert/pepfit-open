// Gardes de la page de suivi des fibres (planche fibres-page, NOTES D7, D10) : un seul composant de conseils pour le Journal et la
// page, la route et l'entrée du Journal, aucun point médian ni tilde tapé, pas de sélecteur natif, textes fr et en alignés.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { en } from "../src/i18n/dico-en/fibres-page.ts";
import { fr } from "../src/i18n/dico-fr/fibres-page.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const PAGE = sansCommentaires(lire("ecrans/mesures/Fibres.tsx"));
const JOURNAL = sansCommentaires(lire("ecrans/nutrition/Journal.tsx"));
const FIBRES_EAU = sansCommentaires(lire("ecrans/nutrition/FibresEau.tsx"));

test("un seul composant de conseils : défini dans FibresEau, repris tel quel par le Journal et par la page (D7)", () => {
  assert.equal((FIBRES_EAU.match(/export function CarteConseils\b/g) ?? []).length, 1);
  assert.match(JOURNAL, /<CarteConseils\b/);
  assert.match(PAGE, /<CarteConseils\b/);
  assert.doesNotMatch(PAGE, /function (Carte)?(Conseils|Astuce)/, "la page ne redéfinit pas la carte");
  // une seule feuille d'habitudes et un seul réglage pour les deux endroits
  assert.equal((FIBRES_EAU.match(/export function FeuilleHabitudes\b/g) ?? []).length, 1);
  assert.match(PAGE, /FeuilleHabitudes/);
  assert.doesNotMatch(PAGE, /nutri_fibres_astuce_page|astucePage/);
});

test("la route /nutrition/fibres existe, et la cellule Fibres du Journal l'ouvre en gardant le jour affiché (D10)", () => {
  assert.match(sansCommentaires(lire("app/nutrition/fibres.tsx")), /<Fibres \/>/);
  assert.match(JOURNAL, /\/nutrition\/fibres/);
  assert.match(JOURNAL, /onFibres/);
  assert.match(FIBRES_EAU, /onFibres/);
  assert.match(FIBRES_EAU, /fibres\.ouvrirSuivi/, "la cellule dit ce qu'elle ouvre (lecture d'écran)");
});

test("pas de point médian, de tilde tapé ni de sélecteur natif dans la page et ses textes", () => {
  for (const [nom, s] of [["page", PAGE], ["fr", JSON.stringify(fr)], ["en", JSON.stringify(en)]] as const) {
    assert.doesNotMatch(s, /·|•/, `${nom} : le point médian est banni`);
    assert.doesNotMatch(s, /~/, `${nom} : « environ » passe par approx()`);
  }
  assert.doesNotMatch(PAGE, /<Picker|<select|Picker\.Item/);
});

test("les textes de la page sont les mêmes clés en français et en anglais, sans texte vide, les pluriels avec un et autres", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const dico of [fr, en] as object[]) {
    for (const [k, v] of Object.entries(dico)) {
      if (typeof v === "string") assert.ok(v.trim().length > 0, k);
      else {
        // un pluriel : { one, other }, deux textes qui parlent du nombre
        assert.deepEqual(Object.keys(v as object).sort(), ["one", "other"], k);
        for (const t of Object.values(v as Record<string, string>)) assert.match(t, /\{n\}/, k);
      }
    }
  }
});

test("le Journal et Ma journée ne sont pas touchés par la page : l'accueil garde ses fibres sans lien vers la page", () => {
  assert.doesNotMatch(sansCommentaires(lire("ecrans/MaJournee.tsx")), /nutrition\/fibres/);
});
