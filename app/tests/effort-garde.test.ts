// Garde-fou de l'Effort pepfit (planche effort-pepfit, corrections d'Alex du 31/10) : l'effort de Whoop a disparu de tout
// l'affichage. Aucune chaîne affichée (dictionnaires fr et en, et textes en dur des écrans) ne dit « strain », « sur 21 » ou
// « / 21 » ; l'Effort n'a pas d'unité (jamais « peps ») ni de maximum (jamais « sur 10 », « / 10 », « 0 à 10 »).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";

const textes = (v: unknown): string[] => (typeof v === "string" ? [v] : [(v as { one: string }).one, (v as { other: string }).other]);

/** `effort` : la règle ne vaut que pour les textes de l'effort (la douleur, elle, se note sur 10). */
const INTERDITS: { motif: RegExp; pourquoi: string; effort?: boolean }[] = [
  { motif: /\bstrain\b/i, pourquoi: "le score de Whoop n'est plus affiché : « Effort »" },
  { motif: /\bsur 21\b|\/ ?21\b|\b(out )?of 21\b|\b0 (à|to) 21\b/i, pourquoi: "l'échelle de Whoop (0 à 21) a disparu" },
  { motif: /\bpeps\b/i, pourquoi: "aucune unité : le chiffre seul (correction 1)" },
  { motif: /\bsur 10\b|\/ ?10\b|\b(out )?of 10\b|\b0 (à|to) 10\b/i, pourquoi: "échelle ouverte : jamais de maximum (correction 3)", effort: true },
];

test("dictionnaires fr et en : ni « strain », ni « sur 21 », ni unité, ni maximum", () => {
  for (const [langue, dico] of Object.entries({ fr, en }) as [string, Record<string, unknown>][]) {
    for (const [cle, v] of Object.entries(dico))
      for (const x of textes(v))
        for (const { motif, pourquoi, effort } of INTERDITS)
          if (!effort || /effort|sportStats/i.test(cle)) assert.doesNotMatch(x, motif, `${langue} ${cle} : « ${x} » (${pourquoi})`);
  }
});

const RACINE = new URL("..", import.meta.url).pathname;
function fichiers(dossier: string): string[] {
  return readdirSync(join(RACINE, dossier)).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(join(RACINE, p)).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("écrans : aucune unité ni maximum écrits en dur à côté de l'Effort (« / 21 », « peps »)", () => {
  for (const f of [...fichiers("src/app"), ...fichiers("src/ecrans"), ...fichiers("src/ui")]) {
    const s = readFileSync(join(RACINE, f), "utf8");
    // seulement les littéraux affichables (entre guillemets ou backquotes) et le texte JSX
    const litteraux = [...s.matchAll(/"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
    for (const x of litteraux) {
      assert.doesNotMatch(x, /\/ ?21\b|\bsur 21\b|\bof 21\b/, `${f} : « ${x} »`);
      assert.doesNotMatch(x, /\bpeps\b/i, `${f} : « ${x} »`);
    }
  }
});

test("le score d'effort de Whoop n'est lu que pour être gardé (whoop/) et pour la comparaison du labo (31/10, D3)", () => {
  const permis: Record<string, string> = {
    "src/whoop/types.ts": "réponse de l'API Whoop",
    "src/whoop/convertir.ts": "conversion de la réponse",
    "src/whoop/depot.ts": "écriture en base",
    "src/whoop/lecture.ts": "ligne brute de whoop_jour (SELECT *)",
    "src/whoop/partage-ia.ts": "liste des scores écartés avant l'envoi à l'IA (jamais lus ni transmis)",
    "src/db/migrations.ts": "colonnes des tables Whoop",
    "src/ecrans/effort-charges.ts": "lireComparaison, le labo de comparaison",
    "src/ecrans/calibration-collective.ts": "rapport anonyme Whoop ÷ pepfit, seulement si la personne l'a accepté (31/10)",
    "src/ecrans/seance-passee-vue.ts": "retire les lignes « strain » des notes importées (jamais affichées)",
  };
  const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const f of fichiers("src")) {
    if (permis[f]) continue;
    assert.doesNotMatch(sansCommentaires(readFileSync(join(RACINE, f), "utf8")), /\bstrain\b/, `${f} lit le score de Whoop`);
  }
});
