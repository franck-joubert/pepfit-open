// Rapport chiffré sur le catalogue seul (docs/CODE-PICTOS-PERSO.md) : combien d'exercices n'ont pas de picto ou de 3D, et combien
// d'entre eux ressemblent à un exercice qui en a un (le rattachement par nom les couvrirait sans rien produire).
// Lancer : npm run rapport-pictos (écrit le tableau en Markdown sur la sortie standard).
import { readFileSync } from "node:fs";
import { preparerCatalogue, procheDuCatalogue, SEUIL_SUGGESTION } from "../src/db/proximite.ts";
import { resoudreAvec } from "../src/ui/resolution.ts";

const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const index = lire("src/ui/pictos-index.ts");
const bloc = (src: string, nom: string) => src.split(`export const ${nom}`)[1]!.split("};")[0]!;
const paires = (b: string) => Object.fromEntries([...b.matchAll(/"([^"]+)": "([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
const T = { catalogue: paires(bloc(index, "CATALOGUE")), noms: paires(bloc(index, "NOMS")) };
const PICTOS = new Set([...bloc(index, "FICHIERS").matchAll(/"([^"]+)": require/g)].map((m) => m[1]!));
const CLIPS = new Set([...bloc(lire("src/ui/3d/clips.ts"), "CLIPS_3D").matchAll(/^ {2}"?([a-z0-9-]+)"?: require\(/gm)].map((m) => m[1]!));
const cat = JSON.parse(lire("assets/catalogue/exercices.json")).exercices as { slug: string; nom: string; nom_en: string; materiel: string | null }[];

type Etat = "propre" | "emprunt" | "aucun";
/** Propre : un picto (ou un clip) à son slug ; emprunt : celui d'un autre exercice (alias d'un geste identique, ou nom) ; aucun. */
function etat(e: { slug: string; nom: string }, connus: Set<string>, geste: boolean): Etat {
  if (connus.has(e.slug) || (!geste && connus.has(T.catalogue[e.slug] ?? ""))) return "propre";
  return resoudreAvec(T, e.slug, e.nom, (k) => connus.has(k), geste) ? "emprunt" : "aucun";
}

const prepare = preparerCatalogue(cat);
const parSlug = new Map(cat.map((e) => [e.slug, e]));
const sorties = [
  { titre: "Picto", connus: PICTOS, geste: false },
  { titre: "3D", connus: CLIPS, geste: true },
];
const lignes: string[] = [`Catalogue : ${cat.length} exercices.`, "", "| | propre | emprunté | aucun | sans propre, mais proche (≥ " + SEUIL_SUGGESTION + ") d'un exercice qui en a un |", "|---|---|---|---|---|"];
for (const s of sorties) {
  const n: Record<Etat, number> = { propre: 0, emprunt: 0, aucun: 0 };
  let proches = 0;
  for (const e of cat) {
    const et = etat(e, s.connus, s.geste);
    n[et]++;
    if (et === "propre") continue;
    const [p] = procheDuCatalogue(e.nom, prepare, { sauf: new Set([e.slug]), n: 40 }).filter((x) => etat(parSlug.get(x.slug)!, s.connus, s.geste) === "propre");
    if (p) proches++;
  }
  lignes.push(`| ${s.titre} | ${n.propre} | ${n.emprunt} | ${n.aucun} | ${proches} |`);
}
console.log(lignes.join("\n"));
