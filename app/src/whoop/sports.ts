// Sport d'une séance Whoop → activité du catalogue pepfit (exercices.whoop_ids, outils/whoop_activites.py) : nom fr/en et picto
// de l'activité, famille de sport pour le rattachement, marches de faible effort. Fonctions pures (tests/whoop-seances.test.ts).
import { sportDeSeance } from "../db/sports";
import { baremeSport, chargeFc } from "../ecrans/effort-pepfit";
import type { Sport } from "../i18n/bienvenue";

/** Table « WHOOP Sports » de la doc de l'API v2 (developer.whoop.com/docs/developing/user-data/workout) : id → nom anglais. */
export const SPORTS_DOC: Readonly<Record<number, string>> = {
  [-1]: "Activity", 0: "Running", 1: "Cycling", 16: "Baseball", 17: "Basketball", 18: "Rowing", 19: "Fencing", 20: "Field Hockey",
  21: "Football", 22: "Golf", 24: "Ice Hockey", 25: "Lacrosse", 27: "Rugby", 28: "Sailing", 29: "Skiing", 30: "Soccer", 31: "Softball",
  32: "Squash", 33: "Swimming", 34: "Tennis", 35: "Track & Field", 36: "Volleyball", 37: "Water Polo", 38: "Wrestling", 39: "Boxing",
  42: "Dance", 43: "Pilates", 44: "Yoga", 45: "Weightlifting", 47: "Cross Country Skiing", 48: "Functional Fitness", 49: "Duathlon",
  51: "Gymnastics", 52: "Hiking/Rucking", 53: "Horseback Riding", 55: "Kayaking", 56: "Martial Arts", 57: "Mountain Biking",
  59: "Powerlifting", 60: "Rock Climbing", 61: "Paddleboarding", 62: "Triathlon", 63: "Walking", 64: "Surfing", 65: "Elliptical",
  66: "Stairmaster", 70: "Meditation", 71: "Other", 73: "Diving", 74: "Operations - Tactical", 75: "Operations - Medical",
  76: "Operations - Flying", 77: "Operations - Water", 82: "Ultimate", 83: "Climber", 84: "Jumping Rope", 85: "Australian Football",
  86: "Skateboarding", 87: "Coaching", 88: "Ice Bath", 89: "Commuting", 90: "Gaming", 91: "Snowboarding", 92: "Motocross", 93: "Caddying",
  94: "Obstacle Course Racing", 95: "Motor Racing", 96: "HIIT", 97: "Spin", 98: "Jiu Jitsu", 99: "Manual Labor", 100: "Cricket",
  101: "Pickleball", 102: "Inline Skating", 103: "Box Fitness", 104: "Spikeball", 105: "Wheelchair Pushing", 106: "Paddle Tennis",
  107: "Barre", 108: "Stage Performance", 109: "High Stress Work", 110: "Parkour", 111: "Gaelic Football", 112: "Hurling/Camogie",
  113: "Circus Arts", 121: "Massage Therapy", 123: "Strength Trainer", 125: "Watching Sports", 126: "Assault Bike", 127: "Kickboxing",
  128: "Stretching", 230: "Table Tennis", 231: "Badminton", 232: "Netball", 233: "Sauna", 234: "Disc Golf", 235: "Yard Work",
  236: "Air Compression", 237: "Percussive Massage", 238: "Paintball", 239: "Ice Skating", 240: "Handball", 248: "F45 Training",
  249: "Padel", 250: "Barry's", 251: "Dedicated Parenting", 252: "Stroller Walking", 253: "Stroller Jogging", 254: "Toddlerwearing",
  255: "Babywearing", 258: "Barre3", 259: "Hot Yoga", 261: "Stadium Steps", 262: "Polo", 263: "Musical Performance", 264: "Kite Boarding",
  266: "Dog Walking", 267: "Water Skiing", 268: "Wakeboarding", 269: "Cooking", 270: "Cleaning", 272: "Public Speaking",
};

/** Entrées techniques et vie courante (26/10) : jamais une séance. */
export const SPORTS_IGNORES: ReadonlySet<number> = new Set([-1, 71, 74, 75, 76, 77, 87, 89, 90, 93, 99, 108, 109, 125, 235, 251, 254, 255, 263, 269, 270, 272]);
/** Parmi les ignorés, ceux qui peuvent quand même enrichir une séance pepfit qu'ils chevauchent (activité non nommée). */
export const SPORTS_JOKERS: ReadonlySet<number> = new Set([-1, 71]);

/** Marche, marche avec poussette, promenade du chien : auto-détectées par Whoop. */
export const IDS_MARCHE: ReadonlySet<number> = new Set([63, 252, 266]);
/**
 * Sous cette charge de l'Effort pepfit (100 points, un Effort d'environ 4 : entre la marche tranquille, 2, et la séance
 * sérieuse, 5,5), une marche est celle de tous les jours : ses pas sont déjà dans la dépense (NEAT). Remplace le score de
 * Whoop (8), qui ne sert plus qu'à la comparaison du labo (31/10, D3).
 */
export const CHARGE_MARCHE_MIN = 100;

/**
 * Charge d'une activité Whoop (points de l'Effort pepfit) : sa FC, par les minutes que Whoop a comptées dans chaque zone (0 à
 * 5 ; la zone 0, sous 50 %, ne compte pas) ; sans elles, sa durée au barème de la marche. Jamais son score.
 */
export function chargeWhoop(w: { debut: number; fin: number; zones: readonly number[] | null }): number {
  if (w.zones && w.zones.length >= 6) return chargeFc(w.zones.slice(1, 6).map((z) => Number(z) || 0));
  return (Math.max(0, w.fin - w.debut) / 60_000) * baremeSport("cat:marche");
}

/** Les zones de Whoop gardées en base (JSON), null si absentes ou illisibles. */
export function zonesWhoop(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const z = JSON.parse(json) as unknown;
    return Array.isArray(z) ? z.map((x) => Number(x) || 0) : null;
  } catch {
    return null;
  }
}

/** Activité du catalogue qui porte un sport Whoop (exercices.whoop_ids). */
export interface ActiviteWhoop {
  id: string;
  slug: string | null;
  nom: string;
  nom_en: string | null;
  categorie: string | null;
  whoop_ids: string | null;
}

const norme = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\bmsk\b/g, " ").replace(/\s+/g, " ").trim();
const PAR_NOM = new Map(Object.entries(SPORTS_DOC).map(([id, nom]) => [norme(nom), Number(id)]));

/** sport_id de la séance, sinon celui de son sport_name (API v2 : « weightlifting_msk », « paddle_tennis »). */
export function idSport(sportId: number | null | undefined, sportName: string | null | undefined): number | null {
  if (sportId != null && Number.isFinite(sportId)) return sportId;
  return sportName ? (PAR_NOM.get(norme(sportName)) ?? null) : null;
}

/** sport_id → activité du catalogue. */
export function indexActivites(l: readonly ActiviteWhoop[]): Map<number, ActiviteWhoop> {
  const m = new Map<number, ActiviteWhoop>();
  for (const a of l) for (const x of (a.whoop_ids ?? "").split("|")) if (x !== "" && Number.isFinite(Number(x))) m.set(Number(x), a);
  return m;
}

/** Famille de sport pour le rattachement : celle de l'accueil (padel, course, muscu…), plus la marche. */
export type Famille = Sport | "marche";
const SLUGS_MARCHE = new Set(["marche", "randonnee"]);

export function familleExercices(l: readonly { slug: string | null; categorie: string | null; perso: number }[]): Famille {
  const s = sportDeSeance([...l]);
  if (s === "autre" && l.some((e) => e.slug != null && SLUGS_MARCHE.has(e.slug))) return "marche";
  return s;
}

/** Même famille, ou l'une des deux inconnue (« autre » : séance sans exercice, activité Whoop non nommée). */
export function famillesCompatibles(a: Famille, b: Famille): boolean {
  return a === b || a === "autre" || b === "autre";
}

export type SortSeance = "seance" | "marche-auto" | "ignoree";

/**
 * Ce que devient une séance Whoop sans séance pepfit à enrichir : une séance, ou rien. Une marche de faible effort (charge
 * sous CHARGE_MARCHE_MIN, chargeWhoop) est celle de tous les jours, déjà comptée par les pas : jamais une séance ni des kcal en
 * plus. La randonnée et une marche d'effort restent des séances.
 */
export function sortSeance(id: number | null, charge: number | null): SortSeance {
  if (id != null && SPORTS_IGNORES.has(id)) return "ignoree";
  if (id != null && IDS_MARCHE.has(id) && (charge ?? 0) < CHARGE_MARCHE_MIN) return "marche-auto";
  return "seance";
}
