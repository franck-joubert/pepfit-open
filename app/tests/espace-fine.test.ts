// Espace fine des milliers (docs/ESPACE-FINE.md) : en chiffres proportionnels, Inter rend à largeur nulle l'espace fine
// insécable (U+202F) que `nombre()` met dans les milliers (« 9063 » au lieu de « 9 063 », vu à l'émulateur). Correctif à un
// seul endroit : toutes les variantes de typo.ts sont en chiffres tabulaires, qui la gardent.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { approx, nombre } from "../src/ecrans/format.ts";
import { typo } from "../src/theme/typo.ts";

const APP = new URL("../", import.meta.url).pathname;
const SRC = join(APP, "src");

/** Chasse (unités de la police) du glyphe d'un caractère, lue dans les tables cmap (format 4) et hmtx d'un TTF. */
function chasse(fichier: string, cp: number): number {
  const b = readFileSync(fichier);
  const tables = new Map<string, number>();
  for (let i = 0; i < b.readUInt16BE(4); i++) tables.set(b.toString("latin1", 12 + 16 * i, 16 + 16 * i), b.readUInt32BE(20 + 16 * i));
  const cmap = tables.get("cmap")!;
  let glyphe = 0;
  for (let i = 0; i < b.readUInt16BE(cmap + 2); i++) {
    const o = cmap + b.readUInt32BE(cmap + 8 + 8 * i);
    if (b.readUInt16BE(o) !== 4) continue;
    const n = b.readUInt16BE(o + 6) / 2;
    const fin = o + 14, debut = fin + 2 * n + 2, delta = debut + 2 * n, saut = delta + 2 * n;
    for (let s = 0; s < n; s++) {
      if (cp > b.readUInt16BE(fin + 2 * s) || cp < b.readUInt16BE(debut + 2 * s)) continue;
      const r = b.readUInt16BE(saut + 2 * s), d = b.readInt16BE(delta + 2 * s);
      const g = r ? b.readUInt16BE(saut + 2 * s + r + 2 * (cp - b.readUInt16BE(debut + 2 * s))) : cp;
      glyphe = g ? (g + d) & 0xffff : 0;
      break;
    }
    if (glyphe) break;
  }
  assert.ok(glyphe, `U+${cp.toString(16)} absent de ${fichier}`);
  const metriques = b.readUInt16BE(tables.get("hhea")! + 34);
  return b.readUInt16BE(tables.get("hmtx")! + 4 * Math.min(glyphe, metriques - 1));
}

const langue = (l: "fr" | "en") => definirActif({ langue: l, fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const fichiers = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? fichiers(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));

test("toutes les variantes de typo.ts sont en chiffres tabulaires (Texte, champs, molettes)", () => {
  for (const [nom, style] of Object.entries(typo)) {
    assert.deepEqual([...(style.fontVariant ?? [])], ["tabular-nums"], `typo.${nom} sans chiffres tabulaires`);
  }
});

test("les nombres formatés n'ont que des séparateurs qu'Inter affiche (chasse non nulle dans les 4 graisses du texte)", () => {
  const vus = new Set<number>();
  for (const l of ["fr", "en"] as const) {
    langue(l);
    for (const n of [9063, -1365, 1234567.8, 12.5, 0.25, 100000]) {
      for (const c of nombre(n, 2)) if (!/\d/.test(c)) vus.add(c.codePointAt(0)!);
    }
    for (const c of approx(nombre(2350, 0))) if (!/\d/.test(c)) vus.add(c.codePointAt(0)!);
  }
  langue("fr");
  assert.equal(nombre(9063, 0), "9\u202f063", "français : espace fine insécable des milliers");
  assert.ok(vus.has(0x202f));
  const polices = join(APP, "assets/fonts");
  // Inter-SemiBoldItalic ne sert qu'au « pep » de la marque (ui/Pep.tsx) : réduite aux lettres, sans nombre
  for (const f of readdirSync(polices).filter((f) => /^Inter-.*\.ttf$/.test(f) && !/Italic/.test(f))) {
    for (const cp of vus) assert.ok(chasse(join(polices, f), cp) > 0, `U+${cp.toString(16)} sans chasse dans ${f}`);
  }
});

test("aucun style ne retire les chiffres tabulaires, sauf le score « 6-4 » de la fin de suivi (sans milliers)", () => {
  const exceptions = ["ecrans/SuiviFin.tsx"];
  for (const f of fichiers(SRC)) {
    const rel = f.slice(SRC.length + 1);
    if (rel.startsWith("app/labo/") || exceptions.includes(rel)) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/fontVariant: *([^,}]+\]|tab\b)/g)) {
      if (/tabular-nums|^tab$/.test(m[1] ?? "")) continue;
      assert.fail(`${rel} : fontVariant ${m[1]} retire les chiffres tabulaires`);
    }
  }
});
