// Proximité de deux noms d'exercice, en français comme en anglais (logique pure, testée sous node) : sert à proposer, pour un
// exercice perso (créé à la main ou importé de Hevy), l'exercice du catalogue qui lui ressemble le plus. Jamais un rattachement
// seul : la suggestion est confirmée par la personne (db/depots/liens-catalogue.ts).
//
// Principe : chaque nom devient un ensemble de jetons canoniques (anglais, sans accent, pluriels ramenés au singulier, synonymes
// réunis : « développé épaules », « shoulder press » et « presse militaire » donnent les mêmes jetons ; le matériel entre
// parenthèses est un jeton comme un autre). Le score est un Dice pondéré (le geste et le muscle pèsent plus que le matériel, le
// matériel plus que la posture). Deux garde-fous contre les faux positifs :
//   - le « cœur » (geste et muscle) doit se recouvrir : développé couché et développé épaules ne partagent que « press » ;
//   - une contradiction (matériel, inclinaison, prise, côté) abaisse le score : barre contre haltère ne passe pas le seuil.
import { normaliser } from "./normaliser";

type Classe = "geste" | "corps" | "materiel" | "posture" | "orientation" | "prise" | "cote" | "mot";

/** Poids de chaque classe de jeton dans le score. Un mot inconnu pèse comme un détail distinctif (bulgare, arnold, zottman…). */
const POIDS: Record<Classe, number> = { geste: 3, corps: 2, materiel: 1.5, posture: 0.7, orientation: 1, prise: 0.8, cote: 0.8, mot: 2 };

/** Pluriel simple ramené au singulier (« dips », « haltères »), sauf « press », « biceps »… sans importance : les deux côtés suivent. */
function singulier(m: string): string {
  if (/(ch|sh|x)es$/.test(m) && m.length > 5) return m.slice(0, -2); // crunches, stretches
  return m.length > 3 && m.endsWith("s") && !m.endsWith("ss") ? m.slice(0, -1) : m;
}

/** Mots sans sens pour la comparaison (articles, prépositions des deux langues). */
const VIDES = new Set(
  "de du des d la le les l un une a au aux avec sans the of with on and et en to for sur pour par in at an or ou vers from depui toward towards".split(" ").map((m) => singulier(m)),
);

/** Mots utiles d'un nom : normalisés, au singulier, sans mots vides (même chemin pour les noms et pour les clés de PHRASES). */
const mots = (texte: string) => normaliser(texte).split(" ").filter(Boolean).map(singulier).filter((m) => !VIDES.has(m) && (m.length > 1 || /\d/.test(m)));
const cle = (phrase: string) => mots(phrase).join(" ");

// Phrases d'un à trois mots → jetons canoniques (séparés par une espace). Plus longues d'abord.
const PHRASES: Record<string, string> = {
  // Développés
  "developpe couche": "chest press",
  "developpe militaire": "shoulder press",
  "developpe epaules": "shoulder press",
  "developpe epaule": "shoulder press",
  "developpe assis": "shoulder press seated",
  "presse epaules": "shoulder press",
  "presse militaire": "shoulder press",
  "military press": "shoulder press",
  "overhead press": "shoulder press",
  "shoulder press": "shoulder press",
  "bench press": "chest press",
  "chest press": "chest press",
  "developpe pectoraux": "chest press",
  "presse pectoraux": "chest press",
  "presse a pectoraux": "chest press",
  "presse a cuisses": "leg press",
  "presse cuisses": "leg press",
  "leg press": "leg press",
  "developpe arnold": "arnold press",
  "arnold press": "arnold press",
  "developpe": "press",
  "presse": "press",
  // Tractions, tirages, rowings
  "tirage vertical": "pulldown",
  "tirage poitrine": "pulldown",
  "tirage nuque": "pulldown",
  "lat pulldown": "pulldown",
  "pull down": "pulldown",
  "pulldown": "pulldown",
  "pull up": "pullup",
  "pullup": "pullup",
  "chin up": "pullup supination",
  "chinup": "pullup supination",
  "traction": "pullup",
  "tirage horizontal": "row",
  "rowing": "row",
  "tirage menton": "uprightrow",
  "upright row": "uprightrow",
  "face pull": "facepull",
  "tirage visage": "facepull",
  "tirage vers visage": "facepull",
  "tirage vers le visage": "facepull",
  "tirage bras tendus": "pulldown straight",
  "straight arm pulldown": "pulldown straight",
  "tirage": "pull",
  // Pompes, dips
  "push up": "pushup",
  "pushup": "pushup",
  "pompe": "pushup",
  "dip": "dip",
  // Poussées de jambes, squats, fentes, soulevés
  "soulev de terre": "deadlift",
  "souleve de terre": "deadlift",
  "soulev terre": "deadlift",
  "deadlift": "deadlift",
  "sdt": "deadlift",
  "roumain": "romanian",
  "romanian": "romanian",
  "good morning": "goodmorning",
  "hip thrust": "hipthrust",
  "hip trust": "hipthrust", // la faute la plus courante
  "poussee de hanches": "hipthrust",
  "poussee de hanche": "hipthrust",
  "poussee de bassin": "hipthrust",
  "squat": "squat",
  "fente": "lunge",
  "lunge": "lunge",
  "split squat": "lunge",
  "leg extension": "leg extension",
  "extension jambes": "leg extension",
  "extension de jambes": "leg extension",
  "extension quadriceps": "leg extension",
  "leg curl": "leg curl",
  "flexion jambes": "leg curl",
  "curl jambes": "leg curl",
  "curl ischio": "leg curl",
  "calf raise": "calf raise",
  "extension mollets": "calf raise",
  "releve mollets": "calf raise",
  "mollet": "calf",
  "calve": "calf",
  "calf": "calf",
  // Isolation haut du corps
  "elevation laterale": "lateral raise",
  "levee laterale": "lateral raise",
  "lateral raise": "lateral raise",
  "side raise": "lateral raise",
  "elevation frontale": "frontal raise",
  "elevation avant": "frontal raise",
  "front raise": "frontal raise",
  "releve de jambes": "leg raise",
  "releve jambes": "leg raise",
  "leg raise": "leg raise",
  "releve de genoux": "knee raise",
  "releve genoux": "knee raise",
  "knee raise": "knee raise",
  "oiseau": "reverse fly",
  "reverse fly": "reverse fly",
  "rear delt": "reverse fly",
  "ecarte": "fly",
  "crossover": "fly",
  "crossovers": "fly",
  "fly": "fly",
  "flye": "fly",
  "butterfly": "fly machine",
  "pec deck": "fly machine",
  "curl biceps": "curl biceps",
  "curl": "curl",
  "extension triceps": "extension triceps",
  "triceps extension": "extension triceps",
  "pushdown": "extension triceps",
  "tricep": "triceps",
  "bicep": "biceps",
  "kickback": "kickback",
  "shrug": "shrug",
  "haussement epaules": "shrug",
  "haussement": "shrug",
  "pullover": "pullover",
  // Abdos, gainage
  "sit up": "situp",
  "releve de buste": "situp",
  "releve buste": "situp",
  "crunch": "crunch",
  "gainage": "plank",
  "planche": "plank",
  "planches": "plank",
  "plank": "plank",
  "roue abdominale": "abs wheel",
  "ab wheel": "abs wheel",
  "ab roller": "abs wheel",
  "russian twist": "twist",
  // Mots courants des deux langues (noms du catalogue)
  "etirement": "stretch",
  "stretch": "stretch",
  "saut": "jump",
  "sauter": "jump",
  "jump": "jump",
  "hop": "jump",
  "elevation": "raise",
  "raise": "raise",
  "au dessus de la tete": "overhead",
  "dessus tete": "overhead",
  "overhead": "overhead",
  "arriere": "rear",
  "rear": "rear",
  "poignet": "wrist",
  "wrist": "wrist",
  "suspendu": "hang",
  "hanging": "hang",
  "hang": "hang",
  "palm": "palm",
  "paume": "palm",
  "ischio jambier": "hamstring",
  "ischio": "hamstring",
  "hamstring": "hamstring",
  "sol": "floor",
  "floor": "floor",
  "genou": "knee",
  "knee": "knee",
  "deux bras": "twoarm",
  "two arm": "twoarm",
  "bras": "arm",
  "arm": "arm",
  "prise": "grip",
  "grip": "grip",
  "arrache": "snatch",
  "snatch": "snatch",
  "clean": "clean",
  "penche": "bent",
  "fleche": "bent",
  "flechi": "bent",
  "bent over": "bent",
  "bent": "bent",
  "epaule": "shoulder",
  "jete": "jerk",
  "jerk": "jerk",
  "marche": "walk",
  "walking": "walk",
  "walk": "walk",
  "pied": "foot",
  "derriere": "behind",
  "behind": "behind",
  "bas": "low",
  "low": "low",
  "haut": "high",
  "high": "high",
  "haute": "high",
  "basse": "low",
  "inclinee": "incline",
  "quadricep": "quad",
  "quadriceps": "quad",
  "quad": "quad",
  "cercle": "circle",
  "circle": "circle",
  "traineau": "sled",
  "sled": "sled",
  "chaine": "chain",
  "chain": "chain",
  "pupitre": "preacher",
  "preacher": "preacher",
  "cou": "neck",
  "nuque": "neck",
  "neck": "neck",
  "leste": "weighted",
  "weighted": "weighted",
  "lancer": "throw",
  "throw": "throw",
  "pont": "bridge",
  "bridge": "bridge",
  "laterale": "lateral",
  "lateral": "lateral",
  "cote": "lateral",
  "side": "lateral",
  "fendu": "split",
  "split": "split",
  "montee": "stepup",
  "step up": "stepup",
  "disque": "plate",
  "plate": "plate",
  "velo": "bike",
  "bike": "bike",
  "rapide": "quick",
  "quick": "quick",
  "tendue": "straight",
  "tendu": "straight",
  "straight": "straight",
  "aine": "groin",
  "groin": "groin",
  "medecine ball": "medicine ball",
  "medicine ball": "medicine ball",
  "interne": "inner",
  "inner": "inner",
  "internal": "inner",
  "externe": "outer",
  "external": "outer",
  "croise": "cross",
  "cross": "cross",
  "double": "double",
  "mur": "wall",
  "wall": "wall",
  "chaise": "chair",
  "chair": "chair",
  "bulgare": "bulgarian",
  "bulgarian": "bulgarian",
  "isometrique": "isometric",
  "isometric": "isometric",
  "isolation": "isolation",
  "rotation": "rotation",
  "avance": "advanced",
  "advanced": "advanced",
  "adducteur": "adductor",
  "adductor": "adductor",
  "abducteur": "abductor",
  "abductor": "abductor",
  "tete": "head",
  "head": "head",
  "banc": "bench",
  "bench": "bench",
  "tapi": "treadmill",
  "treadmill": "treadmill",
  "escalier": "stair",
  "stair": "stair",
  "buste": "torso",
  "torso": "torso",
  "bassin": "pelvis",
  "pelvis": "pelvis",
  // Muscles
  "deltoide": "shoulder",
  "delt": "shoulder",
  "shoulder": "shoulder",
  "pectoraux": "chest",
  "pectoral": "chest",
  "pec": "chest",
  "chest": "chest",
  "dos": "back",
  "back": "back",
  "jambe": "leg",
  "leg": "leg",
  "cuisse": "thigh",
  "thigh": "thigh",
  "poitrine": "chest",
  "abdominaux": "abs",
  "abdo": "abs",
  "ab": "abs",
  "fessier": "glute",
  "glute": "glute",
  "avant bras": "forearm",
  "forearm": "forearm",
  "trapeze": "trap",
  "trap": "trap",
  "hanche": "hip",
  "hanches": "hip", // « hanches » se singularise en « hanch » (règle des -ches anglais) : sans cette entrée, il ne dit pas « hip »
  "hip": "hip",
  // Matériel
  "a levier": "machine",
  "levier": "machine",
  "leverage": "machine",
  "selectorized": "machine",
  "machine smith": "smith",
  "smith machine": "smith",
  "smith": "smith",
  "machine": "machine",
  "haltere": "dumbbell",
  "dumbbell": "dumbbell",
  "db": "dumbbell",
  "barre ez": "barbell",
  "ez bar": "barbell",
  "ez": "barbell",
  "barre": "barbell",
  "barbell": "barbell",
  "bb": "barbell",
  "poulie": "cable",
  "cable": "cable",
  "kettlebell": "kettlebell",
  "kb": "kettlebell",
  "elastique": "band",
  "band": "band",
  "bande": "band",
  "poids du corps": "bodyweight",
  "poids de corps": "bodyweight",
  "body weight": "bodyweight",
  "bodyweight": "bodyweight",
  "swiss ball": "ball",
  "ballon": "ball",
  "suspension": "suspension",
  "trx": "suspension",
  "sangle": "suspension",
  "landmine": "landmine",
  "rouleau": "roller",
  "roller": "roller",
  // Posture, orientation, prise, côté
  "assis": "seated",
  "seated": "seated",
  "sitting": "seated",
  "debout": "standing",
  "standing": "standing",
  "allonge": "lying",
  "lying": "lying",
  "couche": "lying",
  "incline": "incline",
  "decline": "decline",
  "un bras": "onearm",
  "one arm": "onearm",
  "single arm": "onearm",
  "unilateral": "onearm",
  "alterne": "alternating",
  "alternating": "alternating",
  "prise serree": "close",
  "close grip": "close",
  "serre": "close",
  "close": "close",
  "prise large": "wide",
  "wide grip": "wide",
  "large": "wide",
  "wide": "wide",
  "supination": "supination",
  "pronation": "pronation",
  "marteau": "hammer",
  "hammer": "hammer",
  "neutre": "hammer",
  "inverse": "reverse",
  "reverse": "reverse",
  "avant": "front",
  "front": "front",
  "corde": "rope",
  "rope": "rope",
};

const CLASSES: [Classe, string][] = [
  ["geste", "press pulldown pullup row pushup dip deadlift squat lunge crunch plank situp twist curl fly raise extension kickback shrug pullover pull wheel clean uprightrow facepull goodmorning hipthrust"],
  ["corps", "shoulder chest back leg thigh abs glute forearm trap hip biceps triceps calf lateral frontal"],
  ["materiel", "machine smith dumbbell barbell cable kettlebell band bodyweight ball suspension landmine roller"],
  ["posture", "seated standing lying alternating front reverse rope"],
  ["orientation", "incline decline"],
  ["prise", "close wide supination pronation hammer"],
  ["cote", "onearm"],
];
const CLASSE_DE = new Map<string, Classe>(CLASSES.flatMap(([c, mots]) => mots.split(" ").map((m) => [m, c] as const)));
const classeDe = (j: string): Classe => CLASSE_DE.get(j) ?? "mot";

const TABLE = new Map(Object.entries(PHRASES).map(([k, v]) => [cle(k), v.split(" ")] as const));
const LONGUEUR_MAX = 3;

/** Jetons canoniques d'un nom (ensemble, sans doublon). « Développé Épaules Assis (Machine) » : shoulder, press, seated, machine. */
export function jetons(nom: string): string[] {
  // « épaulé » (clean) ne se distingue de « épaule » que par l'accent, que la normalisation efface.
  const m = mots(nom.toLowerCase().replace(/épaulée?s?(?![\p{L}])/gu, " clean "));
  const sortie = new Set<string>();
  for (let i = 0; i < m.length; ) {
    let trouve: string[] | undefined;
    let n = 0;
    for (let l = Math.min(LONGUEUR_MAX, m.length - i); l >= 1 && !trouve; l--) {
      const t = TABLE.get(m.slice(i, i + l).join(" "));
      if (t) (trouve = t), (n = l);
    }
    if (trouve) trouve.forEach((j) => sortie.add(j));
    else sortie.add(m[i]!);
    i += n || 1;
  }
  return [...sortie];
}

export interface NomPrepare {
  jetons: Map<string, Classe>;
}

/** Matériel d'un exercice dit à part du nom (« Barre », « halteres », « poids_du_corps ») : ses jetons de matériel seulement. */
function jetonsMateriel(materiel: string | null | undefined): string[] {
  if (!materiel || /fixe/.test(normaliser(materiel))) return [];
  return jetons(materiel).filter((j) => classeDe(j) === "materiel");
}

/** Jetons d'un nom, avec leur classe, prêts à comparer ; `materiel` : le matériel connu par ailleurs (colonne de l'exercice). */
export function preparer(nom: string, materiel?: string | null): NomPrepare {
  return { jetons: new Map([...jetons(nom), ...jetonsMateriel(materiel)].map((j) => [j, classeDe(j)] as const)) };
}

const poids = (c: Classe) => POIDS[c];

/** Cœur du geste : les jetons de geste et de muscle. */
function coeur(n: NomPrepare, avecMots = false): string[] {
  return [...n.jetons].filter(([, c]) => c === "geste" || c === "corps" || (avecMots && c === "mot")).map(([j]) => j);
}

function de(n: NomPrepare, classe: Classe): string[] {
  return [...n.jetons].filter(([, c]) => c === classe).map(([j]) => j);
}

const sontDisjoints = (a: string[], b: string[]) => a.length > 0 && b.length > 0 && !a.some((x) => b.includes(x));

/** Ressemblance de deux noms préparés, de 0 (rien en commun) à 1 (mêmes jetons). */
export function similaritePreparee(a: NomPrepare, b: NomPrepare): number {
  if (a.jetons.size === 0 || b.jetons.size === 0) return 0;
  let ca = coeur(a);
  let cb = coeur(b);
  // Un nom sans geste ni muscle connu (« Cercles de bras ») se compare par tous ses mots, plus strictement.
  const repli = ca.length === 0 || cb.length === 0;
  if (repli) (ca = coeur(a, true)), (cb = coeur(b, true));
  // Le cœur doit se recouvrir : sans geste ni muscle en commun, deux noms ne se ressemblent pas, quel que soit le matériel.
  if (ca.length === 0 || cb.length === 0) return 0;
  const commun = ca.filter((j) => cb.includes(j)).length;
  if (commun === 0) return 0;
  const jaccard = commun / (ca.length + cb.length - commun);
  if (jaccard < (repli ? 0.6 : 0.5)) return 0;
  // Le matériel qu'un seul des deux noms précise ne compte pas (« Squat » ressemble autant à « Squat (Barre) » qu'à « Squat (Smith) »).
  const materielDesDeux = de(a, "materiel").length > 0 && de(b, "materiel").length > 0;
  const compte = (c: Classe) => (c === "materiel" && !materielDesDeux ? 0 : poids(c));
  let somme = 0;
  let total = 0;
  for (const [j, c] of a.jetons) {
    total += compte(c);
    if (b.jetons.has(j)) somme += compte(c);
  }
  for (const [, c] of b.jetons) total += compte(c);
  let score = (2 * somme) / total;
  // Contradictions : même rubrique des deux côtés, valeurs différentes.
  if (sontDisjoints(de(a, "materiel"), de(b, "materiel"))) score *= 0.5;
  const oa = de(a, "orientation");
  const ob = de(b, "orientation");
  if (sontDisjoints(oa, ob)) score *= 0.4;
  else if (oa.length !== ob.length) score *= 0.75; // incliné d'un côté, à plat de l'autre
  if (sontDisjoints(de(a, "prise"), de(b, "prise"))) score *= 0.8;
  if (de(a, "cote").length !== de(b, "cote").length) score *= 0.8;
  const pa = de(a, "posture").filter((p) => p === "seated" || p === "standing" || p === "lying");
  const pb = de(b, "posture").filter((p) => p === "seated" || p === "standing" || p === "lying");
  if (sontDisjoints(pa, pb)) score *= 0.85;
  return score;
}

/** Ressemblance de deux noms (voir similaritePreparee). */
export function similarite(a: string, b: string): number {
  return similaritePreparee(preparer(a), preparer(b));
}

/** Score minimal pour proposer un exercice : prudent, la suggestion reste soumise à la confirmation de la personne. */
export const SEUIL_SUGGESTION = 0.7;

export interface EntreeCatalogueNom {
  slug: string;
  nom: string;
  nom_en?: string | null;
  /** Matériel de l'exercice (« Barre », ou le code de la colonne `equipement`) : le nom anglais le tait souvent. */
  materiel?: string | null;
  /** Muscle principal (nom français du catalogue) : l'exercice d'un autre muscle n'est jamais proposé à un exercice qui a le sien. */
  muscle?: string | null;
}

export interface Proche {
  slug: string;
  score: number;
}

export interface CataloguePrepare {
  entrees: { slug: string; noms: NomPrepare[]; /** Noms normalisés, tels quels (le nom exact passe avant tout). */ exacts: Set<string>; muscle: string | null }[];
}

/** Catalogue prêt à comparer (français et anglais) : à construire une fois, puis `procheDuCatalogue` à chaque nom. */
export function preparerCatalogue(catalogue: readonly EntreeCatalogueNom[]): CataloguePrepare {
  return {
    entrees: catalogue.map((e) => {
      const noms = [e.nom, e.nom_en].filter((n): n is string => !!n && n.trim() !== "");
      return { slug: e.slug, noms: noms.map((n) => preparer(n, e.materiel)), exacts: new Set(noms.map(normaliser)), muscle: e.muscle ? normaliser(e.muscle) : null };
    }),
  };
}

export interface OptionsProche {
  seuil?: number;
  /** Nombre maximal de propositions (défaut : 1). */
  n?: number;
  /** Départage les ex æquo : de 0 à 1, ajouté au score à raison de 0,02 (un picto ou une 3D propre passe avant un emprunt). */
  departager?: (slug: string) => number;
  /** Slugs à ne pas proposer. */
  sauf?: ReadonlySet<string>;
  /** Matériel de l'exercice cherché, s'il le précise à part de son nom (colonne `equipement` d'un exercice perso). */
  materiel?: string | null;
  /**
   * Muscle principal de l'exercice cherché, s'il en a un : un exercice du catalogue d'un autre muscle n'est jamais proposé,
   * même au nom presque identique ou identique (un hip thrust n'est pas un relevé de hanches d'abdominaux). Sans muscle, c'est
   * le nom exact qui passe avant les autres.
   */
  muscle?: string | null;
  /** Si donné, ne garde que les propositions à au plus cet écart du meilleur score (« Hip thrust » sans matériel : barre, machine et Smith à égalité). */
  ecart?: number;
}

/** Les exercices du catalogue les plus proches d'un nom, du meilleur au moins bon, au-dessus du seuil. */
export function procheDuCatalogue(nom: string, cat: CataloguePrepare, o: OptionsProche = {}): Proche[] {
  const seuil = o.seuil ?? SEUIL_SUGGESTION;
  const q = preparer(nom, o.materiel);
  // Le matériel que le nom dit lui-même (« (Smith) ») compte plus que celui de la colonne : une fiche « Hip thrust (Smith) » rangée en
  // « Machine » reste un Smith.
  const materielDuNom = o.materiel ? de(preparer(nom), "materiel") : [];
  const muscle = o.muscle ? normaliser(o.muscle) : null;
  const exact = normaliser(nom);
  const trouves: (Proche & { taille: number; bonus: number })[] = [];
  for (const e of cat.entrees) {
    if (o.sauf?.has(e.slug)) continue;
    if (muscle && e.muscle && e.muscle !== muscle) continue;
    const nomExact = e.exacts.has(exact);
    let s = 0;
    let taille = 0;
    let materiel: string[] = [];
    for (const n of e.noms) {
      const v = similaritePreparee(q, n);
      if (v > s) (s = v), (taille = n.jetons.size), (materiel = de(n, "materiel"));
    }
    if (s < seuil) continue;
    const dit = materielDuNom.length > 0 && materielDuNom.every((m) => materiel.includes(m));
    trouves.push({ slug: e.slug, score: s, taille, bonus: (nomExact ? 0.05 : 0) + (dit ? 0.03 : 0) });
  }
  // À score égal : le nom exact, puis un picto ou une 3D propre (departager), puis le nom le plus simple.
  const effectif = (p: Proche & { taille: number; bonus: number }) => p.score + p.bonus + 0.02 * (o.departager?.(p.slug) ?? 0) - 0.002 * p.taille;
  trouves.sort((x, y) => effectif(y) - effectif(x) || x.slug.localeCompare(y.slug));
  const meilleur = Math.max(0, ...trouves.map((p) => p.score));
  return trouves
    .filter((p) => o.ecart === undefined || p.score >= meilleur - o.ecart)
    .slice(0, o.n ?? 1)
    .map(({ slug, score }) => ({ slug, score }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Recherche d'un exercice : mêmes équivalences français/anglais que la proximité (« hip » trouve aussi les exercices de
// « hanches », « glute bridge » les « ponts fessiers »), par début de mot, sans casse ni accents.

/** Jetons trop généraux ou trop courts pour servir d'équivalent : taper « lying » ne doit pas ramener tout « couché » (le développé). */
const SANS_EQUIVALENT = new Set(
  "press pull lateral frontal low high front reverse arm head foot double cross straight quick floor close wide incline decline seated standing lying alternating rope onearm hammer supination pronation".split(" "),
);

/** Valeur canonique (jetons séparés par une espace) → toutes les formes qui la disent, dans les deux langues. */
const FORMES = new Map<string, string[]>();
for (const [k, v] of Object.entries(PHRASES)) {
  const l = FORMES.get(v) ?? [];
  const c = cle(k);
  if (!l.includes(c)) l.push(c);
  FORMES.set(v, l);
}

/** Une forme est utilisable comme début de mot si elle n'est pas trop courte : « ab », « db », « ez » ramèneraient tout ; « push up » passe. */
const utilisable = (forme: string) => (forme.includes(" ") ? forme.length >= 5 : forme.length >= 3 || /\d/.test(forme));

/**
 * Ce qu'une saisie de recherche peut vouloir dire : pour chaque morceau de la saisie, ses variantes (la saisie telle quelle, puis ses
 * équivalents français et anglais), chacune une liste de débuts de mots à trouver tous. Un morceau est un mot ou une phrase connue
 * (« poussée de hanches » = « hip thrust »). Les mots de liaison de la saisie (de, la, with…) ne comptent pas, sauf si elle n'a rien d'autre.
 */
export function variantesDeRecherche(saisie: string): string[][][] {
  const m = mots(saisie);
  if (m.length === 0) {
    const brut = normaliser(saisie).split(" ").filter(Boolean);
    return brut.map((b) => [[b]]);
  }
  const sortie: string[][][] = [];
  for (let i = 0; i < m.length; ) {
    let trouve: string[] | undefined;
    let n = 0;
    for (let l = Math.min(LONGUEUR_MAX, m.length - i); l >= 1 && !trouve; l--) {
      const t = TABLE.get(m.slice(i, i + l).join(" "));
      if (t) (trouve = t), (n = l);
    }
    const dit = m.slice(i, i + (n || 1));
    const variantes: string[][] = [dit];
    const valeur = trouve?.join(" ");
    if (valeur && !trouve!.every((j) => SANS_EQUIVALENT.has(j))) {
      for (const f of FORMES.get(valeur) ?? []) if (utilisable(f) && f !== dit.join(" ")) variantes.push(f.split(" "));
    }
    sortie.push(variantes);
    i += n || 1;
  }
  return sortie;
}
