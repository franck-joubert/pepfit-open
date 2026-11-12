// Composition et historique d'une mesure (planche sante-energie § 3, D7) : unités, décimales, écart sur la période, date
// de la source. Sans React Native.
import type { TypeMensuration } from "../db/depots/profil";
import { locale, t } from "../i18n/index";
import { formater } from "../i18n/temps";
import { heure, nombre } from "./format";

/** Mesures qui ont un historique : celles de la balance et des montres, le poids, et les tours (« m:tour_taille »). */
export type CleMesure = "poids" | "gras" | "maigre" | "os" | "eau" | "bmr" | "vfc" | "fc" | `m:${TypeMensuration}`;

export const PERIODES_JOURS = [30, 90, 365, 0] as const;
export type PeriodeJours = (typeof PERIODES_JOURS)[number];

export function lireCle(s: string | undefined): CleMesure | null {
  if (!s) return null;
  if (["poids", "gras", "maigre", "os", "eau", "bmr", "vfc", "fc"].includes(s)) return s as CleMesure;
  return /^m:[a-z_]+$/.test(s) ? (s as CleMesure) : null;
}

/** Unité, décimales et libellé de l'écart (le % de gras s'écarte en points). */
export function formatMesure(cle: CleMesure): { unite: string; decimales: number; uniteEcart: string } {
  if (cle === "gras") return { unite: "%", decimales: 1, uniteEcart: "pt" };
  if (cle === "bmr") return { unite: t("sante.kcal"), decimales: 0, uniteEcart: t("sante.kcal") };
  if (cle === "vfc") return { unite: t("sante.ms"), decimales: 0, uniteEcart: t("sante.ms") };
  if (cle === "fc") return { unite: t("sante.bpm"), decimales: 0, uniteEcart: t("sante.bpm") };
  if (cle.startsWith("m:")) return { unite: t("sante.cm"), decimales: 1, uniteEcart: t("sante.cm") };
  return { unite: "kg", decimales: 1, uniteEcart: "kg" };
}

export function libelleMesure(cle: CleMesure): string {
  if (cle.startsWith("m:")) return t(`nutrition.mesure.${cle.slice(2)}` as "nutrition.mesure.taille");
  return t(`sante.${cle === "bmr" ? "metabolisme" : cle}` as "sante.poids");
}

/** Écart entre la plus ancienne et la plus récente mesure de la période (liste du plus récent au plus ancien) ; null
 * s'il n'y en a pas deux ou s'il est nul à la précision affichée. */
export function ecart(l: readonly { valeur: number }[], decimales: number): number | null {
  if (l.length < 2) return null;
  const d = l[0]!.valeur - l[l.length - 1]!.valeur;
  return Math.round(d * 10 ** decimales) === 0 ? null : d;
}

export function texteEcart(d: number, cle: CleMesure): string {
  const f = formatMesure(cle);
  return `${d > 0 ? "+" : ""}${fixe(d, f.decimales)} ${f.uniteEcart}`;
}

/** Nombre à décimales fixes (« 78,0 ») : les mesures du corps gardent leur précision affichée. */
export function fixe(v: number, decimales: number): string {
  const s = new Intl.NumberFormat(locale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(Math.abs(v));
  return `${v < 0 && Math.round(v * 10 ** decimales) !== 0 ? "−" : ""}${s}`;
}

/** « 26/10 » */
export const jourMoisChiffres = (ms: number) => formater(ms, { day: "2-digit", month: "2-digit" });

/** « 07:12 » le jour même, sinon « 26/10 ». */
export function quand(ms: number, maintenant = Date.now()): string {
  const a = new Date(ms), b = new Date(maintenant);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return heure(ms);
  return jourMoisChiffres(ms);
}

/** Points d'une période (0 = tout), du plus ancien au plus récent pour la courbe. */
export function pointsPeriode<T extends { date: number }>(l: readonly T[], jours: number, maintenant = Date.now()): T[] {
  const depuis = jours ? maintenant - jours * 86_400_000 : -Infinity;
  return l.filter((p) => p.date >= depuis).sort((a, b) => a.date - b.date);
}

/** Repères de l'axe : 5 valeurs rondes qui encadrent les points (pas de 1, 2 ou 5 × 10ⁿ). */
export function reperes(vals: readonly number[]): number[] {
  if (!vals.length) return [];
  const min = Math.min(...vals), max = Math.max(...vals);
  const brut = Math.max((max - min) / 4, Math.abs(max) * 0.002, 0.1);
  const p10 = 10 ** Math.floor(Math.log10(brut));
  for (const pas of [1, 2, 5, 10, 20].map((k) => k * p10)) {
    const bas = Math.floor(min / pas) * pas;
    if (bas + 4 * pas >= max) return Array.from({ length: 5 }, (_, i) => Math.round((bas + i * pas) * 1000) / 1000);
  }
  return [min, max];
}
