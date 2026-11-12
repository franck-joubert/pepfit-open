import { minuit, PERMISSIONS, type NatifSante, type SessionSommeil } from "./logique";
import type { TypeMesureSante } from "./types";

// iPhone : HealthKit derrière le même contrat que le module Kotlin (NatifSante). Le Swift (modules/pepfit-sante/ios) ne fait
// que des accès bruts par identifiant HealthKit ; la correspondance Santé Connect → HealthKit (autorisations, types de séance,
// phases du sommeil, règles, unités) est ici, testée avec un faux module (tests/sante-ios.test.ts). docs/CODE-IOS-SANTE.md.

/** Échantillon HealthKit à plat (dates en ms). `valeur` : quantité dans l'unité du type (Swift, Types.swift), ou valeur de catégorie. */
export interface EchantillonHk {
  valeur: number;
  debut: number;
  fin: number;
  /** bundleIdentifier de la source (l'appli ou l'appareil qui a écrit). */
  origine: string;
  /** UUID HealthKit. */
  id: string;
  /** Règles : HKMetadataKeyMenstrualCycleStart (premier jour des règles). */
  debutCycle?: boolean;
}

export interface SeanceHk {
  debut: number;
  fin: number;
  /** HKWorkoutActivityType.rawValue. */
  activite: number;
  /** HKMetadataKeyIndoorWorkout. */
  interieur?: boolean;
  /** HKMetadataKeySwimmingLocationType : 1 piscine, 2 eau libre. */
  lieuNage?: number;
  titre?: string;
  origine: string;
}

/** Accès bruts du module Swift modules/pepfit-sante/ios. Dates en ms ; identifiants HealthKit en clair (HKQuantityTypeIdentifierStepCount…). */
export interface NatifHealthKit {
  /** HKHealthStore.isHealthDataAvailable(). */
  disponible(): boolean;
  /** Lecture : 0 inconnu, 1 jamais demandée, 2 déjà demandée (HealthKit ne dit jamais si une lecture est refusée). */
  statutsLecture(ids: string[]): Promise<number[]>;
  /** Écriture : 0 jamais demandée, 1 refusée, 2 autorisée. */
  statutsEcriture(ids: string[]): Promise<number[]>;
  /** Autorisations sans type HealthKit déjà demandées (gardées par le Swift dans UserDefaults). */
  marquees(): Promise<string[]>;
  /** Fenêtre d'autorisation de Santé ; les `marques` sont retenues une fois la demande faite. */
  demander(lecture: string[], ecriture: string[], marques: string[]): Promise<void>;
  quantites(id: string, debut: number, fin: number): Promise<EchantillonHk[]>;
  categories(id: string, debut: number, fin: number): Promise<EchantillonHk[]>;
  /** Somme cumulée de chaque intervalle [bornes[i], bornes[i+1]] ; -1 sans donnée. */
  sommes(id: string, bornes: number[]): Promise<number[]>;
  /** Sommes par heure ou par jour (calendrier local) de [debut, fin] : [début, fin, somme] des seules tranches avec une donnée. */
  sommesGroupees(id: string, debut: number, fin: number, pas: "heure" | "jour"): Promise<[number, number, number][]>;
  /** bundleIdentifier des sources qui ont écrit ce type sur l'intervalle (HKSourceQuery). */
  sources(id: string, debut: number, fin: number): Promise<string[]>;
  seances(debut: number, fin: number): Promise<SeanceHk[]>;
  /** HKWorkout musculation ; même `id` (HKMetadataKeySyncIdentifier) = la séance est remplacée. */
  exporter(debut: number, fin: number, titre: string, id: string): Promise<void>;
  /** Ouvre l'appli Santé (sinon les réglages de pepfit). */
  ouvrirSante(): Promise<void>;
}

export const HK = {
  poids: "HKQuantityTypeIdentifierBodyMass",
  pas: "HKQuantityTypeIdentifierStepCount",
  sommeil: "HKCategoryTypeIdentifierSleepAnalysis",
  fcRepos: "HKQuantityTypeIdentifierRestingHeartRate",
  fc: "HKQuantityTypeIdentifierHeartRate",
  seance: "HKWorkoutTypeIdentifier",
  gras: "HKQuantityTypeIdentifierBodyFatPercentage",
  maigre: "HKQuantityTypeIdentifierLeanBodyMass",
  bmr: "HKQuantityTypeIdentifierBasalEnergyBurned",
  vfc: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  respiration: "HKQuantityTypeIdentifierRespiratoryRate",
  kcalActives: "HKQuantityTypeIdentifierActiveEnergyBurned",
  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  taille: "HKQuantityTypeIdentifierHeight",
  regles: "HKCategoryTypeIdentifierMenstrualFlow",
} as const;

/**
 * Autorisation Santé Connect (chaîne de PERMISSIONS) → types HealthKit à lire et à écrire. Sans type (masse osseuse, eau,
 * historique) : rien à demander à HealthKit, l'autorisation est retenue une fois demandée et les lectures rendent une liste vide.
 */
export const CORRESPONDANCE: Record<string, { lecture: string[]; ecriture: string[] }> = {
  [PERMISSIONS.poids]: { lecture: [HK.poids], ecriture: [] },
  [PERMISSIONS.pas]: { lecture: [HK.pas], ecriture: [] },
  [PERMISSIONS.sommeil]: { lecture: [HK.sommeil], ecriture: [] },
  [PERMISSIONS["frequence-cardiaque"]]: { lecture: [HK.fcRepos], ecriture: [] },
  [PERMISSIONS.seances]: { lecture: [], ecriture: [HK.seance] },
  [PERMISSIONS.gras]: { lecture: [HK.gras], ecriture: [] },
  [PERMISSIONS.maigre]: { lecture: [HK.maigre], ecriture: [] },
  [PERMISSIONS.os]: { lecture: [], ecriture: [] },
  [PERMISSIONS.eau]: { lecture: [], ecriture: [] },
  [PERMISSIONS.bmr]: { lecture: [HK.bmr], ecriture: [] },
  [PERMISSIONS.vfc]: { lecture: [HK.vfc], ecriture: [] },
  [PERMISSIONS.respiration]: { lecture: [HK.respiration], ecriture: [] },
  [PERMISSIONS.sport]: { lecture: [HK.seance], ecriture: [] },
  [PERMISSIONS["kcal-actives"]]: { lecture: [HK.kcalActives], ecriture: [] },
  [PERMISSIONS.distance]: { lecture: [HK.distance], ecriture: [] },
  [PERMISSIONS.taille]: { lecture: [HK.taille], ecriture: [] },
  [PERMISSIONS["fc-montre"]]: { lecture: [HK.fc], ecriture: [] },
  [PERMISSIONS.regles]: { lecture: [HK.regles], ecriture: [] },
  [PERMISSIONS.historique]: { lecture: [], ecriture: [] },
};

/**
 * HKWorkoutActivityType.rawValue → ExerciseSessionRecord.EXERCISE_TYPE_* (0 : autre). Course, vélo et aviron en intérieur
 * (HKMetadataKeyIndoorWorkout) et nage en eau libre (HKMetadataKeySwimmingLocationType) : voir typeSeance.
 */
export const SPORT_HK: Readonly<Record<number, number>> = {
  1: 28, // americanFootball → FOOTBALL_AMERICAN
  3: 29, // australianFootball → FOOTBALL_AUSTRALIAN
  4: 2, // badminton
  5: 4, // baseball
  6: 5, // basketball
  8: 11, // boxing
  9: 51, // climbing → ROCK_CLIMBING
  10: 14, // cricket
  11: 10, // crossTraining → BOOT_CAMP
  13: 8, // cycling → BIKING
  14: 16, // dance → DANCING
  15: 16, // danceInspiredTraining
  16: 25, // elliptical
  18: 27, // fencing
  20: 70, // functionalStrengthTraining → STRENGTH_TRAINING
  21: 32, // golf
  22: 34, // gymnastics
  23: 35, // handball
  24: 37, // hiking
  25: 38, // hockey → ICE_HOCKEY
  28: 44, // martialArts
  31: 46, // paddleSports → PADDLING
  33: 71, // preparationAndRecovery → STRETCHING
  34: 50, // racquetball
  35: 53, // rowing
  36: 55, // rugby
  37: 56, // running
  38: 58, // sailing
  39: 60, // skatingSports → SKATING
  40: 61, // snowSports → SKIING
  41: 64, // soccer
  42: 65, // softball
  43: 66, // squash
  44: 68, // stairClimbing
  45: 72, // surfingSports
  46: 74, // swimming → SWIMMING_POOL
  47: 75, // tableTennis
  48: 76, // tennis
  50: 70, // traditionalStrengthTraining → STRENGTH_TRAINING
  51: 78, // volleyball
  52: 79, // walking
  54: 80, // waterPolo
  56: 44, // wrestling → MARTIAL_ARTS
  57: 83, // yoga
  58: 26, // barre → EXERCISE_CLASS
  59: 13, // coreTraining → CALISTHENICS
  60: 61, // crossCountrySkiing → SKIING
  61: 61, // downhillSkiing → SKIING
  62: 71, // flexibility → STRETCHING
  63: 36, // highIntensityIntervalTraining
  65: 44, // kickboxing → MARTIAL_ARTS
  66: 48, // pilates
  67: 62, // snowboarding
  68: 68, // stairs → STAIR_CLIMBING
  69: 68, // stepTraining → STAIR_CLIMBING
  70: 82, // wheelchairWalkPace → WHEELCHAIR
  71: 82, // wheelchairRunPace → WHEELCHAIR
  75: 31, // discSports → FRISBEE_DISC
  77: 16, // cardioDance → DANCING
  78: 16, // socialDance → DANCING
  84: 59, // underwaterDiving → SCUBA_DIVING
};

/** Type Santé Connect d'une séance HealthKit. */
export function typeSeance(s: Pick<SeanceHk, "activite" | "interieur" | "lieuNage">): number {
  if (s.interieur) {
    if (s.activite === 37) return 57; // RUNNING_TREADMILL
    if (s.activite === 13) return 9; // BIKING_STATIONARY
    if (s.activite === 35) return 54; // ROWING_MACHINE
  }
  if (s.activite === 46 && s.lieuNage === 2) return 73; // SWIMMING_OPEN_WATER
  return SPORT_HK[s.activite] ?? 0;
}

/** HKCategoryValueSleepAnalysis → stade Santé Connect (SleepSessionRecord.STAGE_TYPE_*) ; inBed (0) n'est pas un stade. */
export const ETAPE_HK: Readonly<Record<number, number>> = {
  1: 2, // asleepUnspecified → SLEEPING
  2: 1, // awake → AWAKE
  3: 4, // asleepCore → LIGHT
  4: 5, // asleepDeep → DEEP
  5: 6, // asleepREM → REM
};
const ENDORMI = new Set([1, 3, 4, 5]);
const PHASES = new Set([3, 4, 5]);

const HEURE = 3_600_000;
const JOUR = 86_400_000;
/** Deux échantillons de sommeil d'une même source à moins d'une heure l'un de l'autre font la même session. */
export const ECART_SESSION_MS = HEURE;
/** La lecture du sommeil commence 12 h avant la plage : une nuit commencée avant y garde son début (Santé Connect rend la session entière). */
export const MARGE_SOMMEIL_MS = 12 * HEURE;

/**
 * HealthKit n'a pas de sessions de sommeil, seulement des échantillons (au lit, endormi, phases, éveil) : on les regroupe par
 * source, puis on fait une session par groupe. Bornes : endormi et éveils s'il y en a, sinon le temps au lit. Stades : seulement
 * si la source donne les phases (Apple Watch, iOS 16) ; sans phases, la session est la durée endormie. Une session sans aucun
 * échantillon « endormi » (le seul temps au lit de l'iPhone) est écartée si une autre source a dormi en même temps.
 */
export function sessionsSommeilHk(echantillons: EchantillonHk[]): SessionSommeil[] {
  const parSource = new Map<string, EchantillonHk[]>();
  for (const e of echantillons) if (e.fin >= e.debut) parSource.set(e.origine, [...(parSource.get(e.origine) ?? []), e]);
  const sessions: (SessionSommeil & { endormi: boolean })[] = [];
  for (const [origine, l] of parSource) {
    const groupes: { fin: number; l: EchantillonHk[] }[] = [];
    for (const e of [...l].sort((a, b) => a.debut - b.debut)) {
      const g = groupes[groupes.length - 1];
      if (g && e.debut <= g.fin + ECART_SESSION_MS) {
        g.l.push(e);
        g.fin = Math.max(g.fin, e.fin);
      } else groupes.push({ fin: e.fin, l: [e] });
    }
    for (const g of groupes) {
      const dormi = g.l.filter((e) => e.valeur in ETAPE_HK);
      const endormi = dormi.some((e) => ENDORMI.has(e.valeur));
      const bornes = endormi ? dormi : g.l;
      const etapes = g.l.some((e) => PHASES.has(e.valeur)) ? dormi.map((e) => ({ debut: e.debut, fin: e.fin, type: ETAPE_HK[e.valeur]! })) : [];
      sessions.push({
        debut: Math.min(...bornes.map((e) => e.debut)),
        fin: Math.max(...bornes.map((e) => e.fin)),
        origine,
        etapes,
        endormi,
      });
    }
  }
  return sessions
    .filter((s) => s.endormi || !sessions.some((x) => x.endormi && x.debut < s.fin && x.fin > s.debut))
    .map(({ endormi: _, ...s }) => s);
}

/** HKCategoryValueMenstrualFlow → MenstruationFlowRecord.FLOW_* ; none (5, « pas de flux ») n'est pas un jour de règles. */
export const FLUX_HK: Readonly<Record<number, number>> = {
  1: 0, // unspecified → FLOW_UNKNOWN
  2: 1, // light → FLOW_LIGHT
  3: 2, // medium → FLOW_MEDIUM
  4: 3, // heavy → FLOW_HEAVY
};
/** Lecture des règles depuis 15 jours avant la plage : des règles commencées avant y gardent leur premier jour. */
export const MARGE_REGLES_MS = 15 * JOUR;
/** Un jour sans saisie entre deux jours de règles ne coupe pas les règles ; deux, si (changement d'heure compris). */
const ECART_REGLES_MS = 1.5 * JOUR;

/**
 * HealthKit n'a que des jours de flux (pas de période) : des jours qui se suivent font une période, coupée par un premier jour
 * marqué (HKMetadataKeyMenstrualCycleStart) ou par deux jours sans saisie. Fin d'une période : la fin de son dernier jour.
 */
export function reglesHk(echantillons: EchantillonHk[], debut: number, fin: number) {
  const jours = echantillons.filter((e) => e.valeur in FLUX_HK).sort((a, b) => a.debut - b.debut);
  const periodes: { debut: number; fin: number; id: string }[] = [];
  for (const e of jours) {
    const finJour = Math.max(e.fin, minuit(e.debut, 1));
    const p = periodes[periodes.length - 1];
    if (p && !e.debutCycle && e.debut - p.fin <= ECART_REGLES_MS) p.fin = Math.max(p.fin, finJour);
    else periodes.push({ debut: e.debut, fin: finJour, id: e.id });
  }
  return {
    periodes: periodes.filter((p) => p.fin >= debut && p.debut <= fin),
    flux: jours.map((e) => ({ date: e.debut, flux: FLUX_HK[e.valeur]!, id: e.id })),
  };
}

/**
 * Métabolisme de base : Santé Connect en donne un débit (kcal/j), HealthKit l'énergie de base dépensée (kcal, par tranches).
 * Une mesure par jour entier écoulé : la somme du jour, datée de midi ; le jour en cours n'en est pas une.
 */
async function bmrParJour(hk: NatifHealthKit, debut: number, fin: number) {
  const jours = await hk.sommesGroupees(HK.bmr, minuit(debut), fin, "jour");
  return jours
    .filter(([a, b, v]) => b <= fin && a + JOUR / 2 >= debut && v > 0)
    .map(([a, , v]) => ({ valeur: v, date: a + JOUR / 2, origine: "" }));
}

/** Mesures d'un type : HealthKit n'a ni masse osseuse ni masse d'eau (liste vide, comme sans donnée). */
const MESURE_HK: Partial<Record<Exclude<TypeMesureSante, "fc">, { id: string; facteur: number }>> = {
  gras: { id: HK.gras, facteur: 100 }, // HKUnit.percent() rend une fraction (0,18) ; Santé Connect un pourcentage (18)
  maigre: { id: HK.maigre, facteur: 1 },
  vfc: { id: HK.vfc, facteur: 1 },
  respiration: { id: HK.respiration, facteur: 1 },
  taille: { id: HK.taille, facteur: 1 },
};

const unique = (l: string[]) => [...new Set(l)];

/** NatifSante branché sur HealthKit : même contrat que le module Kotlin, les mêmes valeurs aux mêmes clés. */
export function natifDepuisHealthKit(hk: NatifHealthKit): NatifSante {
  const autorisees = async (): Promise<string[]> => {
    const perms = Object.keys(CORRESPONDANCE);
    const lecture = unique(perms.flatMap((p) => CORRESPONDANCE[p]!.lecture));
    const ecriture = unique(perms.flatMap((p) => CORRESPONDANCE[p]!.ecriture));
    const [sl, se, marquees] = await Promise.all([hk.statutsLecture(lecture), hk.statutsEcriture(ecriture), hk.marquees()]);
    const lu = new Set(lecture.filter((_, i) => sl[i] === 2));
    const ecrit = new Set(ecriture.filter((_, i) => se[i] === 2));
    const marques = new Set(marquees);
    return perms.filter((p) => {
      const c = CORRESPONDANCE[p]!;
      if (!c.lecture.length && !c.ecriture.length) return marques.has(p);
      return c.lecture.every((id) => lu.has(id)) && c.ecriture.every((id) => ecrit.has(id));
    });
  };
  const quantites = (id: string, debut: number, fin: number) => hk.quantites(id, debut, fin);

  return {
    statut: async () => (hk.disponible() ? 3 : 1),
    autorisees,
    // HealthKit garde tout l'historique : rien à demander de plus (la permission « historique » est sans type, retenue une fois demandée)
    historiquePossible: async () => true,
    demander: async (permissions) => {
      const connues = permissions.filter((p) => p in CORRESPONDANCE);
      const lecture = unique(connues.flatMap((p) => CORRESPONDANCE[p]!.lecture));
      const ecriture = unique(connues.flatMap((p) => CORRESPONDANCE[p]!.ecriture));
      const marques = connues.filter((p) => !CORRESPONDANCE[p]!.lecture.length && !CORRESPONDANCE[p]!.ecriture.length);
      if (connues.length) await hk.demander(lecture, ecriture, marques);
      const a = new Set(await autorisees());
      return permissions.filter((p) => a.has(p));
    },
    poids: async (debut, fin) => (await quantites(HK.poids, debut, fin)).map((e) => ({ kg: e.valeur, date: e.debut, origine: e.origine })),
    pas: (bornes) => hk.sommes(HK.pas, bornes),
    pasHeures: async (debut, fin) => (await hk.sommesGroupees(HK.pas, debut, fin, "heure")).map(([t, , v]): [number, number] => [t, v]),
    originesPas: (debut, fin) => hk.sources(HK.pas, debut, fin),
    sommeil: async (debut, fin) => sessionsSommeilHk(await hk.categories(HK.sommeil, debut - MARGE_SOMMEIL_MS, fin)).filter((s) => s.fin > debut && s.debut < fin),
    frequenceRepos: async (debut, fin) => (await quantites(HK.fcRepos, debut, fin)).map((e) => ({ bpm: e.valeur, date: e.debut, origine: e.origine })),
    fc: async (debut, fin) =>
      (await quantites(HK.fc, debut, fin))
        .filter((e) => e.debut >= debut && e.debut <= fin)
        .sort((a, b) => a.debut - b.debut)
        .map((e) => ({ t: e.debut, bpm: e.valeur })),
    mesures: async (type, debut, fin) => {
      if (type === "bmr") return bmrParJour(hk, debut, fin);
      const m = MESURE_HK[type];
      return m ? (await quantites(m.id, debut, fin)).map((e) => ({ valeur: e.valeur * m.facteur, date: e.debut, origine: e.origine })) : [];
    },
    regles: async (debut, fin) => reglesHk(await hk.categories(HK.regles, debut - MARGE_REGLES_MS, fin), debut, fin),
    seancesSport: async (debut, fin) =>
      (await hk.seances(debut, fin)).map((s) => ({ debut: s.debut, fin: s.fin, type: typeSeance(s), titre: s.titre ?? null, origine: s.origine })),
    kcalActives: (bornes) => hk.sommes(HK.kcalActives, bornes),
    distance: (bornes) => hk.sommes(HK.distance, bornes),
    exporter: (debut, fin, titre, id) => hk.exporter(debut, fin, titre, id),
    // iOS ne dit pas quelles applis sont installées (paquets Android de toute façon) ; « partage » vient des pesées lues
    installees: async () => [],
    ouvrir: () => hk.ouvrirSante(),
  };
}
