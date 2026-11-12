// Planification des séances (planche v7, validée le 27/10) : règles, occurrences, prochaine séance, séances manquées et
// marques des jours. Pur (sans React Native ni base) : les jours sont des dates calendaires « AAAA-MM-JJ », sans fuseau ;
// testé par tests/planification.test.ts. NOTES : planches/planification/NOTES.md.
import { aUneFamille, familleDe } from "./familles-table";

export type Freq = "semaine" | "jour" | "mois" | "annee" | "unique";

export interface Regle {
  freq: Freq;
  intervalle: number;
  /** 0 = lundi … 6 = dimanche (semaine, mois) */
  jours: number[];
  /** Mensuel : 1 à 4, -1 = dernier. */
  ordinal?: number;
  /** Unique (et annuel) : le jour. */
  date?: string;
  /** « 18:00 » ; null = heure par défaut du profil. */
  heure: string | null;
  /** Ancre de « un sur deux » et premier jour possible. */
  debut: string;
  /**
   * Occurrence retouchée (lot AF, docs/AGENDA-ROUTINES.md) : cette règle unique, sur une copie cachée de la routine, remplace
   * l'occurrence `date` (jour d'origine) de la programmation `programmationId`, retirée par une exception. Modifier la routine
   * programmée ne la touche plus.
   */
  remplace?: { programmationId: string; date: string };
}

export interface Programmation {
  id: string;
  routineId: string;
  texte: string;
  regle: Regle;
  actif: boolean;
  /** null = rappel par défaut du profil ; 0 = aucun. */
  rappelMin: number | null;
  ordre: number;
}

export interface Exception {
  programmationId: string;
  dateOrigine: string;
  type: "retiree" | "decalee";
  nouvelleDate: string | null;
  nouvelleHeure: string | null;
}

/** Une séance prévue un jour donné. `origine` : le jour de la règle (diffère de `date` si elle a été décalée). */
export interface Occurrence {
  programmationId: string;
  routineId: string;
  date: string;
  origine: string;
  /** Heure effective (« 18:00 »), l'heure par défaut appliquée. */
  heure: string;
  /** La règle répète (tout sauf unique). */
  repetee: boolean;
  /** Sport de la routine (« cat:padel »), si connu : une séance du même sport sur ce créneau la valide (voir `faite`). */
  sport?: string | null;
  /** Durée estimée de la routine, en minutes (0 ou absente : inconnue). */
  dureeMin?: number;
}

/** Ce que `occurrences` sait d'une routine pour reconnaître sa séance faite. */
export interface InfoRoutine {
  sport: string | null;
  dureeMin: number;
}

/** Une séance de l'historique, ramenée à son jour. */
export interface SeanceJour {
  id: string;
  routineId: string | null;
  date: string;
  /** Terminée. */
  faite: boolean;
  /** Sport de la séance (« cat:padel »), si connu : séance importée ou détectée, sans routine. */
  sport?: string | null;
  /** Début et fin, en minutes depuis minuit de `date` (la fin peut dépasser 1440). */
  debutMin?: number;
  finMin?: number;
}

// ——— Dates calendaires ———

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (a: number, m: number, j: number): string => {
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const lire = (j: string) => {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  return { a, m, d };
};
const utc = (j: string) => {
  const { a, m, d } = lire(j);
  return Date.UTC(a, m - 1, d);
};
export const ajouterJ = (j: string, n: number): string => {
  const { a, m, d } = lire(j);
  return iso(a, m, d + n);
};
export const ecartJ = (de: string, a: string): number => Math.round((utc(a) - utc(de)) / 86_400_000);
/** 0 = lundi … 6 = dimanche */
export const jourSem = (j: string): number => (new Date(utc(j)).getUTCDay() + 6) % 7;
export const lundiDe = (j: string): string => ajouterJ(j, -jourSem(j));
export const premierDuMois = (j: string, decalage = 0): string => {
  const { a, m } = lire(j);
  return iso(a, m + decalage, 1);
};
/** Données lues autour d'une semaine (bande de la semaine) : son mois et ses voisins, stables d'une semaine à l'autre du
 *  même mois. Passer d'une semaine à l'autre, ou revenir à aujourd'hui, ne relit pas la base. */
export const fenetreSemaine = (lundi: string): { de: string; a: string } => ({ de: premierDuMois(lundi, -1), a: ajouterJ(premierDuMois(lundi, 2), -1) });
export const joursDuMois = (j: string): number => {
  const { a, m } = lire(j);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
/** Jour de la date `ms` lue dans des champs locaux (une date murale). */
export const isoDe = (d: Date): string => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** Le `ordinal`-ième `jour` (0 = lundi) du mois de `j` ; -1 = le dernier. Null si le mois n'en a pas autant. */
export function nemeJourDuMois(j: string, jour: number, ordinal: number): string | null {
  const premier = premierDuMois(j);
  if (ordinal === -1) {
    const dernier = ajouterJ(premierDuMois(j, 1), -1);
    return ajouterJ(dernier, -((jourSem(dernier) - jour + 7) % 7));
  }
  const d = ajouterJ(premier, (jour - jourSem(premier) + 7) % 7 + 7 * (ordinal - 1));
  return premierDuMois(d) === premier ? d : null;
}

// ——— Occurrences ———

/** Jours de la règle entre `de` et `a` inclus (sans les exceptions). */
export function joursDeRegle(r: Regle, de: string, a: string): string[] {
  const out: string[] = [];
  const debut = r.debut > de ? r.debut : de;
  if (r.freq === "unique") return r.date && r.date >= de && r.date <= a ? [r.date] : [];
  if (r.freq === "mois") {
    for (let m = premierDuMois(debut); m <= a; m = premierDuMois(m, 1)) {
      for (const jour of r.jours) {
        const d = nemeJourDuMois(m, jour, r.ordinal ?? 1);
        if (d && d >= debut && d <= a && ecartMois(r.debut, d) % Math.max(1, r.intervalle) === 0) out.push(d);
      }
    }
    return out.sort();
  }
  if (r.freq === "annee") {
    if (!r.date) return [];
    const { m, d } = lire(r.date);
    for (let an = lire(debut).a; an <= lire(a).a; an++) {
      const x = iso(an, m, d);
      if (x >= debut && x <= a && x >= r.date) out.push(x);
    }
    return out;
  }
  const pas = Math.max(1, r.intervalle);
  for (let d = debut; d <= a; d = ajouterJ(d, 1)) {
    if (r.freq === "jour") {
      if (ecartJ(r.debut, d) % pas === 0) out.push(d);
    } else if (r.jours.includes(jourSem(d)) && (ecartJ(lundiDe(r.debut), lundiDe(d)) / 7) % pas === 0) out.push(d);
  }
  return out;
}

const ecartMois = (de: string, a: string) => {
  const x = lire(de);
  const y = lire(a);
  return (y.a - x.a) * 12 + (y.m - x.m);
};

/** Séances prévues entre `de` et `a` inclus, triées par jour puis heure. Les règles éteintes n'en donnent aucune. */
export function occurrences(
  progs: Programmation[],
  exceptions: Exception[],
  de: string,
  a: string,
  heureDefaut: string,
  infos?: ReadonlyMap<string, InfoRoutine>,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const p of progs) {
    if (!p.actif) continue;
    const exc = exceptions.filter((e) => e.programmationId === p.id);
    const heure = p.regle.heure ?? heureDefaut;
    const info = infos?.get(p.routineId);
    // Une séance décalée hors de la fenêtre peut y revenir : on élargit la lecture des origines d'un mois de chaque côté.
    for (const origine of joursDeRegle(p.regle, ajouterJ(de, -31), ajouterJ(a, 31))) {
      const e = exc.find((x) => x.dateOrigine === origine);
      if (e?.type === "retiree") continue;
      const date = e?.type === "decalee" && e.nouvelleDate ? e.nouvelleDate : origine;
      if (date < de || date > a) continue;
      out.push({ programmationId: p.id, routineId: p.routineId, date, origine, heure: (e?.type === "decalee" && e.nouvelleHeure) || heure, repetee: p.regle.freq !== "unique", ...(info ? { sport: info.sport, dureeMin: info.dureeMin } : {}) });
    }
  }
  return out.sort((x, y) => (x.date === y.date ? x.heure.localeCompare(y.heure) : x.date.localeCompare(y.date)));
}

/** Une séance démarrée dans les 90 min de l'heure prévue est celle de ce créneau, même sans la routine. */
export const FENETRE_DEBUT_MIN = 90;

const minuteDe = (heure: string): number => {
  const [h, m] = heure.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const slugDe = (id: string) => (id.startsWith("cat:") ? id.slice(4) : id);
/** Même sport, ou deux sports rangés dans la même famille (familles-sports). Un sport inconnu ne vaut rien. */
const memeSport = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && (slugDe(a) === slugDe(b) || (aUneFamille(a) && aUneFamille(b) && familleDe(a) === familleDe(b)));

/** Écart (min) entre l'heure prévue et le début de la séance si elle recoupe le créneau de `o` ; null sinon. */
function ecartCreneau(o: Occurrence, s: SeanceJour): number | null {
  if (s.date !== o.date || !s.faite || s.debutMin == null || !memeSport(o.sport, s.sport)) return null;
  const debut = minuteDe(o.heure);
  const ecart = Math.abs(s.debutMin - debut);
  const chevauche = (o.dureeMin ?? 0) > 0 && s.debutMin < debut + o.dureeMin! && (s.finMin ?? s.debutMin) > debut;
  return ecart <= FENETRE_DEBUT_MIN || chevauche ? ecart : null;
}

/**
 * La séance terminée qui valide chaque séance prévue. Deux façons : la même routine le même jour (comme avant) ; sinon une
 * séance du même sport (ou de la même famille) qui recoupe le créneau, le même jour — début dans les 90 min de l'heure prévue
 * ou chevauchement avec [heure, heure + durée de la routine]. Une séance détectée ou importée n'a pas de routine. Avec
 * plusieurs séances prévues du même sport, la plus proche en heure ; une séance ne valide jamais deux séances prévues par le
 * sport. Rien n'est stocké : c'est calculé.
 */
export function seancesDesOccurrences(occ: readonly Occurrence[], seances: readonly SeanceJour[]): Map<Occurrence, SeanceJour> {
  const out = new Map<Occurrence, SeanceJour>();
  const prises = new Set<string>();
  for (const o of occ) {
    const s = seances.find((x) => x.faite && x.routineId === o.routineId && x.date === o.date);
    if (s) {
      out.set(o, s);
      prises.add(s.id);
    }
  }
  const paires: { o: Occurrence; s: SeanceJour; ecart: number }[] = [];
  for (const o of occ) {
    if (out.has(o)) continue;
    for (const s of seances) {
      const ecart = prises.has(s.id) ? null : ecartCreneau(o, s);
      if (ecart != null) paires.push({ o, s, ecart });
    }
  }
  paires.sort((x, y) => x.ecart - y.ecart);
  for (const { o, s } of paires) {
    if (out.has(o) || prises.has(s.id)) continue;
    out.set(o, s);
    prises.add(s.id);
  }
  return out;
}

// Un même planning interroge ce calcul pour chaque jour (marques du mois) : une fois par couple de listes.
const cache = new WeakMap<readonly Occurrence[], WeakMap<readonly SeanceJour[], Map<Occurrence, SeanceJour>>>();
function validees(occ: readonly Occurrence[], seances: readonly SeanceJour[]): Map<Occurrence, SeanceJour> {
  let parSeances = cache.get(occ);
  if (!parSeances) cache.set(occ, (parSeances = new WeakMap()));
  let m = parSeances.get(seances);
  if (!m) parSeances.set(seances, (m = seancesDesOccurrences(occ, seances)));
  return m;
}

/**
 * La séance prévue a été faite (voir `seancesDesOccurrences`). `occ` : les séances prévues autour (celles du même jour au
 * moins), pour qu'une séance ne valide pas deux créneaux ; sans elle, `o` est jugée seule.
 */
export const faite = (o: Occurrence, seances: readonly SeanceJour[], occ?: readonly Occurrence[]) => validees(occ ?? [o], seances).has(o);

/** Activité d'un capteur (Whoop) ou séance, ramenée à ses heures et à son sport (« cat:padel »). */
export interface PlageSport {
  debut: number;
  fin: number;
  sport: string | null | undefined;
}

const minutesDuJour = (ms: number) => new Date(ms).getHours() * 60 + new Date(ms).getMinutes();

/**
 * L'activité `a` (Whoop) est celle de la séance `s` : la règle de `faite`, la séance prévue étant l'activité (même jour, même sport
 * ou même famille, début dans les 90 min ou chevauchement). Une activité sans sport (« Activité » de Whoop) prend celui de la séance.
 */
export function memeCreneau(a: PlageSport, s: PlageSport): boolean {
  const date = isoDe(new Date(a.debut));
  const debutA = minutesDuJour(a.debut);
  const o: Occurrence = {
    programmationId: "", routineId: "", date, origine: date, repetee: false,
    heure: `${String(Math.floor(debutA / 60)).padStart(2, "0")}:${String(debutA % 60).padStart(2, "0")}`,
    sport: a.sport ?? s.sport, dureeMin: Math.round((a.fin - a.debut) / 60_000),
  };
  const debutS = minutesDuJour(s.debut);
  const seance: SeanceJour = { id: "", routineId: null, date: isoDe(new Date(s.debut)), faite: true, sport: s.sport, debutMin: debutS, finMin: debutS + Math.round((s.fin - s.debut) / 60_000) };
  return faite(o, [seance]);
}

/** Séances manquées entre `de` et `a` : prévues avant aujourd'hui, pas faites. Rien n'est stocké : c'est calculé. */
export function manquees(occ: Occurrence[], seances: SeanceJour[], aujourdhui: string): Occurrence[] {
  return occ.filter((o) => o.date < aujourdhui && !faite(o, seances, occ));
}

/** Séances à venir (aujourd'hui compris, si pas encore faite). */
export function aVenir(occ: Occurrence[], seances: SeanceJour[], aujourdhui: string): Occurrence[] {
  return occ.filter((o) => o.date >= aujourdhui && !faite(o, seances, occ));
}

/** Horizon de recherche de la prochaine séance (une règle mensuelle ou une date lointaine). */
export const HORIZON_J = 400;

/** Prochaine séance de chaque routine programmée. */
export function prochaines(
  progs: Programmation[],
  exceptions: Exception[],
  seances: SeanceJour[],
  aujourdhui: string,
  heureDefaut: string,
  infos?: ReadonlyMap<string, InfoRoutine>,
): Map<string, Occurrence> {
  const out = new Map<string, Occurrence>();
  for (const o of aVenir(occurrences(progs, exceptions, aujourdhui, ajouterJ(aujourdhui, HORIZON_J), heureDefaut, infos), seances, aujourdhui)) {
    if (!out.has(o.routineId)) out.set(o.routineId, o);
  }
  return out;
}

/** La routine dont la prochaine séance est la plus proche (seule étiquette en orange) ; égalité : la plus tôt dans la journée. */
export function laPlusProche(p: Map<string, Occurrence>): string | null {
  let m: Occurrence | null = null;
  for (const o of p.values()) if (!m || o.date < m.date || (o.date === m.date && o.heure < m.heure)) m = o;
  return m?.routineId ?? null;
}

/** « Prochaine : … » : aujourd'hui, demain, le nom du jour dans les 6 jours, sinon jj/mm. */
export type Quand = { genre: "aujourdhui" | "demain" } | { genre: "jour"; jour: number } | { genre: "date"; jj: number; mm: number };
export function quand(date: string, aujourdhui: string): Quand {
  const n = ecartJ(aujourdhui, date);
  if (n <= 0) return { genre: "aujourdhui" };
  if (n === 1) return { genre: "demain" };
  if (n < 7) return { genre: "jour", jour: jourSem(date) };
  const { m, d } = lire(date);
  return { genre: "date", jj: d, mm: m };
}

/** Marque d'un jour : une seule pastille, par priorité faite > à venir > manquée. */
export type Marque = "faite" | "prevue" | "manquee" | null;
export function marqueDuJour(date: string, occ: Occurrence[], seances: SeanceJour[], aujourdhui: string): Marque {
  if (seances.some((s) => s.faite && s.date === date)) return "faite";
  const ici = occ.filter((o) => o.date === date);
  if (date >= aujourdhui && ici.some((o) => !faite(o, seances, occ))) return "prevue";
  if (date < aujourdhui && ici.some((o) => !faite(o, seances, occ))) return "manquee";
  return null;
}

/** Les sept jours (lundi → dimanche) de la semaine de `j`. */
export const semaineDe = (j: string): string[] => Array.from({ length: 7 }, (_, i) => ajouterJ(lundiDe(j), i));

/** Grille d'un mois : cases vides avant le 1er (lundi en premier), puis les jours. */
export function grilleMois(premier: string): (string | null)[] {
  return [...Array<null>(jourSem(premier)).fill(null), ...Array.from({ length: joursDuMois(premier) }, (_, i) => ajouterJ(premier, i))];
}

/** Décalage de toute la série : la règle hebdomadaire change de jour (`de` → `vers`) ; les autres règles deviennent ce jour-là. */
export function deplacerSerie(r: Regle, de: string, vers: string): Regle {
  if (r.freq === "semaine") {
    const jours = [...new Set(r.jours.map((j) => (j === jourSem(de) ? jourSem(vers) : j)))].sort();
    return { ...r, jours };
  }
  if (r.freq === "mois") return { ...r, jours: r.jours.map((j) => (j === jourSem(de) ? jourSem(vers) : j)) };
  if (r.freq === "jour") return { ...r, debut: ajouterJ(r.debut, ecartJ(de, vers)) };
  return { ...r, date: vers };
}

/** Heure moins le rappel : minutes depuis minuit (peut être négatif : la veille). */
export function minuteDuRappel(heure: string, rappelMin: number): number {
  const [h, m] = heure.split(":").map(Number) as [number, number];
  return h * 60 + m - rappelMin;
}
