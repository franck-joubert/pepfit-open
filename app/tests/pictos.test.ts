// Pictos (V1.1, point 9) : l'index généré ne pointe que vers des fichiers présents.
// pictos-index.ts utilise require (Metro) : on le lit comme du texte.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("../src/ui/pictos-index.ts", import.meta.url), "utf8");
const bloc = (nom: string) => src.split(`export const ${nom}`)[1]!.split("};")[0]!;

test("V1.1 (9) : chaque picto de l'index existe dans assets, en 128 et en 512", () => {
  const fichiers = [...bloc("FICHIERS").matchAll(/"([^"]+)": require\("\.\.\/\.\.\/assets\/pictos\/([^"]+)"\)/g)];
  assert.equal(fichiers.length, 499);   // 58 exercices + 9 activités (6 Whoop, lot D30) + 50 du lot de 50 (pictos/lot-50.md) + 50 du lot 100a + 230 des clips 3D (picto-3d/v8, piste I) + 50 sports (pictos-activites, sports50.py) + 50 pictos manquants (docs/CODE-PICTOS-MANQUANTS.md : 25 du lot 1, 25 du lot 2) + 2 refaits d'après les retours du 09/11 (hip thrust Smith, pompes prise serrée sur haltères)
  for (const [, slug, f] of fichiers) {
    assert.ok(existsSync(new URL(`../assets/pictos/${f}`, import.meta.url)), f);
    assert.ok(existsSync(new URL(`../assets/pictos/${slug}-512.webp`, import.meta.url)), `${slug}-512`);
  }
  // Chaque picto embarque son 512, 3D ou non : la séance passée d'un exercice seul le montre en grand (planche Lieux, 27/10).
  const grands = bloc("GRANDS");
  for (const [, cle] of fichiers) assert.ok(grands.includes(`"${cle}":`), `${cle} : 512 absent de GRANDS`);
  const connus = new Set(fichiers.map((m) => m[1]));
  for (const nom of ["CATALOGUE", "NOMS"])
    for (const [, cle, picto] of bloc(nom).matchAll(/"([^"]+)": "([^"]+)"/g)) assert.ok(connus.has(picto), `${nom} ${cle} → ${picto}`);
});
