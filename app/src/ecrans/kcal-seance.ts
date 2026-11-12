// Les kcal d'une séance, calculées par pepfit (décision du 31/10 : « le calcul des kcal dépensées doit se faire chez
// nous », comme l'Effort et la Récupération ; docs/KCAL-SEANCES.md). Une seule fonction, kcalSeance, pour la page Énergie,
// le bilan, les séances et l'activité détectée ; ses paramètres sont dans CALCUL_KCAL, constante unique et versionnée. Pur
// (sans React Native ni base) : tests/kcal-seance.test.ts.
//
// 1. Avec la FC enregistrée de la séance (capteur, Whoop en FC, Santé Connect : effort-charges.ts la garde minute par minute),
//    la formule de Keytel et al. (2005, J Sports Sci 23:289) minute par minute : sexe, poids, âge, FC. La FC au repos et la
//    FC max du profil bornent son domaine de validité : au-dessus de la FC max, un artefact (ramené à la FC max) ; sous la
//    « FC flex » (Spurr et al. 1988 : FC au repos + 30 % de la réserve), la FC ne suit plus la dépense et Keytel la
//    surestime : la dépense rejoint le repos en ligne droite, de la FC flex à la FC au repos.
// 2. Sans FC : les MET du sport (Compendium 2024), la durée et le poids, nuancés par le ressenti s'il existe. Sauna et bain
//    froid (famille « thermique », CALCUL_KCAL.auxMet) : toujours aux MET, même avec une FC, car la FC y monte par la
//    chaleur ou le froid, sans travail mécanique (décision du 31/10).
// 3. Toujours le net au-dessus du repos (le métabolisme de la durée est déjà dans le BMR du jour).
// 4. Le calcul à la FC est corrigé par famille de sport (CALCUL_KCAL.coefFc, docs/KCAL-CALIBRATION.md) : Keytel est établie
//    en effort continu ; la muscu et les efforts par à-coups élèvent la FC plus que la dépense, la natation l'abaisse. Puis
//    par le facteur personnel appris sur le téléphone face aux kcal d'un appareil (calibration.ts), s'il est actif.
// Les kcal de Whoop ou d'une montre n'entrent jamais ici : gardées 4 semaines pour le labo (kcal-comparaison.ts), jamais
// affichées.
import type { MotEffort } from "../boutique/poids";
import { DEFAUTS_PROFIL } from "./energie-precision";
import { aUneFamille, familleDe } from "./familles-table";
import { fcMaxTanaka } from "./zones-fc";

/** Séance pepfit sans FC et sans sport connu : musculation ≈ 5 MET. */
export const MET_MUSCULATION = 5;
/**
 * MET d'une séance sans FC, selon son sport (Compendium of Physical Activities, Herrmann et al. 2024, valeurs générales) :
 * la dépense suit le sport quand on le change (planche activite-detectee). Les autres : MET_MUSCULATION.
 */
export const MET_SPORT: Readonly<Record<string, number>> = {
  "cat:course": 9.8, "cat:bicycling": 7.5, "cat:natation": 5.8, "cat:randonnee": 6, "cat:marche": 3.5,
  "cat:padel": 6, "cat:tennis": 7.3, "cat:squash": 7.3, "cat:badminton": 5.5, "cat:football": 7, "cat:basketball": 6.5,
  "cat:crossfit": 8, "cat:cross-training": 8, "cat:hiit": 8, "cat:yoga": 2.5, "cat:pilates": 3, "cat:boxe": 7.8, "cat:escalade": 7.5,
  // sauna : repos assis (1) + 0,3 MET mesurés (Hannuksela et Ellahham 2001) ; bain froid : la dépense double environ en
  // quelques minutes dans l'eau à 10-15 °C, par le frisson (Šrámek et al. 2000 ; docs/KCAL-CALIBRATION.md § 1)
  "cat:sauna": 1.3, "cat:bain-froid": 2,
};

/** Sport d'une séance Santé Connect d'une autre appli (ExerciseSessionRecord.EXERCISE_TYPE_*) : ses MET sans FC. */
export const SPORT_SANTE: Readonly<Record<number, string>> = {
  2: "cat:badminton", 5: "cat:basketball", 8: "cat:bicycling", 9: "cat:bicycling", 36: "cat:hiit", 37: "cat:randonnee", 48: "cat:pilates",
  56: "cat:course", 57: "cat:course", 70: "cat:musculation", 73: "cat:natation", 74: "cat:natation", 76: "cat:tennis", 79: "cat:marche",
  81: "cat:musculation", 83: "cat:yoga",
};

/**
 * Famille d'une séance pour ses kcal à la FC : les cinq familles de l'appli (familles-sports.ts), « Sports et cours » détaillé
 * en raquette, collectif, combat et efforts par à-coups, la natation à part de l'endurance. « inconnue » : séance sans sport
 * (activité détectée), sans correction. « thermique » : sauna et bain froid, sortis de la récupération, calculés aux MET.
 */
export type FamilleKcal = "force" | "intermittent" | "raquette" | "collectif" | "combat" | "endurance" | "natation" | "autre" | "recup" | "thermique" | "inconnue";
export const FAMILLES_KCAL: readonly FamilleKcal[] = ["force", "intermittent", "raquette", "collectif", "combat", "endurance", "natation", "autre", "recup", "thermique", "inconnue"];

/** Sports détaillés (slugs du catalogue ; basketball et crossfit : ceux de Santé Connect et des MET). */
const DETAIL_KCAL: Readonly<Record<string, FamilleKcal>> = {
  ...Object.fromEntries(["tennis", "padel", "squash", "badminton", "tennis-de-table", "pickleball"].map((s) => [s, "raquette"])),
  ...Object.fromEntries(
    ["football", "football-americain", "football-australien", "football-gaelique", "hurling", "rugby", "basket", "basketball", "volley", "handball",
      "netball", "baseball", "softball", "cricket", "hockey-gazon", "hockey-glace", "lacrosse", "ultimate", "water-polo", "polo", "spikeball"].map((s) => [s, "collectif"]),
  ),
  ...Object.fromEntries(["boxe", "kickboxing", "arts-martiaux", "jiu-jitsu", "lutte", "escrime"].map((s) => [s, "combat"])),
  ...Object.fromEntries(["hiit", "cardio-boxe", "cross-training", "crossfit"].map((s) => [s, "intermittent"])),
  natation: "natation",
  sauna: "thermique",
  "bain-froid": "thermique",
};

/** Famille kcal d'un sport (`cat:<slug>`) ; null : séance sans sport. */
export function familleKcal(sportId: string | null | undefined): FamilleKcal {
  if (!sportId) return "inconnue";
  const slug = sportId.startsWith("cat:") ? sportId.slice(4) : sportId;
  const d = DETAIL_KCAL[slug];
  if (d) return d;
  if (!aUneFamille(sportId)) return "autre";
  const f = familleDe(sportId);
  return f === "dehors" || f === "interieur" ? "endurance" : f === "seance" ? "autre" : f;
}

/** Facteurs personnels actifs, par famille (calibration.ts) ; une famille absente : 1. */
export type FacteursKcal = Partial<Record<FamilleKcal, number>>;

/**
 * Paramètres du calcul : les changer change la version (rien n'est stocké en kcal : tout se recalcule à la lecture, depuis la
 * FC gardée, le sport, la durée et le profil du jour).
 */
export const CALCUL_KCAL = {
  version: 3,
  /** Keytel et al. 2005, sans VO2max : kJ/min = c + fc × FC + kg × poids + age × âge. */
  keytel: {
    h: { c: -55.0969, fc: 0.6309, kg: 0.1988, age: 0.2017 },
    f: { c: -20.4022, fc: 0.4472, kg: -0.1263, age: 0.074 },
  },
  kjParKcal: 4.184,
  /** FC flex = FC au repos + flex × (FC max − FC au repos). */
  flex: 0.3,
  /** FC au repos sans mesure (comme l'Effort). */
  fcReposDefaut: 60,
  /** FC plausible : un capteur envoie 0 quand il perd le contact. */
  fcPossible: [25, 250] as const,
  /** La FC doit couvrir 2 minutes et la moitié de la séance ; sinon sa FC moyenne (Whoop), sinon les MET. */
  fcMinMinutes: 2,
  couverture: 0.5,
  /** Ressenti des séries (« C'était comment ? ») : MET du sport × facteur (Compendium : musculation légère 3,5, vigoureuse 6). */
  ressenti: { facile: 0.7, bien: 1, dur: 1.2, max: 1.4 } as Record<MotEffort, number>,
  /**
   * Coefficient du calcul à la FC (sur le net au-dessus du repos), par famille (version 2, 31/10 ; sources et raisonnement :
   * docs/KCAL-CALIBRATION.md § 1). Keytel vaut pour l'effort continu (1) ; muscu et à-coups : la FC monte plus que la dépense
   * (efforts statiques, petites masses musculaires, FC qui reste haute dans les pauses) ; natation : FC plus basse à dépense
   * égale (position allongée, immersion). « thermique » : sans objet (1), la famille est calculée aux MET (auxMet).
   */
  coefFc: {
    force: 0.75, intermittent: 0.85, raquette: 0.8, collectif: 0.9, combat: 0.85, endurance: 1, natation: 1.1, autre: 0.9, recup: 0.5, thermique: 1, inconnue: 1,
  } as Record<FamilleKcal, number>,
  /**
   * Calcul aux MET, jamais à la FC, même si une FC existe (version 3, 31/10) : la FC monte sans travail mécanique (chaleur du
   * sauna, froid du bain). Ni coefficient, ni facteur personnel, ni calibration (séances jamais comparables).
   */
  auxMet: ["thermique"] as readonly FamilleKcal[],
  /**
   * Calibration personnelle (calibration.ts) : rapport mesure ÷ calcul des séances comparables, médiane des `fenetre`
   * dernières de la famille, active dès `seances`, pleine à `pleine` (avant : rapprochée de 1 au prorata), bornée.
   */
  calibration: { seances: 5, pleine: 10, fenetre: 20, min: 0.7, max: 1.3, plausible: [0.4, 2.5] as const, minutesMin: 15 },
} as const;

export interface CorpsKcal {
  sexe: "h" | "f" | null;
  kg: number | null;
  age: number | null;
  /** FC au repos et FC max du profil (zones de FC) ; null : 60 et Tanaka. */
  fcRepos?: number | null;
  fcMax?: number | null;
  /** Facteurs personnels actifs (calibration.ts), appliqués au calcul à la FC. */
  calibration?: FacteursKcal | null;
}

export type MethodeKcal = "fc" | "met";

export interface EntreeKcal {
  minutes: number;
  /** FC moyenne de chaque minute de la séance (0 ou null : minute sans FC) ; null : aucune. */
  fc?: readonly (number | null)[] | null;
  /** FC moyenne de toute la séance (Whoop, activité détectée), quand la FC minute par minute manque. */
  fcMoy?: number | null;
  sportId?: string | null;
  ressenti?: MotEffort | null;
}

export interface KcalSeance {
  /** Net au-dessus du repos (ce qui s'ajoute au métabolisme du jour). */
  kcal: number;
  /** Métabolisme de la durée compris (la dépense de la séance). */
  brutes: number;
  methode: MethodeKcal;
  famille: FamilleKcal;
  /** Coefficient de la famille et facteur personnel appliqués (1 et 1 aux MET). */
  coef: number;
  facteur: number;
}

const possible = (bpm: number | null | undefined): bpm is number =>
  bpm != null && bpm >= CALCUL_KCAL.fcPossible[0] && bpm <= CALCUL_KCAL.fcPossible[1];

/** Le corps du calcul, complété par l'adulte de référence (comme le métabolisme par défaut) : toujours une valeur. */
function corpsComplet(c: CorpsKcal) {
  const kg = c.kg != null && c.kg > 0 ? c.kg : DEFAUTS_PROFIL.kg[c.sexe ?? "inconnu"];
  const age = c.age != null && c.age > 0 ? c.age : DEFAUTS_PROFIL.age;
  const fcMax = c.fcMax != null && c.fcMax > 0 ? c.fcMax : fcMaxTanaka(age);
  const fcRepos = c.fcRepos != null && c.fcRepos > 0 && c.fcRepos < fcMax ? c.fcRepos : CALCUL_KCAL.fcReposDefaut;
  return { sexe: c.sexe, kg, age, fcMax, fcRepos };
}

/** Keytel (kcal brutes par minute, métabolisme compris) à une FC ; sexe inconnu : la moyenne des deux équations. */
export function keytelKcalMin(bpm: number, c: { sexe: "h" | "f" | null; kg: number; age: number }): number {
  const k = (e: { c: number; fc: number; kg: number; age: number }) => e.c + e.fc * bpm + e.kg * c.kg + e.age * c.age;
  const { h, f } = CALCUL_KCAL.keytel;
  const kj = c.sexe === "h" ? k(h) : c.sexe === "f" ? k(f) : (k(h) + k(f)) / 2;
  return Math.max(0, kj / CALCUL_KCAL.kjParKcal);
}

/** kcal nettes (au-dessus du repos) d'une minute à une FC, dans le domaine de Keytel (FC flex, FC max). */
export function netMinute(bpm: number, corps: CorpsKcal, bmrKcal: number): number {
  const c = corpsComplet(corps);
  const b = Math.min(bpm, c.fcMax);
  const repos = bmrKcal / 1440;
  const actif = (x: number) => Math.max(0, keytelKcalMin(x, c) - repos);
  const flex = c.fcRepos + CALCUL_KCAL.flex * (c.fcMax - c.fcRepos);
  if (b >= flex) return actif(b);
  if (b <= c.fcRepos) return 0;
  return (actif(flex) * (b - c.fcRepos)) / (flex - c.fcRepos);
}

/** FC moyenne de chaque minute de [debut, fin] (heure murale), 0 pour une minute sans FC : ce que garde effort-charges.ts. */
export function fcParMinute(points: readonly { t: number; bpm: number }[], debut: number, fin: number): number[] {
  const n = Math.max(0, Math.ceil((fin - debut) / 60_000));
  const somme = new Array<number>(n).fill(0);
  const nb = new Array<number>(n).fill(0);
  for (const p of points) {
    if (p.t < debut || p.t > fin || !possible(p.bpm)) continue;
    const i = Math.min(n - 1, Math.floor((p.t - debut) / 60_000));
    if (i < 0) continue;
    somme[i] = somme[i]! + p.bpm;
    nb[i] = nb[i]! + 1;
  }
  return somme.map((s, i) => (nb[i]! ? Math.round(s / nb[i]!) : 0));
}

/**
 * Les kcal d'une séance : la FC minute par minute, sinon sa FC moyenne, sinon les MET du sport (avec le ressenti) ; sauna et
 * bain froid, toujours les MET (CALCUL_KCAL.auxMet). À la FC, le
 * coefficient de la famille puis le facteur personnel (corps.calibration) corrigent le net.
 */
export function kcalSeance(e: EntreeKcal, corps: CorpsKcal, bmrKcal: number): KcalSeance {
  const minutes = Math.max(0, e.minutes);
  const repos = (bmrKcal / 1440) * minutes;
  const famille = familleKcal(e.sportId);
  const fin = (kcal: number, methode: MethodeKcal, coef = 1, facteur = 1): KcalSeance => ({ kcal, brutes: kcal + repos, methode, famille, coef, facteur });
  if (!(minutes > 0)) return fin(0, "met");
  const c = corpsComplet(corps);
  const auxMet = () => {
    const met = (MET_SPORT[e.sportId ?? ""] ?? MET_MUSCULATION) * (e.ressenti ? CALCUL_KCAL.ressenti[e.ressenti] : 1);
    return fin(Math.max(0, met * c.kg * (minutes / 60) - repos), "met");
  };
  if (CALCUL_KCAL.auxMet.includes(famille)) return auxMet();
  const aLaFc = (netMin: number) => {
    const coef = CALCUL_KCAL.coefFc[famille];
    const facteur = corps.calibration?.[famille] ?? 1;
    return fin(netMin * minutes * coef * facteur, "fc", coef, facteur);
  };
  const mesurees = (e.fc ?? []).filter(possible);
  if (mesurees.length >= CALCUL_KCAL.fcMinMinutes && mesurees.length >= CALCUL_KCAL.couverture * minutes) {
    // les minutes sans FC (trous) comptent à la moyenne des minutes mesurées
    return aLaFc(mesurees.reduce((a, b) => a + netMinute(b, corps, bmrKcal), 0) / mesurees.length);
  }
  if (possible(e.fcMoy)) return aLaFc(netMinute(e.fcMoy, corps, bmrKcal));
  return auxMet();
}
