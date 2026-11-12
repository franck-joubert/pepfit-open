// Écran Sommeil (planche sante-energie v2, D15 à D18) : ce qu'on tire d'une nuit de Santé Connect, sans rien inventer.
// Sans Whoop (pas encore relié), ni besoin, ni performance, ni régularité, ni cycles : ces blocs n'apparaissent pas ;
// l'efficacité est calculée (sommeil ÷ temps au lit) et précédée de « ~ » (D16). Sans React Native (tests/sommeil.test.ts).
import type { SommeilNuit } from "../natif/sante/types";

export type Stade = "eveil" | "leger" | "profond" | "paradoxal";
export const STADES: readonly Stade[] = ["eveil", "leger", "profond", "paradoxal"];

/** Types de stades Santé Connect (SleepSessionRecord.STAGE_TYPE_*) vers nos quatre stades ; 2 (SLEEPING) : endormi sans détail. */
const TYPE_STADE: Record<number, Stade | undefined> = { 1: "eveil", 3: "eveil", 7: "eveil", 4: "leger", 5: "profond", 6: "paradoxal" };

export interface AnalyseNuit {
  debut: number;
  fin: number;
  auLitMin: number;
  sommeilMin: number;
  /** Minutes et part du temps au lit (%) par stade ; null si l'appli source ne dépose pas les stades. */
  stades: Record<Stade, { minutes: number; part: number }> | null;
  /** Réveils : passages à l'éveil entre deux tranches de sommeil ; null sans stades. */
  reveils: number | null;
  /** Latence d'endormissement (min) : du coucher à la première tranche de sommeil ; null sans stades. */
  latenceMin: number | null;
  /** Sommeil ÷ temps au lit (%), calculé par pepfit (« ~ »). */
  efficacite: number;
  origine: string | null;
}

export function analyserNuit(n: SommeilNuit): AnalyseNuit {
  const auLit = Math.max(1, Math.round((n.fin - n.debut) / 60_000));
  let stades: AnalyseNuit["stades"] = null;
  let reveils: number | null = null;
  let latenceMin: number | null = null;
  if (n.phases) {
    const p = n.phases;
    stades = Object.fromEntries(STADES.map((s) => [s, { minutes: p[s], part: Math.round((p[s] / auLit) * 100) }])) as AnalyseNuit["stades"];
  }
  const etapes = (n.etapes ?? []).filter((e) => e.fin > e.debut).sort((a, b) => a.debut - b.debut);
  if (etapes.length) {
    // un réveil = une tranche d'éveil précédée et suivie de sommeil (l'endormissement et le lever n'en sont pas)
    const dort = etapes.map((e) => TYPE_STADE[e.type] !== "eveil");
    const premier = dort.indexOf(true), dernier = dort.lastIndexOf(true);
    reveils = 0;
    if (premier >= 0) latenceMin = Math.max(0, Math.round((etapes[premier]!.debut - n.debut) / 60_000));
    for (let i = premier + 1; i < dernier; i++) if (!dort[i] && dort[i - 1]) reveils++;
  }
  return {
    debut: n.debut,
    fin: n.fin,
    auLitMin: auLit,
    sommeilMin: n.minutes,
    stades,
    reveils,
    latenceMin,
    efficacite: Math.round((n.minutes / auLit) * 100),
    origine: n.origine,
  };
}

/** Une valeur par nuit des `n` dernières (jour de réveil), de la plus ancienne à `fin` ; null : pas de nuit ce jour-là. */
export function historiqueNuits(nuits: readonly SommeilNuit[], n: number, finJour: number): (number | null)[] {
  const parJour = new Map<number, number>();
  for (const x of nuits) parJour.set(debutJourLocal(x.fin), x.minutes);
  return Array.from({ length: n }, (_, i) => parJour.get(decalerJourLocal(finJour, i - n + 1)) ?? null);
}

export function moyenneMinutes(l: readonly (number | null)[]): number | null {
  const v = l.filter((x): x is number => x != null && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Moyenne des mesures (fréquence respiratoire) prises pendant la nuit, null sans aucune. */
export function moyennePendant(mesures: readonly { valeur: number; date: number }[], debut: number, fin: number): number | null {
  const v = mesures.filter((m) => m.date >= debut && m.date <= fin).map((m) => m.valeur);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function debutJourLocal(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function decalerJourLocal(ms: number, jours: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + jours).getTime();
}
