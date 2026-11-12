// Tiroir de lancement, avancement du programme et carte de fin (planche seance-tiroirs v2, validée le 03/11).
// Pur (sans React Native ni base) : testé par tests/tiroir-seance.test.ts. Les jours sont des dates « AAAA-MM-JJ ».
// Décisions : D4 (semaine N sur M, séance n sur total), D5 (ligne jusqu'à 20 séances, grille au-delà), D6 (pourcentage des
// séances faites), D8 (durée prévue), D9 (séance non liée), D11 (dernière séance). Voir docs/CODE-TIROIRS.md.
import { ecartJ } from "./planification";

/** Une séance prévue du plan (programmation). */
export interface SeanceProg {
  date: string;
  routineId: string;
}
/** Une séance du plan faite (enregistrée) : sa routine, son jour. */
export interface SeanceFaite {
  routineId: string;
  jour: string;
}

/** Case de l'avancement : faite (vert adouci), manquée (contour), à venir (s3), ici (anneau ; plein en fin de séance). */
export type EtatCase = "faite" | "manquee" | "avenir" | "ici";

/** Au-delà de ce nombre de séances, l'avancement passe de la ligne à la grille (D5). */
export const LIGNE_MAX = 20;

export interface Avancement {
  total: number;
  /** Séances faites (en fin de séance : celle-ci comprise). */
  faites: number;
  /** Faites avant cette séance (le compte part de là en fin de séance). */
  faitesAvant: number;
  pourcent: number;
  pourcentAvant: number;
  /** Semaine de la séance du jour (1…semaines). */
  semaine: number;
  semaines: number;
  /** Numéro de la séance du jour (1…total) ; null si la routine n'a plus de séance à faire dans le plan. */
  rang: number | null;
  /** Une colonne par semaine qui a des séances, dans l'ordre. */
  colonnes: EtatCase[][];
  forme: "ligne" | "grille";
  /** Écart entre deux colonnes de la grille (px) ; en ligne, 12 entre deux semaines. */
  ecartColonnes: number;
  /** Jour de la séance suivante à faire (après celle-ci), null s'il n'y en a plus. */
  prochaine: string | null;
  /** La séance du jour est la dernière à faire du plan : « programme terminé » (D11). */
  derniere: boolean;
}

/** Pourcentage des séances faites (D6) : faites / total, arrondi ; 0 sans séance. */
export const pourcentage = (faites: number, total: number): number => (total > 0 ? Math.round((100 * Math.min(faites, total)) / total) : 0);

/** Forme de l'avancement (D5) : une ligne jusqu'à 20 séances, la grille au-delà. */
export const formeAvancement = (total: number): "ligne" | "grille" => (total <= LIGNE_MAX ? "ligne" : "grille");

/** Écart entre les colonnes de la grille (D5) : 8 px jusqu'à 12 semaines, 6 jusqu'à 16, 4 au-delà. */
export const ecartColonnes = (semaines: number): number => (semaines <= 12 ? 8 : semaines <= 16 ? 6 : 4);

/**
 * Rattache les séances faites aux séances prévues : d'abord la même routine le même jour, sinon la plus ancienne séance
 * encore libre de la même routine (une séance faite un autre jour que prévu compte quand même). Renvoie, pour chaque
 * séance prévue, si elle est faite.
 */
export function rattacher(seances: readonly SeanceProg[], faites: readonly SeanceFaite[]): boolean[] {
  const prise = seances.map(() => false);
  const reste: SeanceFaite[] = [];
  for (const f of faites) {
    const i = seances.findIndex((s, k) => !prise[k] && s.routineId === f.routineId && s.date === f.jour);
    if (i >= 0) prise[i] = true;
    else reste.push(f);
  }
  for (const f of reste) {
    const i = seances.findIndex((s, k) => !prise[k] && s.routineId === f.routineId);
    if (i >= 0) prise[i] = true;
  }
  return prise;
}

/**
 * La séance du plan que l'on lance avec `routineId` : celle d'aujourd'hui si elle n'est pas faite, sinon la prochaine à
 * venir de cette routine, sinon la plus ancienne en retard. -1 si la routine n'a plus rien à faire dans le plan.
 */
export function seanceDuJour(seances: readonly SeanceProg[], faites: readonly boolean[], routineId: string, auj: string): number {
  const libres = seances.map((s, i) => ({ s, i })).filter((x) => !faites[x.i] && x.s.routineId === routineId);
  return (libres.find((x) => x.s.date === auj) ?? libres.find((x) => x.s.date > auj) ?? libres[0])?.i ?? -1;
}

/**
 * Avancement d'un plan pour le tiroir (`fin` faux : la case du jour porte l'anneau) ou la fin de séance (`fin` vrai : la case
 * du jour compte comme faite). `debut` : premier jour du plan ; `semaines` : sa durée (programme), sinon déduite des séances.
 */
export function avancement(o: {
  debut: string;
  semaines?: number;
  seances: readonly SeanceProg[];
  faites: readonly SeanceFaite[];
  routineId: string | null;
  auj: string;
  fin?: boolean;
}): Avancement {
  const { seances, auj } = o;
  const faites = rattacher(seances, o.faites);
  const ici = o.routineId ? seanceDuJour(seances, faites, o.routineId, auj) : -1;
  const etats: EtatCase[] = seances.map((s, i) => (faites[i] ? "faite" : i === ici ? "ici" : s.date < auj ? "manquee" : "avenir"));
  const semaineDe = (date: string) => Math.max(0, Math.floor(ecartJ(o.debut, date) / 7));
  const colonnes = new Map<number, EtatCase[]>();
  seances.forEach((s, i) => {
    const k = semaineDe(s.date);
    colonnes.set(k, [...(colonnes.get(k) ?? []), etats[i]!]);
  });
  const nbSemaines = Math.max(o.semaines ?? 0, ...[...colonnes.keys()].map((k) => k + 1), 1);
  const avant = faites.filter(Boolean).length;
  const apres = avant + (o.fin && ici >= 0 ? 1 : 0);
  const total = seances.length;
  const suivantes = seances.filter((_, i) => etats[i] === "avenir");
  const repere = ici >= 0 ? seances[ici]!.date : auj;
  return {
    total,
    faites: apres,
    faitesAvant: avant,
    pourcent: pourcentage(apres, total),
    pourcentAvant: pourcentage(avant, total),
    semaine: Math.min(nbSemaines, semaineDe(repere) + 1),
    semaines: nbSemaines,
    rang: ici >= 0 ? ici + 1 : null,
    colonnes: [...colonnes.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]),
    forme: formeAvancement(total),
    ecartColonnes: ecartColonnes(colonnes.size),
    prochaine: suivantes.find((s) => s.date >= auj)?.date ?? null,
    derniere: ici >= 0 && suivantes.length === 0,
  };
}

/** Genre du tiroir (D1, D9) : séance d'un programme, routine seule, ou routine lancée pendant un programme en cours. */
export type GenreTiroir = "programme" | "routine" | "horsProgramme";

/**
 * `planDeLaRoutine` : le plan en cours (non arrêté) auquel appartient la routine, s'il y en a un ; `planEnCours` : un autre
 * plan en cours qui a encore une séance à faire. La séance libre n'a pas de tiroir (D1).
 */
export function genreTiroir(planDeLaRoutine: string | null, planEnCours: string | null): GenreTiroir {
  if (planDeLaRoutine) return "programme";
  return planEnCours ? "horsProgramme" : "routine";
}

/** Rappel du tiroir (D7) : programme : l'accent de la semaine, sinon la note de la séance ; routine : la dernière fois. */
export type Rappel = { genre: "texte"; texte: string } | { genre: "derniere"; jour: number; series: number; minutes: number } | null;

export function rappelTiroir(o: {
  genre: GenreTiroir;
  accent: string | null;
  note: string | null;
  derniere: { jour: number; series: number; minutes: number } | null;
}): Rappel {
  const texte = (x: string | null) => (x && x.trim() ? { genre: "texte" as const, texte: x.trim() } : null);
  if (o.genre === "programme") return texte(o.accent) ?? texte(o.note);
  return o.derniere ? { genre: "derniere", ...o.derniere } : texte(o.note);
}

/** Durée prévue (D8) : estimation (programme, ou routine jamais faite) ou moyenne des 3 dernières fois (routine). */
export interface DureePrevue {
  minutes: number;
  source: "estimation" | "moyenne";
  /** Nombre de séances de la moyenne (1 à 3). */
  n: number;
}

/** Minutes arrondies à 5 (au moins 5) : la durée est toujours précédée de « ≈ ». */
export const arrondi5 = (min: number): number => Math.max(5, Math.round(min / 5) * 5);

export function dureePrevue(genre: GenreTiroir, estimeeS: number, dernieresMin: readonly number[]): DureePrevue | null {
  const d = dernieresMin.filter((m) => m > 0).slice(0, 3);
  if (genre !== "programme" && d.length) return { minutes: arrondi5(d.reduce((a, b) => a + b, 0) / d.length), source: "moyenne", n: d.length };
  return estimeeS > 0 ? { minutes: arrondi5(estimeeS / 60), source: "estimation", n: 0 } : null;
}

/** Repos le plus fréquent d'une séance (s), pour « repos de 3 min » ; null sans repos. */
export function reposTypique(repos: readonly number[]): number | null {
  const n = new Map<number, number>();
  for (const r of repos) if (r > 0) n.set(r, (n.get(r) ?? 0) + 1);
  let best: number | null = null;
  for (const [r, c] of n) if (best == null || c > n.get(best)! || (c === n.get(best)! && r > best)) best = r;
  return best;
}

/** Une série lourde d'un exercice dans une séance du plan (carte de fin : « +22,5 kg au squat »). */
export interface ChargeSeance {
  exo: string;
  nom: string;
  debut: number;
  kg: number;
}

/**
 * Meilleur gain du programme : pour chaque exercice fait au moins deux jours, charge la plus lourde de sa dernière séance
 * moins celle de sa première ; le plus grand gain positif, null sinon (programme sans charge).
 */
export function meilleurGain(l: readonly ChargeSeance[]): { nom: string; kg: number } | null {
  const parExo = new Map<string, Map<number, { nom: string; kg: number }>>();
  for (const x of l) {
    if (!(x.kg > 0)) continue;
    const m = parExo.get(x.exo) ?? new Map<number, { nom: string; kg: number }>();
    const v = m.get(x.debut);
    if (!v || x.kg > v.kg) m.set(x.debut, { nom: x.nom, kg: x.kg });
    parExo.set(x.exo, m);
  }
  let best: { nom: string; kg: number } | null = null;
  for (const m of parExo.values()) {
    if (m.size < 2) continue;
    const jours = [...m.keys()].sort((a, b) => a - b);
    const premier = m.get(jours[0]!)!;
    const dernier = m.get(jours[jours.length - 1]!)!;
    const g = Math.round((dernier.kg - premier.kg) * 100) / 100;
    if (g > 0 && (!best || g > best.kg)) best = { nom: dernier.nom, kg: g };
  }
  return best;
}
