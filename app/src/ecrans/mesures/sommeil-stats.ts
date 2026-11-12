// Statistiques de la page Sommeil (planche pas, sommeil.js, NOTES § 1 ter) : moyennes sur les nuits qui ont une donnée (une
// nuit sans donnée, bracelet en charge, ne compte pas), nuits à l'objectif (sommeil sans l'éveil ≥ objectif), régularité =
// écart type des heures de coucher et de lever, 12 mois = moyennes par mois, comparaison à la période d'avant.
// Pur (sans React Native) : tests/mesures-sommeil.test.ts.
import { t } from "../../i18n/index";
import { moyenne, periode, type Periode, type TypePeriode } from "./periodes";

/** Objectif par défaut (D14) : 7 h 30, fixe, réglable (réglage `sommeil_objectif_min`). */
export const OBJECTIF_SOMMEIL_MIN = 450;
export const REGLAGE_OBJECTIF_SOMMEIL = "sommeil_objectif_min";

export type Phase = "eveil" | "leger" | "profond" | "paradoxal";
/** Ordre de l'hypnogramme et de la légende : éveil en haut, profond en bas. */
export const PHASES_HYPNO: readonly Phase[] = ["eveil", "paradoxal", "leger", "profond"];
/** Ordre d'empilement des barres (de la base vers le haut) ; l'éveil n'est pas compté. */
export const PHASES_PILE: readonly Exclude<Phase, "eveil">[] = ["profond", "leger", "paradoxal"];

/** Une nuit, rangée au jour de son réveil. Heures en minutes depuis le minuit du réveil (négatif : la veille au soir). */
export interface NuitStat {
  jour: number;
  sommeilMin: number;
  auLitMin: number;
  phases: Record<Phase, number> | null;
  coucher: number;
  lever: number;
  /** Performance Whoop (%), null sans Whoop. */
  perf: number | null;
}

/** 382 → « 6 h 22 » ; 48 → « 48 min ». */
export function hm(min: number): string {
  const m = Math.round(min);
  if (m < 60) return t("mesuresSommeil.min", { m });
  return t("mesuresSommeil.hm", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** 382 → « 6h22 » : durée écrite sur une barre. */
export function hmCourt(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** Écart type (population), null sous 2 valeurs. */
export function ecartType(l: readonly number[]): number | null {
  if (l.length < 2) return null;
  const m = l.reduce((a, b) => a + b, 0) / l.length;
  return Math.sqrt(l.reduce((a, x) => a + (x - m) ** 2, 0) / l.length);
}

export interface StatsNuits {
  n: number;
  sommeil: number | null;
  auLit: number | null;
  phases: Record<Phase, number> | null;
  coucher: number | null;
  lever: number | null;
  ecCoucher: number | null;
  ecLever: number | null;
  meilleure: NuitStat | null;
  aObjectif: number;
  perf: number | null;
}

export function statsNuits(l: readonly (NuitStat | null)[], objectif: number): StatsNuits {
  const ns = l.filter((x): x is NuitStat => x != null && x.sommeilMin > 0);
  const avecPhases = ns.filter((x) => x.phases);
  const phase = (p: Phase) => moyenne(avecPhases.map((x) => x.phases![p]));
  let meilleure: NuitStat | null = null;
  for (const x of ns) if (!meilleure || x.sommeilMin > meilleure.sommeilMin) meilleure = x;
  return {
    n: ns.length,
    sommeil: moyenne(ns.map((x) => x.sommeilMin)),
    auLit: moyenne(ns.map((x) => x.auLitMin)),
    phases: avecPhases.length ? { eveil: phase("eveil")!, leger: phase("leger")!, profond: phase("profond")!, paradoxal: phase("paradoxal")! } : null,
    coucher: moyenne(ns.map((x) => x.coucher)),
    lever: moyenne(ns.map((x) => x.lever)),
    ecCoucher: ecartType(ns.map((x) => x.coucher)),
    ecLever: ecartType(ns.map((x) => x.lever)),
    meilleure,
    aObjectif: ns.filter((x) => x.sommeilMin >= objectif).length,
    perf: moyenne(ns.map((x) => x.perf)),
  };
}

/** Une barre du graphique : la nuit (semaine, mois) ou la moyenne par nuit du mois (année). */
export interface BarreSommeil {
  v: number | null;
  phases: Record<Phase, number> | null;
  coucher: number | null;
  lever: number | null;
  perf: number | null;
  auLit: number | null;
  etiquette: string;
  enCours: boolean;
  aVenir: boolean;
  titre: string;
  debut: number;
  moyenne: boolean;
}

export interface PeriodeSommeil {
  p: Periode<NuitStat>;
  barres: BarreSommeil[];
  stats: StatsNuits;
}

export function periodeSommeil(type: TypePeriode, k: number, maintenant: number, nuits: ReadonlyMap<number, NuitStat>, objectif: number): PeriodeSommeil {
  const p = periode(type, k, maintenant, (j) => nuits.get(j) ?? null, (n) => (n.sommeilMin > 0 ? n.sommeilMin : null));
  const barres: BarreSommeil[] = p.barres.map((b) => {
    const s = statsNuits(b.jours.map((j) => j.donnee), objectif);
    const un = type !== "annee" ? (b.jours[0]?.donnee ?? null) : null;
    return {
      v: b.v,
      phases: un ? un.phases : s.phases,
      coucher: un ? un.coucher : s.coucher,
      lever: un ? un.lever : s.lever,
      perf: un ? un.perf : s.perf,
      auLit: un ? un.auLitMin : s.auLit,
      etiquette: b.etiquette,
      enCours: b.enCours,
      aVenir: b.aVenir,
      titre: b.titre,
      debut: b.debut,
      moyenne: type === "annee",
    };
  });
  return { p, barres, stats: statsNuits(p.jours.map((j) => j.donnee), objectif) };
}

/** Une nuit lue (Santé Connect ou Whoop) vers ses minutes de coucher et de lever autour du minuit de réveil. */
export function versStat(n: { jour: number; debut: number; fin: number; sommeilMin: number; auLitMin: number; phases: Record<Phase, number> | null; perf: number | null }): NuitStat {
  return {
    jour: n.jour,
    sommeilMin: n.sommeilMin,
    auLitMin: n.auLitMin,
    phases: n.phases,
    coucher: (n.debut - n.jour) / 60_000,
    lever: (n.fin - n.jour) / 60_000,
    perf: n.perf,
  };
}

/** Besoin de la nuit (Whoop) : base + dette + effort récent + sieste (négative : une sieste réduit le besoin). */
export function besoinTotal(b: { base: number; dette: number; effort: number; sieste: number }): number {
  return b.base + b.dette + b.effort + b.sieste;
}
