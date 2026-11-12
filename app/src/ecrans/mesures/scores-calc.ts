// Calculs et formats de la page Effort et des pages de mesure (planche pas, autres.js EFFORT_DEF ; l'Effort pepfit lui-même est
// dans ecrans/effort-pepfit.ts, la Récupération pepfit dans ecrans/recup-pepfit.ts). Pur (sans React Native) :
// tests/mesures-scores.test.ts. Rien d'inventé : un jour sans donnée reste null.
import { locale, t } from "../../i18n/index";

/** Repères de l'OMS par semaine (minutes) : 150 min modérées, 75 min intenses ; renforcement : 2 séances (≈ 120 min). */
export const REPERES_OMS = { modere: 150, intense: 75, renforcement: 120 } as const;
/** Sous 2 % d'écart à la normale : « = normale ». */
export const SEUIL_NORMALE = 0.02;

/** kJ Whoop → kcal. */
export const kcalDeKj = (kj: number | null | undefined): number | null => (kj == null ? null : Math.round(kj / 4.184));

/** Minutes des zones 1 à 3 et 4-5 d'une séance (zones 0 à 5 en minutes). */
export function zonesSeance(z: readonly number[] | null): { z13: number; z45: number } | null {
  if (!z) return null;
  const s = (a: number, b: number) => z.slice(a, b + 1).reduce((x, y) => x + (Number(y) || 0), 0);
  return { z13: s(1, 3), z45: s(4, 5) };
}

/** Moyenne par semaine d'une quantité quotidienne (minutes) sur les jours d'une période qui ont une donnée. */
export function parSemaine(valeurs: readonly (number | null)[]): number | null {
  const l = valeurs.filter((v): v is number => v != null);
  if (!l.length) return null;
  return (l.reduce((a, b) => a + b, 0) / l.length) * 7;
}

/** Rail d'un repère : part remplie et place du trait, sur une échelle qui laisse voir le repère (1,6 fois le repère au moins). */
export function railRepere(v: number, repere: number): { part: number; trait: number } {
  const max = Math.max(v, repere * 1.6);
  return { part: max ? v / max : 0, trait: max ? repere / max : 0 };
}

/** « 58 min », « 6 h 07 » : une durée en minutes. */
export function duree(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return t("effort.minN", { n: m });
  return t("sante.duree", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** « 7,1 », « 4,0 » : un Effort, toujours une décimale (virgule en français, point en anglais). Jamais d'unité ni de maximum. */
export function texteEffort(v: number): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
}

/** « 6,5 », « 7 » : une borne de cible ou un repère, arrondi au demi-point, sans « ,0 ». */
export function texteDemi(v: number): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(Math.round(v * 2) / 2);
}
