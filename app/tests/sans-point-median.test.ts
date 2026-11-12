// Plus de « · » (point médian) dans un texte visible : jugé trop IA. Virgule, « et », deux lignes ou deux-points.
// Les commentaires restent libres ; les dictionnaires et les composants n'en ont plus dans le code.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const racine = new URL("../", import.meta.url).pathname;

/** Lecture seule de ces fichiers : lire une ancienne donnée (note de routine, saisie) n'affiche rien. */
const EXCEPTIONS = new Set([
  "src/ecrans/etapes-course.ts", // RECUP : lit aussi les notes de routine écrites avec l'ancien séparateur
  "src/ecrans/reglages/inventaire.ts", // split de la saisie d'un utilisateur
]);

function fichiers(dir: string, ext: RegExp, sortie: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fichiers(p, ext, sortie);
    else if (ext.test(n)) sortie.push(p);
  }
  return sortie;
}

/** Les lignes de code qui portent un « · » (commentaires de ligne, de bloc et fin de ligne écartés). */
function fautives(f: string): string[] {
  const res: string[] = [];
  readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
    if (!ln.includes("·")) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
    const k = ln.indexOf(" // ");
    const code = k >= 0 ? ln.slice(0, k) : ln;
    if (code.includes("·")) res.push(`${i + 1}: ${ln.trim().slice(0, 120)}`);
  });
  return res;
}

function verifier(liste: string[]) {
  const mal: string[] = [];
  for (const f of liste) {
    const rel = relative(racine, f);
    if (EXCEPTIONS.has(rel)) continue;
    for (const l of fautives(f)) mal.push(`${rel}:${l}`);
  }
  assert.deepEqual(mal, [], "« · » dans un texte visible : voir feedback_pas_de_point_median");
}

test("dictionnaires fr et en : aucun point médian", () => {
  const liste = fichiers(join(racine, "src/i18n"), /\.ts$/);
  assert.ok(liste.length > 50);
  verifier(liste);
});

test("composants et logique de l'appli : aucun point médian dans les chaînes", () => {
  verifier(fichiers(join(racine, "src"), /\.tsx?$/));
});
