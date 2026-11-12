// Conversion de l'activité (getactivity) et du sommeil (getsummary) de Withings vers pepfit. Pur, sans base ni réseau.
// Un jour par date Withings ; plusieurs appareils ou plusieurs nuits le même jour ne s'additionnent jamais : on garde la plus
// complète (le plus de pas, la nuit la plus longue), sinon la montre et le tapis de sommeil compteraient deux fois.
import type { ActiviteBrute, JourWithings, SerieSommeilBrute } from "./types";

export const videJour = (jour: number): JourWithings => ({
  jour, pas: null, distanceM: null, kcalActives: null, kcalTotales: null, fcMoy: null, fcMin: null, fcMax: null,
  sommeilDebut: null, sommeilFin: null, sommeilMin: null, auLitMin: null, legerMin: null, profondMin: null, paradoxalMin: null,
  eveilMin: null, reveils: null, scoreSommeil: null, fcNuitMoy: null, fcNuitMin: null, respiration: null,
});

/** « 2026-11-04 » -> minuit local du téléphone (ms), null si illisible. La date est celle de Withings, dans le fuseau de la montre :
 *  un voyageur garde la date que sa montre lui a donnée. */
export function minuitDeDate(date: string | undefined | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}

/** AAAA-MM-JJ local d'un instant (paramètres startdateymd et enddateymd de Withings). */
export function dateLocale(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const positif = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
const nonNeg = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
/** FC plausible (bpm), sinon rien. */
const fc = (x: unknown): number | null => {
  const v = positif(x);
  return v != null && v >= 20 && v <= 250 ? Math.round(v) : null;
};
const minutes = (s: unknown): number | null => {
  const v = nonNeg(s);
  return v == null ? null : Math.round((v / 60) * 10) / 10;
};

/** Activité par jour. Plusieurs lignes le même jour (montre et application) : celle qui a le plus de pas. */
export function convertirActivites(l: readonly ActiviteBrute[]): Map<number, JourWithings> {
  const jours = new Map<number, JourWithings>();
  for (const a of l ?? []) {
    const jour = minuitDeDate(a.date);
    if (jour == null) continue;
    const pas = nonNeg(a.steps);
    const deja = jours.get(jour);
    if (deja && (deja.pas ?? -1) >= (pas ?? -1)) continue;
    const j = videJour(jour);
    j.pas = pas == null ? null : Math.round(pas);
    j.distanceM = nonNeg(a.distance);
    j.kcalActives = nonNeg(a.calories);
    j.kcalTotales = nonNeg(a.totalcalories);
    j.fcMoy = fc(a.hr_average);
    j.fcMin = fc(a.hr_min);
    j.fcMax = fc(a.hr_max);
    jours.set(jour, j);
  }
  return jours;
}

/** Nuits par jour de réveil. Plusieurs nuits le même jour (sieste, tapis et montre) : la plus longue. */
export function convertirNuits(l: readonly SerieSommeilBrute[]): Map<number, JourWithings> {
  const jours = new Map<number, JourWithings>();
  for (const s of l ?? []) {
    if (!Number.isFinite(s.startdate) || !Number.isFinite(s.enddate) || !(s.enddate > s.startdate)) continue;
    const d = s.data ?? {};
    const leger = nonNeg(d.lightsleepduration), profond = nonNeg(d.deepsleepduration), rem = nonNeg(d.remsleepduration);
    const total = positif(d.total_sleep_time) ?? (leger != null || profond != null || rem != null ? (leger ?? 0) + (profond ?? 0) + (rem ?? 0) : null);
    if (total == null || !(total > 0)) continue;
    const jour = minuitDeDate(s.date) ?? minuitDeDate(dateLocale(s.enddate * 1000));
    if (jour == null) continue;
    const dormi = Math.round((total / 60) * 10) / 10;
    const deja = jours.get(jour);
    if (deja && (deja.sommeilMin ?? 0) >= dormi) continue;
    const j = videJour(jour);
    j.sommeilDebut = s.startdate * 1000;
    j.sommeilFin = s.enddate * 1000;
    j.sommeilMin = dormi;
    j.auLitMin = Math.round(((positif(d.total_timeinbed) ?? s.enddate - s.startdate) / 60) * 10) / 10;
    j.legerMin = minutes(leger);
    j.profondMin = minutes(profond);
    j.paradoxalMin = minutes(rem);
    j.eveilMin = minutes(d.wakeupduration);
    j.reveils = nonNeg(d.wakeupcount) == null ? null : Math.round(d.wakeupcount!);
    j.scoreSommeil = positif(d.sleep_score);
    j.fcNuitMoy = fc(d.hr_average);
    j.fcNuitMin = fc(d.hr_min);
    j.respiration = positif(d.rr_average);
    jours.set(jour, j);
  }
  return jours;
}
