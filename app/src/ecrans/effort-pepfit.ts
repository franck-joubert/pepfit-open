// L'Effort pepfit (planche effort-pepfit, variante C validée le 31/10, avec ses corrections : aucune unité, le
// chiffre seul ; aucun texte d'objectif sur les jauges ; jamais « / 10 » ni maximum, l'échelle est ouverte). Pur (sans React
// Native ni base) : testé par tests/effort-pepfit.test.ts. Les lectures en base sont dans effort-charges.ts.
//
// 1. La charge d'une séance, en points (NOTES § 2.1) : on la stocke, jamais le score.
//    - avec la FC : TRIMP d'Edwards (1993), minutes dans chaque zone de l'appli × 1 à 5 ; sous Z1, rien ;
//    - sans FC : sRPE de Foster (2001), durée × poids du ressenti (Facile 1,5, Bien 2,5, Dur 3,5, Max 4,5 : D4) ;
//    - ni l'un ni l'autre : le barème du sport, avec « ~ ».
//    La muscu (famille « force ») se mesure à ses séries (effort-muscu.ts, 03/11) : chaque série pèse selon l'exercice, sa
//    proximité de l'échec face à la référence de l'athlète et son habitude ; le ressenti en fait la moitié quand il est dit,
//    la FC s'y ajoute (en entier depuis le recalage sur Whoop du 03/11). Un exercice sans série notée compte une série
//    prudente, avec « ~ ». Sans séries : le ressenti, même avec la FC (D3) ; sans ressenti, la FC, avec « ~ ».
// 2. Du point au score, une seule courbe (§ 2.2, D2) : score = 10 ÷ (1 + (140 ÷ charge)^1,25), 140 points = 5. Ses paramètres
//    sont dans COURBE_EFFORT, constante unique et versionnée : la changer recalcule tout (historique, semaines, cibles, repères).
// 3. La journée additionne les points, jamais les scores (§ 2.4) ; la semaine, même courbe au milieu de 5 × 140, plus
//    l'activité d'une semaine ordinaire (D6, recalée le 31/10 : docs/EFFORT-ACTIVITE.md § 6).
// 4. La cible du jour (§ 5), en charge, puis sur la courbe, réglée par la Récupération pepfit (recup-pepfit.ts, formeCible) ;
//    l'anneau la suit (D7). Le rythme de la semaine (§ 6, D8).
// Whoop n'entre jamais ici : son score n'est gardé que pour la comparaison du labo (src/app/labo/effort.tsx).
import type { MotEffort } from "../boutique/poids";
import { rirDeRpe, motDeRir } from "../boutique/poids";
import { compteDansEffort, familleDe } from "./familles-sports";
import { CHARGE_MUSCU, type EffortSeries } from "./effort-muscu";

// ---------------------------------------------------------------- la courbe

export interface CourbeEffort {
  /** Change à chaque réglage : la courbe d'avant ne sert plus nulle part (rien n'est stocké en score). */
  version: number;
  /** Paramètre de calcul seulement : l'interface ne l'écrit jamais. */
  echelle: number;
  /** Charge qui fait la moitié de l'échelle (5). */
  milieu: number;
  pente: number;
  /** La semaine : même courbe, au milieu de `semaine` × `milieu`. */
  semaine: number;
}

/**
 * Le milieu de la semaine (31/10, D1) : cinq séances sérieuses (5 × 140 = 700 points), plus l'activité hors séances
 * d'une semaine ordinaire, 7 jours à 8 000 pas au barème des pas (7 × 8 000 × 0,0048 = 268,8 points, CHARGE_ACTIVITE.parPas) :
 * 968,8 points font 5, et une semaine « séances + activité » garde le sens qu'avait une semaine de séances seules.
 */
export const MILIEU_SEMAINE = 5 * 140 + 7 * 8_000 * 0.0048;

/** La courbe (D2 ; version 2 : semaine recalée avec l'activité). La recaler sur un mois de vraies semaines ne touche que cette constante. */
export const COURBE_EFFORT: CourbeEffort = { version: 2, echelle: 10, milieu: 140, pente: 1.25, semaine: MILIEU_SEMAINE / 140 };

/** Le score d'une charge (non arrondi) : l'unique fonction de score de l'appli. */
export function scoreEffort(charge: number, courbe: CourbeEffort = COURBE_EFFORT): number {
  return charge > 0 ? courbe.echelle / (1 + Math.pow(courbe.milieu / charge, courbe.pente)) : 0;
}

/** Le score d'une semaine (charge des 7 jours) : la même fonction, au milieu de la semaine (D6). */
export function scoreSemaine(charge: number, courbe: CourbeEffort = COURBE_EFFORT): number {
  return scoreEffort(charge, { ...courbe, milieu: courbe.milieu * courbe.semaine });
}

/** La charge qui donne un score (l'inverse de scoreEffort) ; au bout de l'échelle, l'infini. */
export function chargeDeScore(score: number, courbe: CourbeEffort = COURBE_EFFORT): number {
  if (!(score > 0)) return 0;
  if (score >= courbe.echelle) return Infinity;
  return courbe.milieu / Math.pow(courbe.echelle / score - 1, 1 / courbe.pente);
}

/** Un score arrondi au dixième, comme il s'affiche (« 7,1 »). */
export const arrondiEffort = (score: number): number => Math.round(score * 10) / 10;

/** Repères du tiroir « Comprendre l'Effort » (§ 1, D9) : définis par leur charge, leur score suit la courbe. */
export const REPERES_EFFORT = [
  { cle: "marche", charge: 45 },
  { cle: "seance", charge: 165 },
  { cle: "dure", charge: 330 },
  { cle: "marathon", charge: 780 },
] as const;
export type CleRepere = (typeof REPERES_EFFORT)[number]["cle"];

/** Score arrondi au demi-point (les repères du tiroir, les bornes de la cible). */
export const demiPoint = (x: number): number => Math.round(x * 2) / 2;

// ---------------------------------------------------------------- la charge d'une séance

/**
 * Paramètres de la charge (D3, D4) : les changer change la version, et chaque séance est recalculée au lancement suivant
 * (effort-charges.ts). Barème sans FC ni ressenti : points par minute d'après l'intensité habituelle du sport (≈ la zone où
 * il se pratique le plus : course 3,2 en Z3-Z4, musculation 2,5 comme un ressenti « Bien », marche 1 en Z1).
 */
export const CHARGE_EFFORT = {
  // 2 : FC espacée tolérée selon sa source (trouFcS, docs/SANS-WHOOP.md C3) ; 3 : la muscu à ses séries (CHARGE_MUSCU) ;
  // 4 : recalage sur le Pull d'Alex face à Whoop, exercices sans séries notées (docs/CODE-EFFORT-CHARGE.md § 5) ;
  // 5 : le tirage bras tendus en isolation, l'isolation d'un gros muscle à 0,85 (§ 5 bis)
  version: 5,
  zones: [1, 2, 3, 4, 5],
  ressenti: { facile: 1.5, bien: 2.5, dur: 3.5, max: 4.5 } as Record<MotEffort, number>,
  bareme: {
    "cat:course": 3.2,
    "cat:bicycling": 2.6,
    "cat:crossfit": 3,
    "cat:cross-training": 3,
    "cat:hiit": 3.2,
    "cat:pilates": 0.6,
    "cat:natation": 2.8,
    "cat:musculation": 2.5,
    "cat:randonnee": 1.8,
    "cat:marche": 1,
    "cat:yoga": 0.6,
    "cat:padel": 2.6,
    "cat:tennis": 2.6,
    "cat:football": 2.6,
    "cat:basket": 2.6,
    "cat:basketball": 2.6,
  } as Record<string, number>,
  baremeDefaut: 2,
  /** Moins de 2 minutes de FC dans les zones : on ne s'y fie pas. */
  fcMinMinutes: 2,
  /** Part de la séance que la FC doit couvrir pour la mesurer. */
  couvertureFc: 0.5,
  /**
   * Temps qu'un échantillon de FC couvre au plus (s), selon sa source : le capteur en direct envoie chaque seconde (10 s,
   * comme le bloc d'effort) ; une montre par Santé Connect ou Whoop peut n'écrire qu'une FC par minute (Samsung, Xiaomi, Polar
   * au quotidien, tout mode économie) : 90 s, sans quoi 45 min de course faisaient 7,4 min en zones, donc le barème.
   */
  trouFcS: { capteur: 10, whoop: 90, sante: 90 },
} as const;

/** Points par minute du barème d'un sport. */
export const baremeSport = (sportId: string | null): number => CHARGE_EFFORT.bareme[sportId ?? ""] ?? CHARGE_EFFORT.baremeDefaut;

/** Charge avec la FC (Edwards) : minutes de Z1 à Z5 × 1 à 5. */
export function chargeFc(minutes: readonly number[]): number {
  return CHARGE_EFFORT.zones.reduce((t, poids, k) => t + Math.max(0, minutes[k] ?? 0) * poids, 0);
}

/** Charge au ressenti (Foster) : durée × poids du ressenti. */
export const chargeRessenti = (mot: MotEffort, minutes: number): number => Math.max(0, minutes) * CHARGE_EFFORT.ressenti[mot];

/**
 * Le ressenti d'une séance : celui de ses séries de travail (« C'était comment ? », colonne rpe), le mot du milieu (la médiane,
 * vers le plus dur à égalité). null : aucune série dite.
 */
export function ressentiDeSeance(rpes: readonly (number | null | undefined)[]): MotEffort | null {
  const ordre: MotEffort[] = ["facile", "bien", "dur", "max"];
  const mots = rpes.map((r) => motDeRir(rirDeRpe(r))).filter((m): m is MotEffort => m != null).map((m) => ordre.indexOf(m)).sort((a, b) => a - b);
  return mots.length ? ordre[mots[mots.length >> 1]!]! : null;
}

export type MethodeCharge = "fc" | "ressenti" | "bareme";

export interface ChargeSeance {
  charge: number;
  methode: MethodeCharge;
  /** « ~ » : le barème, ou la FC d'une séance de muscu sans ressenti (D3). */
  estime: boolean;
  /** Durée hors pauses (min). */
  minutes: number;
  /** Minutes de Z1 à Z5 (méthode « fc »). */
  zones?: number[];
  /** Le ressenti retenu (méthode « ressenti », ou mêlé aux séries). */
  ressenti?: MotEffort;
  /**
   * Muscu mesurée à ses séries : leurs points (ressenti mêlé, habitude comprise), et combien de séries. `methode` dit alors ce
   * qui s'y ajoute : « fc » (le cœur, pour moitié), « ressenti » (sans FC), « bareme » (les séries seules).
   */
  muscu?: number;
  series?: number;
}

export interface MesureSeance {
  sportId: string | null;
  minutes: number;
  /** Minutes de Z1 à Z5 de la FC de la séance (minutesParZone), null sans FC. */
  zones: readonly number[] | null;
  ressenti: MotEffort | null;
  /** Les séries de force de la séance (effortSeries), null ou absent sans séries. */
  series?: EffortSeries | null;
}

/** La charge d'une séance ; null pour une séance de récupération (D5) ou sans durée. */
export function chargeSeance(m: MesureSeance): ChargeSeance | null {
  if (m.sportId && !compteDansEffort(familleDe(m.sportId))) return null;
  const minutes = Math.max(0, m.minutes);
  if (!(minutes > 0)) return null;
  const force = familleDe(m.sportId ?? "cat:musculation") === "force";
  const minFc = m.zones ? m.zones.reduce((a, b) => a + b, 0) : 0;
  const fcSure = minFc >= CHARGE_EFFORT.fcMinMinutes && minFc >= CHARGE_EFFORT.couvertureFc * minutes;
  const parRessenti = (mot: MotEffort): ChargeSeance => ({ charge: chargeRessenti(mot, minutes), methode: "ressenti", estime: false, minutes, ressenti: mot });
  const parFc = (estime: boolean): ChargeSeance => ({ charge: chargeFc(m.zones!), methode: "fc", estime, minutes, zones: [...m.zones!] });
  if (force && m.series && m.series.points > 0) return parSeries(m, m.series, minutes, fcSure);
  if (force && m.ressenti) return parRessenti(m.ressenti);
  if (fcSure) return parFc(force);
  if (m.ressenti) return parRessenti(m.ressenti);
  return { charge: minutes * baremeSport(m.sportId), methode: "bareme", estime: true, minutes };
}

/**
 * Muscu à ses séries : leurs points, mêlés pour moitié au ressenti s'il est dit (Foster) ; la FC sûre s'y ajoute (partFc),
 * jamais moins que la FC seule (un circuit où le cœur monte reste mesuré comme un sport). « ~ », sans ressenti de séance :
 * plus de la moitié des points sans repère (ni ressenti ni référence), ou un exercice sans série notée.
 */
function parSeries(m: MesureSeance, s: EffortSeries, minutes: number, fcSure: boolean): ChargeSeance {
  const r = m.ressenti ? chargeRessenti(m.ressenti, minutes) : null;
  const muscu = r == null ? s.points : (1 - CHARGE_MUSCU.partRessenti) * s.points + CHARGE_MUSCU.partRessenti * r;
  const estime = !m.ressenti && (s.sansRepere > 0.5 || s.estimes > 0);
  const commun = { estime, minutes, muscu, series: s.series, ...(m.ressenti ? { ressenti: m.ressenti } : {}) };
  if (fcSure) {
    const fc = chargeFc(m.zones!);
    return { ...commun, charge: Math.max(fc, muscu + CHARGE_MUSCU.partFc * fc), methode: "fc", zones: [...m.zones!] };
  }
  return { ...commun, charge: muscu, methode: m.ressenti ? "ressenti" : "bareme" };
}

/**
 * La part musculaire et la part cardio d'une séance mesurée à ses séries et à la FC (l'indicateur en lecture seule de la
 * séance) : ce que les séries apportent, le reste vient du cœur. null sans FC ou sans séries.
 */
export function partsSeance(c: Pick<ChargeSeance, "charge" | "methode" | "muscu">): { musculaire: number; cardio: number } | null {
  if (c.methode !== "fc" || c.muscu == null || !(c.charge > 0)) return null;
  const musculaire = Math.min(1, Math.max(0, c.muscu / c.charge));
  return { musculaire, cardio: 1 - musculaire };
}

// ---------------------------------------------------------------- la journée et la semaine

/** Effort d'un ensemble de séances : la somme des charges, puis la courbe (non additif : 4,8 et 5,3 font 7,1). */
export function effortDeCharges(charges: readonly number[], courbe: CourbeEffort = COURBE_EFFORT): { charge: number; score: number } {
  const charge = charges.reduce((a, b) => a + Math.max(0, b), 0);
  return { charge, score: scoreEffort(charge, courbe) };
}

/** Rythme de la semaine (§ 6, D8) : charge des 7 derniers jours ÷ (charge des 28 derniers jours ÷ 4). */
export type BandeRythme = "calme" | "rythme" | "plus" | "beaucoup";
export const SEUILS_RYTHME = { calme: 0.8, rythme: 1.3, plus: 1.5 } as const;
/** La piste du rythme va de 0,5 à 2 fois l'habitude. */
export const PISTE_RYTHME = [0.5, 2] as const;
export function rythmeSemaine(charge7: number, charge28: number): { r: number; bande: BandeRythme } | null {
  if (!(charge28 > 0)) return null;
  const r = charge7 / (charge28 / 4);
  const bande: BandeRythme = r < SEUILS_RYTHME.calme ? "calme" : r <= SEUILS_RYTHME.rythme ? "rythme" : r <= SEUILS_RYTHME.plus ? "plus" : "beaucoup";
  return { r, bande };
}

// ---------------------------------------------------------------- la cible du jour

/**
 * La forme du jour (§ 5, 2) vient de la Récupération pepfit (recup-pepfit.ts, formeCible) : une seule lecture de la nuit
 * dans toute l'appli. Bornée de 0,6 à 1,2 ; 1 sans score ou sous 40 % de précision (la cible habituelle).
 */
export const FORME_BORNES = [0.6, 1.2] as const;
const borne = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Fenêtre d'habitude de la cible (§ 5, 5) : les 28 derniers jours. */
export const JOURS_CIBLE = 28;
/** Jours écoulés depuis la première séance avant d'avoir une cible (04/11 : 7 jours, plus 28). */
export const JOURS_MIN_CIBLE = 7;
/** Fois qu'une séance prévue doit avoir été faite pour servir de base (§ 5, 3). */
export const FOIS_MIN_SEANCE = 4;
/** Largeur de la plage autour de la charge visée (§ 5, 4). */
export const PLAGE_CIBLE = [0.85, 1.15] as const;
/** Demi-largeur de la plage au premier jour de cible (7 jours) : elle se resserre jusqu'à celle de PLAGE_CIBLE à 28 jours (« de plus en plus précis », 04/11). */
export const DEMI_PLAGE_DEBUT = 0.3;
/** Les bornes de la plage selon l'ancienneté de la première séance (en jours). */
export function plageCible(jours: number): readonly [number, number] {
  const f = Math.min(1, Math.max(0, (jours - JOURS_MIN_CIBLE) / (JOURS_CIBLE - JOURS_MIN_CIBLE)));
  const bas = DEMI_PLAGE_DEBUT + f * ((1 - PLAGE_CIBLE[0]) - DEMI_PLAGE_DEBUT);
  const haut = DEMI_PLAGE_DEBUT + f * ((PLAGE_CIBLE[1] - 1) - DEMI_PLAGE_DEBUT);
  return [1 - bas, 1 + haut];
}
/**
 * Un repos prévu : la cible va de 0 au haut de l'habitude des jours sans séance (tes pas), au moins au premier point (une
 * marche reste dans la cible, une séance non).
 */
export const HAUT_REPOS = 1;

export interface EntreeCible {
  /** Minuit du jour. */
  jour: number;
  /** Charge de chaque jour passé qui a des séances notées (minuits), activité de la journée comprise ; un jour sans séance n'y est pas. */
  charges: ReadonlyMap<number, number>;
  /** Charge d'activité de chaque jour passé sans séance (l'habitude d'un repos prévu, § 5, 3). */
  chargesRepos?: ReadonlyMap<number, number> | null;
  /** Minuit du premier jour de charge connu (toutes séances). */
  premier: number | null;
  /** Multiplicateur de la Récupération du matin (formeCible) ; null : 1, la cible habituelle. */
  forme: number | null;
  /** Séance prévue ce jour : la charge de chacun des jours passés où elle a été faite. */
  joursSeance?: readonly number[] | null;
  /** Repos prévu par un programme. */
  repos?: boolean;
  age: number | null;
  blessure: boolean;
  /** Jour à venir : jamais de cible. */
  futur: boolean;
}

export interface Cible {
  /** Bornes affichées, arrondies au demi-point (« 6,5 à 7 »). */
  bas: number;
  haut: number;
  basExact: number;
  hautExact: number;
  /** Charge visée (points). */
  visee: number;
  /** L'habitude : la médiane des charges des jours d'entraînement des 28 derniers jours. */
  habitude: number;
  m: number;
  base: "seance" | "repos" | "habitude";
}

const decaler = (jour: number, n: number) => {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};
export const mediane = (l: readonly number[]): number | null => {
  if (!l.length) return null;
  const s = [...l].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

/** La cible du jour, ou null : jour à venir, blessure, moins de 18 ans, moins de 7 jours depuis la première séance. */
export function cibleEffort(e: EntreeCible, courbe: CourbeEffort = COURBE_EFFORT): Cible | null {
  if (e.futur || e.blessure) return null;
  if (e.age != null && e.age < 18) return null;
  if (e.premier == null || e.premier > decaler(e.jour, -JOURS_MIN_CIBLE)) return null;
  const jours: number[] = [];
  for (let i = 1; i <= JOURS_CIBLE; i++) {
    const c = e.charges.get(decaler(e.jour, -i));
    if (c != null && c > 0) jours.push(c);
  }
  const habitude = mediane(jours);
  if (habitude == null) return null;
  const m = borne(e.forme ?? 1, FORME_BORNES[0], FORME_BORNES[1]);
  if (e.repos) {
    const repos: number[] = [];
    for (let i = 1; i <= JOURS_CIBLE; i++) {
      const c = e.chargesRepos?.get(decaler(e.jour, -i));
      if (c != null && c > 0) repos.push(c);
    }
    const r = mediane(repos);
    const hautExact = r == null ? HAUT_REPOS : Math.max(HAUT_REPOS, scoreEffort(PLAGE_CIBLE[1] * r, courbe));
    return { bas: 0, haut: Math.max(HAUT_REPOS, demiPoint(hautExact)), basExact: 0, hautExact, visee: r ?? 0, habitude, m, base: "repos" };
  }
  let base: Cible["base"] = "habitude";
  let vb = habitude;
  const seance = (e.joursSeance ?? []).filter((c) => c > 0);
  if (seance.length >= FOIS_MIN_SEANCE) {
    vb = mediane(seance)!;
    base = "seance";
  }
  const visee = vb * m;
  const plage = plageCible((e.jour - e.premier) / 86_400_000);
  const basExact = scoreEffort(plage[0] * visee, courbe);
  const hautExact = scoreEffort(plage[1] * visee, courbe);
  return { bas: demiPoint(basExact), haut: demiPoint(hautExact), basExact, hautExact, visee, habitude, m, base };
}

// ---------------------------------------------------------------- l'anneau (D7)

/** État de l'effort face à sa cible (règle S2 de sport-stats) : sans cible, toujours « en cours ». */
export type EtatJauge = "cours" | "ok" | "alerte";
/** Vert dès le bas de la cible, zone idéale comprise et au-delà (02/11) ; jamais de rouge au-dessus de la cible (02/11). */
export const ECART_ALERTE = 1.5;

export function etatEffort(score: number | null, cible: Pick<Cible, "bas" | "haut"> | null): EtatJauge {
  if (score == null || !cible) return "cours";
  if (score >= cible.bas) return "ok";
  return "cours";
}

/** Part du tour d'un score sur l'échelle de 0 à 10, bornée à [0, 1]. */
const surEchelle = (v: number) => Math.min(1, Math.max(0, v / COURBE_EFFORT.echelle));

/** Remplissage de l'anneau : toujours sur l'échelle de 0 à 10, avec ou sans cible (05/11). */
export function partAnneau(score: number | null): number {
  return score == null ? 0 : surEchelle(score);
}

/** L'arc de la cible sur le même tour, en parts de l'échelle : de bas à haut (4,5 à 5,5 : 45 % à 55 %). */
export function zoneAnneau(cible: Pick<Cible, "bas" | "haut"> | null): [number, number] | null {
  if (!cible || !(cible.haut > 0)) return null;
  return [surEchelle(cible.bas), surEchelle(cible.haut)];
}
