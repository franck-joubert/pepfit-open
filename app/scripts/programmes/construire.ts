// Génère le catalogue de la boutique (NOTES § 3 de planches/boutique-programmes) : un JSON par programme dans
// assets/catalogue/programmes/, un par routine dans assets/catalogue/routines/, et src/boutique/catalogue-embarque.ts
// (require statiques pour Metro).
//   npm run programmes              écrit les fichiers
//   npm run programmes -- --verifier  compare sans écrire (code 1 si différent)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { validerProgramme, validerRoutine } from "../../src/boutique/modele.ts";
import { AUTRES } from "./autres.ts";
import { ENDURANCE } from "./endurance.ts";
import { ROUTINES } from "./routines.ts";

const racine = new URL("../../", import.meta.url);
const dossier = new URL("assets/catalogue/programmes/", racine);
const dossierRoutines = new URL("assets/catalogue/routines/", racine);
const slugs = new Set((JSON.parse(readFileSync(new URL("assets/catalogue/exercices.json", racine), "utf8")) as { exercices: { slug: string }[] }).exercices.map((e) => e.slug));

export const PROGRAMMES = [...ENDURANCE, ...AUTRES];

export function fichiers(): Map<URL, string> {
  const out = new Map<URL, string>();
  for (const p of PROGRAMMES) {
    const err = validerProgramme(p, slugs);
    if (err.length) throw new Error(`${p.id} invalide :\n${err.join("\n")}`);
    out.set(new URL(`${p.id}.json`, dossier), `${JSON.stringify(p, null, 1)}\n`);
  }
  const ids = new Set(PROGRAMMES.map((p) => p.id));
  for (const r of ROUTINES) {
    const err = validerRoutine(r, slugs);
    if (ids.has(r.id)) err.push(`${r.id} : même id qu'un programme`);
    if (err.length) throw new Error(`${r.id} invalide :\n${err.join("\n")}`);
    out.set(new URL(`${r.id}.json`, dossierRoutines), `${JSON.stringify(r, null, 1)}\n`);
  }
  const lignes = PROGRAMMES.map((p) => `  require("../../assets/catalogue/programmes/${p.id}.json"),`).join("\n");
  const lignesR = ROUTINES.map((r) => `  require("../../assets/catalogue/routines/${r.id}.json"),`).join("\n");
  out.set(
    new URL("src/boutique/catalogue-embarque.ts", racine),
    `// Écrit par scripts/programmes/construire.ts (npm run programmes) : ne pas modifier à la main.\nimport type { Programme, RoutineBoutique } from "./modele";\n\n/** Les programmes du catalogue, dans l'ordre de la boutique (require statiques, obligatoires pour Metro). */\nexport const PROGRAMMES_EMBARQUES: Programme[] = [\n${lignes}\n];\n\n/** Les routines du catalogue (rayon « Routines »), dans l'ordre de la boutique. */\nexport const ROUTINES_EMBARQUEES: RoutineBoutique[] = [\n${lignesR}\n];\n`,
  );
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = process.argv.includes("--verifier");
  let differents = 0;
  mkdirSync(dossier, { recursive: true });
  mkdirSync(dossierRoutines, { recursive: true });
  for (const [u, contenu] of fichiers()) {
    let actuel = "";
    try {
      actuel = readFileSync(u, "utf8");
    } catch {}
    if (actuel === contenu) continue;
    differents++;
    if (verifier) console.error(`différent : ${u.pathname}`);
    else writeFileSync(u, contenu);
  }
  console.log(verifier ? `${differents} fichier(s) différent(s)` : `${PROGRAMMES.length} programmes, ${ROUTINES.length} routines, ${differents} fichier(s) écrit(s)`);
  if (verifier && differents) process.exit(1);
}
