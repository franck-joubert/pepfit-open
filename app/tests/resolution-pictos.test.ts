// Résolution unique du picto et du clip 3D (src/ui/resolution.ts) : slug, alias d'un geste identique, nom.
// pictos-index.ts et clips.ts utilisent require (Metro) : leurs tables sont lues comme du texte.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { candidats, resoudreAvec } from "../src/ui/resolution.ts";
import { ALIAS_3D } from "../src/ui/3d/alias.ts";

const lire = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const index = lire("../src/ui/pictos-index.ts");
const bloc = (src: string, nom: string) => src.split(`export const ${nom}`)[1]!.split("};")[0]!;
const paires = (b: string) => Object.fromEntries([...b.matchAll(/"([^"]+)": "([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
export const TABLES = { catalogue: paires(bloc(index, "CATALOGUE")), noms: paires(bloc(index, "NOMS")) };
export const PICTOS = new Set([...bloc(index, "FICHIERS").matchAll(/"([^"]+)": require/g)].map((m) => m[1]!));
const CLIPS = new Set([...bloc(lire("../src/ui/3d/clips.ts"), "CLIPS_3D").matchAll(/^ {2}"?([a-z0-9-]+)"?: require\(/gm)].map((m) => m[1]!));
const picto = (slug: string | null, nom?: string) => resoudreAvec(TABLES, slug, nom, (c) => PICTOS.has(c));
const clip = (slug: string | null, nom?: string) => resoudreAvec(TABLES, slug, nom, (c) => CLIPS.has(c), true);

test("résolution : slug du catalogue, puis alias d'un geste identique, puis nom", () => {
  assert.equal(picto("barbell-bench-press-medium-grip"), TABLES.catalogue["barbell-bench-press-medium-grip"]);
  // ez-bar-curl n'a pas de picto à son slug : l'alias du même geste (curl-barre) en a un
  assert.ok(ALIAS_3D["alternating-floor-press"]);
  assert.equal(picto("alternating-floor-press"), "kb-developpe-sol");
  assert.equal(picto(null, "Padel"), "padel");
  assert.equal(picto("slug-inconnu", "nom inconnu"), undefined);
  assert.deepEqual(candidats(TABLES, null, null), []);
});

test("résolution partagée : un exercice qui a un clip par alias trouve aussi son picto s'il existe", () => {
  const cat = JSON.parse(lire("../assets/catalogue/exercices.json")).exercices as { slug: string; nom: string }[];
  let parAlias = 0;
  for (const e of cat) {
    const c = clip(e.slug, e.nom);
    if (c && PICTOS.has(c)) assert.ok(picto(e.slug, e.nom), `${e.slug} : clip ${c} à picto, mais picto neutre`);
    if (!PICTOS.has(TABLES.catalogue[e.slug] ?? e.slug) && picto(e.slug, e.nom)) parAlias++;
  }
  // 293 depuis les pictos manquants (docs/CODE-PICTOS-MANQUANTS.md) : un exercice qui prend son picto quitte l'alias
  assert.ok(parAlias >= 280, `${parAlias} exercices reliés par alias`);
});

// Activités encore sans picto : vide depuis les 50 sports du 29/10 (pictos-activites/outils/sports50.py). Un nouvel
// exercice sans picto s'ajoute ici, le temps d'en faire un.
const SANS_PICTO = new Set<string>();

test("catalogue : chaque exercice a un picto réel (sauf les activités sans geste de la liste), champ picto à jour", () => {
  const cat = JSON.parse(lire("../assets/catalogue/exercices.json")).exercices as { slug: string; nom: string; picto: string }[];
  const manquants = cat.filter((e) => !picto(e.slug, e.nom) && !SANS_PICTO.has(e.slug)).map((e) => e.slug);
  assert.deepEqual(manquants, []);
  for (const e of cat) {
    const c = picto(e.slug, e.nom);
    if (SANS_PICTO.has(e.slug)) assert.equal(c, undefined, `${e.slug} a maintenant un picto : le retirer de SANS_PICTO`);
    assert.equal(e.picto, c ? `assets/pictos/${c}-512.webp` : "assets/pictos/neutre-512.webp", e.slug);
  }
  assert.equal(cat.length - SANS_PICTO.size, 959);
});

// Retours du 09/11 (planche pictos-retours) : picto du hip thrust Smith (d'après la photo d'Alex) et des pompes prise serrée sur
// haltères (l'ancien picto montrait une pompe ordinaire), et leurs clips 3D (le Smith : barre collée aux hanches). Validés par Alex.
test("retours du 09/11 : hip thrust Smith et pompes serrées sur haltères ont leur picto et leur clip", () => {
  assert.equal(picto("smith-machine-hip-thrust", "Hip thrust (Smith)"), "hip-thrust-smith");
  assert.equal(picto("close-grip-push-up-off-of-a-dumbbell", "Pompes prise serrée sur haltère"), "pompes-serrees-haltere");
  assert.equal(picto("hip-thrust-machine", "Hip thrust (Machine)"), "hip-thrust-machine");
  assert.equal(picto("barbell-hip-thrust", "Hip thrust (Barre)"), "hip-thrust-barre");
  assert.equal(clip("close-grip-push-up-off-of-a-dumbbell"), "pompes-serrees-haltere");
  assert.equal(clip("smith-machine-hip-thrust"), "hip-thrust-smith");
  assert.equal(clip("barbell-hip-thrust"), "barbell-hip-thrust");
  for (const p of ["hip-thrust-smith", "pompes-serrees-haltere"]) {
    assert.ok(PICTOS.has(p), p);
    assert.ok(existsSync(new URL(`../assets/pictos/${p}-512.webp`, import.meta.url)), p);
  }
  for (const c of ["hip-thrust-smith", "pompes-serrees-haltere"]) {
    assert.ok(CLIPS.has(c), c);
    assert.ok(existsSync(new URL(`../assets/3d/${c}.glb`, import.meta.url)), c);
  }
});
