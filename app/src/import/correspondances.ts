import { normaliser } from "../db/normaliser";

// Noms Hevy (français ou anglais) -> slug du catalogue. Seulement des équivalences de mouvement et de matériel sûres ;
// le reste devient un exercice perso (rapport d'import).
const TABLE: [string[], string][] = [
  [["Tirage Poitrine (Poulie)", "Lat Pulldown (Cable)", "Tirage Poitrine (Machine)"], "wide-grip-lat-pulldown"],
  [["Tirage Poitrine - Prise Serrée (Poulie)", "Lat Pulldown - Close Grip (Cable)"], "close-grip-front-lat-pulldown"],
  [["Développé Couché (Machine Smith)", "Bench Press (Smith Machine)"], "smith-machine-bench-press"],
  [["Rowing Poulie Assis", "Seated Cable Row - Bar Grip"], "seated-cable-rows"],
  [["Extension Triceps Corde", "Triceps Rope Pushdown"], "triceps-pushdown-rope-attachment"],
  [["Extension Triceps Poulie Haute", "Extension Triceps (Poulie)", "Triceps Extension (Cable)"], "triceps-pushdown"],
  [["Développé Couché Incliné (Haltère)", "Incline Bench Press (Dumbbell)"], "incline-dumbbell-press"],
  [["Tractions", "Pull Up"], "pullups"],
  [["Tractions Supination", "Chin Up"], "chin-up"],
  [["Butterfly (Pec Deck)"], "butterfly"],
  [["Curl Biceps (Barre)", "Bicep Curl (Barbell)"], "barbell-curl"],
  [["Curl Biceps (Haltère)", "Bicep Curl (Dumbbell)"], "dumbbell-bicep-curl"],
  [["Extension Jambes", "Extension Jambes (Machine)", "Leg Extension (Machine)"], "leg-extensions"],
  [["Presse à Cuisses Horizontal", "Presse à Cuisses Horizontale", "Leg Press Horizontal (Machine)"], "leg-press"],
  [["Leg Curl Assis", "Leg Curl Assis (Machine)", "Seated Leg Curl (Machine)"], "seated-leg-curl"],
  [["Pompes"], "pushups"],
  [["Abduction Hanche", "Abduction Hanche (Machine)", "Hip Abduction (Machine)"], "thigh-abductor"],
  [["Tirage Poitrine Bras Tendus (Poulie)"], "straight-arm-pulldown"],
  [["Rope Straight Arm Pulldown"], "rope-straight-arm-pulldown"],
  [["Écartés Poulie", "Cable Fly Crossovers"], "cable-crossover"],
  [["Écartés Poulie Basse", "Low Cable Fly Crossovers"], "low-cable-crossover"],
  [["Presse Épaules (Haltère)", "Développé Militaire (Haltère)", "Shoulder Press (Dumbbell)"], "dumbbell-shoulder-press"],
  [["Seated Shoulder Press (Machine)"], "machine-shoulder-military-press"],
  [["Élévation Frontale (Haltère)", "Front Raise (Dumbbell)"], "front-dumbbell-raise"],
  [["Élévation Latérale (Haltère)", "Lateral Raise (Dumbbell)"], "side-lateral-raise"],
  [["Crunch (Machine)"], "ab-crunch-machine"],
  [["Face Pull", "Tirage vers Visage", "Tirage vers le Visage"], "face-pull"],
  [["Hanging Leg Raise"], "hanging-leg-raise"],
  [["Dips Triceps", "Triceps Dip"], "dips-triceps-version"],
  [["Roue Abdominale"], "ab-roller"],
  [["Crunch"], "crunches"],
  [["Développé Couché (Barre)", "Bench Press (Barbell)"], "couche"],
  [["Développé Couché Incliné (Barre)", "Incline Bench Press (Barbell)"], "barbell-incline-bench-press-medium-grip"],
  [["Développé Couché Décliné (Barre)", "Decline Bench Press (Barbell)"], "decline-barbell-bench-press"],
  [["Développé Couché (Haltère)", "Bench Press (Dumbbell)"], "dumbbell-bench-press"],
  [["Chest Press (Machine)"], "machine-bench-press"],
  [["Standing Calf Raise (Machine)", "Extension Mollets Debout (Machine)"], "standing-calf-raises"],
  [["Gainage"], "plank"],
  [["Rope Cable Curl", "Curl Poulie Basse Corde"], "cable-hammer-curls-rope-attachment"],
  [["Overhead Triceps Extension (Cable)", "Extension Triceps au-dessus de la Tête (Poulie)"], "cable-rope-overhead-triceps-extension"],
  [["Squat (Poids du Corps)"], "bodyweight-squat"],
  [["Squat (Barre)", "Squat (Barbell)"], "squat"],
  [["Soulevé de Terre (Barre)", "Deadlift (Barbell)"], "sdt"],
  [["Oiseau (Machine)"], "reverse-machine-flyes"],
  [["Extension Triceps Un Bras (Haltère)", "Single Arm Tricep Extension (Dumbbell)"], "dumbbell-one-arm-triceps-extension"],
  [["Développé Couché Décliné (Machine)", "Decline Bench Press (Machine)"], "leverage-decline-chest-press"],
  [["Machine Dips Assis", "Seated Dip Machine", "Dips Assis (Machine)"], "dip-machine"],
  [["Front Raise (Cable)", "Élévation Frontale (Poulie)", "Élévation Avant (Poulie)"], "front-cable-raise"],
];

// Équivalences PROBABLES (variante proche, pas identique) : à faire valider par Alex. NON BRANCHÉES : rien ne lit cette liste ;
// pour en valider une, la déplacer dans TABLE.
export const PROBABLES_HEVY: readonly (readonly [string, string])[] = [
  ["Pompes sur haltères", "pushups"],
  ["Pompes - Prisé Serrée", "push-ups-close-triceps-position"],
  ["Lateral Raise (Cable)", "cable-seated-lateral-raise"],
  ["Élévation Latérale (Poulie)", "cable-seated-lateral-raise"],
  ["Tirage Machine Convergente", "leverage-iso-row"],
  ["Curl Pupitre (Haltère)", "one-arm-dumbbell-preacher-curl"],
  ["Scissors", "scissor-kick"],
  ["Hip Raise", "bent-knee-hip-raise"],
  ["Cours HIIT", "hiit"],
  ["Rowing Bas (Suspension)", "suspended-row"],
];

export const CORRESPONDANCES_HEVY: ReadonlyMap<string, string> = new Map(
  TABLE.flatMap(([noms, slug]) => noms.map((n) => [normaliser(n), slug] as const)),
);

// Noms Hevy d'un même exercice (anglais / français) hors catalogue : l'API Hevy parle anglais, les exports anciens
// français. Le premier nom déjà connu de pepfit (alias de l'historique) l'emporte, sans créer de doublon.
const SYNONYMES: string[][] = [
  ["Push Up - Close Grip", "Pompes - Prisé Serrée", "Pompes - Prise Serrée"],
  ["Preacher Curl (Dumbbell)", "Curl Pupitre (Haltère)"],
  ["Low Row (Suspension)", "Rowing Bas (Suspension)"],
  ["Hip Thrust (Machine)", "Poussée de hanches (machine)"],
  ["Iso-Lateral Row (Machine)", "Tirage Machine Convergente"],
  ["Single Arm Lateral Raise (Cable)", "Élévation Latérale Un Bras (Poulie)", "Élévation latérale à un bras (câble)"],
];

export const SYNONYMES_HEVY: ReadonlyMap<string, string[]> = new Map(
  SYNONYMES.flatMap((g) => g.map((n) => [normaliser(n), g.filter((x) => x !== n)] as const)),
);
