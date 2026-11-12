// Catalogue (NOTES § 3), famille endurance : course du 5 km au marathon, natation, vélo, randonnée.
import type { Programme } from "../../src/boutique/modele.ts";
import {
  continu, cotes, courseJour, duree, ex, footing, fois, fractionne, fractionneM, longue, longueKm, PH, programme, repetitions, repetitionsM, seance,
  sec, seuil, T, distance, type SeanceCle,
} from "./outils.ts";

const DEHORS = T("Course, dehors", "Running, outdoors");
const AUCUN = T("Aucun", "None");
const P8020 = T(
  "80 % du temps en endurance facile (Z2), 20 % plus dur. Le volume monte par paliers, une semaine allégée laisse le corps assimiler, et l'affûtage garde l'intensité en baissant le volume.",
  "80% of the time easy (Z2), 20% harder. Volume rises in steps, a deload week lets your body absorb the work, and the taper keeps intensity while cutting volume.",
);

// ---------------------------------------------------------------- 1. Courir 5 km sans t'arrêter

const marcheCourse = (n: number, courS: number, marcheS: number): SeanceCle => ({
  cle: `mc-${n}x${courS}-${marcheS}`,
  nom: T(`Marche-course ${n} × ${courS / 60} min`, `Run-walk ${n} × ${courS / 60} min`),
  type: "course",
  role: "facile",
  blocs: [
    continu(5, 1, T("marche rapide pour t'échauffer", "brisk walk to warm up"), "marche"),
    repetitions(n, courS, 2, marcheS, T(`course lente, puis ${sec(marcheS).fr} de marche`, `slow run, then ${sec(marcheS).en} walking`)),
    continu(5, 1, T("marche pour finir", "walk to finish"), "marche"),
  ],
});
const continuDebutant = (min: number): SeanceCle => ({
  cle: `continu-${min}`,
  nom: T(`Course continue ${min} min`, `Continuous run ${min} min`),
  type: "course",
  role: "facile",
  blocs: [continu(5, 1, T("marche rapide pour t'échauffer", "brisk walk to warm up"), "marche"), continu(min, 2, T("assez lent pour parler", "slow enough to talk"))],
});
const c5: Programme = programme(
  {
    id: "c5",
    nom: T("Courir 5 km sans t'arrêter", "Run 5 km non-stop"),
    resume: T("De la marche-course à 30 min de course continue.", "From run-walk to 30 minutes of continuous running."),
    description: T(
      "Tu pars de zéro : marche et course alternent, puis la course prend toute la place. En 9 semaines, tu cours 30 minutes, ou 5 km, sans t'arrêter.",
      "You start from scratch: walking and running alternate, then running takes over. In 9 weeks you run 30 minutes, or 5 km, without stopping.",
    ),
    famille: "endu",
    type: "course",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 1,
    picto: "course",
    gros: { valeur: "5", unite: "km" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
    principes: T(
      "Une progression très douce : le temps de course augmente chaque semaine, le temps de marche diminue. Toujours assez lent pour parler ; trois séances par semaine, jamais deux jours de suite.",
      "A very gentle progression: running time goes up each week, walking time goes down. Always slow enough to talk; three sessions a week, never two days in a row.",
    ),
    sources: [0, 2],
    phases: [
      { nom: T("Marche-course", "Run-walk"), semaines: 4 },
      { nom: T("Course plus longue", "Longer runs"), semaines: 2 },
      { nom: T("Course continue", "Continuous running"), semaines: 3 },
    ],
    seanceType: "mc-6x120-60",
  },
  [
    ...fois(2, { accent: T("8 × 1 min de course", "8 × 1 min running"), seances: [marcheCourse(8, 60, 90), marcheCourse(8, 60, 90), marcheCourse(8, 60, 90)] }),
    ...fois(2, { accent: T("6 × 2 min de course", "6 × 2 min running"), seances: [marcheCourse(6, 120, 60), marcheCourse(6, 120, 60), marcheCourse(6, 120, 60)] }),
    { accent: T("4 × 5 min", "4 × 5 min"), seances: [marcheCourse(4, 300, 120), marcheCourse(4, 300, 120), marcheCourse(4, 300, 120)] },
    { accent: T("2 × 10 min", "2 × 10 min"), seances: [marcheCourse(2, 600, 120), marcheCourse(2, 600, 120), marcheCourse(2, 600, 120)] },
    { accent: T("20 min continues", "20 min continuous"), seances: [continuDebutant(20), marcheCourse(2, 600, 120), continuDebutant(20)] },
    { accent: T("25 min continues", "25 min continuous"), seances: [continuDebutant(25), continuDebutant(20), continuDebutant(25)] },
    { accent: T("30 min, ou 5 km", "30 min, or 5 km"), seances: [continuDebutant(25), continuDebutant(20), continuDebutant(30)] },
  ],
);

// ---------------------------------------------------------------- 2. Premier 10 km

const c10a: Programme = programme(
  {
    id: "c10a",
    nom: T("Premier 10 km", "First 10K"),
    resume: T("Pour qui court déjà 30 min : le volume monte doucement.", "If you already run 30 min: volume rises gently."),
    description: T(
      "Tu cours déjà 30 minutes. En 10 semaines, la sortie longue passe de 40 à 70 minutes, puis viennent les côtes et un peu de vitesse : le 10 km devient une formalité.",
      "You already run 30 minutes. Over 10 weeks the long run grows from 40 to 70 minutes, then come hills and some speed: the 10K becomes a formality.",
    ),
    famille: "endu",
    type: "course",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 1,
    picto: "course",
    gros: { valeur: "10", unite: "km" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
    principes: P8020,
    sources: [0, 1, 2],
    phases: [
      { nom: PH.base, semaines: 4 },
      { nom: PH.dev, semaines: 5 },
      { nom: PH.aff, semaines: 1 },
    ],
    seanceType: "fract-6x120-z4",
  },
  [
    { accent: T("3 footings en Z2", "3 easy runs in Z2"), seances: [footing(30), footing(35), longue(40)] },
    { accent: T("sortie longue 45 min", "45 min long run"), seances: [footing(35), footing(35), longue(45)] },
    { accent: T("sortie longue 55 min", "55 min long run"), seances: [footing(35), footing(40), longue(55)] },
    { allegee: true, seances: [footing(30), footing(30), longue(40)] },
    { accent: T("côtes courtes", "short hills"), seances: [cotes(6, 45), footing(40), longue(60)] },
    { accent: T("6 × 2 min", "6 × 2 min"), seances: [fractionne(6, 120, 4, 90), footing(40), longue(65)] },
    { accent: T("côtes, sortie longue 70 min", "hills, 70 min long run"), seances: [cotes(8, 45), footing(40), longue(70)] },
    { allegee: true, seances: [fractionne(4, 120, 4, 90), footing(30), longue(45)] },
    { accent: T("4 × 2 km allure 10 km", "4 × 2 km at 10K pace"), seances: [fractionneM(4, 2000, 4, 120, T("allure 10 km visée", "target 10K pace")), footing(35), longue(60)] },
    { accent: T("affûtage, 10 km", "taper, 10K"), seances: [footing(30, true), footing(20), courseJour(10000)] },
  ],
);

// ---------------------------------------------------------------- 3. 10 km plus vite

const c10: Programme = programme(
  {
    id: "c10",
    nom: T("10 km plus vite", "Faster 10K"),
    resume: T("Footings, fractionné et seuil pour battre ton record.", "Easy runs, intervals and threshold to beat your best."),
    description: T(
      "Tu cours déjà 10 km ; en 8 semaines, footings, fractionné et seuil pour battre ton temps sans te blesser.",
      "You already run 10K; in 8 weeks, easy runs, intervals and threshold work to beat your time without getting hurt.",
    ),
    famille: "endu",
    type: "course",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 2,
    picto: "course",
    gros: { valeur: "10", unite: "km" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
    principes: T(
      "80 % du temps en endurance facile, volume qui monte puis s'allège, affûtage de deux semaines (volume − 30 % puis − 50 %, intensité gardée).",
      "80% of the time easy, volume that rises then eases, a two-week taper (volume −30% then −50%, intensity kept).",
    ),
    sources: [0, 1, 2],
    phases: [
      { nom: PH.base, semaines: 3 },
      { nom: PH.dev, semaines: 3 },
      { nom: PH.aff, semaines: 2 },
    ],
    seanceType: "fract-6x180-z4",
  },
  [
    { accent: T("fractionné court", "short intervals"), seances: [fractionne(10, 60, 5, 60), footing(35), footing(30, true), longue(45)] },
    { accent: T("côtes", "hills"), seances: [cotes(8, 60), footing(40), footing(30, true), longue(50)] },
    { accent: T("premier seuil", "first threshold"), seances: [seuil(3, 8, 120), footing(40), footing(35, true), longue(55)] },
    { allegee: true, accent: T("semaine allégée", "deload"), seances: [fractionne(6, 60, 5, 60), footing(35), footing(30), longue(50)] },
    { accent: T("6 × 3 min allure 10 km", "6 × 3 min at 10K pace"), seances: [fractionne(6, 180, 4, 120), footing(35), seuil(2, 12), longue(60)] },
    { accent: T("seuil 2 × 12 min, sortie longue 75 min", "threshold 2 × 12 min, 75 min long run"), seances: [fractionne(6, 180, 4, 120), footing(35), seuil(2, 12), longue(75)] },
    { accent: T("affûtage − 30 %", "taper −30%"), seances: [fractionne(5, 180, 4, 120), footing(35), footing(30, true), longue(50)] },
    { accent: T("affûtage − 50 %, course", "taper −50%, race"), seances: [fractionne(4, 120, 4, 120), footing(30), footing(20, true), courseJour(10000)] },
  ],
);

// ---------------------------------------------------------------- 4. Semi-marathon

const SEMI = T("à allure semi", "at half-marathon pace");
const semi: Programme = programme(
  {
    id: "semi",
    nom: T("Semi-marathon", "Half marathon"),
    resume: T("Sortie longue jusqu'à 18 km, allure semi travaillée.", "Long run up to 18 km, half-marathon pace work."),
    description: T(
      "Douze semaines pour courir 21,1 km : la sortie longue grandit, le seuil s'allonge, et l'allure semi s'installe dans les jambes. Une semaine allégée toutes les quatre.",
      "Twelve weeks to run 21.1 km: the long run grows, threshold work gets longer and half-marathon pace settles into your legs. A deload week every four.",
    ),
    famille: "endu",
    type: "course",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 2,
    picto: "course",
    gros: { valeur: "21", unite: "km" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
    principes: P8020,
    sources: [0, 1, 2],
    phases: [
      { nom: PH.base, semaines: 4 },
      { nom: PH.spe, semaines: 4 },
      { nom: PH.pic, semaines: 2 },
      { nom: PH.aff, semaines: 2 },
    ],
    seanceType: "seuil-2x20",
  },
  [
    { accent: T("sortie longue 1 h", "1 h long run"), seances: [fractionne(10, 60, 5, 60), footing(45), footing(40, true), longue(60)] },
    { accent: T("sortie longue 1 h 10", "1h10 long run"), seances: [cotes(8, 60), footing(45), footing(40, true), longue(70)] },
    { accent: T("sortie longue 1 h 20", "1h20 long run"), seances: [fractionne(12, 60, 5, 60), footing(50), footing(40, true), longue(80)] },
    { allegee: true, seances: [fractionne(8, 60, 5, 60), footing(40), footing(35), longue(60)] },
    { accent: T("seuil 3 × 10 min", "threshold 3 × 10 min"), seances: [seuil(3, 10), footing(50), footing(40, true), longueKm(14)] },
    { accent: T("3 km allure semi", "3 km at HM pace"), seances: [seuil(3, 10), footing(50), footing(40, true), longueKm(15, { n: 1, m: 3000, zone: 4, quoi: SEMI })] },
    { accent: T("seuil 2 × 20 min", "threshold 2 × 20 min"), seances: [seuil(2, 20), footing(50), footing(45, true), longueKm(16, { n: 1, m: 5000, zone: 4, quoi: SEMI })] },
    { allegee: true, seances: [seuil(2, 12), footing(40), footing(35), longueKm(12)] },
    { accent: T("pic : 17 km", "peak: 17 km"), seances: [fractionneM(6, 1000, 4, 90, T("allure 10 km", "10K pace")), footing(50), seuil(2, 20), longueKm(17)] },
    { accent: T("pic : 18 km dont 6 allure semi", "peak: 18 km with 6 at HM pace"), seances: [fractionneM(6, 1000, 4, 90, T("allure 10 km", "10K pace")), footing(50), seuil(2, 20), longueKm(18, { n: 1, m: 6000, zone: 4, quoi: SEMI })] },
    { accent: T("affûtage − 30 %", "taper −30%"), seances: [fractionneM(4, 1000, 4, 90, T("allure 10 km", "10K pace")), footing(40), footing(35, true), longueKm(12, { n: 1, m: 4000, zone: 4, quoi: SEMI })] },
    { accent: T("affûtage, course", "taper, race"), seances: [fractionne(5, 120, 4, 90), footing(30), footing(20, true), courseJour(21100)] },
  ],
);

// ---------------------------------------------------------------- 5. Marathon

const AM = T("à allure marathon", "at marathon pace");
const mara: Programme = programme(
  {
    id: "mara",
    nom: T("Marathon", "Marathon"),
    resume: T("Base, spécifique, puis trois semaines d'affûtage.", "Base, specific phase, then a three-week taper."),
    description: T(
      "Seize semaines, cinq séances : une base solide en endurance, des portions à allure marathon dans la sortie longue jusqu'à 32 km, puis trois semaines d'affûtage pour arriver frais.",
      "Sixteen weeks, five sessions: a solid aerobic base, marathon-pace segments inside the long run up to 32 km, then a three-week taper to arrive fresh.",
    ),
    famille: "endu",
    type: "course",
    objectifs: ["distance"],
    lieux: ["dehors"],
    niveau: 3,
    picto: "course",
    gros: { valeur: "42", unite: "km" },
    lieuCourt: DEHORS,
    materiel: AUCUN,
    principes: T(
      "80 % du temps en Z2. La sortie longue porte le travail spécifique (portions à allure marathon) ; semaines 8 et 12 allégées ; affûtage sur trois semaines (− 20 %, − 40 %, − 60 %).",
      "80% of the time in Z2. The long run carries the specific work (marathon-pace segments); weeks 8 and 12 are deloads; three-week taper (−20%, −40%, −60%).",
    ),
    sources: [0, 1, 2],
    phases: [
      { nom: PH.base, semaines: 5 },
      { nom: PH.spe, semaines: 8 },
      { nom: PH.aff, semaines: 3 },
    ],
    seanceType: "longue-28k-3x6000",
  },
  [
    { accent: T("sortie longue 1 h 30", "1h30 long run"), seances: [footing(50), fractionne(10, 60, 5, 60), footing(45, true), seuil(3, 8, 120), longue(90)] },
    { accent: T("côtes", "hills"), seances: [footing(50), cotes(10, 60), footing(45, true), seuil(3, 10), longue(100)] },
    { accent: T("sortie longue 1 h 50", "1h50 long run"), seances: [footing(55), fractionneM(6, 1000, 4, 90, T("allure 10 km", "10K pace")), footing(45, true), seuil(3, 10), longue(110)] },
    { accent: T("sortie longue 1 h 40", "1h40 long run"), seances: [footing(50), cotes(10, 60), footing(45, true), seuil(2, 15), longue(100)] },
    { accent: T("sortie longue 2 h", "2 h long run"), seances: [footing(55), fractionneM(8, 1000, 4, 90, T("allure 10 km", "10K pace")), footing(45, true), seuil(2, 15), longue(120)] },
    { accent: T("premières portions AM", "first MP segments"), seances: [footing(60), seuil(3, 12), footing(45, true), footing(50), longueKm(24, { n: 2, m: 4000, zone: 3, quoi: AM })] },
    { accent: T("26 km dont 2 × 5 km AM", "26 km with 2 × 5 km MP"), seances: [footing(60), seuil(2, 20), footing(45, true), footing(50), longueKm(26, { n: 2, m: 5000, zone: 3, quoi: AM })] },
    { allegee: true, seances: [footing(50), seuil(2, 12), footing(40, true), footing(40), longueKm(20)] },
    { accent: T("28 km dont 3 × 6 km AM", "28 km with 3 × 6 km MP"), seances: [footing(60), seuil(2, 20), footing(45, true), footing(50), longueKm(28, { n: 3, m: 6000, zone: 3, quoi: AM })] },
    { accent: T("30 km", "30 km"), seances: [footing(60), fractionneM(5, 2000, 4, 120, T("allure semi", "HM pace")), footing(45, true), footing(50), longueKm(30)] },
    { accent: T("30 km dont 3 × 6 km AM", "30 km with 3 × 6 km MP"), seances: [footing(60), seuil(2, 20), footing(45, true), footing(50), longueKm(30, { n: 3, m: 6000, zone: 3, quoi: AM })] },
    { allegee: true, seances: [footing(50), seuil(2, 12), footing(40, true), footing(40), longueKm(22)] },
    { accent: T("dernière longue : 32 km", "last long run: 32 km"), seances: [footing(60), seuil(2, 20), footing(45, true), footing(50), longueKm(32, { n: 2, m: 6000, zone: 3, quoi: AM })] },
    { accent: T("affûtage − 20 %", "taper −20%"), seances: [footing(50), fractionneM(5, 2000, 4, 120, T("allure semi", "HM pace")), footing(40, true), footing(45), longueKm(26, { n: 2, m: 5000, zone: 3, quoi: AM })] },
    { accent: T("affûtage − 40 %", "taper −40%"), seances: [footing(45), seuil(2, 12), footing(35, true), footing(40), longueKm(18, { n: 1, m: 6000, zone: 3, quoi: AM })] },
    { accent: T("affûtage − 60 %, course", "taper −60%, race"), seances: [footing(35), fractionne(5, 120, 4, 90), footing(30, true), footing(20), courseJour(42195)] },
  ],
);

// ---------------------------------------------------------------- 6. Nager 1 500 m

const NAGE = "natation";
const educatifs = (n: number): SeanceCle => ({
  cle: `nage-tech-${n}`,
  nom: T(`Technique de crawl, ${n} × 25 m`, `Front crawl technique, ${n} × 25 m`),
  type: "natation",
  role: "facile",
  blocs: [
    repetitionsM(4, 25, 2, 30, T("battements avec planche, bras tendus", "kick with a board, arms straight"), NAGE),
    repetitionsM(4, 25, 2, 30, T("respiration sur 3 temps : souffle sous l'eau", "breathe every 3 strokes: exhale underwater"), NAGE),
    repetitionsM(n, 25, 2, 30, T("crawl complet, sans forcer", "full crawl, easy"), NAGE),
  ],
});
const series = (n: number, m: number, recup: number): SeanceCle => ({
  cle: `nage-${n}x${m}`,
  nom: T(`Séries ${n} × ${m} m`, `Sets ${n} × ${m} m`),
  type: "natation",
  role: "dure",
  blocs: [
    distance(200, 2, T("échauffement, nages au choix", "warm-up, any stroke"), NAGE),
    repetitionsM(n, m, 3, recup, T("crawl, allure régulière", "crawl, even pace"), NAGE),
    distance(100, 1, T("récupération souple", "easy cool-down"), NAGE),
  ],
});
const nageContinue = (m: number): SeanceCle => ({
  cle: `nage-continu-${m}`,
  nom: T(`Nage continue ${m} m`, `Continuous swim ${m} m`),
  type: "natation",
  role: "facile",
  blocs: [distance(m, 2, T("d'affilée, à ton allure", "non-stop, at your pace"), NAGE)],
});
const nage: Programme = programme(
  {
    id: "nage",
    nom: T("Nager 1 500 m", "Swim 1,500 m"),
    resume: T("Technique de crawl et séries, jusqu'à 1 500 m d'affilée.", "Front crawl technique and sets, up to 1,500 m non-stop."),
    description: T(
      "Des éducatifs pour un crawl plus facile, puis des séries de plus en plus longues : en 8 semaines, tu nages 1 500 m d'affilée.",
      "Drills for an easier front crawl, then longer and longer sets: in 8 weeks you swim 1,500 m non-stop.",
    ),
    famille: "endu",
    type: "natation",
    objectifs: ["nager"],
    lieux: ["piscine"],
    niveau: 1,
    picto: "natation",
    gros: { valeur: "1 500", unite: "m" },
    lieuCourt: T("Natation, piscine", "Swimming, pool"),
    materiel: T("Planche", "Kickboard"),
    principes: T(
      "La technique d'abord (respiration, battements), puis des séries courtes avec récupération, qui s'allongent chaque semaine jusqu'à la distance continue.",
      "Technique first (breathing, kick), then short sets with rest that get longer each week until the continuous distance.",
    ),
    sources: [0, 6],
    phases: [
      { nom: PH.tech, semaines: 2 },
      { nom: T("Séries", "Sets"), semaines: 4 },
      { nom: T("Distance", "Distance"), semaines: 2 },
    ],
    seanceType: "nage-6x100",
  },
  [
    { accent: T("éducatifs, 10 × 25 m", "drills, 10 × 25 m"), seances: [educatifs(10), educatifs(10), nageContinue(100)] },
    { accent: T("éducatifs, 12 × 25 m", "drills, 12 × 25 m"), seances: [educatifs(12), educatifs(12), nageContinue(150)] },
    { accent: T("8 × 50 m", "8 × 50 m"), seances: [educatifs(8), series(8, 50, 30), nageContinue(200)] },
    { accent: T("8 × 50 m, 300 m continus", "8 × 50 m, 300 m continuous"), seances: [educatifs(8), series(8, 50, 30), nageContinue(300)] },
    { accent: T("6 × 100 m", "6 × 100 m"), seances: [educatifs(8), series(6, 100, 30), nageContinue(400)] },
    { accent: T("4 × 200 m", "4 × 200 m"), seances: [series(6, 100, 30), series(4, 200, 45), nageContinue(600)] },
    { accent: T("3 × 400 m", "3 × 400 m"), seances: [series(4, 200, 45), series(3, 400, 60), nageContinue(800)] },
    { accent: T("1 500 m d'affilée", "1,500 m non-stop"), seances: [series(4, 200, 45), nageContinue(800), nageContinue(1500)] },
  ],
);

// ---------------------------------------------------------------- 7. Vélo : endurance et seuil

const VELO = "bicycling";
const veloLong = (min: number): SeanceCle => ({
  cle: `velo-long-${min}`,
  nom: cat2(T("Sortie longue ", "Long ride "), duree(min)),
  type: "velo",
  role: "longue",
  blocs: [continu(min, 2, T("endurance, cadence souple", "endurance, easy cadence"), VELO)],
});
const veloSeuil = (n: number, min: number, recup: number): SeanceCle => ({
  cle: `velo-seuil-${n}x${min}`,
  nom: T(`Seuil ${n} × ${min} min`, `Threshold ${n} × ${min} min`),
  type: "velo",
  role: "dure",
  blocs: [continu(15, 2, T("échauffement", "warm-up"), VELO), repetitions(n, min * 60, 4, recup * 60, T("au seuil : dur mais régulier", "at threshold: hard but steady"), VELO), continu(10, 2, T("retour au calme", "cool-down"), VELO)],
});
const veloEndu = (min: number): SeanceCle => ({
  cle: `velo-endu-${min}`,
  nom: T(`Endurance ${min} min`, `Endurance ${min} min`),
  type: "velo",
  role: "facile",
  blocs: [continu(min, 2, null, VELO)],
});
const veloTest: SeanceCle = {
  cle: "velo-test-20",
  nom: T("Test de 20 min", "20-min test"),
  type: "velo",
  role: "dure",
  note: T("Ton seuil ≈ 95 % de la puissance (ou de la vitesse) moyenne des 20 min.", "Your threshold ≈ 95% of the 20-min average power (or speed)."),
  blocs: [continu(20, 2, T("échauffement, avec 3 accélérations", "warm-up with 3 short efforts"), VELO), continu(20, 5, T("à fond, mais régulier", "all out, but even"), VELO), continu(10, 1, null, VELO)],
};
function cat2(a: { fr: string; en: string }, b: { fr: string; en: string }) {
  return T(a.fr + b.fr, a.en + b.en);
}
const velo: Programme = programme(
  {
    id: "velo",
    nom: T("Vélo : endurance et seuil", "Cycling: endurance and threshold"),
    resume: T("Longues sorties en Z2 et efforts au seuil.", "Long Z2 rides and threshold efforts."),
    description: T(
      "Une sortie longue en endurance qui grandit jusqu'à 3 heures, et des efforts au seuil de plus en plus longs. Dehors ou sur home-trainer.",
      "A long endurance ride growing to 3 hours, and longer and longer threshold efforts. Outdoors or on a turbo trainer.",
    ),
    famille: "endu",
    type: "velo",
    objectifs: ["nager"],
    lieux: ["dehors", "maison"],
    niveau: 2,
    picto: "bicycling",
    gros: { valeur: "Z2", unite: null },
    lieuCourt: T("Vélo, dehors", "Cycling, outdoors"),
    materiel: T("Vélo", "Bike"),
    principes: P8020,
    sources: [0, 1],
    phases: [
      { nom: PH.base, semaines: 4 },
      { nom: PH.dev, semaines: 3 },
      { nom: PH.bilan, semaines: 1 },
    ],
    seanceType: "velo-seuil-2x20",
  },
  [
    { accent: T("3 × 8 min au seuil", "3 × 8 min threshold"), seances: [veloSeuil(3, 8, 4), veloEndu(60), veloLong(90)] },
    { accent: T("3 × 10 min au seuil", "3 × 10 min threshold"), seances: [veloSeuil(3, 10, 4), veloEndu(60), veloLong(120)] },
    { accent: T("4 × 8 min au seuil", "4 × 8 min threshold"), seances: [veloSeuil(4, 8, 4), veloEndu(60), veloLong(150)] },
    { allegee: true, seances: [veloSeuil(2, 8, 4), veloEndu(45), veloLong(75)] },
    { accent: T("2 × 15 min au seuil", "2 × 15 min threshold"), seances: [veloSeuil(2, 15, 5), veloEndu(60), veloLong(150)] },
    { accent: T("2 × 20 min au seuil", "2 × 20 min threshold"), seances: [veloSeuil(2, 20, 5), veloEndu(60), veloLong(165)] },
    { accent: T("sortie longue 3 h", "3 h long ride"), seances: [veloSeuil(2, 20, 5), veloEndu(60), veloLong(180)] },
    { allegee: true, accent: T("test de 20 min", "20-min test"), seances: [veloEndu(45), veloTest, veloLong(90)] },
  ],
);

// ---------------------------------------------------------------- 8. Prépa randonnée en montagne

const marcheCote = (min: number): SeanceCle => ({
  cle: `rando-cote-${min}`,
  nom: T(`Marche rapide en côte ${min} min`, `Brisk uphill walk ${min} min`),
  type: "autre",
  role: "dure",
  blocs: [continu(min, 3, T("en côte ou dans les escaliers, rythme soutenu", "uphill or on stairs, brisk pace"), "marche")],
});
const renfoJambes = (series: number): SeanceCle =>
  seance(
    `rando-renfo-${series}`,
    T("Renfo des jambes", "Leg strength"),
    [
      ex("dumbbell-step-ups", series, 12, { repos: 60, note: T("une marche ou un banc ; chaque jambe", "a step or a bench; each leg") }),
      ex("bodyweight-walking-lunge", series, 10, { repos: 60, note: T("chaque jambe", "each leg") }),
      ex("standing-calf-raises", series, 15, { repos: 45 }),
      ex("bodyweight-squat", series, 15, { repos: 60, tempo: "3-0-1-0" }),
    ],
    { type: "muscu" },
  );
const sortieRando = (min: number, sac: number | null, dplus: number | null): SeanceCle => ({
  cle: `rando-sortie-${min}${sac ? `-s${sac}` : ""}`,
  nom: T(`Sortie de ${duree(min).fr}${sac ? `, sac de ${sac} kg` : ""}`, `${duree(min).en} hike${sac ? `, ${sac} kg pack` : ""}`),
  type: "autre",
  role: "longue",
  note: dplus ? T(`Vise ${dplus} m de dénivelé positif.`, `Aim for ${dplus} m of elevation gain.`) : null,
  blocs: [continu(min, 2, sac ? T(`sac de ${sac} kg`, `${sac} kg pack`) : T("rythme où tu peux parler", "pace where you can talk"), "randonnee")],
});
const rando: Programme = programme(
  {
    id: "rando",
    nom: T("Prépa randonnée en montagne", "Mountain hiking prep"),
    resume: T("Marche en côte, montées de marche et jambes solides.", "Uphill walking, step-ups and strong legs."),
    description: T(
      "Huit semaines pour aborder la montagne : de la marche en côte, des jambes renforcées, et une sortie qui s'allonge, sac au dos, jusqu'à 4 heures et 600 m de dénivelé.",
      "Eight weeks to get ready for the mountains: uphill walking, stronger legs and a weekly hike that grows, pack on, up to 4 hours and 600 m of gain.",
    ),
    famille: "endu",
    type: "autre",
    objectifs: ["sport"],
    lieux: ["dehors"],
    niveau: 1,
    picto: "randonnee",
    gros: { valeur: "D+", unite: null },
    lieuCourt: T("Randonnée, dehors", "Hiking, outdoors"),
    materiel: T("Sac à dos", "Backpack"),
    principes: T(
      "L'endurance en marche se construit comme en course : du volume facile, une séance plus intense (la côte), et des jambes renforcées pour la descente.",
      "Walking endurance is built like running: easy volume, one harder session (uphill) and stronger legs for the descents.",
    ),
    sources: [0, 6],
    phases: [
      { nom: PH.base, semaines: 4 },
      { nom: T("Sac au dos", "Pack on"), semaines: 3 },
      { nom: PH.allege, semaines: 1 },
    ],
    seanceType: "rando-renfo-3",
  },
  [
    { accent: T("sortie de 2 h", "2 h hike"), seances: [marcheCote(45), renfoJambes(2), sortieRando(120, null, null)] },
    { seances: [marcheCote(45), renfoJambes(3), sortieRando(120, null, null)] },
    { seances: [marcheCote(50), renfoJambes(3), sortieRando(135, null, 300)] },
    { seances: [marcheCote(50), renfoJambes(3), sortieRando(150, null, 400)] },
    { accent: T("sac de 6 kg, 3 h", "6 kg pack, 3 h"), seances: [marcheCote(55), renfoJambes(3), sortieRando(180, 6, 500)] },
    { accent: T("sac de 8 kg", "8 kg pack"), seances: [marcheCote(60), renfoJambes(4), sortieRando(210, 8, 600)] },
    { accent: T("sac de 10 kg, 4 h", "10 kg pack, 4 h"), seances: [marcheCote(60), renfoJambes(4), sortieRando(240, 10, 600)] },
    { allegee: true, seances: [marcheCote(40), renfoJambes(2), sortieRando(120, null, null)] },
  ],
);

export const ENDURANCE: Programme[] = [c5, c10a, c10, semi, mara, nage, velo, rando];
