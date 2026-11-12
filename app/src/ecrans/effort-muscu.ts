// L'effort musculaire d'une séance de force (demande d'Alex, 03/11 ; docs/CODE-EFFORT-CHARGE.md) : ce que pèsent ses séries,
// en points de l'Effort pepfit (la même échelle que la FC et le ressenti, effort-pepfit.ts). Pur (sans React Native ni base) :
// testé par tests/effort-pepfit.test.ts. Les lectures en base sont dans effort-charges.ts.
//
// Jamais le tonnage brut (une presse légère battrait un tirage lourd) : chaque série de travail compte
//   points = SERIE × difficulté de l'exercice × proximité de l'échec × répétitions × habitude
// 1. la proximité de l'échec vient du ressenti de la série (« C'était comment ? »), sinon de sa charge face à la référence
//    de l'athlète pour cet exercice : son meilleur 1RM estimé des 6 derniers mois (la 2e meilleure séance dès trois), qui
//    décroît après 3 semaines sans le faire (désentraînement) : au retour, le même poids est plus près de l'échec, il
//    compte plus ;
// 2. la difficulté : polyarticulaire 1, libre ou guidé (machine, poulie, Smith : le muscle travaille autant), isolation
//    0,7, 0,85 pour un gros muscle (dos, pectoraux, cuisses : plus de masse en jeu) ; le bas du corps ×1,2 ;
// 3. l'habitude : après une pause (moins de séries ces 4 semaines que d'ordinaire), tout compte jusqu'à 20 % de plus.
// Sans repère (exercice jamais fait, ni ressenti) : une réserve prudente de 3, et la séance est marquée « ~ ». Un exercice
// de la séance sans aucune série notée compte une série prudente (10 répétitions, 3 en réserve), et la séance est marquée « ~ ».
import type { TypeSerie } from "../db/types";
import type { Equipement, Nature } from "../db/natures";
import { RIR_DEFAUT, rirDeRpe } from "../boutique/poids";
import { familleExercice } from "./tempo";

const JOUR_MS = 86_400_000;

/**
 * Les paramètres de l'effort musculaire : les changer change `CHARGE_EFFORT.version` (effort-pepfit.ts), et chaque séance est
 * recalculée au lancement suivant. Recalages du 03/11 : docs/CODE-EFFORT-CHARGE.md § 4 (séances types) et § 5 (le Pull de
 * Alex face à Whoop : guidé 0,8 → 1, isolation 0,6 → 0,7, exposant des répétitions 0,3 → 0,5, FC 0,5 → 1), puis § 5 bis
 * (le tirage bras tendus en isolation, l'isolation d'un gros muscle à 0,85).
 */
export const CHARGE_MUSCU = {
  /** Points d'une série de référence : polyarticulaire libre, 10 répétitions, 2 en réserve, habitude normale. */
  serie: 8,
  /** Difficulté de l'exercice ; l'isolation d'un gros muscle (GROS_MUSCLES) entre l'isolation et le polyarticulaire. */
  difficulte: { libre: 1, guide: 1, isolation: 0.7, isolationGrosMuscle: 0.85, basDuCorps: 1.2 },
  /** Proximité de l'échec : poids d'une série selon sa réserve (0 à 6 et plus), linéaire entre deux. */
  reserve: [1.2, 1.1, 1, 0.85, 0.7, 0.55, 0.4],
  /** Répétitions : (reps ÷ 10)^0,5, borné ; une série en durée vaut une répétition toutes les 3 s. */
  reps: { exposant: 0.5, min: 0.6, max: 1.3, secondesParRep: 3 },
  /** Sans ressenti ni référence : réserve prudente. */
  reserveSansRepere: 3,
  /** Un exercice de la séance sans série notée : des séries prudentes (ces répétitions, la réserve sans repère). */
  sansDetail: { series: 1, reps: 10 },
  /** La référence : le meilleur 1RM estimé des 182 derniers jours ; il perd 1,75 % par semaine après 21 jours, 25 % au plus. */
  reference: { jours: 182, graceJours: 21, pertePerSemaine: 0.0175, perteMax: 0.25 },
  /** Poids du corps quand aucune pesée n'est connue (tractions, dips…) : le même pour toutes les séances, le rapport tient. */
  poidsCorpsDefaut: 75,
  /** L'habitude : séries de travail des 28 derniers jours face à la médiane des 6 périodes de 28 jours d'avant ; jusqu'à +20 %. */
  habitude: { periode: 28, periodes: 6, max: 1.2 },
  /** Le ressenti de la séance (Foster) pèse la moitié de l'effort musculaire quand il est dit. */
  partRessenti: 0.5,
  /** La FC d'une séance de force s'ajoute en entier : les séries mesurent le muscle, la FC le cœur (comme Whoop). */
  partFc: 1,
} as const;

/** Une série de travail faite (hors échauffement), et ce qu'il faut de son exercice. */
export interface SerieMuscu {
  seance: string;
  /** Début de sa séance (ms). */
  date: number;
  exo: string;
  type: TypeSerie;
  kg: number | null;
  reps: number | null;
  rpe: number | null;
  /** Poids du corps ± lest ou aide, quand une pesée est connue (series.charge_eff). */
  chargeEff: number | null;
  dureeS: number | null;
  nature: Nature;
  equipement: Equipement;
  nom: string;
  slug: string | null;
  muscle: string | null;
}

/** Un exercice d'une séance, sans ses séries. */
export type ExoMuscu = Pick<SerieMuscu, "exo" | "nature" | "equipement" | "nom" | "slug" | "muscle">;

const NATURES_FORCE = new Set<Nature>(["poids_reps", "reps", "leste", "assiste", "duree", "duree_poids"]);
/** L'exercice est-il un exercice de force (pas le rameur ni le vélo) ? */
export const exoDeForce = (e: Pick<SerieMuscu, "nature" | "equipement">): boolean => NATURES_FORCE.has(e.nature) && e.equipement !== "cardio";
/** La série compte-t-elle comme série de force (pas l'échauffement, ni le rameur ni le vélo) ? */
export const serieDeForce = (s: Pick<SerieMuscu, "nature" | "equipement" | "type">): boolean => s.type !== "echauffement" && exoDeForce(s);

const GUIDE = new Set<Equipement>(["machine", "poulie", "smith", "elastique"]);
const BAS_DU_CORPS = new Set(["quadriceps", "fessiers", "ischio-jambiers", "lombaires"]);
// Une isolation qui fait travailler un gros muscle (leg extension, leg curl, écarté, tirage bras tendus) en met plus en jeu
// qu'un curl ou une élévation latérale.
const GROS_MUSCLES = new Set([...BAS_DU_CORPS, "grand dorsal", "milieu du dos", "pectoraux"]);
const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Des mouvements que le mot « tirage » range chez les polyarticulaires (tempo.ts, qui règle la durée d'une répétition et reste tel
// quel) mais qui n'ont qu'une articulation : le tirage bras tendus (corde ou barre), le straight-arm pulldown.
const ISOLATION_EFFORT = /bras[- ]?tendus?|straight[- ]?arm/;

/**
 * La difficulté d'un exercice : polyarticulaire (libre ou guidé) > isolation d'un gros muscle > isolation ; un gros mouvement
 * du bas du corps pèse plus.
 */
export function difficulteExercice(e: Pick<SerieMuscu, "nom" | "slug" | "muscle" | "equipement">): number {
  const d = CHARGE_MUSCU.difficulte;
  const muscle = sansAccent(e.muscle ?? "");
  if (familleExercice(e) === "isolation" || ISOLATION_EFFORT.test(`${sansAccent(e.slug ?? "")} ${sansAccent(e.nom)}`))
    return GROS_MUSCLES.has(muscle) ? d.isolationGrosMuscle : d.isolation;
  const base = GUIDE.has(e.equipement) ? d.guide : d.libre;
  return BAS_DU_CORPS.has(muscle) ? base * d.basDuCorps : base;
}

/** Le poids réellement déplacé : la charge, ou le poids du corps ± lest ou aide ; null pour une série en durée seule. */
export function poidsSerie(s: Pick<SerieMuscu, "nature" | "kg" | "chargeEff">): number | null {
  const pc = CHARGE_MUSCU.poidsCorpsDefaut;
  switch (s.nature) {
    case "poids_reps":
    case "duree_poids":
      return s.kg != null && s.kg > 0 ? s.kg : null;
    case "reps":
      return s.chargeEff ?? pc;
    case "leste":
      return s.chargeEff ?? pc + (s.kg ?? 0);
    case "assiste":
      return s.chargeEff ?? Math.max(1, pc - (s.kg ?? 0));
    default:
      return null;
  }
}

/** Répétitions d'une série (une série en durée : une toutes les 3 s). */
const repsDe = (s: Pick<SerieMuscu, "reps" | "dureeS">): number | null =>
  s.reps != null && s.reps > 0 ? s.reps : s.dureeS != null && s.dureeS > 0 ? s.dureeS / CHARGE_MUSCU.reps.secondesParRep : null;

/** Epley (1985) : le 1RM estimé de `n` répétitions jusqu'à l'échec, sans plafond (la référence se compare à elle-même). */
const epley = (kg: number, n: number) => (n <= 1 ? kg : kg * (1 + n / 30));

/** Le 1RM estimé d'une série passée : sa réserve dite, sinon celle d'une série de travail ordinaire (2, RIR_DEFAUT). */
export function unRMSerie(s: Pick<SerieMuscu, "nature" | "kg" | "chargeEff" | "reps" | "rpe">): number | null {
  const kg = poidsSerie(s);
  if (kg == null || s.reps == null || !(s.reps >= 1)) return null;
  return epley(kg, s.reps + (rirDeRpe(s.rpe) ?? RIR_DEFAUT));
}

/** Ce qui reste d'une référence après `jours` sans la refaire : rien de perdu 3 semaines, puis une pente douce. */
export function resteReference(jours: number): number {
  const r = CHARGE_MUSCU.reference;
  const semaines = Math.max(0, jours - r.graceJours) / 7;
  return 1 - Math.min(r.perteMax, semaines * r.pertePerSemaine);
}

/**
 * La référence d'un exercice à une date : le meilleur 1RM estimé de chaque séance des 182 jours d'avant, diminué de ce que le
 * temps a repris ; à partir de trois séances, la deuxième meilleure (une faute de frappe ne fausse pas six mois). null : aucun
 * repère.
 */
export function referenceExercice(historique: readonly SerieMuscu[], exo: string, date: number): number | null {
  const debut = date - CHARGE_MUSCU.reference.jours * JOUR_MS;
  const parSeance = new Map<string, number>();
  for (const s of historique) {
    if (s.exo !== exo || s.date >= date || s.date < debut || !serieDeForce(s)) continue;
    const estime = unRMSerie(s);
    if (estime == null) continue;
    const v = estime * resteReference((date - s.date) / JOUR_MS);
    if (v > (parSeance.get(s.seance) ?? 0)) parSeance.set(s.seance, v);
  }
  const l = [...parSeance.values()].sort((a, b) => b - a);
  return l.length ? l[l.length >= 3 ? 1 : 0]! : null;
}

/** Poids d'une série selon sa réserve (0 à 6 et plus, linéaire entre deux). */
export function poidsReserve(rir: number): number {
  const t = CHARGE_MUSCU.reserve;
  const x = Math.min(t.length - 1, Math.max(0, rir));
  const k = Math.floor(x);
  return k >= t.length - 1 ? t[t.length - 1]! : t[k]! + (t[k + 1]! - t[k]!) * (x - k);
}

/** Poids des répétitions : (reps ÷ 10)^0,5, borné de 0,6 à 1,3. */
export function poidsReps(reps: number): number {
  const r = CHARGE_MUSCU.reps;
  return Math.min(r.max, Math.max(r.min, Math.pow(reps / 10, r.exposant)));
}

/**
 * La réserve d'une série : celle qu'on a dite ; sinon déduite de son poids face à la référence (Epley inversé : les
 * répétitions possibles à ce poids, moins celles faites) ; une série ratée est à l'échec. `repere` : faux sans l'un ni l'autre.
 */
export function reserveSerie(s: SerieMuscu, reference: number | null): { rir: number; repere: boolean } {
  if (s.type === "rate") return { rir: 0, repere: true };
  const dite = rirDeRpe(s.rpe);
  if (dite != null) return { rir: dite, repere: true };
  const kg = poidsSerie(s);
  const reps = repsDe(s);
  if (reference != null && kg != null && reps != null) {
    const possibles = kg >= reference ? 1 : 30 * (reference / kg - 1);
    return { rir: Math.max(0, possibles - reps), repere: true };
  }
  return { rir: CHARGE_MUSCU.reserveSansRepere, repere: false };
}

/** Une séance passée et son nombre de séries de force (l'habitude). */
export interface CompteSeance {
  date: number;
  n: number;
}

/** Les séries de force de chaque séance d'un historique. */
export function comptesParSeance(historique: readonly SerieMuscu[]): CompteSeance[] {
  const m = new Map<string, CompteSeance>();
  for (const s of historique) {
    if (!serieDeForce(s)) continue;
    const c = m.get(s.seance);
    if (c) c.n++;
    else m.set(s.seance, { date: s.date, n: 1 });
  }
  return [...m.values()].sort((a, b) => a.date - b.date);
}

/**
 * Le facteur d'habitude : séries de travail des 28 jours d'avant face à la médiane des 6 périodes de 28 jours précédentes qui
 * en ont. 1 en rythme (ou plus), jusqu'à 1,2 après une pause complète ; 1 sans passé (rien à comparer).
 */
export function facteurHabitude(comptes: readonly CompteSeance[], date: number): number {
  const h = CHARGE_MUSCU.habitude;
  const p = h.periode * JOUR_MS;
  const parPeriode = new Array<number>(h.periodes + 1).fill(0);
  for (const c of comptes) {
    if (c.date >= date) continue;
    const k = Math.floor((date - c.date) / p);
    if (k <= h.periodes) parPeriode[k]! += c.n;
  }
  const avant = parPeriode.slice(1).filter((n) => n > 0).sort((a, b) => a - b);
  if (!avant.length) return 1;
  const m = avant.length % 2 ? avant[avant.length >> 1]! : (avant[(avant.length >> 1) - 1]! + avant[avant.length >> 1]!) / 2;
  const q = Math.min(1, parPeriode[0]! / m);
  return 1 + (h.max - 1) * (1 - q);
}

export interface EffortSeries {
  /** Points des séries (habitude comprise). */
  points: number;
  /** Séries de travail comptées. */
  series: number;
  /** Part des points sans repère (ni ressenti ni référence, exercices estimés compris) : au-delà de la moitié, « ~ ». */
  sansRepere: number;
  /** Exercices de la séance sans série notée, comptés à une série prudente : « ~ » dès un. */
  estimes: number;
  habitude: number;
  /** Ce qui a servi (séries, références, habitude) : l'empreinte du recalcul. */
  sig: string;
}

/** Points d'une série (sans l'habitude). */
export function pointsSerie(s: SerieMuscu, reference: number | null): { points: number; repere: boolean } {
  const reps = repsDe(s);
  if (reps == null) return { points: 0, repere: true };
  const { rir, repere } = reserveSerie(s, reference);
  return { points: CHARGE_MUSCU.serie * difficulteExercice(s) * poidsReserve(rir) * poidsReps(reps), repere };
}

/** Points d'un exercice de la séance sans série notée : ses séries prudentes (sans l'habitude). */
export function pointsSansDetail(e: ExoMuscu): number {
  const c = CHARGE_MUSCU;
  return c.sansDetail.series * c.serie * difficulteExercice(e) * poidsReserve(c.reserveSansRepere) * poidsReps(c.sansDetail.reps);
}

/**
 * L'effort des séries d'une séance (début `date`) face à l'historique de l'athlète (séries d'avant, les siennes exclues d'office
 * par la date) ; `comptes` : les séries de chaque séance passée, déjà comptées (sinon tirées de l'historique) ; `exos` : les
 * exercices de la séance, ceux sans série notée comptent une série prudente. null : aucune série de force comptable (les
 * exercices seuls n'y suffisent pas : la règle D3 reste).
 */
export function effortSeries(
  seance: readonly SerieMuscu[],
  historique: readonly SerieMuscu[],
  date: number,
  comptes?: readonly CompteSeance[],
  exos: readonly ExoMuscu[] = [],
): EffortSeries | null {
  const faites = seance.filter(serieDeForce);
  if (!faites.length) return null;
  const refs = new Map<string, number | null>();
  for (const s of faites) if (!refs.has(s.exo)) refs.set(s.exo, referenceExercice(historique, s.exo, date));
  let brut = 0;
  let sans = 0;
  let n = 0;
  for (const s of faites) {
    const p = pointsSerie(s, refs.get(s.exo) ?? null);
    if (!(p.points > 0)) continue;
    brut += p.points;
    if (!p.repere) sans += p.points;
    n++;
  }
  if (!(brut > 0)) return null;
  const notes = new Set(faites.map((s) => s.exo));
  const estimes = [...new Map(exos.filter((e) => exoDeForce(e) && !notes.has(e.exo)).map((e) => [e.exo, e])).values()];
  for (const e of estimes) {
    const p = pointsSansDetail(e);
    brut += p;
    sans += p;
  }
  const habitude = facteurHabitude(comptes ?? comptesParSeance(historique), date);
  const sig = [
    faites.map((s) => [s.exo, s.type, s.kg, s.reps, s.rpe, s.chargeEff, s.dureeS].join(":")).join(","),
    [...refs].map(([k, v]) => `${k}=${v == null ? "-" : v.toFixed(1)}`).join(","),
    habitude.toFixed(3),
    estimes.map((e) => e.exo).join(","),
  ].join("/");
  return { points: brut * habitude, series: n, sansRepere: sans / brut, estimes: estimes.length, habitude, sig };
}

/** Une petite empreinte stable d'un texte (djb2), pour l'empreinte d'une séance sans y recopier toutes ses séries. */
export function hacher(texte: string): string {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
