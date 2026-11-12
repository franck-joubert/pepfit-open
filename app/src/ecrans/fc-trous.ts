// FC coupée pendant un suivi (padel du 30/10 : flux de la Whoop perdu entre 25 et 40 min, puis sur la fin, écran éteint) : les
// trous du direct, leur complément par une autre source (Whoop toutes les 6 s, Santé Connect), la courbe qui s'interrompt au
// lieu de relier les deux bords, et la ligne qui le dit. Sans React Native (tests/fc-trous.test.ts).
import { t } from "../i18n/index";
import { decimerExtremes } from "./fc-muscu-vue";

/** Au-delà de ce silence (s) entre deux mesures, la FC est coupée : la courbe s'interrompt, le temps n'est pas compté. */
export const TROU_COURBE_S = 20;
/** Part d'un trou couverte par l'autre source au-delà de laquelle il est « complété » (sinon « en partie »). */
export const PART_COMPLETEE = 0.9;
/** Temps qu'un point de l'autre source couvre au plus (s) : Whoop en donne un toutes les 6 s. */
export const COUVERTURE_S = 10;

export type SourceFc = "whoop" | "sante";

/** Échantillon d'une séance : temps de séance `s` (ms, hors pauses) ; `source` absente : le capteur en direct. */
export interface FcSourcee {
  t?: number;
  s: number;
  bpm: number;
  source?: SourceFc;
}

/** Trou du direct, en temps de séance (ms) ; `deT`, `aT` : ses bords en heure murale (null : inconnus, fin de séance). */
export interface Trou {
  deS: number;
  aS: number;
  deT: number | null;
  aT: number | null;
}

/**
 * Trous de plus de TROU_COURBE_S entre deux mesures du capteur, et après la dernière jusqu'à `finMs` (temps de séance). Rien
 * avant la première : la connexion du début n'est pas une coupure. Sans aucune mesure, pas de trou (pas de FC du tout).
 */
export function trousFc(fc: readonly Pick<FcSourcee, "t" | "s" | "source">[], finMs: number): Trou[] {
  const direct = fc.filter((f) => f.source == null);
  const out: Trou[] = [];
  for (let i = 0; i < direct.length; i++) {
    const a = direct[i]!;
    const b = direct[i + 1];
    const aS = b ? b.s : finMs;
    if (aS - a.s > TROU_COURBE_S * 1000) out.push({ deS: a.s, aS, deT: a.t ?? null, aT: b ? (b.t ?? null) : a.t != null ? a.t + (finMs - a.s) : null });
  }
  return out;
}

/**
 * Comble les trous du direct avec `autre` (heure murale) et marque leur provenance. Un point de l'autre source se place au
 * temps de séance de son trou (même décalage heure murale / séance que le bord gauche). Un trou qui contient une pause (le mur
 * avance plus que la séance) n'est pas comblé : ses points ne sauraient où se mettre.
 */
export function completerFc(
  direct: readonly { t: number; s: number; bpm: number }[],
  autre: readonly { t: number; bpm: number }[],
  source: SourceFc,
  finMs: number,
): FcSourcee[] {
  const out: FcSourcee[] = direct.map((f) => ({ t: f.t, s: f.s, bpm: f.bpm }));
  if (!autre.length) return out;
  for (const tr of trousFc(direct, finMs)) {
    if (tr.deT == null || tr.aT == null) continue;
    if (Math.abs(tr.aT - tr.deT - (tr.aS - tr.deS)) > 2000) continue;
    const decalage = tr.deT - tr.deS;
    for (const p of autre) {
      if (p.t <= tr.deT || p.t >= tr.aT) continue;
      out.push({ t: p.t, s: p.t - decalage, bpm: p.bpm, source });
    }
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Ce que dit la ligne sous la courbe : temps coupé (s), temps comblé par l'autre source (s) et laquelle. */
export interface CoupureFc {
  coupeeS: number;
  completeeS: number;
  source: SourceFc | null;
}

/** Bilan des trous du direct (null s'il n'y en a pas) : chaque point de l'autre source couvre jusqu'au suivant, COUVERTURE_S au plus. */
export function bilanCoupure(fc: readonly FcSourcee[], finMs: number): CoupureFc | null {
  const trous = trousFc(fc, finMs);
  if (!trous.length) return null;
  const coupee = trous.reduce((a, tr) => a + (tr.aS - tr.deS), 0);
  let completee = 0;
  let source: SourceFc | null = null;
  for (let i = 0; i < fc.length; i++) {
    const f = fc[i]!;
    if (f.source == null) continue;
    const tr = trous.find((x) => f.s > x.deS && f.s < x.aS);
    if (!tr) continue;
    source ??= f.source;
    const fin = Math.min(fc[i + 1]?.s ?? Infinity, f.s + COUVERTURE_S * 1000, tr.aS);
    completee += Math.max(0, fin - f.s);
  }
  return { coupeeS: Math.round(coupee / 1000), completeeS: Math.round(completee / 1000), source };
}

export type EtatCoupure = "completee" | "partielle" | "non";

export function etatCoupure(c: CoupureFc): EtatCoupure {
  if (c.completeeS <= 0 || !c.source) return "non";
  return c.completeeS >= PART_COMPLETEE * c.coupeeS ? "completee" : "partielle";
}

/** Point de la courbe de FC : temps (s), bpm ; `coupe` : la ligne reprend ici sans partir du point d'avant. */
export interface PointCourbeFc {
  s: number;
  bpm: number;
  source?: SourceFc;
  coupe?: true;
}

/**
 * Courbe de FC à dessiner (temps en ms → s) : coupée à chaque silence de plus de TROU_COURBE_S, avant toute décimation (une
 * fois décimée, deux points voisins peuvent être loin sans qu'il y ait eu de trou). Chaque morceau garde ses pics
 * (decimerExtremes) et une part des `max` points à sa longueur. `trouS` : le silence qui coupe (5 s pour la courbe en direct).
 */
export function serieCourbeFc(fc: readonly FcSourcee[], max = 300, trouS = TROU_COURBE_S): PointCourbeFc[] {
  const morceaux: FcSourcee[][] = [];
  for (let i = 0; i < fc.length; i++) {
    if (i === 0 || fc[i]!.s - fc[i - 1]!.s > trouS * 1000) morceaux.push([]);
    morceaux.at(-1)!.push(fc[i]!);
  }
  const out: PointCourbeFc[] = [];
  for (const [k, m] of morceaux.entries()) {
    const part = Math.max(2, Math.round((max * m.length) / fc.length));
    decimerExtremes(m, part).forEach((f, i) => {
      const p: PointCourbeFc = { s: f.s / 1000, bpm: f.bpm };
      if (f.source) p.source = f.source;
      if (i === 0 && k > 0) p.coupe = true;
      out.push(p);
    });
  }
  return out;
}

/**
 * Morceaux à tracer : une ligne par suite de points sans coupure et de même provenance. Un changement de provenance sans
 * coupure repart du dernier point (la ligne reste continue, seule sa couleur change).
 */
export function morceauxCourbe(serie: readonly PointCourbeFc[]): { source: SourceFc | null; points: PointCourbeFc[] }[] {
  const out: { source: SourceFc | null; points: PointCourbeFc[] }[] = [];
  for (let i = 0; i < serie.length; i++) {
    const p = serie[i]!;
    const src = p.source ?? null;
    const dernier = out.at(-1);
    if (!dernier || p.coupe) out.push({ source: src, points: [p] });
    else if (dernier.source !== src) out.push({ source: src, points: [serie[i - 1]!, p] });
    else dernier.points.push(p);
  }
  return out;
}

/** Nom d'une source de FC (« Whoop », « Santé Connect »). */
export const nomSource = (s: SourceFc) => t(s === "whoop" ? "gps.whoop" : "seance.sources.sante");

/** « FC coupée 14 min · complétée par Whoop », « … · en partie complétée par Santé Connect », « … · non complétée ». */
export function texteCoupure(c: CoupureFc): string {
  const duree = c.coupeeS >= 60 ? t("effort.minN", { n: Math.round(c.coupeeS / 60) }) : t("effort.sN", { n: c.coupeeS });
  const e = etatCoupure(c);
  const suite = e === "non" ? t("effort.fcNonCompletee") : t(e === "completee" ? "effort.fcCompletee" : "effort.fcPartielle", { source: nomSource(c.source!) });
  return `${t("effort.fcCoupee", { duree })}, ${suite}`;
}
