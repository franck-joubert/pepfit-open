// Dates, heures et nombres selon la langue ET le fuseau choisis (Intl). Une « date murale » est une Date dont les champs
// locaux (getDate, getHours…) valent l'heure affichée dans le fuseau choisi : à utiliser pour lire des champs, jamais comme instant.
import { fuseauSysteme, lireActif, locale } from "./index";

const cache = new Map<string, Intl.DateTimeFormat>();

function formateur(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const z = lireActif().fuseau;
  const cle = `${locale()}|${z}|${JSON.stringify(options)}`;
  let f = cache.get(cle);
  if (!f) {
    f = new Intl.DateTimeFormat(locale(), { ...options, timeZone: z });
    cache.set(cle, f);
  }
  return f;
}

export function formater(ms: number | Date, options: Intl.DateTimeFormatOptions): string {
  return formateur(options).format(ms);
}

export interface Parties {
  an: number;
  /** 0 à 11 */
  mois: number;
  jour: number;
  h: number;
  min: number;
  s: number;
  /** 0 = dimanche */
  sem: number;
}

const SEM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const cacheParties = new Map<string, Intl.DateTimeFormat>();

export function parties(ms: number | Date, fuseau: string = lireActif().fuseau): Parties {
  let f = cacheParties.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    cacheParties.set(fuseau, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return { an: Number(o.year), mois: Number(o.month) - 1, jour: Number(o.day), h: Number(o.hour) % 24, min: Number(o.minute), s: Number(o.second), sem: SEM[o.weekday ?? "Sun"] ?? 0 };
}

const memeFuseauQueAppareil = () => lireActif().fuseau === fuseauSysteme();

/** Date murale d'un instant. */
export function murale(ms: number | Date): Date {
  const t = typeof ms === "number" ? ms : ms.getTime();
  if (memeFuseauQueAppareil()) return new Date(t);
  const p = parties(t);
  return new Date(p.an, p.mois, p.jour, p.h, p.min, p.s, ((t % 1000) + 1000) % 1000);
}

/** Instant (ms) dont l'heure dans le fuseau choisi vaut les champs locaux de la date murale. */
export function deMurale(d: Date): number {
  if (memeFuseauQueAppareil()) return d.getTime();
  const champs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  let t = champs;
  for (let i = 0; i < 2; i++) {
    const p = parties(t);
    const lu = Date.UTC(p.an, p.mois, p.jour, p.h, p.min, p.s, ((t % 1000) + 1000) % 1000);
    t -= lu - champs;
  }
  return t;
}

/** Décalage UTC du fuseau choisi à cet instant, en minutes (Paris l'hiver : 60). */
export function decalageMin(ms: number, fuseau: string = lireActif().fuseau): number {
  const p = parties(ms, fuseau);
  return Math.round((Date.UTC(p.an, p.mois, p.jour, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** « UTC+1 », « UTC−3:30 ». */
export function libelleDecalage(ms: number, fuseau: string): string {
  const m = decalageMin(ms, fuseau);
  const signe = m < 0 ? "−" : "+";
  const a = Math.abs(m);
  return `UTC${signe}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}
