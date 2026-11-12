// Vue 3D au doigt (D19) : fichiers du personnage et des clips, libellé d'accessibilité, caméra, décodeur UTF-8.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { libelleVue3D, listeMuscles, NOMS_MUSCLES } from "../src/ui/3d/muscles";
import { amortir, BORNES, CIBLE, etendueDe, ORBITE_DOS, position, rayonCadrage, tourner, zoomer } from "../src/ui/3d/orbite";
import { normaliser } from "../src/db/normaliser";
import { hauteur3DAgrandie } from "../src/ecrans/exercice-vue";
import { DecodeurUtf8 } from "../src/ui/3d/utf8";
import { CURSEURS } from "../src/ecrans/morphologie-calc";

const LOT8 = ["tirage-vertical", "triceps-corde", "couche-smith", "curl-corde", "tirage-horizontal", "incline-halteres", "triceps-barre",
  "triceps-haltere-unilateral"];
// v6 : les lots suivants (picto-3d/v6), mêmes règles, 70 Ko au plus par clip
const V6 = ["tractions-supination", "pec-deck", "curl-barre", "curl-halteres", "leg-extension", "presse-horizontale", "decline-machine",
  "leg-curl-assis", "pompes-halteres", "pompes-serrees", "abduction-machine", "pullover-poulie", "ecarte-poulie", "elevations-laterales",
  "developpe-epaules-halteres", "elevations-frontales", "ecarte-poulie-basse", "elevation-laterale-poulie-unilaterale",
  "rowing-iso-lateral", "face-pull", "crunch-machine", "hip-thrust-machine", "curl-pupitre-haltere", "developpe-epaules-machine",
  "developpe-assis-halteres", "triceps-nuque-poulie", "dips-triceps", "releve-jambes-suspendu",
  "arriere-epaule", "souleve-roumain-halteres", "mollets-debout", "roue-abdos",
  "gainage", "releve-jambes-sol", "crunch", "releve-genoux", "releve-bassin", "squat-poids-du-corps", "elevation-frontale-poulie",
  "curl-poulie-haute", "couche", "couche-halteres", "incline-barre", "decline-barre", "barre-front-halteres", "rowing-sangles",
  "squat", "sdt"];
/** Lots de nuit (lot 15 et suivants) : picto-3d/v7/A-FAIRE.md. */
const NUIT = ["hip-hinge", "calf-stretch", "childs-pose", "cat-camel", "wall-slides", "hip-flexor-stretch", "ankle-dorsiflexion-stretch", "quad-stretch", "curl-marteau", "couche-serre", "developpe-militaire", "sdt-roumain-barre", "barre-front-ez", "worlds-greatest-stretch", "cossack-squat", "thoracic-rotation-stretch", "90-90-hip-stretch", "yoga", "hiit", "boxe", "course", "randonnee", "padel", "natation", "bicycling", "curl-inverse", "shrug-halteres", "shrug-barre", "rowing-deux-halteres", "rowing-barre", "triceps-kickback", "good-morning", "ecarte-halteres", "ecarte-incline-halteres", "pullover-haltere", "triceps-nuque-halteres", "curl-pupitre-barre", "curl-concentre", "curl-incline", "curl-poignets", "tirage-menton", "squat-smith", "squat-avant", "squat-gobelet", "hack-squat", "fentes-halteres", "fente-arriere", "fentes-marchees", "squat-bulgare", "montee-banc", "leg-curl-allonge", "mollets-assis", "presse-inclinee", "mollets-presse", "developpe-epaules-smith", "developpe-incline-smith", "arnold-press", "dips-banc", "rowing-haltere", "rowing-t-bar", "sdt-trap-bar", "pompes", "pompes-larges", "pompes-inclinees", "pompes-declinees", "crunch-inverse", "battements", "sit-up", "pont-fessier", "developpe-debout-halteres", "mollets-halteres", "squat-halteres", "sdt-sumo", "flexion-laterale-haltere", "dead-bug", "russian-twist", "swing-kettlebell", "superman", "air-bike", "mountain-climbers", "side-bridge", "alternate-heel-touchers", "power-clean", "power-jerk", "power-snatch", "overhead-squat", "hyperextensions-back-extensions", "oblique-crunches", "cable-crunch", "external-rotation-with-cable", "glute-kickback", "split-jerk", "split-clean", "split-snatch", "dumbbell-prone-incline-curl", "standing-cable-chest-press", "pallof-press", "standing-cable-wood-chop", "kettlebell-windmill", "kettlebell-thruster", "kettlebell-pistol-squat", "knee-tuck-jump", "standing-toe-touches", "farmers-walk", "overhead-slam", "medicine-ball-chest-pass", "side-neck-stretch", "arm-circles", "overhead-stretch", "triceps-stretch", "chest-and-front-of-shoulder-stretch", "hug-knees-to-chest", "lying-hamstring", "seated-floor-hamstring-stretch", "the-straddle", "groin-and-back-stretch", "upper-back-stretch", "front-leg-raises", "side-leg-raises", "rear-leg-raises", "standing-hip-circles", "ankle-circles", "rhomboids-smr", "hamstring-smr", "quadriceps-smr", "iliotibial-tract-smr", "kettlebell-halo", "kettlebell-halo-with-overhead-extension", "standing-pelvic-tilt", "hip-circles-prone", "one-handed-hang", "kneeling-squat", "monster-walk", "balance-board", "battling-ropes", "anti-gravity-press"];
/** Animations de picto-3d/anim (SUIVI.md), mêmes règles. */
const ANIM = ["marche", "bird-dog", "equilibre-unipodal", "sauts-legers", "rocket-jump", "freehand-jump-squat", "single-leg-glute-bridge", "front-box-jump", "band-pull-apart", "burpee", "chaise-mur", "curl-up", "marche-talon-pointe", "appuis", "barbell-hip-thrust", "one-arm-kettlebell-swings", "lateral-bound", "fast-skipping", "dumbbell-floor-press", "floor-press", "round-the-world-shoulder-stretch", "rowing-stationary", "elliptical-trainer", "stairmaster", "versaclimber", "rope-jumping", "meditation", "pilates", "danse", "football", "basket", "volley", "rugby", "football-americain", "handball", "golf", "baseball", "cricket", "adduction-machine", "oiseau-machine", "curl-poignets-dos", "push-press", "presse-pectoraux", "dips-machine", "pendule", "ciseaux", "hollow-rock", "gainage-sauts", "gainage-genou-lateral", "barbell-glute-bridge", "natural-glute-ham-raise", "handstand-push-ups", "one-arm-lat-pulldown", "ski", "snowboard", "surf", "skateboard", "kayak", "paddle", "patin-a-glace", "escalade", "fauteuil-roulant", "plongee", "hurling", "hockey-gazon", "escrime", "lutte", "paintball", "jiu-jitsu", "ultimate", "netball", "water-polo", "spikeball", "arts-du-cirque", "barre-fitness", "gymnastique", "wakeboard", "kitesurf", "ski-nautique", "sport-auto", "motocross", "voile", "football-gaelique", "parkour", "hockey-glace", "lacrosse", "two-arm-kettlebell-military-press", "lying-glute", "all-fours-quad-stretch", "kettlebell-turkish-get-up-squat-style", "scissors-jump", "split-jump", "star-jump", "plyo-push-up", "alternating-renegade-row", "pompes-serrees-haltere", "hip-thrust-smith"];
const assets = (f: string) => new URL(`../assets/3d/${f}`, import.meta.url);
/** JSON d'un GLB (premier bloc). */
function jsonGlb(f: string) {
  const b = readFileSync(assets(f));
  assert.equal(b.toString("ascii", 0, 4), "glTF", f);
  return JSON.parse(b.toString("utf8", 20, 20 + b.readUInt32LE(12)));
}

test("D19 : chaque clip de clips.ts existe, le personnage et ses textures aussi", () => {
  const src = readFileSync(new URL("../src/ui/3d/clips.ts", import.meta.url), "utf8");
  const fichiers = [...src.matchAll(/require\("\.\.\/\.\.\/\.\.\/assets\/3d\/([^"]+)"\)/g)].map((m) => m[1]!);
  assert.deepEqual([...new Set(fichiers)].sort(), ["cavite.jpg", "masque.png", "personnage-femme-morph.glb", "personnage-femme.glb", "personnage-morph-epaules.glb", "personnage-morph.glb", "personnage.glb", "relief.jpg", "tractions.glb", ...[...LOT8, ...V6, ...NUIT, ...ANIM].map((k) => `${k}.glb`)].sort());
  for (const f of fichiers) assert.ok(existsSync(assets(f)), f);
});

/** Poids au plus des GLB morphés (v6, 08/11) : l'homme 1,4 Mo (1,34 Mo, deux cibles sur les 14 517 sommets) ; la femme 1,9 Mo
 *  (1,86 Mo : trois cibles sur tous les sommets, adiposité en plus et en moins et muscle en moins, 174 Ko chacune ; le gras de
 *  la femme est composé, planches/morphologie/modeles-v3/poids.json). */
const BUDGET_MORPH: Readonly<Record<string, number>> = { "personnage-femme-morph.glb": 1.9e6 };
test("Santé : les GLB v6 portent un morph target par bout de chaque curseur du calcul B, sans meshopt ni texture (Hermes, expo-gl)", () => {
  const bouts = (noms: readonly string[]) => noms.flatMap((n) => (n === "tenue" ? [n] : [`${n}-`, n]));
  const homme = bouts(CURSEURS.filter((n) => n !== "bonnet" && n !== "tenue"));
  for (const [f, noms] of [["personnage-morph.glb", homme], ["personnage-morph-epaules.glb", homme], ["personnage-femme-morph.glb", bouts(CURSEURS)]] as const) {
    const j = jsonGlb(f);
    assert.ok(!(j.extensionsUsed ?? []).includes("EXT_meshopt_compression"), f); // KHR_mesh_quantization se lit sans WebAssembly
    assert.equal(j.images, undefined, f);
    assert.deepEqual(j.meshes[0].extras.targetNames, noms, f);
    assert.ok(readFileSync(assets(f)).length < (BUDGET_MORPH[f] ?? 1.4e6), f);
  }
});

test("Femme 3D : même forme de fichier que l'homme (mêmes muscles, textures à part, sans meshopt), sous 1,2 Mo", () => {
  const homme = jsonGlb("personnage.glb");
  const femme = jsonGlb("personnage-femme.glb");
  assert.equal(femme.animations, undefined);
  assert.equal(femme.skins.length, 1);
  assert.deepEqual(femme.materials.map((m: { name: string }) => m.name), ["corps_pbr"]);
  assert.equal(femme.images, undefined);
  assert.equal(femme.extensionsUsed, undefined);
  assert.deepEqual(femme.extras, { ...homme.extras, genre: "femme", taille: 1.67 });
  assert.deepEqual(femme.nodes.map((n: { name: string }) => n.name), homme.nodes.map((n: { name: string }) => n.name));
  assert.ok(statSync(assets("personnage-femme.glb")).size <= 1_200_000);
});

test("D19 : personnage chargé une fois (sans cheveux, sans animation) ; le clip n'apporte qu'animation, barre et muscles", () => {
  const perso = jsonGlb("personnage.glb");
  assert.equal(perso.animations, undefined);
  assert.equal(perso.skins.length, 1);
  assert.deepEqual(perso.materials.map((m: { name: string }) => m.name), ["corps_pbr"]);
  assert.equal(perso.images, undefined, "textures à part (expo-gl ne lit que des fichiers)");
  // Hermes n'a pas WebAssembly : ni meshopt ni Draco ; la quantification (KHR_mesh_quantization) se lit sans décodeur
  assert.deepEqual(perso.extensionsUsed, ["KHR_mesh_quantization"]);
  assert.ok(statSync(assets("personnage.glb")).size <= 600_000, "homme v2 quantifié : ~520 Ko");

  const clip = jsonGlb("tractions.glb");
  assert.equal(clip.skins, undefined);
  assert.equal(clip.animations.length, 1);
  assert.deepEqual(clip.meshes.map((m: { name: string }) => m.name), ["Cylinder"]); // la barre
  assert.equal(clip.extensionsUsed, undefined);
  assert.deepEqual(clip.extras, { exercice: "tractions", principaux: ["grand_dorsal", "grand_rond"], secondaires: ["biceps", "brachial"] });
  for (const m of [...clip.extras.principaux, ...clip.extras.secondaires]) {
    assert.ok(perso.extras.muscles[m] > 0, m);
    assert.ok(NOMS_MUSCLES[m], m);
  }
  // les os animés existent dans le personnage
  const os = new Set(perso.nodes.map((n: { name: string }) => n.name));
  for (const c of clip.animations[0].channels) assert.ok(os.has(clip.nodes[c.target.node].name), clip.nodes[c.target.node].name);
  assert.ok(statSync(assets("tractions.glb")).size < 80_000, "un clip pèse quelques dizaines de Ko");
});

test("3D lot 8 et v6 : chaque clip n'apporte qu'une animation de 3 s, ses agrès et ses muscles", () => {
  const perso = jsonGlb("personnage.glb");
  const os = new Set(perso.nodes.map((n: { name: string }) => n.name));
  for (const k of [...LOT8, ...V6, ...NUIT, ...ANIM]) {
    const clip = jsonGlb(`${k}.glb`);
    assert.equal(clip.skins, undefined, k);
    assert.equal(clip.extensionsUsed, undefined, k);
    assert.equal(clip.animations.length, 1, k);
    assert.equal(clip.extras.exercice, k);
    assert.ok(clip.extras.nom && clip.extras.execution, k);
    assert.ok(clip.extras.principaux.length > 0, k);
    for (const m of [...clip.extras.principaux, ...clip.extras.secondaires]) assert.ok(perso.extras.muscles[m] > 0 && NOMS_MUSCLES[m], `${k} : ${m}`);
    // les agrès sont des maillages nommés agres_… ; les autres pistes animent des os du personnage
    for (const n of clip.nodes.filter((n: { mesh?: number }) => n.mesh != null)) assert.match(n.name, /^agres_/, k);
    for (const c of clip.animations[0].channels) {
      const nom = clip.nodes[c.target.node].name;
      assert.ok(os.has(nom) || nom.startsWith("agres_"), `${k} : ${nom}`);
    }
    const temps = clip.animations[0].samplers.map((s: { input: number }) => clip.accessors[s.input]);
    assert.equal(Math.min(...temps.map((a: { min: number[] }) => a.min[0])), 0, k);
    assert.ok(Math.abs(Math.max(...temps.map((a: { max: number[] }) => a.max[0])) - 3) < 1e-6, k);
    assert.ok(statSync(assets(`${k}.glb`)).size < (LOT8.includes(k) ? 80_000 : 70 * 1024), k);
  }
});

test("3D de nuit : l'accès par nom ou par alias mène à un clip existant, noms déjà normalisés", () => {
  const src = readFileSync(new URL("../src/ui/3d/clips.ts", import.meta.url), "utf8");
  const alias = readFileSync(new URL("../src/ui/3d/alias.ts", import.meta.url), "utf8");
  const cles = new Set([...src.matchAll(/^ {2}"?([a-z0-9-]+)"?: require\(/gm)].map((m) => m[1]!));
  for (const bloc of ["NOMS_3D", "ALIAS_3D"]) {
    const corps = alias.slice(alias.indexOf(`const ${bloc}`)).split("};")[0]!;
    for (const m of corps.matchAll(/"([^"]+)": "([^"]+)"/g)) {
      assert.ok(cles.has(m[2]!), `${bloc} : ${m[1]} → ${m[2]}`);
      if (bloc === "NOMS_3D") assert.equal(normaliser(m[1]!), m[1], m[1]);
    }
  }
  for (const k of [...NUIT, ...ANIM]) assert.ok(cles.has(k), k);
});

test("D19 : libellé qui énumère les muscles", () => {
  assert.equal(listeMuscles(["grand_dorsal", "grand_rond"]), "Grand dorsal et grand rond");
  assert.equal(listeMuscles(["biceps", "brachial", "avant_bras"]), "Biceps, brachial et avant-bras");
  assert.equal(listeMuscles(["trapeze"]), "Trapèze");
  assert.equal(
    libelleVue3D("Tractions", ["grand_dorsal", "grand_rond"], ["biceps", "brachial"]),
    "Tractions en 3D, à faire tourner du doigt. Muscles principaux : grand dorsal et grand rond. Secondaires : biceps et brachial.",
  );
  assert.equal(libelleVue3D("Tractions", [], []), "Tractions en 3D, à faire tourner du doigt.");
});

test("D19 : caméra, vue de dos de la visionneuse, glisser, pincer, élan", () => {
  const p = position(ORBITE_DOS);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y - 1.6) < 1e-9 && Math.abs(p.z + 4.8) < 1e-9);
  // une hauteur d'écran glissée = un tour complet
  const t = tourner(ORBITE_DOS, 600, 0, 600);
  assert.ok(Math.abs(t.theta - (ORBITE_DOS.theta - 2 * Math.PI)) < 1e-9);
  assert.equal(tourner(ORBITE_DOS, 0, 10_000, 600).phi, BORNES.phiMin);
  assert.equal(tourner(ORBITE_DOS, 0, -10_000, 600).phi, BORNES.phiMax);
  assert.equal(zoomer(ORBITE_DOS, 100).rayon, BORNES.rayonMin);
  assert.equal(zoomer(ORBITE_DOS, 0.01).rayon, BORNES.rayonMax);
  assert.ok(zoomer(ORBITE_DOS, 1.2).rayon < ORBITE_DOS.rayon);
  assert.equal(amortir(1, 120), 0.5);
  assert.equal(amortir(0.012, 120), 0);
  assert.equal(CIBLE.y, 1.45);
});

test("Cadrage : centre du contenu visé, corps entier et agrès selon la forme de la vue ; zoom borné", () => {
  // tractions : pieds à 0,04 m, haut de la barre à 2,54 m, barre de 1,8 m : on vise le milieu de la boîte, pas l'origine
  const tractions = etendueDe({ x: -0.9, y: 0.04, z: -0.3 }, { x: 0.9, y: 2.54, z: 0.3 });
  assert.deepEqual(tractions.centre, { x: 0, y: 1.29, z: 0 });
  assert.equal(tractions.demiHauteur, 1.25);
  assert.ok(Math.abs(tractions.rayon - Math.hypot(0.9, 0.3)) < 1e-9);
  // la caméra orbite autour de ce centre : même distance à lui quel que soit l'angle
  const o = { ...ORBITE_DOS, rayon: 5 };
  const p = position(o, tractions.centre);
  assert.ok(Math.abs(Math.hypot(p.x, p.y - 1.29, p.z) - 5) < 1e-9);
  const t = Math.tan((15 * Math.PI) / 180);
  // vue large (page) : la hauteur décide ; tout le contenu tient dans le champ vertical, avec de l'air
  const large = rayonCadrage(tractions, 412 / 352);
  assert.ok((large - tractions.rayon / 2) * t > tractions.demiHauteur);
  // vue étroite : la largeur décide, la caméra recule
  assert.ok(rayonCadrage(tractions, 0.3) > large);
  // pincer : jamais au-delà du plafond donné (le cadrage × 1,5), ni plus près que rayonMin ; la cible ne bouge pas
  assert.equal(zoomer(ORBITE_DOS, 0.01, 6).rayon, 6);
  assert.equal(zoomer(ORBITE_DOS, 100, 6).rayon, BORNES.rayonMin);
});

test("3D agrandie : 4:3 portrait sur la largeur, jamais plus petite que la taille normale", () => {
  assert.equal(hauteur3DAgrandie(412, 352), 549);
  assert.equal(hauteur3DAgrandie(200, 352), 352);
});

test("D19 : décodeur UTF-8 de secours (Hermes sans TextDecoder)", () => {
  const texte = 'glTF {"nom":"Trapèze, deltoïde ✓ 💪"}';
  const octets = new TextEncoder().encode(texte);
  assert.equal(new DecodeurUtf8().decode(octets), texte);
  assert.equal(new DecodeurUtf8().decode(octets.buffer), texte);
  assert.equal(new DecodeurUtf8().decode(new Uint8Array(octets.buffer, 0, 4)), "glTF");
});
