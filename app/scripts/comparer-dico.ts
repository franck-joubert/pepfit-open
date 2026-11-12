// Compare un dictionnaire traduit à l'anglais, fichier par fichier : mêmes clés, même forme (chaîne ou pluriel), mêmes {paramètres}.
// node --experimental-strip-types --import ./tests/resolveur.mjs scripts/comparer-dico.ts de [fichier…]   (depuis app/)
import { readdirSync } from "node:fs";

const [langue, ...noms] = process.argv.slice(2);
if (!langue) throw new Error("usage : comparer-dico.ts <langue> [fichier…]");
const dossier = new URL(`../src/i18n/dico-${langue}/`, import.meta.url);
const fichiers = noms.length ? noms.map((n) => n.replace(/\.ts$/, "")) : readdirSync(dossier).map((f) => f.replace(/\.ts$/, ""));
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const forme = (v: unknown) => (typeof v === "string" ? [v] : v && typeof v === "object" ? [(v as { one: string }).one, (v as { other: string }).other] : []);

let fautes = 0;
for (const f of fichiers) {
  const ref = (await import(new URL(`../src/i18n/dico-en/${f}.ts`, import.meta.url).href)).en as Record<string, unknown>;
  const mod = await import(new URL(`${f}.ts`, dossier).href);
  const tr = mod[langue] as Record<string, unknown> | undefined;
  const p = (m: string) => {
    fautes++;
    console.log(`${f} : ${m}`);
  };
  if (!tr) {
    p(`pas d'export « ${langue} »`);
    continue;
  }
  for (const k of Object.keys(ref)) {
    if (!(k in tr)) p(`clé manquante ${k}`);
    else if (typeof ref[k] !== typeof tr[k]) p(`forme différente ${k}`);
    else {
      const a = forme(ref[k]);
      const b = forme(tr[k]);
      a.forEach((x, i) => {
        if (params(x) !== params(b[i] ?? "")) p(`paramètres différents ${k} : {${params(x)}} ≠ {${params(b[i] ?? "")}}`);
        if (!b[i]?.trim() && x.trim()) p(`vide ${k}`);
      });
    }
  }
  for (const k of Object.keys(tr)) if (!(k in ref)) p(`clé en trop ${k}`);
  for (const [k, v] of Object.entries(tr)) for (const x of forme(v)) if (x.includes("·")) p(`point médian ${k}`);
}
console.log(fautes ? `${fautes} écart(s)` : `OK (${fichiers.length} fichier(s))`);
process.exitCode = fautes ? 1 : 0;
