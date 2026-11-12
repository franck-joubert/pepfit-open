// Branche les pictos d'exercice : copie ../pictos/exercices/* dans assets/pictos/ et écrit src/ui/pictos-index.ts
// depuis pictos/exercices/index.json (une entrée par exercice d'Alex : nom, nom Hevy, picto partagé ou null),
// puis les pictos rendus depuis les clips 3D (../picto-3d/v8/plan.json et sorties/app).
// Activités Whoop : ../pictos-activites/activites/* (picto nommé par le slug du catalogue), noms lus dans
// ../donnees/whoop-activites.csv (nom français et noms Whoop, pour les exercices perso d'un import).
// Pour un nouveau lot : relancer `npm run pictos`, rien à écrire à la main.
import { copyFileSync, existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { normaliser } from "../src/db/normaliser.ts";
import { CORRESPONDANCES_HEVY } from "../src/import/correspondances.ts";
import { resoudreAvec } from "../src/ui/resolution.ts";

interface Entree {
  nom: string;
  hevy: string;
  picto: string | null;
  fichiers?: Record<string, string>;
}

const source = new URL("../../pictos/exercices/", import.meta.url);
const cible = new URL("../assets/pictos/", import.meta.url);
for (const f of readdirSync(source)) copyFileSync(new URL(f, source), new URL(f, cible));

const index = JSON.parse(readFileSync(new URL("index.json", source), "utf8")) as Record<string, Entree>;
const fichiers = new Map<string, string>();
const grands = new Map<string, string>();
const catalogue = new Map<string, string>();
const noms = new Map<string, string>();
const conflits: string[] = [];

function poser(table: Map<string, string>, cle: string, picto: string) {
  const deja = table.get(cle);
  if (deja && deja !== picto) conflits.push(`${cle} : ${deja} gardé, ${picto} ignoré`);
  else table.set(cle, picto);
}

for (const [cle, e] of Object.entries(index)) {
  if (!e.picto || !e.fichiers?.["cadre-128"]) continue;
  fichiers.set(e.picto, e.fichiers["cadre-128"]);
  if (e.fichiers["512"]) grands.set(e.picto, e.fichiers["512"]);
  poser(catalogue, cle, e.picto);
  const slug = e.hevy ? CORRESPONDANCES_HEVY.get(normaliser(e.hevy)) : undefined;
  if (slug) poser(catalogue, slug, e.picto);
  for (const n of [e.nom, e.hevy]) if (n) poser(noms, normaliser(n), e.picto);
}

// Activités Whoop : le picto porte le slug du catalogue ; nom français et noms Whoop anglais (« Running / Stroller Jogging »).
const activites = new URL("../../pictos-activites/activites/", import.meta.url);
const csv = new URL("../../donnees/whoop-activites.csv", import.meta.url);
if (existsSync(activites)) {
  const noms_act = new Map<string, string[]>();
  for (const l of readFileSync(csv, "utf8").trim().split("\n").slice(1)) {
    const [slug, nom, nom_en] = l.split(",");
    noms_act.set(slug!, [nom!, ...nom_en!.split(" / ")]);
  }
  for (const f of readdirSync(activites)) {
    copyFileSync(new URL(f, activites), new URL(f, cible));
    const slug = f.match(/^(.+)-cadre-128\.webp$/)?.[1];
    if (!slug) continue;
    // Cardio (lot D30) n'est pas une activité Whoop : relié par l'index seulement.
    const parIndex = Object.values(index).some((e) => e.picto === slug);
    if (!noms_act.has(slug) && !parIndex) conflits.push(`${slug} : picto d'activité absent de whoop-activites.csv`);
    fichiers.set(slug, f);
    if (existsSync(new URL(`${slug}-512.webp`, activites))) grands.set(slug, `${slug}-512.webp`);
    poser(catalogue, slug, slug);
    for (const n of noms_act.get(slug) ?? []) poser(noms, normaliser(n), slug);
  }
}

// Pictos des clips 3D (picto-3d/v8, plan.json) : un groupe = un picto, ses exercices du catalogue (slug) et ses exos
// perso (nom). Le fichier est celui de la piste I (pictos/v8/exercices : GPT Image, pose guidée par le rendu v8) s'il
// est fait, sinon le rendu v8 (picto-3d/v8/sorties/app). Un picto déjà connu de l'index garde la main (poser).
const v8 = new URL("../../picto-3d/v8/", import.meta.url);
const pisteI = new URL("../../pictos/v8/exercices/", import.meta.url);
if (existsSync(new URL("plan.json", v8))) {
  const plan = JSON.parse(readFileSync(new URL("plan.json", v8), "utf8")) as { groupes: { sortie: string; exercices: string[]; noms: string[] }[] };
  let n = 0, i = 0;
  for (const g of plan.groupes) {
    const f128 = `${g.sortie}-cadre-128.webp`, f512 = `${g.sortie}-512.webp`;
    const fait = (d: URL) => existsSync(new URL(f128, d)) && existsSync(new URL(f512, d));
    const dossier = fait(pisteI) ? pisteI : new URL("sorties/app/", v8);
    if (!fait(dossier)) {
      conflits.push(`${g.sortie} : picto v8 pas encore rendu`);
      continue;
    }
    // un picto v8 que l'index montre pour un exo perso (index_pictos.PARTAGES) n'est pas dans pictos/exercices : copié ici
    if (existsSync(new URL(f128, source))) {
      conflits.push(`${g.sortie} : picto v8 déjà dans l'index`);
      continue;
    }
    for (const f of [f128, f512]) copyFileSync(new URL(f, dossier), new URL(f, cible));
    fichiers.set(g.sortie, f128);
    grands.set(g.sortie, f512);
    for (const slug of g.exercices) poser(catalogue, slug, g.sortie);
    for (const nom of g.noms) poser(noms, normaliser(nom), g.sortie);
    n++;
    if (dossier === pisteI) i++;
  }
  // un picto v8 sorti du plan (groupe scindé ou renommé) ne reste pas dans l'APK
  for (const f of readdirSync(new URL("sorties/app/", v8))) {
    const s = f.replace(/-(cadre-128|512)\.webp$/, "");
    if (!fichiers.has(s) && existsSync(new URL(f, cible))) unlinkSync(new URL(f, cible));
  }
  console.log(`${n} pictos v8 (rendus depuis les clips 3D), dont ${i} en piste I`);
}

// Activités du catalogue sans geste propre ni clip, reliées au picto d'un geste ou d'un sport voisin (même idée que
// ALIAS_3D, pour le picto seul : pas de 3D). Les autres activités restent au picto neutre (tests/resolution-pictos.test.ts).
const ACTIVITES: Record<string, string> = {
  "musculation": "couche", // comme la tuile du parcours
  "cross-training": "kettlebell-swing", // comme le type de programme « cross »
  "etirements": "yoga", // comme le type « mobilité »
  "montee-marches": "montee-banc",
  "versaclimber": "cardio", // elliptique, stairmaster, rameur et assault bike ont leur picto (docs/CODE-PICTOS-MANQUANTS.md)
  "ski-de-fond": "randonnee", // bâtons, foulée
  "course-obstacles": "course", "duathlon": "course", "triathlon": "course",
  "badminton": "padel", "tennis-de-table": "padel", // sports de raquette (ALIAS_3D le fait déjà pour d'autres)
  "arts-martiaux": "boxe",
};
for (const [slug, picto] of Object.entries(ACTIVITES)) {
  if (fichiers.has(picto)) poser(catalogue, slug, picto);
  else conflits.push(`${slug} : picto ${picto} absent (ACTIVITES)`);
}

// Exercices dont le geste 3D a changé (picto-3d/anim) : leur picto venait de l'ancien alias d'ALIAS_3D ; ils le gardent
// tant qu'aucun picto n'est rendu depuis leur nouveau clip (table « pictos » de branchements.json, écrite par brancher.py).
const branchements = new URL("../../picto-3d/anim/branchements.json", import.meta.url);
if (existsSync(branchements)) {
  const b = JSON.parse(readFileSync(branchements, "utf8")) as { pictos?: Record<string, string> };
  for (const [slug, picto] of Object.entries(b.pictos ?? {})) {
    if (fichiers.has(picto)) poser(catalogue, slug, picto);
    else conflits.push(`${slug} : picto ${picto} absent (picto-3d/anim)`);
  }
}

// Titres Hevy en français que l'API ne relie à aucun nom anglais de l'index (modèle utilisé seulement sous ce nom).
// Traduction du nom Hevy anglais de l'index ; clé = entrée de l'index.
const TITRES_FR: Record<string, string[]> = {
  "barre-front-halteres": ["Skullcrusher (Haltère)"],
  "couche": ["Développé Couché (Barre)"],
  "couche-halteres": ["Développé Couché (Haltère)"],
  "curl-barre": ["Curl Biceps (Barre)"],
  "curl-poulie-haute": ["Curl Vis à vis (Poulie)"],
  "curl-pupitre-haltere": ["Curl Pupitre (Haltère)"],
  "decline-barre": ["Développé Couché Décliné (Barre)"],
  "developpe-assis-halteres": ["Développé Militaire (Haltère)"],
  "developpe-epaules-halteres": ["Presse Épaules (Haltère)"],
  "dips-machine": ["Machine Dips Assis"],
  "ecarte-poulie-basse": ["Écartés Poulie Basse"],
  "incline-barre": ["Développé Couché Incliné (Barre)"],
  "oiseau-machine": ["Oiseau (Machine)"],
  "pullover-poulie": ["Tirage Poitrine Bras Tendus (Poulie)"],
  "rowing-assis-machine": ["Rowing Assis (Machine)"],
  "rowing-sangles": ["Rowing Bas (Suspension)"],
  "squat-poids-du-corps": ["Squat (Poids du Corps)"],
  "tirage-vertical-machine": ["Tirage Poitrine (Machine)"],
  "triceps-barre": ["Extension Triceps Poulie Haute"],
};
let alias = 0;
function relier(titre: string, picto: string) {
  const n = normaliser(titre);
  if (!noms.has(n)) alias++;
  poser(noms, n, picto);
  const slug = CORRESPONDANCES_HEVY.get(n);
  if (slug) poser(catalogue, slug, picto);
}
for (const [cle, titres] of Object.entries(TITRES_FR)) {
  const e = index[cle];
  if (e?.picto && fichiers.has(e.picto)) for (const t of titres) relier(t, e.picto);
  else conflits.push(`${cle} : absent de l'index ou sans picto (TITRES_FR)`);
}

// Les titres Hevy d'Alex ont changé au fil des versions (FR puis EN, ou l'inverse) : l'index ne porte que le
// nom anglais. Si donnees-perso/hevy-api.json est là (ignoré par git), chaque titre qui partage l'exercise_template_id
// du nom de l'index reçoit le même picto (nom et slug du catalogue). Sans ce fichier, ces alias ne sont pas régénérés.
// DONNEES_PERSO : dossier donnees-perso d'un autre arbre (worktree sans ce dossier ignoré par git), lu seulement
const api = process.env.DONNEES_PERSO ? new URL(`file://${process.env.DONNEES_PERSO}/hevy-api.json`)
  : new URL("../donnees-perso/hevy-api.json", import.meta.url);
if (existsSync(api)) {
  const seances = JSON.parse(readFileSync(api, "utf8")) as { exercises: { title: string; exercise_template_id: string }[] }[];
  const titres = new Map<string, Set<string>>();
  const modele = new Map<string, string>();
  for (const s of seances) {
    for (const x of s.exercises) {
      if (!titres.has(x.exercise_template_id)) titres.set(x.exercise_template_id, new Set());
      titres.get(x.exercise_template_id)!.add(x.title);
      modele.set(normaliser(x.title), x.exercise_template_id);
    }
  }
  for (const e of Object.values(index)) {
    if (!e.picto || !fichiers.has(e.picto)) continue;
    const t = modele.get(normaliser(e.hevy || "")) ?? modele.get(normaliser(e.nom));
    for (const titre of t ? titres.get(t)! : []) relier(titre, e.picto);
  }
}

// Les 512 restent tous dans l'APK, même pour un exercice qui a un clip 3D : la séance passée d'un exercice seul montre son
// picto en grand (planche Lieux § 4, 27/10). Avant, le 512 d'un exercice en 3D sortait de l'APK (26/10).

const trier = (m: Map<string, string>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const ts = `// Écrit par scripts/brancher-pictos.ts depuis pictos/exercices/index.json : ne pas modifier à la main.

/** Slug du picto → fichier « cadre 128 » (require statique, obligatoire pour Metro). */
export const FICHIERS: Record<string, number> = {
${trier(fichiers).map(([p, f]) => `  ${JSON.stringify(p)}: require("../../assets/pictos/${f}"),`).join("\n")}
};

/** Slug du picto → fichier « 512 », pour un picto affiché au-delà de 128 px (page exercice sans 3D). */
export const GRANDS: Record<string, number> = {
${trier(grands).map(([p, f]) => `  ${JSON.stringify(p)}: require("../../assets/pictos/${f}"),`).join("\n")}
};

/** Slug du catalogue (ou de l'index) → slug du picto. */
export const CATALOGUE: Record<string, string> = {
${trier(catalogue).map(([s, p]) => `  ${JSON.stringify(s)}: ${JSON.stringify(p)},`).join("\n")}
};

/** Nom normalisé (français ou Hevy) → slug du picto, pour les exercices perso créés par l'import. */
export const NOMS: Record<string, string> = {
${trier(noms).map(([n, p]) => `  ${JSON.stringify(n)}: ${JSON.stringify(p)},`).join("\n")}
};
`;
writeFileSync(new URL("../src/ui/pictos-index.ts", import.meta.url), ts);

// Champ picto du catalogue (assets/catalogue/exercices.json) : le 512 de la résolution de l'appli, sinon le neutre.
// Un changement monte la version du catalogue (rechargé en base au lancement suivant).
const fichierCat = new URL("../assets/catalogue/exercices.json", import.meta.url);
const texteCat = readFileSync(fichierCat, "utf8");
const cat = JSON.parse(texteCat) as { version: number; exercices: { slug: string; nom: string; picto: string }[] };
const tables = { catalogue: Object.fromEntries(catalogue), noms: Object.fromEntries(noms) };
let changes = 0, reels = 0;
for (const e of cat.exercices) {
  const cle = resoudreAvec(tables, e.slug, e.nom, (c) => fichiers.has(c));
  const picto = cle ? `assets/pictos/${grands.get(cle) ?? `${cle}-512.webp`}` : "assets/pictos/neutre-512.webp";
  if (cle) reels++;
  if (e.picto !== picto) { e.picto = picto; changes++; }
}
if (changes) {
  cat.version++;
  writeFileSync(fichierCat, JSON.stringify(cat, null, 1).replace(/^ +/gm, "") + (texteCat.endsWith("\n") ? "\n" : ""));
}
console.log(`catalogue : ${reels} / ${cat.exercices.length} exercices avec un picto réel (${changes} changés, version ${cat.version})`);
console.log(`${fichiers.size} pictos, ${catalogue.size} slugs, ${noms.size} noms (${alias} titres Hevy reliés par modèle)`);
for (const c of conflits) console.log("conflit", c);
