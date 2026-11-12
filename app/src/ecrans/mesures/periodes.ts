// Périodes des pages de mesure (planche pas, NOTES § 1 et D1 ; planche sport-stats, décision du 31/10). Semaine =
// la semaine calendaire, du lundi au dimanche, comme le semainier : celle en cours est partielle (ses jours à venir sont des
// barres vides, hors des moyennes). Mois = 30 jours glissants, année = 12 mois civils (une barre par mois = moyenne par
// jour). k = 0 : la période en cours ; k = 1 : celle d'avant. Pur (sans React Native) : tests/mesures-periodes.test.ts.
import { t } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { nombre } from "../format";

export const JOUR = 86_400_000;

export type TypePeriode = "semaine" | "mois" | "annee";
export const TYPES_PERIODE: readonly TypePeriode[] = ["semaine", "mois", "annee"];
export const LONGUEUR: Record<Exclude<TypePeriode, "annee">, number> = { semaine: 7, mois: 30 };

/** Minuit local du jour de `ms`. */
export function minuit(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Minuit local `n` jours après (ou avant) `jour` : juste aux changements d'heure. */
export function decaler(jour: number, n: number): number {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** Premier jour du mois de `ms`, décalé de `n` mois. */
export function debutMois(ms: number, n = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

/** Les minuits de `debut` (compris) à `fin` (exclu). */
export function joursEntre(debut: number, fin: number): number[] {
  const l: number[] = [];
  for (let j = minuit(debut); j < fin; j = decaler(j, 1)) l.push(j);
  return l;
}

export interface JourPeriode<T> {
  jour: number;
  /** null : pas de donnée ce jour-là (ni dans les moyennes, ni comme un zéro). */
  donnee: T | null;
  v: number | null;
}

export interface Barre<T> {
  /** Minuit du jour, ou premier jour du mois (année). */
  debut: number;
  /** Valeur de la barre : celle du jour, ou la moyenne par jour du mois (jours sans donnée exclus). */
  v: number | null;
  /** Données du jour (semaine, mois) ; du mois, jour par jour (année). */
  jours: JourPeriode<T>[];
  /** La barre d'aujourd'hui ou du mois en cours (k = 0). */
  enCours: boolean;
  /** Jour à venir de la semaine en cours : barre vide, sans donnée ni repère. */
  aVenir: boolean;
  /** Étiquette sous la barre (« jeu. », « auj. », « 8 oct », « O »), vide si elle est sautée. */
  etiquette: string;
  /** Titre au toucher (« ven. 23 oct. », « oct. 2026 »). */
  titre: string;
}

export interface Periode<T> {
  type: TypePeriode;
  k: number;
  debut: number;
  /** Fin exclue. */
  fin: number;
  /** Tous les jours de la période, dans l'ordre. */
  jours: JourPeriode<T>[];
  barres: Barre<T>[];
  /** « 26 oct. – 1 nov. » (semaine), « 2 oct. – aujourd'hui », « 2 sept. – 1 oct. » (mois), « nov. 2025 – oct. 2026 ». */
  titre: string;
}

const jourMoisCourt = (ms: number) => formater(ms, { day: "numeric", month: "short" });
const moisCourtAn = (ms: number) => formater(ms, { month: "short", year: "numeric" });
const jourSemaine = (ms: number) => formater(ms, { weekday: "short" });
const initialeMois = (ms: number) => formater(ms, { month: "narrow" });

/** Lundi (minuit local) de la semaine de `ms`, décalé de `n` semaines. */
export function lundi(ms: number, n = 0): number {
  const auj = minuit(ms);
  return decaler(auj, -((new Date(auj).getDay() + 6) % 7) + 7 * n);
}

/** Bornes de la période `k` de `type` ; k = 0 : celle d'aujourd'hui (la semaine va jusqu'au dimanche, fin exclue). */
export function bornes(type: TypePeriode, k: number, maintenant: number): { debut: number; fin: number } {
  const auj = minuit(maintenant);
  if (type === "semaine") {
    const debut = lundi(auj, -k);
    return { debut, fin: decaler(debut, 7) };
  }
  if (type === "annee") {
    const finMois = debutMois(auj, 1 - 12 * k);
    return { debut: debutMois(finMois, -12), fin: k === 0 ? decaler(auj, 1) : finMois };
  }
  const L = LONGUEUR.mois;
  const fin = decaler(auj, 1 - L * k);
  return { debut: decaler(fin, -L), fin };
}

/**
 * La période et ses barres. `lire(jour)` rend la donnée du jour (null : rien) ; `valeur(donnee)` le nombre de la barre.
 * Les jours d'après aujourd'hui (fin du mois en cours) ne sont pas lus.
 */
export function periode<T>(
  type: TypePeriode,
  k: number,
  maintenant: number,
  lire: (jour: number) => T | null | undefined,
  valeur: (d: T) => number | null,
): Periode<T> {
  const { debut, fin } = bornes(type, k, maintenant);
  const auj = minuit(maintenant);
  const jours: JourPeriode<T>[] = joursEntre(debut, Math.min(fin, decaler(auj, 1))).map((jour) => {
    const donnee = lire(jour) ?? null;
    return { jour, donnee, v: donnee == null ? null : valeur(donnee) };
  });
  let barres: Barre<T>[];
  if (type === "annee") {
    barres = Array.from({ length: 12 }, (_, i) => {
      const m = debutMois(debut, i);
      const js = jours.filter((j) => j.jour >= m && j.jour < debutMois(m, 1));
      return {
        debut: m,
        v: moyenne(js.map((j) => j.v)),
        jours: js,
        enCours: k === 0 && i === 11,
        aVenir: false,
        etiquette: initialeMois(m),
        titre: moisCourtAn(m),
      };
    });
  } else if (type === "semaine") {
    // les 7 jours du lundi au dimanche ; ceux d'après aujourd'hui restent vides
    barres = joursEntre(debut, fin).map((jour, i) => {
      const j = jours[i];
      const enCours = jour === auj;
      return {
        debut: jour,
        v: j?.v ?? null,
        jours: j ? [j] : [],
        enCours,
        aVenir: !j,
        etiquette: enCours ? t("mesures.aujCourt") : jourSemaine(jour),
        titre: formater(jour, { weekday: "short", day: "numeric", month: "short" }),
      };
    });
  } else {
    const L = jours.length;
    barres = jours.map((j, i) => {
      const dernier = k === 0 && i === L - 1;
      const etiquette = dernier ? t("mesures.aujCourt") : i % 7 === 2 ? jourMoisCourt(j.jour).replace(/\.$/, "") : "";
      return { debut: j.jour, v: j.v, jours: [j], enCours: dernier, aVenir: false, etiquette, titre: formater(j.jour, { weekday: "short", day: "numeric", month: "short" }) };
    });
  }
  const titre =
    type === "annee"
      ? `${moisCourtAn(debut)} – ${moisCourtAn(debutMois(fin - 1))}`
      : `${jourMoisCourt(debut)} – ${k === 0 && type === "mois" ? t("mesures.aujourdhuiMin") : jourMoisCourt(decaler(fin, -1))}`;
  return { type, k, debut, fin, jours, barres, titre };
}

/** Moyenne des valeurs présentes, null s'il n'y en a aucune. */
export function moyenne(l: readonly (number | null | undefined)[]): number | null {
  const v = l.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function somme(l: readonly (number | null | undefined)[]): number {
  return l.reduce<number>((a, b) => a + (b != null && Number.isFinite(b) ? b : 0), 0);
}

export interface StatsJours {
  total: number;
  /** Jours avec donnée. */
  n: number;
  moyenne: number | null;
  meilleur: { jour: number; v: number } | null;
  /** Jours qui ont atteint l'objectif. */
  atteints: number;
}

/** Total, moyenne, meilleur jour et jours à l'objectif des jours qui ont une donnée (un jour sans donnée n'est jamais un zéro). */
export function statsJours(jours: readonly { jour: number; v: number | null }[], objectif: number): StatsJours {
  const js = jours.filter((x): x is { jour: number; v: number } => x.v != null);
  const total = js.reduce((a, x) => a + x.v, 0);
  let meilleur: StatsJours["meilleur"] = null;
  for (const x of js) if (!meilleur || x.v > meilleur.v) meilleur = { jour: x.jour, v: x.v };
  return { total, n: js.length, moyenne: js.length ? total / js.length : null, meilleur, atteints: js.filter((x) => x.v >= objectif).length };
}

/** Jour (ou barre) de plus forte valeur, null sans donnée. */
export function meilleur<T extends { v: number | null }>(l: readonly T[]): T | null {
  let m: T | null = null;
  for (const x of l) if (x.v != null && (m == null || x.v > m.v!)) m = x;
  return m;
}

/** Écart relatif `a / b − 1`, null si l'un manque ou si b est nul. */
export function ecartRelatif(a: number | null, b: number | null): number | null {
  return a == null || b == null || b === 0 ? null : a / b - 1;
}

/** La période `k` existe-t-elle : elle commence au plus tard le dernier jour de l'historique connu (`premier`). */
export function periodeExiste(type: TypePeriode, k: number, maintenant: number, premier: number | null): boolean {
  if (k < 0) return false;
  if (k === 0) return true;
  if (premier == null) return false;
  return bornes(type, k, maintenant).fin > minuit(premier);
}

/** « 22 oct. – aujourd'hui » de la période d'une semaine qui contient le jour : sert au semainier. */
export const libelleLongueur = (type: TypePeriode): string => t(`mesures.longueur.${type}` as "mesures.longueur.semaine");

/** « 10,7k », « 950 » : valeurs écrites sur les barres. */
export function court(v: number): string {
  if (Math.abs(v) < 1000) return nombre(v, 0);
  const k = v / 1000;
  return `${nombre(k, Math.abs(k) >= 100 ? 0 : 1)}k`;
}

/** « +1,3 », « −0,32 », « 0 » : un nombre toujours signé (le moins est le vrai signe moins). */
export function signe(v: number, decimales = 0): string {
  const r = Math.round(v * 10 ** decimales) / 10 ** decimales;
  if (r === 0) return nombre(0, decimales);
  return `${r > 0 ? "+" : ""}${nombre(r, decimales)}`;
}

/** Où montrer un jour passé dans les statistiques : la semaine en cours s'il y est, sinon le mois qui le contient. */
export function positionDuJour(jour: number, maintenant: number): { type: TypePeriode; k: number; i: number } {
  const ecart = Math.round((minuit(maintenant) - minuit(jour)) / JOUR);
  if (minuit(jour) >= lundi(maintenant)) return { type: "semaine", k: 0, i: Math.round((minuit(jour) - lundi(maintenant)) / JOUR) };
  return { type: "mois", k: Math.floor(ecart / 30), i: 29 - (ecart % 30) };
}
