// Couverture de la 3D (picto-3d/anim/SUIVI.md) : chaque exercice du catalogue et des programmes de la boutique trouve un
// clip par la résolution de la 3D (slug, geste identique, picto, nom), sauf les activités de la liste SANS_CLIP.
// clips.ts utilise require (Metro) : ses clés sont lues comme du texte.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { resoudreAvec } from "../src/ui/resolution.ts";

const lire = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const bloc = (src: string, nom: string) => src.split(`export const ${nom}`)[1]!.split("};")[0]!;
const paires = (b: string) => Object.fromEntries([...b.matchAll(/"([^"]+)": "([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
const index = lire("../src/ui/pictos-index.ts");
const TABLES = { catalogue: paires(bloc(index, "CATALOGUE")), noms: paires(bloc(index, "NOMS")) };
const CLIPS = new Set([...bloc(lire("../src/ui/3d/clips.ts"), "CLIPS_3D").matchAll(/^ {2}"?([a-z0-9-]+)"?: require\(/gm)].map((m) => m[1]!));
const clip = (slug: string | null, nom?: string) => resoudreAvec(TABLES, slug, nom, (c) => CLIPS.has(c), true);

// Sans clip, justifié (picto-3d/anim/SUIVI.md) : récupération sans geste à montrer (sauna, bain froid, massage) et sports
// à cheval (le cheval n'est pas modélisé).
const SANS_CLIP = new Set(["sauna", "bain-froid", "massage", "polo", "equitation"]);
// Exercices propres aux programmes (perso:…, trouvés par leur nom) encore sans clip.
const PROGRAMMES_SANS = new Set<string>([]);

test("3D : chaque exercice du catalogue a un clip, sauf les activités de SANS_CLIP (liste à jour)", () => {
  const cat = JSON.parse(lire("../assets/catalogue/exercices.json")).exercices as { slug: string; nom: string }[];
  assert.deepEqual(cat.filter((e) => !clip(e.slug, e.nom) && !SANS_CLIP.has(e.slug)).map((e) => e.slug), []);
  for (const s of SANS_CLIP) assert.equal(clip(s), undefined, `${s} a maintenant un clip : le retirer de SANS_CLIP`);
});

test("3D : chaque exercice des programmes de la boutique a un clip, par slug ou par son nom (français et anglais)", () => {
  const dossier = new URL("../assets/catalogue/programmes/", import.meta.url);
  const manquants = new Set<string>();
  for (const f of readdirSync(dossier)) {
    const p = JSON.parse(readFileSync(new URL(f, dossier), "utf8"));
    const exos = new Set<string>();
    JSON.stringify(p, (k, v) => (k === "exo" && typeof v === "string" && exos.add(v), v));
    for (const x of exos) {
      if (!x.startsWith("perso:")) assert.ok(clip(x), `${p.id} : ${x} sans clip`);
      else {
        const e = p.exercicesPerso[x.slice(6)];
        const ok = [e.nom.fr, e.nom.en].map((n: string) => clip(null, n));
        if (!ok[0] || !ok[1]) manquants.add(x.slice(6));
        if (PROGRAMMES_SANS.has(x.slice(6))) assert.deepEqual(ok, [undefined, undefined], `${x} a un clip : le retirer de PROGRAMMES_SANS`);
      }
    }
  }
  assert.deepEqual([...manquants].sort(), [...PROGRAMMES_SANS].sort());
});

test("3D : les clips propres et les gestes identiques passent avant le picto du catalogue", () => {
  assert.equal(clip("pushups"), "pompes"); // le picto des pompes est celui des pompes serrées
  assert.equal(clip("front-box-jump"), "front-box-jump");
  assert.equal(clip("box-jump-multiple-response"), "front-box-jump");
  assert.equal(clip(null, "Bird dog"), "bird-dog");
  assert.equal(clip("barbell-bench-press-medium-grip"), TABLES.catalogue["barbell-bench-press-medium-grip"]);
});
