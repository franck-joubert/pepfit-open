// Garde-fou du lexique (docs/LEXIQUE.md, validée le 29/10) : un mot = un sens, partout à l'écran. Parcourt les
// dictionnaires fr et en, et les textes du catalogue de la boutique (programmes et routines), et refuse les anciens mots.
// Le code garde ses noms internes (routines, plans, blocs) : seules les valeurs affichées sont lues, jamais les clés.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";

type Langue = "fr" | "en";
const DICOS: Record<Langue, Record<string, unknown>> = { fr, en };

/** Toutes les chaînes affichées d'une valeur de dictionnaire (simple ou pluriel). */
const textes = (v: unknown): string[] => (typeof v === "string" ? [v] : [(v as { one: string }).one, (v as { other: string }).other]);

/** Anciens mots refusés partout, avec ce qu'on dit à la place. */
const INTERDITS: Record<Langue, { motif: RegExp; pourquoi: string }[]> = {
  fr: [
    { motif: /\bprogramm(er|ation|ée?s?)\b/i, pourquoi: "« Planifier » (une séance), « Planification »" },
    { motif: /séances? à l'unité/i, pourquoi: "« Routine »" },
    { motif: /séance type/i, pourquoi: "« Routine » (« Exemple de routine »)" },
    { motif: /\bblocs?\b/i, pourquoi: "« Superset » (2 exercices) ou « Circuit » (3 et plus) ; « carte » pour l'accueil" },
    { motif: /\b(biset|triset)\b/i, pourquoi: "« Superset » (2 exercices) ou « Circuit » (3 et plus)" },
    { motif: /\bentraînements\b/i, pourquoi: "« Sport » pour l'onglet, « séances » pour les séances" },
    {
      // Les anciennes phrases où « programme » nommait une routine (liste de LEXIQUE.md et appli du 28/10).
      motif: /nouveau programme|mes programmes|note de programme|programme sans nom|comme programme|choisir un programme|programmes? importés?/i,
      pourquoi: "« Programme » réservé aux plans de plusieurs semaines : « routine »",
    },
    { motif: /se connecter sur (un|cet) ordinateur|appareils? liés?/i, pourquoi: "« Ouvrir sur un ordinateur » (ajout du 30/10, D1)" },
    { motif: /score de profil|complétude/i, pourquoi: "« Précision pepfit » (planche precision, 30/10)" },
    // Plats (planche plats, 30/10) : « Recette » reste le mot de Fitatu, à l'import seulement.
    { motif: /mes recettes|créer une recette|nouvelle recette|\bpoids final\b|\brendement\b|\bcomposants?\b/i, pourquoi: "« Mes plats », « Nouveau plat », « Poids cuit », « Ingrédient » (planche plats, 30/10)" },
    { motif: /\b(une|la|demi-)part\b|pour \d+ personnes/i, pourquoi: "« Portion » (planche plats, 30/10)" },
    { motif: /boutique/i, pourquoi: "« Explorer les programmes », « Explorer les routines » : on ne parle pas de boutique (30/10)" },
  ],
  en: [
    { motif: /\bblocks?\b/i, pourquoi: "“Superset” (2 exercises) or “Circuit” (3 or more); “card” on Home" },
    { motif: /\btri-?set\b/i, pourquoi: "“Circuit”" },
    { motif: /single sessions?/i, pourquoi: "“Routine”" },
    { motif: /sample session/i, pourquoi: "“Sample routine”" },
    { motif: /sign in on (a|this) computer|linked devices?/i, pourquoi: "“Open on a computer” (added 30/10, D1)" },
    { motif: /profile score|completeness/i, pourquoi: "“pepfit precision” (precision board, 30/10)" },
    { motif: /my recipes|new recipe|create a recipe|\bfinal weight\b|\bportions?\b(?!\})/i, pourquoi: "“My dishes”, “New dish”, “Cooked weight”, “Serving” (plats board, 30/10)" },
    { motif: /\b(shop|store|boutique)s?\b/i, pourquoi: "“Explore programs”, “Explore routines”: no shop (30/10)" },
  ],
};

/**
 * Clés dont les textes parlent d'une routine (liste d'exercices réutilisable) : « Programme » / “Program” y est refusé.
 * Les plans de plusieurs semaines (boutique.plan, boutique.d, boutique.fiche) gardent « Programme ».
 */
const CLES_ROUTINE = [
  "exercices.routine.",
  "exercices.notes.",
  "exercices.choix.aussiRoutine",
  "accueil.entrainement.",
  "accueil.lanceur.",
  "accueil.blocs.choisirRoutine",
  "accueil.blocs.aucuneRoutine",
  "accueil.index.pourCommencerAide",
  "programmes.titre",
  "programmes.nouveau",
  "programmes.modele.",
  "programmes.nomDefaut.",
  "programmes.ajouterAu.",
  "programmes.liste.",
  "programmes.tous.",
  "boutique.vide.",
  "profil.routinesImportees",
  "profil.importRoutineSansId",
  "seance.passee.enRoutine",
  "reglages.hevySous",
];
const PROGRAMME: Record<Langue, RegExp> = { fr: /programme/i, en: /program/i };

/** Exceptions : « langue clé » exacte. Chaque ligne dit pourquoi. */
const EXCEPTIONS: Record<string, string> = {
  "fr accueil.lanceur.programmes": "bouton de la page Programmes du Sport : les plans de plusieurs semaines (planche sport-programmes-routines v2)",
  "en accueil.lanceur.programmes": "button of the Sport tab's Programs page: multi-week plans (sport-programmes-routines v2 board)",
  "fr boutique.vide.aucunSous": "« un programme pepfit » : la boutique propose aussi des programmes de plusieurs semaines",
  "en boutique.vide.aucunSous": "“a pepfit program”: the shop also offers multi-week programs",
};

/** L'onglet s'appelle « Activité » (« Activity » en anglais : menu, titre ; ex-Effort). */
const ONGLET = ["ui.onglet.entrainement", "accueil.entrainement.titre"];

test("lexique : aucun ancien mot dans les dictionnaires fr et en", () => {
  const fautes: string[] = [];
  for (const langue of ["fr", "en"] as const) {
    for (const [k, v] of Object.entries(DICOS[langue])) {
      if (EXCEPTIONS[`${langue} ${k}`]) continue;
      for (const x of textes(v)) {
        for (const { motif, pourquoi } of INTERDITS[langue]) if (motif.test(x)) fautes.push(`${langue} ${k} : « ${x} » → ${pourquoi}`);
        if (CLES_ROUTINE.some((c) => k.startsWith(c)) && PROGRAMME[langue].test(x)) fautes.push(`${langue} ${k} : « ${x} » → une routine n'est pas un programme`);
      }
    }
  }
  assert.deepEqual(fautes, []);
});

test("lexique : l'onglet s'appelle « Activité » (« Activity »), « Planifier une séance », Superset et Circuit", () => {
  for (const k of ONGLET) {
    assert.equal((fr as Record<string, unknown>)[k], "Activité", k);
    assert.equal((en as Record<string, unknown>)[k], "Activity", k);
  }
  assert.equal(fr["planif.programmerSeance"], "Planifier une séance");
  assert.equal(en["planif.programmerSeance"], "Schedule a workout");
  assert.deepEqual([fr["communs.biset"], fr["communs.circuit"], en["communs.biset"], en["communs.circuit"]], ["Superset", "Circuit", "Superset", "Circuit"]);
  // Explorer les programmes, Explorer les routines (planche boutiques, retour du 30/10).
  assert.deepEqual([fr["boutique.titre.programme"], fr["boutique.titre.routine"]], ["Explorer les programmes", "Explorer les routines"]);
  assert.deepEqual([en["boutique.titre.programme"], en["boutique.titre.routine"]], ["Explore programs", "Explore routines"]);
});

test("lexique : les mots des plats (planche plats, 30/10) : Plat, Mes plats, Portion, Poids cuit, Pour cette fois", () => {
  const mots: [string, string, string][] = [
    ["plats.mesPlats", "Mes plats", "My dishes"],
    ["plats.nouveau", "Nouveau plat", "New dish"],
    ["plats.enregistrerComme", "Enregistrer comme plat", "Save as dish"],
    ["plats.ingredients", "Ingrédients", "Ingredients"],
    ["plats.poidsCuit", "Poids cuit", "Cooked weight"],
    ["plats.portionMaj", "Portion", "Serving"],
    ["plats.sansIngredients", "sans ingrédients", "no ingredients"],
  ];
  for (const [k, f, e] of mots) assert.deepEqual([(fr as Record<string, unknown>)[k], (en as Record<string, unknown>)[k]], [f, e], k);
  assert.match(fr["plats.pourCetteFois"], /^Pour cette fois/);
  assert.match(en["plats.pourCetteFois"], /^Just this once/);
  // « Recette » n'apparaît qu'à l'import Fitatu.
  const recette = Object.entries(fr).filter(([, v]) => textes(v).some((x) => /recette/i.test(x))).map(([k]) => k);
  assert.deepEqual(recette, ["profil.fitatuPlats"]);
});

test("lexique : les exceptions servent encore (une exception morte se retire)", () => {
  for (const e of Object.keys(EXCEPTIONS)) {
    const [langue, k] = e.split(" ") as [Langue, string];
    const v = DICOS[langue][k];
    assert.ok(v !== undefined, `${e} : clé disparue`);
    const fautif = textes(v).some((x) => INTERDITS[langue].some(({ motif }) => motif.test(x)) || (CLES_ROUTINE.some((c) => k.startsWith(c)) && PROGRAMME[langue].test(x)));
    assert.ok(fautif, `${e} : plus rien à excuser`);
  }
});

test("lexique : aucun ancien mot dans les textes du catalogue de la boutique (programmes et routines)", () => {
  const fautes: string[] = [];
  /** Les textes bilingues ({ fr, en }) d'un fichier du catalogue, où qu'ils soient. */
  const parcourir = (x: unknown, ou: string) => {
    if (Array.isArray(x)) return x.forEach((y, i) => parcourir(y, `${ou}[${i}]`));
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (typeof o.fr === "string" && typeof o.en === "string") {
      for (const langue of ["fr", "en"] as const)
        for (const { motif, pourquoi } of INTERDITS[langue]) if (motif.test(o[langue] as string)) fautes.push(`${ou} ${langue} : « ${o[langue]} » → ${pourquoi}`);
      return;
    }
    for (const [k, v] of Object.entries(o)) parcourir(v, `${ou}.${k}`);
  };
  for (const dossier of ["programmes", "routines"]) {
    const d = new URL(`../assets/catalogue/${dossier}/`, import.meta.url);
    const fichiers = readdirSync(d).filter((f) => f.endsWith(".json"));
    assert.ok(fichiers.length > 0, dossier);
    for (const f of fichiers) parcourir(JSON.parse(readFileSync(new URL(f, d), "utf8")), `${dossier}/${f}`);
  }
  assert.deepEqual(fautes, []);
});

/**
 * Rester hors du médical (30/10, puis D1 à D6 du 31/10) : pepfit suit des compléments alimentaires, jamais des
 * traitements ni des médicaments, et ne parle jamais de maladie. Refusés dans les dictionnaires fr et en, et dans les
 * textes du catalogue de la boutique. « medicine ball » (nom d'exercice, dans exercices.json) n'est pas lu ici.
 */
const MEDICAL: Record<Langue, RegExp> = {
  fr: /\btraitements?\b|médicaments?|médicamenteu|maladie/i,
  en: /\btreatments?\b|\bmedications?\b|\bmedicines?\b|\bdrugs?\b|disease|illness/i,
};
/** Exceptions des dictionnaires : « langue clé » exacte. Chaque ligne dit pourquoi. */
const EXCEPTIONS_MEDICAL_DICO: Record<string, string> = {
  "fr age.methode.p3": "avertissement gardé (D5, 31/10) : « pas un avis médical », elle ne dit rien d'une maladie : un refus du médical",
  "en age.methode.p3": "warning kept (D5, 31/10): “not medical advice”, says nothing about any disease: a refusal of the medical",
  "en age.ref.muscu": "exact title of a cited paper (Momma 2022): a reference is not rewritten",
  "en materiel.genre.leste": "“medicine ball” is the name of a gym ball, not medicine (planche matériel, lestés)",
  "en materiel.leste.medecine_ball": "“medicine ball” is the name of a gym ball, not medicine (planche matériel, lestés)",
};
/** Exceptions du catalogue : chemin exact. Chaque ligne dit pourquoi (aucune depuis la remise en route du 31/10, D4). */
const EXCEPTIONS_MEDICAL: Record<string, string> = {};

test("lexique : ni « traitement », ni « médicament », ni « maladie » à l'écran (fr et en, dictionnaires et catalogue)", () => {
  const fautes: string[] = [];
  const vus = new Set<string>();
  for (const langue of ["fr", "en"] as const)
    for (const [k, v] of Object.entries(DICOS[langue]))
      for (const x of textes(v)) {
        if (!MEDICAL[langue].test(x)) continue;
        if (EXCEPTIONS_MEDICAL_DICO[`${langue} ${k}`]) vus.add(`${langue} ${k}`);
        else fautes.push(`${langue} ${k} : « ${x} »`);
      }
  const parcourir = (x: unknown, ou: string) => {
    if (Array.isArray(x)) return x.forEach((y, i) => parcourir(y, `${ou}[${i}]`));
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (typeof o.fr === "string" && typeof o.en === "string") {
      for (const langue of ["fr", "en"] as const) {
        if (!MEDICAL[langue].test(o[langue] as string)) continue;
        if (EXCEPTIONS_MEDICAL[`${ou} ${langue}`]) vus.add(`${ou} ${langue}`);
        else fautes.push(`${ou} ${langue} : « ${o[langue]} »`);
      }
      return;
    }
    for (const [k, v] of Object.entries(o)) parcourir(v, `${ou}.${k}`);
  };
  for (const dossier of ["programmes", "routines"]) {
    const d = new URL(`../assets/catalogue/${dossier}/`, import.meta.url);
    for (const f of readdirSync(d).filter((f) => f.endsWith(".json"))) parcourir(JSON.parse(readFileSync(new URL(f, d), "utf8")), `${dossier}/${f}`);
  }
  assert.deepEqual(fautes, []);
  assert.deepEqual([...vus].sort(), [...Object.keys(EXCEPTIONS_MEDICAL_DICO), ...Object.keys(EXCEPTIONS_MEDICAL)].sort(), "une exception morte se retire");
  assert.deepEqual([fr["suivi.complements"], en["suivi.complements"]], ["Compléments", "Supplements"]);
  // D6 (31/10) : la FC max se mesure lors d'un test d'effort, pas « chez un médecin ».
  assert.deepEqual([fr["zones.mode.saisieAide"], en["zones.mode.saisieAide"]], ["Ta valeur, mesurée lors d'un test d'effort", "Your value, measured during a stress test"]);
});
