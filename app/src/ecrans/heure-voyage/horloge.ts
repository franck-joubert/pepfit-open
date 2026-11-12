// Heures murales dans un fuseau donné, pas forcément celui de l'appli : le fuseau de chez soi, celui du lieu d'un voyage
// (planche sommeil, section C). Tout passe par Intl (i18n/temps) : aucune table de dates codée en dur. Pur : testé par
// tests/heure-voyage.test.ts.
import { lireActif, locale, t } from "../../i18n/index";
import { decalageMin, parties } from "../../i18n/temps";
import { heureTexte } from "../format";
import { iso } from "../planification";

export const MIN_JOUR = 1440;

/** Jour local (AAAA-MM-JJ) d'un instant dans le fuseau `z`. */
export function jourDans(ms: number, z: string): string {
  const p = parties(ms, z);
  return iso(p.an, p.mois + 1, p.jour);
}

/** Minutes depuis minuit, heure locale de `z`. */
export function minutesDans(ms: number, z: string): number {
  const p = parties(ms, z);
  return p.h * 60 + p.min;
}

/** Instant où il est `min` minutes après le minuit du jour `jour`, heure locale de `z` (`min` peut dépasser 24 h). */
export function instantDans(jour: string, min: number, z: string): number {
  const [a, m, d] = jour.split("-").map(Number) as [number, number, number];
  const champs = Date.UTC(a, m - 1, d, 0, min);
  let ms = champs;
  for (let i = 0; i < 3; i++) {
    const p = parties(ms, z);
    ms -= Date.UTC(p.an, p.mois, p.jour, p.h, p.min, p.s) - champs;
  }
  return ms;
}

/** Écart (minutes) entre l'heure de `b` et celle de `a` à cet instant : New York − Paris = − 360. */
export function ecartFuseaux(ms: number, a: string, b: string): number {
  return decalageMin(ms, b) - decalageMin(ms, a);
}

/** 1 425 → « 23:45 » ; 1 485 → « 00:45 » (modulo 24 h). */
export function hhmm(min: number): string {
  const m = ((Math.round(min) % MIN_JOUR) + MIN_JOUR) % MIN_JOUR;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Heure affichée, au format de l'appli (« 23:45 », « 0:45 » ; « 11:45 PM » en anglais). */
export const heureMin = (min: number): string => heureTexte(hhmm(min));

/** L'heure qui saute : « 2 h », « 2 h 30 » ; « 2:00 AM » en anglais ; « 2:30 » en allemand et en espagnol. */
export function heurePile(min: number): string {
  if (lireActif().langue !== "fr") return heureMin(min);
  const m = ((Math.round(min) % MIN_JOUR) + MIN_JOUR) % MIN_JOUR;
  return m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m / 60} h`;
}

/** Aux 5 min. */
export const arrondi5 = (m: number): number => Math.round(m / 5) * 5;

/** 20 → « 20 min » ; 60 → « 1 h » ; 90 → « 1 h 30 ». */
export function duree(min: number): string {
  const m = Math.abs(Math.round(min));
  if (m < 60) return t("heureVoyage.min", { m });
  if (m % 60 === 0) return t("heureVoyage.h", { h: m / 60 });
  return t("heureVoyage.hm", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** « Dimanche », « Jeudi » : le jour de la semaine de `jour`, dans la langue, capitale en tête. */
export function jourSemaineLong(jour: string): string {
  const [a, m, d] = jour.split("-").map(Number) as [number, number, number];
  const s = new Intl.DateTimeFormat(locale(), { weekday: "long", timeZone: "UTC" }).format(Date.UTC(a, m - 1, d, 12));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « jeu. 25 » (« Jeu. 25 » avec `capitale`) ; « jeu. 12 nov. » avec `mois` ; « 28 mars » avec `mois` sans `semaine`. */
export function jourCourt(jour: string, o: { capitale?: boolean; mois?: boolean; semaine?: boolean } = {}): string {
  const [a, m, d] = jour.split("-").map(Number) as [number, number, number];
  const f = new Intl.DateTimeFormat(locale(), {
    ...(o.semaine === false ? {} : { weekday: "short" }),
    day: "numeric",
    ...(o.mois ? { month: o.semaine === false ? "long" : "short" } : {}),
    timeZone: "UTC",
  });
  const s = f.format(Date.UTC(a, m - 1, d, 12)).replace(",", "");
  return o.capitale ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
