// Catalogue, rayon « Routines » (ajout d'Alex du 28/10, lexique du 29/10) : à faire une fois, sans suivre de programme.
// Mêmes briques que les programmes (outils.ts) ; une routine ajoutée devient une routine de « mes routines ».
import type { ExercicePerso, Famille, Lieu, Niveau, Objectif, RoutineBoutique, Texte2 } from "../../src/boutique/modele.ts";
import type { TypeProgramme } from "../../src/db/programmes.ts";
import { continu, ex, footing, fractionneM, repetitions, repetitionsM, seance, seuil, T, tenu, type SeanceCle } from "./outils.ts";

const DEHORS = T("Course, dehors", "Running, outdoors");
const AUCUN = T("Aucun", "None");

interface MetaRoutine {
  id: string;
  nom: Texte2;
  resume: Texte2;
  description: Texte2;
  famille: Famille;
  objectifs: Objectif[];
  lieux: Lieu[];
  niveau: Niveau;
  picto: string;
  gros: { valeur: string; unite: string | null };
  lieuCourt: Texte2;
  materiel: Texte2;
  avertissement?: Texte2;
  exercicesPerso?: Record<string, ExercicePerso>;
}

/** Une routine : sa vitrine, puis sa séance (le nom affiché est celui de la routine). */
function routine(m: MetaRoutine, { cle: _cle, ...s }: SeanceCle): RoutineBoutique {
  const type: TypeProgramme = s.type;
  return {
    id: m.id,
    version: 1,
    nom: m.nom,
    resume: m.resume,
    description: m.description,
    famille: m.famille,
    type,
    objectifs: m.objectifs,
    lieux: m.lieux,
    niveau: m.niveau,
    picto: m.picto,
    gros: m.gros,
    lieuCourt: m.lieuCourt,
    materiel: m.materiel,
    avertissement: m.avertissement ?? null,
    seance: { ...s, nom: m.nom },
    exercicesPerso: m.exercicesPerso ?? {},
  };
}

// ---------------------------------------------------------------- course

const fract6x1k = routine(
  {
    id: "r-fract-6x1k",
    nom: T("Fractionné 6 × 1 km", "Intervals 6 × 1 km"),
    resume: T("Six kilomètres à allure 10 km, deux minutes de trot entre deux.", "Six kilometres at 10 km pace, two minutes' jog between."),
    description: T(
      "La séance de qualité la plus classique : un échauffement, six fois un kilomètre à ton allure 10 km, et un retour au calme. Une heure en tout.",
      "The classic quality session: a warm-up, six times one kilometre at your 10 km pace, and a cool-down. One hour in all.",
    ),
    famille: "endu",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 2,
    picto: "course",
    gros: { valeur: "6×1", unite: "km" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
  },
  // La note d'un bloc répété se lit sur sa ligne de récupération (fiche) : elle dit comment récupérer.
  fractionneM(6, 1000, 4, 120, T("récupération en trottinant", "jog recovery")),
);

const footing45 = routine(
  {
    id: "r-footing-45",
    nom: T("Footing 45 min et lignes droites", "Easy run 45 min and strides"),
    resume: T("Endurance facile, puis quatre accélérations courtes.", "Easy endurance, then four short strides."),
    description: T(
      "Quarante-cinq minutes assez lentes pour parler, puis quatre lignes droites pour garder de la vitesse dans les jambes.",
      "Forty-five minutes slow enough to talk, then four strides to keep some speed in your legs.",
    ),
    famille: "endu",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 1,
    picto: "course",
    gros: { valeur: "45", unite: "min" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
  },
  footing(45, true),
);

// Test VMA (planche vma-vo2max, validée le 29/10 ; NOTES-VMA.md) : le demi-Cooper de run-motion, guidé étape par étape par la
// course guidée. La note « test VMA » du bloc des 6 min en fait l'étape du test (etapes-course.ts) : sa distance ÷ 100 donne
// la VMA ; « récupération : » fait de la ligne seule une récupération.
const testVma = routine(
  {
    id: "r-test-vma",
    nom: T("Test VMA", "MAS test"),
    resume: T("Six minutes à fond pour connaître ta VMA et tes allures.", "Six minutes all out to find your MAS and your paces."),
    description: T(
      "Le demi-Cooper : 15 minutes d'échauffement finies par deux accélérations, puis 6 minutes le plus loin possible, à allure régulière. Ta VMA (km/h) est la distance divisée par 100 ; pepfit en tire ta VO₂max et tes allures. Sur du plat ; une piste de 400 m est idéale.",
      "The half-Cooper: 15 minutes' warm-up ending with two strides, then 6 minutes as far as you can, at an even pace. Your MAS (km/h) is the distance divided by 100; pepfit works out your VO₂max and your paces from it. On flat ground; a 400 m track is ideal.",
    ),
    famille: "endu",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 2,
    picto: "course",
    gros: { valeur: "6", unite: "min" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
  },
  {
    cle: "test-vma",
    nom: T("Test VMA", "MAS test"),
    type: "course",
    role: "dure",
    blocs: [
      continu(13, 2, T("échauffement : footing facile, tu peux parler", "warm-up: easy run, you can talk")),
      repetitions(2, 15, 5, 45, T("accélérations : 15 s vite, puis 45 s de trot", "strides: 15 s fast, then 45 s jog")),
      { exo: "course", series: 1, dureeS: 120, zone: 1, note: T("récupération : trot ou marche, le test arrive", "recovery: jog or walk, the test is coming") },
      { exo: "course", series: 1, dureeS: 360, zone: 5, note: T("test VMA : 6 min à fond, le plus loin possible, à allure régulière", "MAS test: 6 min all out, as far as you can, at an even pace") },
      continu(10, 1, T("retour au calme : footing très lent, puis marche", "cool-down: very easy run, then walk")),
    ],
  },
);

const seuil3x10 = routine(
  {
    id: "r-seuil-3x10",
    nom: T("Seuil 3 × 10 min", "Threshold 3 × 10 min"),
    resume: T("Trois fois dix minutes dur mais tenable.", "Three times ten minutes, hard but sustainable."),
    description: T(
      "Trente minutes au seuil, en trois fois, avec deux minutes de trot entre deux : le travail qui fait tenir une allure plus longtemps.",
      "Thirty minutes at threshold, in three goes, with two minutes' jog between: the work that lets you hold a pace for longer.",
    ),
    famille: "endu",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 3,
    picto: "course",
    gros: { valeur: "3×10", unite: "min" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
  },
  seuil(3, 10, 120),
);

// ---------------------------------------------------------------- natation

const crawl = routine(
  {
    id: "r-crawl",
    nom: T("Technique de crawl", "Front crawl technique"),
    resume: T("Battements, respiration, puis crawl complet : 400 m.", "Kick, breathing, then full crawl: 400 m."),
    description: T(
      "Seize longueurs de 25 m, sans forcer : les jambes à la planche, la respiration sur trois temps, puis le crawl complet.",
      "Sixteen 25 m lengths, easy: legs with a board, breathing every three strokes, then full front crawl.",
    ),
    famille: "endu",
    objectifs: ["nager"],
    lieux: ["piscine"],
    niveau: 1,
    picto: "natation",
    gros: { valeur: "400", unite: "m" },
    lieuCourt: T("Natation, piscine", "Swimming, pool"),
    materiel: T("Planche", "Kickboard"),
  },
  {
    cle: "crawl",
    nom: T("Technique de crawl", "Front crawl technique"),
    type: "natation",
    role: "facile",
    blocs: [
      repetitionsM(4, 25, 2, 30, T("battements avec planche, bras tendus", "kick with a board, arms straight"), "natation"),
      repetitionsM(4, 25, 2, 30, T("respiration sur 3 temps : souffle sous l'eau", "breathe every 3 strokes: exhale underwater"), "natation"),
      repetitionsM(8, 25, 2, 30, T("crawl complet, sans forcer", "full crawl, easy"), "natation"),
    ],
  },
);

// ---------------------------------------------------------------- salle

const pushA = routine(
  {
    id: "r-push-a",
    nom: T("Push A", "Push A"),
    resume: T("Pectoraux, épaules, triceps : cinq exercices, un superset.", "Chest, shoulders, triceps: five exercises, one superset."),
    description: T(
      "Une séance de poussée complète : développé couché lourd, incliné aux haltères, développé militaire, puis élévations latérales et triceps en superset.",
      "A complete push session: heavy bench press, incline dumbbell press, overhead press, then lateral raises and triceps as a superset.",
    ),
    famille: "force",
    objectifs: ["muscle"],
    lieux: ["salle"],
    niveau: 2,
    picto: "couche",
    gros: { valeur: "Push", unite: null },
    lieuCourt: T("Salle, barre et haltères", "Gym, barbell and dumbbells"),
    materiel: T("Salle", "Gym"),
  },
  seance("push-a", T("Push A", "Push A"), [
    ex("couche", 4, 6, { repsMax: 8, repos: 150 }),
    ex("incline-dumbbell-press", 3, 8, { repsMax: 12, repos: 120 }),
    ex("standing-military-press", 3, 8, { repsMax: 10, repos: 120 }),
    ex("side-lateral-raise", 3, 12, { repsMax: 15, repos: 0, superset: 1, transition: 15 }),
    ex("triceps-pushdown", 3, 10, { repsMax: 15, repos: 90, superset: 1, transition: 15 }),
  ], { role: "dure" }),
);

const fullBody = routine(
  {
    id: "r-full-body",
    nom: T("Full body 45 min", "Full body 45 min"),
    resume: T("Tout le corps en six exercices de base.", "The whole body in six basic exercises."),
    description: T(
      "Squat, développé couché, rowing, développé militaire, soulevé de terre roumain et gainage : trois séries de chaque, tout le corps en trois quarts d'heure.",
      "Squat, bench press, row, overhead press, Romanian deadlift and plank: three sets of each, the whole body in 45 minutes.",
    ),
    famille: "force",
    objectifs: ["muscle", "force"],
    lieux: ["salle"],
    niveau: 1,
    picto: "squat",
    gros: { valeur: "45", unite: "min" },
    lieuCourt: T("Salle, barre", "Gym, barbell"),
    materiel: T("Barre", "Barbell"),
  },
  seance("full-body", T("Full body 45 min", "Full body 45 min"), [
    ex("squat", 3, 8, { repsMax: 10, repos: 150 }),
    ex("couche", 3, 8, { repsMax: 10, repos: 150 }),
    ex("bent-over-barbell-row", 3, 8, { repsMax: 10, repos: 120 }),
    ex("standing-military-press", 3, 8, { repsMax: 10, repos: 120 }),
    ex("romanian-deadlift", 3, 8, { repsMax: 10, repos: 120 }),
    tenu("plank", 3, 30, { repos: 45 }),
  ], { role: "dure" }),
);

// ---------------------------------------------------------------- maison

const halteres = routine(
  {
    id: "r-halteres",
    nom: T("Haltères, tout le corps", "Dumbbells, full body"),
    resume: T("Six exercices avec deux haltères, à la maison.", "Six exercises with two dumbbells, at home."),
    description: T(
      "Une séance complète avec deux haltères : squat gobelet, développé au sol, rowing, fentes, soulevé de terre jambes tendues et élévations latérales.",
      "A complete session with two dumbbells: goblet squat, floor press, row, lunges, stiff-legged deadlift and lateral raises.",
    ),
    famille: "force",
    objectifs: ["muscle", "maison"],
    lieux: ["maison_halteres"],
    niveau: 1,
    picto: "squat-gobelet",
    gros: { valeur: "Haltères", unite: null },
    lieuCourt: T("Maison, haltères", "Home, dumbbells"),
    materiel: T("Haltères", "Dumbbells"),
  },
  seance("halteres", T("Haltères, tout le corps", "Dumbbells, full body"), [
    ex("goblet-squat", 3, 10, { repsMax: 15, repos: 90 }),
    ex("dumbbell-floor-press", 3, 10, { repsMax: 15, repos: 90 }),
    ex("one-arm-dumbbell-row", 3, 10, { repsMax: 15, repos: 75, note: T("chaque bras", "each arm") }),
    ex("dumbbell-rear-lunge", 3, 10, { repsMax: 12, repos: 75, note: T("chaque jambe", "each leg") }),
    ex("stiff-legged-dumbbell-deadlift", 3, 10, { repsMax: 15, repos: 90 }),
    ex("side-lateral-raise", 3, 12, { repsMax: 15, repos: 60 }),
  ]),
);

const JJ = "perso:jumping-jack";
const BURPEE = "perso:burpee";
const hiit20 = routine(
  {
    id: "r-hiit-20",
    nom: T("HIIT 20 min", "HIIT 20 min"),
    resume: T("Un circuit de cinq exercices, 40 s d'effort, 20 s de repos.", "A five-exercise circuit, 40 s on, 20 s off."),
    description: T(
      "Vingt minutes sans matériel : un échauffement, deux tours d'un circuit au poids du corps, et un retour au calme.",
      "Twenty minutes, no equipment: a warm-up, two rounds of a bodyweight circuit, and a cool-down.",
    ),
    famille: "forme",
    objectifs: ["maison", "poids"],
    lieux: ["maison"],
    niveau: 2,
    picto: "hiit",
    gros: { valeur: "20", unite: "min" },
    lieuCourt: T("Maison, sans matériel", "Home, no equipment"),
    materiel: AUCUN,
    exercicesPerso: {
      "jumping-jack": { nom: T("Jumping jacks", "Jumping jacks"), nature: "duree" },
      burpee: { nom: T("Burpees", "Burpees"), nature: "duree" },
    },
  },
  seance("hiit-20", T("HIIT 20 min", "HIIT 20 min"), [
    tenu("fast-skipping", 1, 240, { repos: 60, note: T("échauffement : montées de genoux tranquilles", "warm-up: easy high knees") }),
    tenu("freehand-jump-squat", 2, 40, { repos: 0, superset: 1, transition: 20 }),
    tenu("mountain-climbers", 2, 40, { repos: 0, superset: 1, transition: 20 }),
    tenu("pushups", 2, 40, { repos: 0, superset: 1, transition: 20 }),
    tenu(JJ, 2, 40, { repos: 0, superset: 1, transition: 20 }),
    tenu(BURPEE, 2, 40, { repos: 60, superset: 1, transition: 20 }),
    tenu("childs-pose", 1, 120, { repos: 0, note: T("retour au calme", "cool-down") }),
  ], { type: "cross", role: "dure", note: T("Effort au maximum de ce que tu peux tenir, repos complet.", "Go as hard as you can sustain, rest fully.") }),
);

const SWING = "one-arm-kettlebell-swings";
const kbEmom = routine(
  {
    id: "r-kb-emom",
    nom: T("EMOM kettlebell 20 min", "Kettlebell EMOM 20 min"),
    resume: T("Swing, goblet squat, presse, rowing : un exercice par minute.", "Swing, goblet squat, press, row: one exercise per minute."),
    description: T(
      "Un seul kettlebell. Chaque minute, un exercice ; le reste de la minute, tu souffles. Cinq tours, vingt minutes.",
      "A single kettlebell. Every minute, one exercise; rest for the rest of the minute. Five rounds, twenty minutes.",
    ),
    famille: "forme",
    objectifs: ["maison", "force"],
    lieux: ["maison_halteres"],
    niveau: 2,
    picto: "kettlebell-swing",
    gros: { valeur: "EMOM", unite: null },
    lieuCourt: T("Maison, kettlebell", "Home, kettlebell"),
    materiel: T("Kettlebell", "Kettlebell"),
  },
  seance("kb-emom", T("EMOM kettlebell 20 min", "Kettlebell EMOM 20 min"), [
    ex(SWING, 5, 15, { repos: 0, superset: 1 }),
    ex("goblet-squat", 5, 8, { repos: 0, superset: 1 }),
    ex("two-arm-kettlebell-military-press", 5, 6, { repos: 0, superset: 1 }),
    ex("alternating-kettlebell-row", 5, 8, { repos: 0, superset: 1 }),
  ], { type: "cross", role: "dure", format: "emom", formatValeur: 1200 }),
);

// ---------------------------------------------------------------- mobilité et santé

const hanches = routine(
  {
    id: "r-hanches",
    nom: T("Mobilité des hanches 15 min", "Hip mobility 15 min"),
    resume: T("Cinq postures pour des hanches plus libres.", "Five poses for freer hips."),
    description: T(
      "Quinze minutes au sol, deux fois chaque posture : fléchisseurs, ischios, fessiers. L'amplitude active : va chercher la position.",
      "Fifteen minutes on the floor, each pose twice: hip flexors, hamstrings, glutes. Active range: reach for the position.",
    ),
    famille: "sante",
    objectifs: ["mobilite"],
    lieux: ["maison"],
    niveau: 1,
    picto: "yoga",
    gros: { valeur: "15", unite: "min" },
    lieuCourt: T("Mobilité, maison", "Mobility, home"),
    materiel: AUCUN,
  },
  seance(
    "hanches",
    T("Mobilité des hanches 15 min", "Hip mobility 15 min"),
    ["worlds-greatest-stretch", "kneeling-hip-flexor", "90-90-hamstring", "lying-glute", "hip-circles-prone"].map((e) => tenu(e, 2, 60, { repos: 15 })),
    { type: "mobilite" },
  ),
);

const CURL_UP = "perso:curl-up";
const BIRD_DOG = "perso:bird-dog";
const dos = routine(
  {
    id: "r-dos",
    nom: T("Dos solide, tronc", "Strong back, core"),
    resume: T("Les trois exercices de contrôle du tronc, tenus et sans douleur.", "The three core-control exercises, held and pain-free."),
    description: T(
      "Curl-up, gainage latéral et bird dog, en pyramide 6, 4, 2 : chaque répétition tenue 8 à 10 s. Dix minutes pour apprendre au tronc à rester stable.",
      "Curl-up, side bridge and bird dog, in a 6, 4, 2 pyramid: each rep held 8 to 10 s. Ten minutes to teach your core to stay stable.",
    ),
    famille: "sante",
    objectifs: ["mobilite"],
    lieux: ["maison"],
    niveau: 1,
    picto: "gainage",
    gros: { valeur: "Tronc", unite: null },
    lieuCourt: T("Santé, maison", "Health, home"),
    materiel: AUCUN,
    avertissement: T(
      "Sans douleur. Une douleur qui descend dans la jambe, des fourmillements ou une faiblesse : arrête et demande l'avis d'un médecin.",
      "Pain-free. Pain running down the leg, tingling or weakness: stop and see a doctor.",
    ),
    exercicesPerso: {
      "curl-up": { nom: T("Curl-up", "Curl-up"), nature: "reps" },
      "bird-dog": { nom: T("Bird dog", "Bird dog"), nature: "reps" },
    },
  },
  seance(
    "dos",
    T("Dos solide, tronc", "Strong back, core"),
    [
      ex(CURL_UP, 3, 6, { repsParSerie: [6, 4, 2], repos: 30, note: T("tiens chaque répétition 8 à 10 s", "hold each rep 8 to 10 s") }),
      ex("side-bridge", 3, 6, { repsParSerie: [6, 4, 2], repos: 30, note: T("chaque côté, tenu 8 à 10 s", "each side, held 8 to 10 s") }),
      ex(BIRD_DOG, 3, 6, { repsParSerie: [6, 4, 2], repos: 30, note: T("chaque côté, tenu 8 à 10 s, le dos ne bouge pas", "each side, held 8 to 10 s, the back stays still") }),
    ],
    { type: "mobilite", note: T("Sans douleur. Ce n'est pas un étirement : on apprend au tronc à rester stable.", "Pain-free. This isn't stretching: you teach your core to stay stable.") },
  ),
);

/** Les routines du catalogue, dans l'ordre de la boutique. */
export const ROUTINES: RoutineBoutique[] = [fract6x1k, footing45, seuil3x10, testVma, pushA, fullBody, halteres, hiit20, kbEmom, hanches, dos, crawl];
