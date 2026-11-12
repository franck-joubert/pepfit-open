// Catalogue (NOTES § 3), familles force et muscle, forme et poids, mobilité et santé.
import type { Bloc, Programme } from "../../src/boutique/modele.ts";
import { avecEffort, continu, ex, fois, PH, programme, repetitions, seance, T, tenu, type SeanceCle } from "./outils.ts";

const SALLE = T("Salle", "Gym");
const MAISON = T("Maison", "Home");
const SANS = T("Aucun", "None");
const PRINCIPES_MUSCU = T(
  "Assez de séries par muscle et par semaine (10 à 20), chaque muscle deux fois par semaine, et la double progression : d'abord les répétitions, puis le poids. Une semaine allégée laisse récupérer.",
  "Enough sets per muscle per week (10 to 20), each muscle twice a week, and double progression: reps first, then weight. A deload week lets you recover.",
);
const DOUBLE = T("double progression : le haut de la plage à toutes les séries, puis + 2,5 kg", "double progression: top of the range on every set, then +2.5 kg");

// ---------------------------------------------------------------- 9. Full body débutant

const fullBody = (series: number, phase: "appr" | "prog" | "bilan"): SeanceCle =>
  seance(
    `fb-${phase}`,
    phase === "appr" ? T("Full body, apprentissage", "Full body, learning") : phase === "bilan" ? T("Full body, allégée", "Full body, deload") : T("Full body", "Full body"),
    [
      ex("squat", series, 8, { repsMax: 10, repos: 150, tempo: phase === "appr" ? "3-1-1-0" : undefined, note: phase === "bilan" ? T("dernière séance : cherche ton poids pour 10 répétitions", "last session: find your 10-rep weight") : undefined }),
      ex("couche", series, 8, { repsMax: 10, repos: 150, tempo: phase === "appr" ? "3-1-1-0" : undefined }),
      ex("bent-over-barbell-row", series, 8, { repsMax: 10, repos: 120 }),
      ex("standing-military-press", series, 8, { repsMax: 10, repos: 120 }),
      ex("romanian-deadlift", series, 8, { repsMax: 10, repos: 120, tempo: phase === "appr" ? "3-0-1-0" : undefined }),
      tenu("plank", series, 30, { repos: 45 }),
    ],
    {
      role: "dure",
      note:
        phase === "appr"
          ? T("Poids légers : apprends les gestes, descente lente.", "Light weights: learn the movements, slow lowering.")
          : phase === "prog"
            ? T("Toutes les séries à 10 répétitions ? + 2,5 kg la fois suivante.", "All sets at 10 reps? +2.5 kg next time.")
            : undefined,
    },
  );
const fb: Programme = programme(
  {
    id: "fb",
    nom: T("Full body débutant", "Beginner full body"),
    resume: T("Trois séances complètes, le poids monte à chaque fois.", "Three full sessions, the weight goes up each time."),
    description: T(
      "Une seule séance qui fait travailler tout le corps, trois fois par semaine. Deux semaines pour apprendre les gestes, puis le poids monte dès que toutes les séries passent.",
      "One session that works the whole body, three times a week. Two weeks to learn the movements, then the weight goes up as soon as every set is done.",
    ),
    famille: "force",
    type: "muscu",
    objectifs: ["muscle", "force"],
    lieux: ["salle"],
    niveau: 1,
    picto: "squat",
    gros: { valeur: "Full body", unite: null },
    lieuCourt: T("Salle, barre", "Gym, barbell"),
    materiel: T("Barre", "Barbell"),
    progression: T("+ 2,5 kg dès que toutes les séries atteignent 10 répétitions.", "+2.5 kg as soon as every set reaches 10 reps."),
    principes: PRINCIPES_MUSCU,
    sources: [3],
    phases: [
      { nom: PH.appr, semaines: 2 },
      { nom: PH.prog, semaines: 5 },
      { nom: PH.bilan, semaines: 1 },
    ],
    seanceType: "fb-prog",
  },
  [
    ...fois(2, { accent: T("apprendre les gestes", "learn the movements"), seances: [fullBody(3, "appr"), fullBody(3, "appr"), fullBody(3, "appr")] }),
    ...fois(5, { accent: T("+ 2,5 kg quand tout passe", "+2.5 kg when everything is done"), seances: [fullBody(3, "prog"), fullBody(3, "prog"), fullBody(3, "prog")] }),
    { allegee: true, accent: T("nouveau 10 RM", "new 10RM"), seances: [fullBody(2, "bilan"), fullBody(2, "bilan"), fullBody(2, "bilan")] },
  ],
);

// ---------------------------------------------------------------- 10. Force 5×5

const A = seance(
  "f5-a",
  T("5×5, Routine A", "5×5, Routine A"),
  [
    ex("squat", 5, 5, { repos: 180, progression: 2.5 }),
    ex("couche", 5, 5, { repos: 180, progression: 2.5 }),
    ex("bent-over-barbell-row", 5, 5, { repos: 150, progression: 2.5 }),
  ],
  { role: "dure", note: T("Trois échecs de suite sur un mouvement : − 10 %, et on remonte.", "Three failed sessions in a row on a lift: −10%, then build back up.") },
);
const B = seance(
  "f5-b",
  T("5×5, Routine B", "5×5, Routine B"),
  [
    ex("squat", 5, 5, { repos: 180, progression: 2.5 }),
    ex("standing-military-press", 5, 5, { repos: 180, progression: 2.5 }),
    ex("sdt", 1, 5, { repos: 180, progression: 5, note: T("une seule série lourde", "a single heavy set") }),
  ],
  { role: "dure", note: T("Trois échecs de suite sur un mouvement : − 10 %, et on remonte.", "Three failed sessions in a row on a lift: −10%, then build back up.") },
);
const f5: Programme = programme(
  {
    id: "f5",
    nom: T("Force 5×5", "Strength 5×5"),
    resume: T("Cinq mouvements de base à la barre, deux séances A et B.", "Five barbell basics, two sessions A and B."),
    description: T(
      "Cinq mouvements de base, deux séances qui alternent. Tu ajoutes un peu de poids à chaque séance réussie.",
      "Five basic lifts, two alternating sessions. You add a little weight after every successful session.",
    ),
    famille: "force",
    type: "muscu",
    objectifs: ["force"],
    lieux: ["salle"],
    niveau: 2,
    picto: "sdt",
    gros: { valeur: "5×5", unite: null },
    lieuCourt: T("Salle, barre", "Gym, barbell"),
    materiel: T("Barre", "Barbell"),
    progression: T(
      "+ 2,5 kg à chaque séance réussie (+ 5 kg au soulevé de terre). Trois échecs de suite : le poids redescend de 10 %.",
      "+2.5 kg after each successful session (+5 kg on the deadlift). Three failures in a row: the weight drops by 10%.",
    ),
    chargesDepart: true,
    principes: T(
      "Progression linéaire : peu de répétitions, des poids lourds, et un petit pas à chaque séance. Départ à 90 % de ta dernière série pour avoir de la marge ; si ça coince après la semaine 5, passe à 3 × 5.",
      "Linear progression: low reps, heavy weights and a small step every session. Start at 90% of your last set to leave some margin; if you stall after week 5, switch to 3 × 5.",
    ),
    sources: [3],
    phases: [
      { nom: T("Mise en route", "Ramp-up"), semaines: 4 },
      { nom: PH.prog, semaines: 8 },
    ],
    seanceType: "f5-a",
  },
  Array.from({ length: 12 }, (_, i) => ({
    accent: i === 0 ? T("départ à 90 % de ta dernière série", "start at 90% of your last set") : i === 4 ? T("progression linéaire", "linear progression") : undefined,
    seances: i % 2 === 0 ? [A, B, A] : [B, A, B],
  })),
);

// ---------------------------------------------------------------- 11. Push Pull Legs

const push = (n: number): SeanceCle =>
  seance(`ppl-push-${n}`, T("Pousser", "Push"), [
    ex("couche", n, 6, { repsMax: 10, repos: 150, note: DOUBLE }),
    ex("incline-dumbbell-press", n, 8, { repsMax: 12, repos: 120 }),
    ex("standing-military-press", n, 8, { repsMax: 12, repos: 120 }),
    ex("side-lateral-raise", n, 12, { repsMax: 15, repos: 0, superset: 1, transition: 15 }),
    ex("triceps-pushdown", n, 10, { repsMax: 15, repos: 90, superset: 1, transition: 15 }),
  ]);
const pull = (n: number): SeanceCle =>
  seance(`ppl-pull-${n}`, T("Tirer", "Pull"), [
    ex("pullups", n, 6, { repsMax: 10, repos: 150, note: T("avec un élastique si besoin", "use a band if needed") }),
    ex("bent-over-barbell-row", n, 8, { repsMax: 12, repos: 120 }),
    ex("seated-cable-rows", n, 10, { repsMax: 12, repos: 90 }),
    ex("face-pull", n, 12, { repsMax: 15, repos: 0, superset: 1, transition: 15 }),
    ex("hammer-curls", n, 10, { repsMax: 12, repos: 90, superset: 1, transition: 15 }),
  ]);
const legs = (n: number): SeanceCle =>
  seance(`ppl-legs-${n}`, T("Jambes", "Legs"), [
    ex("squat", n, 6, { repsMax: 10, repos: 180, note: DOUBLE }),
    ex("romanian-deadlift", n, 8, { repsMax: 10, repos: 150 }),
    ex("leg-press", n, 10, { repsMax: 15, repos: 120 }),
    ex("lying-leg-curls", n, 10, { repsMax: 15, repos: 0, superset: 1, transition: 15 }),
    ex("standing-calf-raises", n, 12, { repsMax: 15, repos: 90, superset: 1, transition: 15 }),
  ]);
const semPPL = (n: number, accent?: ReturnType<typeof T>, allegee = false) => ({ accent, allegee, seances: [push(n), pull(n), legs(n), push(n), pull(n), legs(n)] });
const ppl: Programme = programme(
  {
    id: "ppl",
    nom: T("Push Pull Legs", "Push Pull Legs"),
    resume: T("Pousser, tirer, jambes, deux fois par semaine.", "Push, pull, legs, twice a week."),
    description: T(
      "Le grand classique pour prendre du muscle : pousser, tirer, jambes, deux fois par semaine. Le volume monte par paliers, avec des supersets pour gagner du temps.",
      "The classic for building muscle: push, pull, legs, twice a week. Volume rises in steps, with supersets to save time.",
    ),
    famille: "force",
    type: "muscu",
    objectifs: ["muscle"],
    lieux: ["salle"],
    niveau: 2,
    picto: "couche",
    gros: { valeur: "PPL", unite: null },
    lieuCourt: T("Salle, machines et barre", "Gym, machines and barbell"),
    materiel: SALLE,
    progression: T("Double progression : le haut de la plage à toutes les séries, puis + 2,5 kg.", "Double progression: top of the range on every set, then +2.5 kg."),
    principes: PRINCIPES_MUSCU,
    sources: [3],
    phases: [
      { nom: T("10 à 12 séries", "10 to 12 sets"), semaines: 3 },
      { nom: T("14 à 16 séries", "14 to 16 sets"), semaines: 3 },
      { nom: T("16 à 20 séries", "16 to 20 sets"), semaines: 3 },
      { nom: PH.allege, semaines: 1 },
    ],
    seanceType: "ppl-push-3",
  },
  [
    semPPL(3, T("3 séries par exercice", "3 sets per exercise")),
    semPPL(3),
    semPPL(3),
    semPPL(4, T("4 séries par exercice", "4 sets per exercise")),
    semPPL(4),
    semPPL(4),
    semPPL(5, T("5 séries par exercice", "5 sets per exercise")),
    semPPL(5),
    semPPL(5),
    semPPL(2, T("semaine allégée", "deload week"), true),
  ],
);

// ---------------------------------------------------------------- 12. Haut et bas du corps

const hautL = (n: number, test = false): SeanceCle =>
  seance(test ? "hb-haut-test" : `hb-haut-lourd-${n}`, T("Haut lourd", "Upper heavy"), [
    ex("couche", n, 6, { repos: 180, note: test ? T("dernière série : ton nouveau maximum sur 5", "last set: your new 5-rep max") : undefined }),
    ex("bent-over-barbell-row", n, 6, { repos: 150 }),
    ex("standing-military-press", 3, 8, { repos: 120 }),
    ex("pullups", 3, 6, { repsMax: 10, repos: 120 }),
  ], { role: "dure" });
const basL = (n: number, test = false): SeanceCle =>
  seance(test ? "hb-bas-test" : `hb-bas-lourd-${n}`, T("Bas lourd", "Lower heavy"), [
    ex("squat", n, 6, { repos: 180, note: test ? T("dernière série : ton nouveau maximum sur 5", "last set: your new 5-rep max") : undefined }),
    ex("romanian-deadlift", 3, 8, { repos: 150 }),
    ex("leg-press", 3, 10, { repos: 120 }),
    ex("standing-calf-raises", 3, 12, { repos: 60 }),
  ], { role: "dure" });
const hautV = (n: number): SeanceCle =>
  seance(`hb-haut-volume-${n}`, T("Haut volume", "Upper volume"), [
    ex("incline-dumbbell-press", n, 10, { repsMax: 12, repos: 90 }),
    ex("wide-grip-lat-pulldown", n, 10, { repsMax: 12, repos: 90 }),
    ex("side-lateral-raise", 3, 12, { repsMax: 15, repos: 60 }),
    ex("dumbbell-bicep-curl", 3, 10, { repsMax: 12, repos: 0, superset: 1, transition: 10 }),
    ex("triceps-pushdown", 3, 10, { repsMax: 12, repos: 75, superset: 1, transition: 10 }),
  ]);
const basV = (n: number): SeanceCle =>
  seance(`hb-bas-volume-${n}`, T("Bas volume", "Lower volume"), [
    ex("dumbbell-lunges", n, 10, { repsMax: 12, repos: 90, note: T("chaque jambe", "each leg") }),
    ex("barbell-hip-thrust", n, 10, { repsMax: 12, repos: 90, tempo: "2-1-1-1" }),
    ex("lying-leg-curls", 3, 12, { repsMax: 15, repos: 60 }),
    tenu("plank", 3, 45, { repos: 45 }),
  ]);
const hb: Programme = programme(
  {
    id: "hb",
    nom: T("Haut et bas du corps", "Upper / lower"),
    resume: T("Quatre séances, chaque muscle deux fois par semaine.", "Four sessions, each muscle twice a week."),
    description: T(
      "Haut lourd, bas lourd, haut volume, bas volume : la force et le muscle dans la même semaine. Une série de plus sur les mouvements principaux après la semaine allégée.",
      "Upper heavy, lower heavy, upper volume, lower volume: strength and size in the same week. One extra set on the main lifts after the deload.",
    ),
    famille: "force",
    type: "muscu",
    objectifs: ["muscle", "force"],
    lieux: ["salle"],
    niveau: 2,
    picto: "rowing-barre",
    gros: { valeur: "Haut / bas", unite: null },
    lieuCourt: T("Salle, barre", "Gym, barbell"),
    materiel: SALLE,
    progression: T("Lourd : + 2,5 kg quand les 6 répétitions passent. Volume : double progression.", "Heavy: +2.5 kg when all 6 reps are done. Volume: double progression."),
    principes: PRINCIPES_MUSCU,
    sources: [3],
    phases: [
      { nom: PH.vol, semaines: 4 },
      { nom: PH.allege, semaines: 1 },
      { nom: T("Une série de plus", "One more set"), semaines: 4 },
      { nom: PH.bilan, semaines: 1 },
    ],
    seanceType: "hb-haut-lourd-4",
  },
  [
    ...fois(4, { accent: T("4 × 6 et 3 × 10-12", "4 × 6 and 3 × 10-12"), seances: [hautL(4), basL(4), hautV(3), basV(3)] }),
    { allegee: true, seances: [hautL(3), basL(3), hautV(2), basV(2)] },
    ...fois(4, { accent: T("+ 1 série sur les principaux", "+1 set on the main lifts"), seances: [hautL(5), basL(5), hautV(4), basV(4)] }),
    { allegee: true, accent: T("nouveaux maxima sur 5 répétitions", "new 5-rep maxes"), seances: [hautL(3, true), basL(3, true), hautV(2), basV(2)] },
  ],
);

// ---------------------------------------------------------------- 13. Muscu aux haltères

const halteres = (n: number, tempo: boolean): SeanceCle =>
  seance(`hal-${n}${tempo ? "-tempo" : ""}`, tempo ? T("Haltères, tempo lent", "Dumbbells, slow tempo") : T("Haltères, tout le corps", "Dumbbells, full body"), [
    ex("goblet-squat", n, 10, { repsMax: 15, repos: 90, tempo: tempo ? "3-1-1-0" : undefined }),
    ex("dumbbell-floor-press", n, 10, { repsMax: 15, repos: 90, tempo: tempo ? "3-1-1-0" : undefined }),
    ex("one-arm-dumbbell-row", n, 10, { repsMax: 15, repos: 75, note: T("chaque bras", "each arm") }),
    ex("dumbbell-rear-lunge", n, 10, { repsMax: 12, repos: 75, note: T("chaque jambe", "each leg") }),
    ex("stiff-legged-dumbbell-deadlift", n, 10, { repsMax: 15, repos: 90 }),
    ex("side-lateral-raise", n, 12, { repsMax: 15, repos: 60 }),
  ], { note: T("On monte les répétitions jusqu'au haut de la plage, puis le poids.", "Raise the reps to the top of the range, then the weight.") });
const hal: Programme = programme(
  {
    id: "hal",
    nom: T("Muscu aux haltères", "Dumbbell training"),
    resume: T("Tout le corps avec deux haltères réglables.", "Full body with two adjustable dumbbells."),
    description: T(
      "Une séance complète avec deux haltères, à la maison. On monte d'abord les répétitions, puis le poids ; un tempo lent prend le relais quand les haltères deviennent légers.",
      "A full session with two dumbbells at home. Reps go up first, then the weight; a slow tempo takes over when the dumbbells get light.",
    ),
    famille: "force",
    type: "muscu",
    objectifs: ["muscle", "maison"],
    lieux: ["maison_halteres"],
    niveau: 1,
    picto: "squat-gobelet",
    gros: { valeur: "Haltères", unite: null },
    lieuCourt: T("Maison, haltères", "Home, dumbbells"),
    materiel: T("Haltères", "Dumbbells"),
    progression: T("Double progression : 15 répétitions à toutes les séries, puis un cran de plus.", "Double progression: 15 reps on every set, then go one notch heavier."),
    principes: PRINCIPES_MUSCU,
    sources: [3],
    phases: [
      { nom: PH.prog, semaines: 3 },
      { nom: PH.allege, semaines: 1 },
      { nom: T("Tempo lent", "Slow tempo"), semaines: 3 },
      { nom: PH.allege, semaines: 1 },
    ],
    seanceType: "hal-3",
  },
  [
    ...fois(3, { accent: T("3 × 10-15", "3 × 10-15"), seances: [halteres(3, false), halteres(3, false), halteres(3, false)] }),
    { allegee: true, seances: [halteres(2, false), halteres(2, false), halteres(2, false)] },
    ...fois(3, { accent: T("tempo 3-1-1-0", "tempo 3-1-1-0"), seances: [halteres(3, true), halteres(3, false), halteres(3, true)] }),
    { allegee: true, seances: [halteres(2, false), halteres(2, false), halteres(2, false)] },
  ],
);

// ---------------------------------------------------------------- 14. Prépa physique padel

const APPUIS = "perso:appuis";
const padelA = (n: number, vitesse: boolean): SeanceCle =>
  seance(`padel-a-${n}${vitesse ? "-v" : ""}`, T("Appuis et jambes", "Footwork and legs"), [
    tenu(APPUIS, 6, 20, { repos: 40, note: T("pas chassés, changements de direction, replacement au centre", "side shuffles, direction changes, back to the centre") }),
    ex("lateral-bound", n, 8, { repos: 60, note: T("chaque côté, réception stable", "each side, land softly") }),
    ex("dumbbell-lunges", n, 8, { repos: 75, note: T("chaque jambe", "each leg") }),
    ...(vitesse ? [ex("freehand-jump-squat", 3, 6, { repos: 75, note: T("explosif, réception souple", "explosive, soft landing") })] : []),
    ex("pallof-press-with-rotation", n, 10, { repos: 45, note: T("chaque côté", "each side") }),
    ex("external-rotation-with-cable", n, 12, { repsMax: 15, repos: 45 }),
  ], { role: vitesse ? "dure" : "facile" });
const padelB = (n: number, vitesse: boolean): SeanceCle =>
  seance(`padel-b-${n}${vitesse ? "-v" : ""}`, T("Gainage et épaules", "Core and shoulders"), [
    tenu(APPUIS, 6, 20, { repos: 40 }),
    ex("barbell-side-split-squat", n, 8, { repos: 75, note: T("chaque côté", "each side") }),
    ...(vitesse ? [ex("front-box-jump", 3, 5, { repos: 75 })] : []),
    ex("cable-russian-twists", n, 12, { repos: 45 }),
    ex("face-pull", n, 12, { repsMax: 15, repos: 0, superset: 1, transition: 10 }),
    ex("palms-up-barbell-wrist-curl-over-a-bench", n, 15, { repos: 60, superset: 1, transition: 10 }),
  ], { role: vitesse ? "dure" : "facile" });
const padel: Programme = programme(
  {
    id: "padel",
    nom: T("Prépa physique padel", "Padel conditioning"),
    resume: T("Appuis, gainage en rotation et épaules, en plus des matchs.", "Footwork, rotational core and shoulders, on top of your matches."),
    description: T(
      "Deux séances par semaine, en plus de tes matchs : des appuis plus vifs, un tronc solide en rotation, des épaules et des avant-bras qui tiennent la saison.",
      "Two sessions a week on top of your matches: quicker footwork, a strong rotating core, and shoulders and forearms that last the season.",
    ),
    famille: "force",
    type: "muscu",
    objectifs: ["sport"],
    lieux: ["salle", "padel"],
    niveau: 2,
    picto: "padel",
    gros: { valeur: "Padel", unite: null },
    lieuCourt: T("Padel, salle", "Padel, gym"),
    materiel: SALLE,
    principes: T(
      "La technique d'abord, puis le poids et la vitesse ; la dernière semaine s'allège avant un tournoi. Coiffe des rotateurs et avant-bras protègent l'épaule et le coude.",
      "Technique first, then weight and speed; the last week eases off before a tournament. Rotator cuff and forearm work protect the shoulder and elbow.",
    ),
    sources: [3],
    phases: [
      { nom: PH.tech, semaines: 2 },
      { nom: PH.charge, semaines: 3 },
      { nom: PH.allege, semaines: 1 },
    ],
    seanceType: "padel-a-3-v",
    exercicesPerso: { appuis: { nom: T("Appuis et changements de direction", "Footwork and direction changes"), nature: "duree" } },
  },
  [
    ...fois(2, { accent: T("technique", "technique"), seances: [padelA(2, false), padelB(2, false)] }),
    ...fois(3, { accent: T("poids et vitesse", "weight and speed"), seances: [padelA(3, true), padelB(3, true)] }),
    { allegee: true, accent: T("avant tournoi", "before a tournament"), seances: [padelA(2, false), padelB(2, false)] },
  ],
);

// ---------------------------------------------------------------- 15. Perdre du poids : marche et renfo

const marche = (min: number): SeanceCle => ({
  cle: `pp-marche-${min}`,
  nom: T(`Marche rapide ${min} min`, `Brisk walk ${min} min`),
  type: "autre",
  role: "facile",
  blocs: [continu(min, 2, T("tu peux parler, pas chanter", "you can talk, not sing"), "marche")],
});
const circuitMaison = (tours: number, cle: string, nom: ReturnType<typeof T>): SeanceCle =>
  seance(cle, nom, [
    ex("bodyweight-squat", tours, 15, { repos: 0, superset: 1, transition: 20 }),
    ex("incline-push-up", tours, 10, { repos: 0, superset: 1, transition: 20, note: T("mains sur une table ou un canapé", "hands on a table or sofa") }),
    ex("single-leg-glute-bridge", tours, 12, { repos: 0, superset: 1, transition: 20, note: T("chaque jambe", "each leg") }),
    ex("superman", tours, 12, { repos: 0, superset: 1, transition: 20 }),
    ex("bodyweight-walking-lunge", tours, 10, { repos: 0, superset: 1, transition: 20 }),
    tenu("plank", tours, 30, { repos: 90, superset: 1, transition: 20 }),
  ], { note: T("Circuit : enchaîne les six exercices, puis souffle 1 min 30 avant le tour suivant.", "Circuit: go through all six exercises, then rest 1 min 30 before the next round.") });
const pp: Programme = programme(
  {
    id: "pp",
    nom: T("Perdre du poids : marche et renfo", "Lose weight: walking and strength"),
    resume: T("Deux marches rapides, deux renfos, et ta nutrition en lien.", "Two brisk walks, two strength sessions, linked to your nutrition."),
    description: T(
      "Deux marches rapides qui s'allongent, deux renfos pour garder ton muscle : de 150 à 250 minutes d'activité par semaine. Avec un léger déficit et assez de protéines, suivis dans Nutrition.",
      "Two brisk walks that get longer and two strength sessions to keep your muscle: from 150 to 250 minutes of activity a week. With a slight calorie deficit and enough protein, tracked in Nutrition.",
    ),
    famille: "forme",
    type: "autre",
    objectifs: ["poids", "maison"],
    lieux: ["maison", "dehors"],
    niveau: 1,
    picto: "montee-banc",
    gros: { valeur: "Pas + force", unite: null },
    lieuCourt: T("Maison, dehors", "Home, outdoors"),
    materiel: SANS,
    principes: T(
      "150 à 300 minutes d'activité modérée par semaine pour la santé et la perte de poids ; le renfo garde le muscle pendant le déficit. Le déficit se joue surtout dans l'assiette.",
      "150 to 300 minutes of moderate activity a week for health and weight loss; strength work keeps your muscle during the deficit. The deficit mostly happens on your plate.",
    ),
    sources: [5, 3],
    phases: [
      { nom: T("Mise en route", "Getting started"), semaines: 4 },
      { nom: PH.prog, semaines: 4 },
      { nom: T("Consolidation", "Consolidation"), semaines: 4 },
    ],
    seanceType: "pp-renfo-3",
  },
  [
    ...[30, 30, 35, 35].map((m, i) => ({
      accent: i === 0 ? T("150 min par semaine", "150 min a week") : undefined,
      seances: [marche(m), circuitMaison(2, "pp-renfo-2", T("Renfo tout le corps", "Full-body strength")), marche(m), circuitMaison(2, "pp-renfo-2", T("Renfo tout le corps", "Full-body strength"))],
    })),
    ...[40, 45, 45, 50].map((m, i) => ({
      accent: i === 0 ? T("3 tours de circuit", "3 circuit rounds") : undefined,
      seances: [marche(m), circuitMaison(3, "pp-renfo-3", T("Renfo tout le corps", "Full-body strength")), marche(m), circuitMaison(3, "pp-renfo-3", T("Renfo tout le corps", "Full-body strength"))],
    })),
    ...[50, 55, 60, 60].map((m, i) => ({
      accent: i === 3 ? T("250 min par semaine", "250 min a week") : undefined,
      seances: [marche(m), circuitMaison(3, "pp-renfo-3", T("Renfo tout le corps", "Full-body strength")), marche(m), circuitMaison(3, "pp-renfo-3", T("Renfo tout le corps", "Full-body strength"))],
    })),
  ],
);

// ---------------------------------------------------------------- 16. HIIT à la maison

const JJ = "perso:jumping-jack";
const BURPEE = "perso:burpee";
const hiitSeance = (effort: number, repos: number, tours: number, six: boolean): SeanceCle =>
  seance(
    `hiit-${effort}-${repos}-${tours}${six ? "-6" : ""}`,
    T(`HIIT ${effort} s / ${repos} s`, `HIIT ${effort} s / ${repos} s`),
    [
      tenu("fast-skipping", 1, 240, { repos: 60, note: T("échauffement : montées de genoux tranquilles", "warm-up: easy high knees") }),
      tenu("freehand-jump-squat", tours, effort, { repos: 0, superset: 1, transition: repos }),
      tenu("mountain-climbers", tours, effort, { repos: 0, superset: 1, transition: repos }),
      tenu("pushups", tours, effort, { repos: 0, superset: 1, transition: repos }),
      tenu(JJ, tours, effort, { repos: 0, superset: 1, transition: repos }),
      tenu(BURPEE, tours, effort, { repos: six ? 0 : repos, superset: 1, transition: repos }),
      ...(six ? [tenu("plank", tours, effort, { repos, superset: 1, transition: repos })] : []),
      tenu("childs-pose", 1, 120, { repos: 0, note: T("retour au calme", "cool-down") }),
    ],
    { type: "cross", role: "dure", note: T("Effort au maximum de ce que tu peux tenir, repos complet. Jamais deux jours de suite.", "Go as hard as you can sustain, rest fully. Never two days in a row.") },
  );
const tabata: SeanceCle = seance(
  "hiit-tabata",
  T("Tabata 8 × 20 s / 10 s", "Tabata 8 × 20 s / 10 s"),
  [
    tenu("fast-skipping", 1, 240, { repos: 60, note: T("échauffement", "warm-up") }),
    { ...tenu("freehand-jump-squat", 8, 20, { repos: 10 }), note: T("4 min : 8 × 20 s à fond, 10 s de repos", "4 min: 8 × 20 s all out, 10 s rest") },
    { ...tenu("mountain-climbers", 8, 20, { repos: 10 }), note: T("souffle 2 min avant cet exercice", "rest 2 min before this exercise") },
    { ...tenu(BURPEE, 8, 20, { repos: 10 }), note: T("souffle 2 min avant cet exercice", "rest 2 min before this exercise") },
    tenu("childs-pose", 1, 120, { repos: 0, note: T("retour au calme", "cool-down") }),
  ],
  { type: "cross", role: "dure" },
);
const hiit: Programme = programme(
  {
    id: "hiit",
    nom: T("HIIT à la maison", "HIIT at home"),
    resume: T("Intervalles courts au poids du corps, 20 min chrono.", "Short bodyweight intervals, 20 minutes flat."),
    description: T(
      "Vingt minutes, sans matériel : des intervalles courts qui deviennent plus denses chaque deux semaines, jusqu'au Tabata.",
      "Twenty minutes, no equipment: short intervals that get denser every two weeks, up to Tabata.",
    ),
    famille: "forme",
    type: "cross",
    objectifs: ["maison", "poids"],
    lieux: ["maison"],
    niveau: 2,
    picto: "hiit",
    gros: { valeur: "20", unite: "min" },
    lieuCourt: T("Maison, sans matériel", "Home, no equipment"),
    materiel: SANS,
    principes: T(
      "Des efforts courts et intenses améliorent l'endurance et la santé métabolique en peu de temps. Le rapport effort / repos se resserre par paliers ; jamais deux jours de suite.",
      "Short, intense efforts improve endurance and metabolic health in little time. The work/rest ratio tightens in steps; never two days in a row.",
    ),
    sources: [4],
    phases: [
      { nom: T("30 s / 30 s", "30 s / 30 s"), semaines: 2 },
      { nom: T("40 s / 20 s", "40 s / 20 s"), semaines: 2 },
      { nom: T("Tabata", "Tabata"), semaines: 1 },
      { nom: PH.allege, semaines: 1 },
    ],
    seanceType: "hiit-40-20-2-6",
    exercicesPerso: {
      "jumping-jack": { nom: T("Jumping jacks", "Jumping jacks"), nature: "duree" },
      burpee: { nom: T("Burpees", "Burpees"), nature: "duree" },
    },
  },
  [
    ...fois(2, { accent: T("30 s effort / 30 s repos", "30 s work / 30 s rest"), seances: [hiitSeance(30, 30, 2, false), hiitSeance(30, 30, 2, false), hiitSeance(30, 30, 2, false)] }),
    ...fois(2, { accent: T("40 s / 20 s", "40 s / 20 s"), seances: [hiitSeance(40, 20, 2, true), hiitSeance(40, 20, 2, true), hiitSeance(40, 20, 2, true)] }),
    { accent: T("Tabata 20 s / 10 s", "Tabata 20 s / 10 s"), seances: [tabata, hiitSeance(40, 20, 2, true), tabata] },
    { allegee: true, seances: [hiitSeance(30, 30, 1, false), hiitSeance(30, 30, 2, false), hiitSeance(30, 30, 1, false)] },
  ],
);

// ---------------------------------------------------------------- 17. Remise en forme

const ROWING_ELASTIQUE = "perso:rowing-elastique";
const remiseEnForme = (tours: number): SeanceCle =>
  seance(`rf-${tours}`, T(`Remise en forme, ${tours} tours`, `Get fit, ${tours} rounds`), [
    { ...continu(10, 2, T("cardio doux : marche rapide ou vélo", "easy cardio: brisk walk or bike"), "marche") },
    ex("bodyweight-squat", tours, 12, { repos: 0, superset: 1, transition: 20 }),
    ex("incline-push-up", tours, 8, { repos: 0, superset: 1, transition: 20 }),
    ex("bent-knee-hip-raise", tours, 12, { repos: 0, superset: 1, transition: 20 }),
    ex(ROWING_ELASTIQUE, tours, 12, { repos: 0, superset: 1, transition: 20 }),
    ex("bodyweight-walking-lunge", tours, 8, { repos: 0, superset: 1, transition: 20 }),
    tenu("plank", tours, 20, { repos: 90, superset: 1, transition: 20 }),
  ], { note: T("30 minutes en tout. Circuit : les six exercices à la suite, puis 1 min 30 de pause.", "30 minutes in all. Circuit: the six exercises in a row, then a 1 min 30 break.") });
const rf: Programme = programme(
  {
    id: "rf",
    nom: T("Remise en forme", "Get back in shape"),
    resume: T("Renfo et cardio doux pour reprendre une routine.", "Strength and easy cardio to get back into a routine."),
    description: T(
      "Trente minutes, trois fois par semaine : dix minutes de cardio doux et un circuit au poids du corps. Deux tours pour commencer, trois ensuite.",
      "Thirty minutes, three times a week: ten minutes of easy cardio and a bodyweight circuit. Two rounds to start, three after.",
    ),
    famille: "forme",
    type: "muscu",
    objectifs: ["maison", "poids"],
    lieux: ["maison"],
    niveau: 1,
    picto: "squat-poids-du-corps",
    gros: { valeur: "30", unite: "min" },
    lieuCourt: T("Maison, élastique", "Home, band"),
    materiel: T("Élastique", "Band"),
    principes: T(
      "Les recommandations de santé : de l'activité modérée chaque semaine et du renforcement deux fois ou plus. On commence bas, on ajoute un tour quand les deux premiers deviennent faciles.",
      "Health guidelines: moderate activity every week and strength work twice or more. Start low, add a round once the first two feel easy.",
    ),
    sources: [6, 5],
    phases: [
      { nom: T("Reprise", "Restart"), semaines: 4 },
      { nom: PH.prog, semaines: 4 },
    ],
    seanceType: "rf-2",
    exercicesPerso: { "rowing-elastique": { nom: T("Rowing avec élastique", "Band row"), nature: "reps" } },
  },
  [
    ...fois(4, { accent: T("2 tours", "2 rounds"), seances: [remiseEnForme(2), remiseEnForme(2), remiseEnForme(2)] }),
    ...fois(4, { accent: T("3 tours", "3 rounds"), seances: [remiseEnForme(3), remiseEnForme(3), remiseEnForme(3)] }),
  ],
);

// ---------------------------------------------------------------- 18. Kettlebell : tout le corps

const SWING = "one-arm-kettlebell-swings";
const kbTech = (swings: number, n: number): SeanceCle =>
  seance(`kb-tech-${swings}-${n}`, T("Kettlebell, technique", "Kettlebell, technique"), [
    ex(SWING, swings, 10, { repos: 45, note: T("à deux mains si tu débutes ; la hanche pousse, les bras suivent", "two hands if you're new; the hips drive, the arms follow") }),
    ex("goblet-squat", n, 8, { repos: 90 }),
    ex("two-arm-kettlebell-military-press", n, 8, { repos: 90 }),
    ex("alternating-kettlebell-row", n, 8, { repos: 75 }),
    ex("kettlebell-turkish-get-up-squat-style", n, 1, { repos: 60, note: T("chaque côté, lentement", "each side, slowly") }),
  ], { type: "cross", role: "dure" });
const kbEmom: SeanceCle = seance(
  "kb-emom",
  T("EMOM 20 min", "EMOM 20 min"),
  [
    ex(SWING, 5, 15, { repos: 0, superset: 1 }),
    ex("goblet-squat", 5, 8, { repos: 0, superset: 1 }),
    ex("two-arm-kettlebell-military-press", 5, 6, { repos: 0, superset: 1 }),
    ex("alternating-kettlebell-row", 5, 8, { repos: 0, superset: 1 }),
  ],
  { type: "cross", role: "dure", format: "emom", formatValeur: 1200, note: T("Chaque minute, un exercice ; le reste de la minute, tu souffles. 5 tours.", "Every minute, one exercise; rest for the rest of the minute. 5 rounds.") },
);
const kbTest: SeanceCle = seance(
  "kb-test",
  T("Test : 100 swings", "Test: 100 swings"),
  [
    ex(SWING, 1, 100, { repos: 0, note: T("le moins de pauses possible ; note ton temps", "as few breaks as possible; note your time") }),
    ex("kettlebell-turkish-get-up-squat-style", 3, 1, { repos: 60 }),
  ],
  { type: "cross", role: "dure" },
);
const kb: Programme = programme(
  {
    id: "kb",
    nom: T("Kettlebell : tout le corps", "Kettlebell: full body"),
    resume: T("Swing, goblet squat, presse : un seul kettlebell.", "Swing, goblet squat, press: a single kettlebell."),
    description: T(
      "Un kettlebell suffit : la technique du swing d'abord, puis un EMOM de 20 minutes qui fait tout travailler, et un test de 100 swings pour finir.",
      "One kettlebell is enough: swing technique first, then a 20-minute EMOM that works everything, and a 100-swing test to finish.",
    ),
    famille: "forme",
    type: "cross",
    objectifs: ["maison", "force"],
    lieux: ["maison_halteres"],
    niveau: 2,
    picto: "kettlebell-swing",
    gros: { valeur: "KB", unite: null },
    lieuCourt: T("Maison, kettlebell", "Home, kettlebell"),
    materiel: T("Kettlebell", "Kettlebell"),
    principes: T(
      "Le swing travaille la chaîne arrière et le cardio en même temps. La technique avant le volume, puis la densité (EMOM) ; une semaine allégée au milieu.",
      "The swing trains the posterior chain and conditioning at once. Technique before volume, then density (EMOM); a deload week in the middle.",
    ),
    sources: [3, 4],
    phases: [
      { nom: PH.tech, semaines: 3 },
      { nom: PH.allege, semaines: 1 },
      { nom: T("EMOM", "EMOM"), semaines: 3 },
      { nom: T("Test", "Test"), semaines: 1 },
    ],
    seanceType: "kb-emom",
  },
  [
    ...fois(3, { accent: T("swing : 10 × 10", "swing: 10 × 10"), seances: [kbTech(10, 3), kbTech(10, 3), kbTech(10, 3)] }),
    { allegee: true, seances: [kbTech(6, 2), kbTech(6, 2), kbTech(6, 2)] },
    ...fois(3, { accent: T("EMOM 20 min", "EMOM 20 min"), seances: [kbEmom, kbTech(10, 3), kbEmom] }),
    { accent: T("100 swings", "100 swings"), seances: [kbTech(6, 2), kbEmom, kbTest] },
  ],
);

// ---------------------------------------------------------------- 19. Mobilité 15 min par jour

const mobilite = (cle: string, nom: ReturnType<typeof T>, exos: string[], s: number, test: boolean): SeanceCle =>
  seance(
    `${cle}-${s}${test ? "-test" : ""}`,
    nom,
    exos.map((e) => tenu(e, 2, s, { repos: 15 })),
    {
      type: "mobilite",
      note: test
        ? T("Test d'amplitude : note jusqu'où tu vas à la première posture, pour comparer en semaine 4.", "Range test: note how far you get on the first pose, to compare in week 4.")
        : T("Amplitude active : va chercher la position, ne te laisse pas seulement tomber dedans.", "Active range: reach for the position, don't just sink into it."),
    },
  );
const HANCHES = ["worlds-greatest-stretch", "kneeling-hip-flexor", "90-90-hamstring", "lying-glute", "hip-circles-prone"];
const DOS = ["cat-stretch", "perso:rotation-thoracique", "childs-pose", "spinal-stretch", "superman"];
const EPAULES = ["round-the-world-shoulder-stretch", "chest-and-front-of-shoulder-stretch", "shoulder-stretch", "perso:glissements-mur", "childs-pose"];
const CHEVILLES = ["ankle-circles", "calf-stretch-hands-against-wall", "perso:genou-mur", "bodyweight-squat", "all-fours-quad-stretch"];
const COMPLET = ["worlds-greatest-stretch", "cat-stretch", "kneeling-hip-flexor", "round-the-world-shoulder-stretch", "ankle-circles"];
const semMob = (s: number, test: boolean) => ({
  accent: test ? T("tests d'amplitude", "range tests") : undefined,
  seances: [
    mobilite("mob-hanches", T("Hanches", "Hips"), HANCHES, s, test),
    mobilite("mob-dos", T("Dos et colonne thoracique", "Back and thoracic spine"), DOS, s, false),
    mobilite("mob-epaules", T("Épaules", "Shoulders"), EPAULES, s, false),
    mobilite("mob-chevilles", T("Chevilles", "Ankles"), CHEVILLES, s, false),
    mobilite("mob-complet", T("Tout le corps", "Whole body"), COMPLET, s, false),
  ],
});
const mob: Programme = programme(
  {
    id: "mob",
    nom: T("Mobilité 15 min par jour", "Mobility, 15 min a day"),
    resume: T("Hanches, dos, épaules : un peu chaque jour.", "Hips, back, shoulders: a little every day."),
    description: T(
      "Quinze minutes, cinq jours par semaine, une zone par jour : hanches, colonne, épaules, chevilles, puis tout le corps. Des tests d'amplitude au début et à la fin pour voir le progrès.",
      "Fifteen minutes, five days a week, one area a day: hips, spine, shoulders, ankles, then the whole body. Range tests at the start and end to see your progress.",
    ),
    famille: "sante",
    type: "mobilite",
    objectifs: ["mobilite"],
    lieux: ["maison"],
    niveau: 1,
    picto: "yoga",
    gros: { valeur: "15", unite: "min" },
    lieuCourt: T("Mobilité, maison", "Mobility, home"),
    materiel: SANS,
    principes: T(
      "La mobilité progresse avec la régularité plus qu'avec la durée : un peu chaque jour. L'amplitude active (aller chercher la position) tient mieux que l'étirement passif seul.",
      "Mobility improves with consistency more than duration: a little every day. Active range (reaching for the position) lasts better than passive stretching alone.",
    ),
    sources: [6],
    phases: [
      { nom: T("Tests et base", "Tests and base"), semaines: 1 },
      { nom: PH.prog, semaines: 2 },
      { nom: PH.bilan, semaines: 1 },
    ],
    seanceType: "mob-hanches-45-test",
    exercicesPerso: {
      "rotation-thoracique": { nom: T("Rotations thoraciques à quatre pattes", "Quadruped thoracic rotations"), nature: "duree" },
      "glissements-mur": { nom: T("Glissements de bras au mur", "Wall slides"), nature: "duree" },
      "genou-mur": { nom: T("Genou au mur (cheville)", "Knee to wall (ankle)"), nature: "duree" },
    },
  },
  [semMob(45, true), semMob(60, false), semMob(60, false), semMob(45, true)],
);

// ---------------------------------------------------------------- 20. Dos solide

const CURL_UP = "perso:curl-up";
const BIRD_DOG = "perso:bird-dog";
const CHARNIERE = "perso:charniere";
const dosSeance = (pyramide: number[], charniere: boolean): SeanceCle =>
  seance(
    `dos-${pyramide.join("")}${charniere ? "-ch" : ""}`,
    charniere ? T("Tronc et charnière", "Core and hip hinge") : T("Contrôle du tronc", "Core control"),
    [
      ex(CURL_UP, pyramide.length, pyramide[0]!, { repsParSerie: pyramide, repos: 30, note: T("tiens chaque répétition 8 à 10 s", "hold each rep 8 to 10 s") }),
      ex("side-bridge", pyramide.length, pyramide[0]!, { repsParSerie: pyramide, repos: 30, note: T("chaque côté, tenu 8 à 10 s", "each side, held 8 to 10 s") }),
      ex(BIRD_DOG, pyramide.length, pyramide[0]!, { repsParSerie: pyramide, repos: 30, note: T("chaque côté, tenu 8 à 10 s, le dos ne bouge pas", "each side, held 8 to 10 s, the back stays still") }),
      ...(charniere ? [ex(CHARNIERE, 3, 10, { repos: 45, note: T("bâton le long du dos : tête, dos et bassin le touchent", "stick along your back: head, upper back and pelvis touch it") })] : []),
    ],
    { type: "mobilite", note: T("Sans douleur. Ce n'est pas un étirement : on apprend au tronc à rester stable.", "Pain-free. This isn't stretching: you teach your core to stay stable.") },
  );
const dos: Programme = programme(
  {
    id: "dos",
    nom: T("Dos solide", "Strong back"),
    resume: T("Gainage et contrôle du tronc, sans douleur.", "Core bracing and control, pain-free."),
    description: T(
      "Les trois exercices de contrôle du tronc les plus étudiés, en séries courtes et tenues, puis la charnière de hanche pour ramasser sans charger le dos.",
      "The three most studied core-control exercises, in short held sets, then the hip hinge to pick things up without loading your back.",
    ),
    famille: "sante",
    type: "mobilite",
    objectifs: ["mobilite"],
    lieux: ["maison"],
    niveau: 1,
    picto: "gainage",
    gros: { valeur: "Gainage", unite: null },
    lieuCourt: T("Santé, maison", "Health, home"),
    materiel: T("Un bâton", "A stick"),
    avertissement: T(
      "Sans douleur. Une douleur qui descend dans la jambe, des fourmillements ou une faiblesse : arrête et demande l'avis d'un médecin.",
      "Pain-free. Pain running down the leg, tingling or weakness: stop and see a doctor.",
    ),
    principes: T(
      "Endurance du tronc plutôt que force : des contractions tenues 8 à 10 s, en pyramide descendante (par exemple 5, 3, 1), pour tenir sans fatigue.",
      "Core endurance rather than strength: holds of 8 to 10 s in a descending pyramid (e.g. 5, 3, 1), so you can hold without fatigue.",
    ),
    sources: [7],
    phases: [
      { nom: T("Contrôle", "Control"), semaines: 3 },
      { nom: T("Charnière", "Hip hinge"), semaines: 3 },
    ],
    seanceType: "dos-642-ch",
    exercicesPerso: {
      "curl-up": { nom: T("Curl-up", "Curl-up"), nature: "reps" },
      "bird-dog": { nom: T("Bird dog", "Bird dog"), nature: "reps" },
      charniere: { nom: T("Charnière de hanche au bâton", "Hip hinge with a stick"), nature: "reps" },
    },
  },
  [
    ...fois(2, { accent: T("pyramide 5, 3, 1", "pyramid 5, 3, 1"), seances: Array.from({ length: 4 }, () => dosSeance([5, 3, 1], false)) }),
    { accent: T("pyramide 6, 4, 2", "pyramid 6, 4, 2"), seances: Array.from({ length: 4 }, () => dosSeance([6, 4, 2], false)) },
    ...fois(3, { accent: T("+ charnière de hanche", "+ hip hinge"), seances: Array.from({ length: 4 }, () => dosSeance([6, 4, 2], true)) }),
  ],
);

// ---------------------------------------------------------------- 21. Remise en route : genoux et chevilles
// Hors du médical (31/10, D4) : une reprise du sport après une pause, sans progression guidée par la douleur ni
// accord d'un soignant ; la progression suit les semaines, au rythme de l'aisance.

const CHAISE = "perso:chaise-mur";
const EQUILIBRE = "perso:equilibre-unipodal";
const SAUTS = "perso:sauts-legers";
const AISANCE = T("Tranquille : tu peux parler pendant l'effort et tu gardes trois répétitions en réserve.", "Easy: you can talk during the effort and keep three reps in reserve.");
const iso: SeanceCle = seance("gen-iso", T("Isométrie et équilibre", "Isometrics and balance"), [
  tenu(CHAISE, 4, 30, { repos: 60, note: T("dos au mur, genoux à angle droit ou un peu plus haut", "back to the wall, knees at a right angle or a little higher") }),
  tenu("bent-knee-hip-raise", 3, 30, { repos: 45, note: T("pont tenu", "held bridge") }),
  ex("standing-calf-raises", 3, 12, { repos: 45, tempo: "3-1-3-0" }),
  tenu(EQUILIBRE, 4, 30, { repos: 30, note: T("chaque jambe, près d'un appui", "each leg, near something to hold") }),
], { type: "mobilite", note: AISANCE });
const renfoGenou = (n: number): SeanceCle =>
  seance(`gen-renfo-${n}`, T("Renfo progressif", "Progressive strength"), [
    ex("single-leg-glute-bridge", n, 10, { repos: 60, note: T("chaque jambe", "each leg") }),
    ex("dumbbell-step-ups", n, 10, { repos: 60, note: T("sans haltère d'abord ; chaque jambe", "no dumbbell at first; each leg") }),
    ex("bodyweight-squat", n, 12, { repos: 60, tempo: "3-0-1-0" }),
    ex("standing-calf-raises", n, 15, { repos: 45 }),
    tenu(EQUILIBRE, 3, 30, { repos: 30 }),
  ], { type: "muscu", note: AISANCE });
const marcheCourseGenou = (n: number, s: number): SeanceCle => ({
  cle: `gen-mc-${n}x${s}`,
  nom: T(`Marche-course ${n} × ${s / 60} min`, `Run-walk ${n} × ${s / 60} min`),
  type: "course",
  role: "facile",
  note: AISANCE,
  blocs: [
    continu(5, 1, T("marche", "walk"), "marche"),
    ex(SAUTS, 2, 10, { repos: 45, note: T("petits sauts sur place, pieds joints", "small hops in place, feet together") }),
    repetitions(n, s, 2, 60, T("course très lente, puis 1 min de marche", "very slow run, then 1 min walking")),
    continu(5, 1, T("marche", "walk"), "marche"),
  ],
});
const gen: Programme = programme(
  {
    id: "gen",
    nom: T("Remise en route : genoux et chevilles", "Getting going again: knees and ankles"),
    resume: T("Pour reprendre en douceur après une pause, semaine après semaine.", "To ease back in after a break, week by week."),
    description: T(
      "Après une pause : de l'isométrie et de l'équilibre, un renfo qui monte, puis le retour à la course en marche-course. Tu restes à l'aise, la difficulté vient avec les semaines.",
      "After a break: isometrics and balance, strength that builds up, then a return to running with run-walk. You stay comfortable; the challenge comes with the weeks.",
    ),
    famille: "sante",
    type: "mobilite",
    objectifs: ["mobilite"],
    lieux: ["maison"],
    niveau: 1,
    picto: "pont-fessier-unijambiste",
    gros: { valeur: "Reprise", unite: null },
    lieuCourt: T("Santé, maison", "Health, home"),
    materiel: T("Une marche", "A step"),
    avertissement: T(
      "Va à ton rythme : si un mouvement te gêne, laisse-le de côté et passe au suivant.",
      "Go at your own pace: if a movement bothers you, skip it and move on to the next.",
    ),
    principes: T(
      "Une progression régulière : chaque phase ajoute un peu de volume. Si une semaine t'a semblé dure, refais-la avant de passer à la suivante.",
      "Steady progress: each phase adds a little volume. If a week felt hard, repeat it before moving on to the next.",
    ),
    sources: [6],
    phases: [
      { nom: T("Isométrie", "Isometrics"), semaines: 2 },
      { nom: T("Renfo", "Strength"), semaines: 3 },
      { nom: T("Retour à la course", "Back to running"), semaines: 3 },
    ],
    seanceType: "gen-renfo-3",
    exercicesPerso: {
      "chaise-mur": { nom: T("Chaise contre le mur", "Wall sit"), nature: "duree" },
      "equilibre-unipodal": { nom: T("Équilibre sur un pied", "Single-leg balance"), nature: "duree" },
      "sauts-legers": { nom: T("Petits sauts sur place", "Small hops in place"), nature: "reps" },
    },
  },
  [
    ...fois(2, { accent: T("isométrie, équilibre", "isometrics, balance"), seances: [iso, iso, iso] }),
    { accent: T("renfo progressif", "progressive strength"), seances: [renfoGenou(2), renfoGenou(2), renfoGenou(2)] },
    ...fois(2, { seances: [renfoGenou(3), renfoGenou(3), renfoGenou(3)] }),
    { accent: T("marche-course 6 × 1 min", "run-walk 6 × 1 min"), seances: [renfoGenou(3), marcheCourseGenou(6, 60), renfoGenou(3)] },
    { accent: T("marche-course 8 × 1 min", "run-walk 8 × 1 min"), seances: [renfoGenou(3), marcheCourseGenou(8, 60), marcheCourseGenou(8, 60)] },
    { accent: T("marche-course 5 × 2 min", "run-walk 5 × 2 min"), seances: [renfoGenou(2), marcheCourseGenou(5, 120), marcheCourseGenou(5, 120)] },
  ],
);

// ---------------------------------------------------------------- 22. Force et équilibre après 60 ans

const TALON = "perso:marche-talon-pointe";
const equilibre = (reps: number, s: number): SeanceCle =>
  seance(`equi-${reps}-${s}`, T("Jambes, équilibre et haut du corps", "Legs, balance and upper body"), [
    ex("chair-squat", 3, reps, { repos: 60, note: T("se lever d'une chaise sans les mains", "stand up from a chair without your hands") }),
    ex("dumbbell-step-ups", 3, reps, { repos: 60, note: T("une marche d'escalier, la main sur la rampe ; chaque jambe", "one stair step, hand on the rail; each leg") }),
    tenu(EQUILIBRE, 3, s, { repos: 30, note: T("près d'un appui ; chaque pied", "near something to hold; each foot") }),
    ex(TALON, 3, 10, { repos: 30, note: T("10 pas, talon contre la pointe, le long d'un mur", "10 steps, heel to toe, along a wall") }),
    ex("band-pull-apart", 3, 12, { repos: 45 }),
    ex("bench-press-with-bands", 3, 10, { repos: 45, note: T("debout, élastique dans le dos", "standing, band behind your back") }),
    ex("standing-calf-raises", 2, 12, { repos: 45 }),
  ], { type: "mobilite", note: T("Avec la marche, vise 3 heures d'activité par semaine.", "With walking, aim for 3 hours of activity a week.") });
const equi: Programme = programme(
  {
    id: "equi",
    nom: T("Force et équilibre après 60 ans", "Strength and balance after 60"),
    resume: T("Jambes, équilibre et prévention des chutes.", "Legs, balance and fall prevention."),
    description: T(
      "Deux séances par semaine pour des jambes plus fortes et un meilleur équilibre : se lever d'une chaise, monter une marche, tenir sur un pied. Ce qui protège le mieux des chutes.",
      "Two sessions a week for stronger legs and better balance: getting up from a chair, stepping up, standing on one foot. What best protects against falls.",
    ),
    famille: "sante",
    type: "mobilite",
    objectifs: ["mobilite"],
    lieux: ["maison"],
    niveau: 1,
    picto: "montee-banc",
    gros: { valeur: "Équilibre", unite: null },
    lieuCourt: T("Santé, maison", "Health, home"),
    materiel: T("Chaise, élastique", "Chair, band"),
    avertissement: T(
      "Demande l'avis de ton médecin avant de commencer si tu as un problème de cœur, de tension, des vertiges ou une chute récente. Fais les exercices d'équilibre près d'un appui.",
      "Ask your doctor before starting if you have heart or blood-pressure problems, dizziness or a recent fall. Do the balance exercises near something to hold.",
    ),
    principes: T(
      "L'exercice d'équilibre et de force des jambes, deux fois par semaine ou plus, réduit les chutes d'environ un quart. Avec la marche, 3 heures d'activité par semaine sont visées.",
      "Balance and leg-strength exercise, twice a week or more, cuts falls by about a quarter. With walking, the aim is 3 hours of activity a week.",
    ),
    sources: [9, 5],
    phases: [
      { nom: T("Mise en route", "Getting started"), semaines: 4 },
      { nom: PH.prog, semaines: 4 },
    ],
    seanceType: "equi-12-30",
    exercicesPerso: {
      "equilibre-unipodal": { nom: T("Équilibre sur un pied", "Single-leg balance"), nature: "duree" },
      "marche-talon-pointe": { nom: T("Marche talon-pointe", "Heel-to-toe walk"), nature: "reps" },
    },
  },
  [
    ...fois(2, { accent: T("8 répétitions, 20 s sur un pied", "8 reps, 20 s on one foot"), seances: [equilibre(8, 20), equilibre(8, 20)] }),
    ...fois(2, { seances: [equilibre(10, 20), equilibre(10, 20)] }),
    ...fois(4, { accent: T("12 répétitions, 30 s sur un pied", "12 reps, 30 s on one foot"), seances: [equilibre(12, 30), equilibre(12, 30)] }),
  ],
);

// ---------------------------------------------------------------- effort visé (NOTES-CHARGES § 3)

/** Exercices d'isolation (un seul muscle, machine ou poulie) : on peut aller plus près de l'échec sans risque. */
const ISOLATION = new Set([
  "side-lateral-raise", "triceps-pushdown", "face-pull", "hammer-curls", "dumbbell-bicep-curl", "lying-leg-curls", "standing-calf-raises",
]);
/** Répétitions en réserve : 2 sur les mouvements de base, 1 en isolation ; 3 en apprentissage et en semaine allégée. */
const muscu = (cle: string, b: Bloc, allegee: (cle: string) => boolean) => (allegee(cle) ? 3 : ISOLATION.has(b.exo) ? 1 : 2);

export const AUTRES: Programme[] = [
  avecEffort(fb, (cle) => (cle === "fb-appr" ? 3 : 2)),
  avecEffort(f5, () => 2),
  avecEffort(ppl, (cle, b) => muscu(cle, b, (c) => c.endsWith("-2"))),
  // Semaine bilan : « ton nouveau maximum sur 5 » sur les deux mouvements lourds, à 1 en réserve.
  avecEffort(hb, (cle, b) => (cle.endsWith("-test") && (b.exo === "couche" || b.exo === "squat") ? 1 : muscu(cle, b, (c) => /-(lourd-3|volume-2)$/.test(c)))),
  avecEffort(hal, (cle, b) => muscu(cle, b, (c) => c.startsWith("hal-2"))),
  avecEffort(padel, () => 2),
  pp,
  hiit,
  rf,
  // Le test des 100 swings n'a pas de cible : le moins de pauses possible.
  avecEffort(kb, (cle) => (cle === "kb-test" ? null : cle.startsWith("kb-tech-6") ? 3 : 2)),
  mob,
  dos,
  // Santé (remise en route, après 60 ans) : toujours de la marge.
  avecEffort(gen, () => 3),
  avecEffort(equi, () => 3),
];
