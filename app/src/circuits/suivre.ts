// Suivre un circuit pendant une activité (planche Circuits, lot F) : ce que l'écran de départ et le direct décident avant de dessiner. Pur
// (sans React ni réseau). Où l'on est par rapport au tracé (« Sur le circuit, il reste 7,6 km » à moins de 40 m, « À 180 m du circuit »
// au-delà), quels circuits proposer à un sport (du départ le plus proche au plus loin), et si une sortie finie a fait le circuit (« Mon temps »).
// Aucun signal, aucune navigation guidée : le circuit est une ligne sous la trace, et une phrase le dit.
import { haversineM, projectionSegment } from "./geo";
import type { ActiviteCircuit, Circuit, CircuitSuivi, Point } from "./types";
import { decoderTrace } from "./polyline";
import type { VueCircuit } from "./vue";

/** À moins de 40 m du tracé, on est « sur le circuit » (planche, s2) ; plus loin, l'écart est dit. */
export const SUR_CIRCUIT_M = 40;
/** La progression ne recule que de 50 m d'un relevé au suivant : sur une boucle, le départ et l'arrivée sont au même endroit. */
const RECUL_M = 50;
/** Une sortie a fait le circuit si elle l'a pris à son début (150 m) et l'a quitté à moins de 100 m de sa fin. */
export const DEBUT_MAX_M = 150;
export const FIN_MAX_M = 100;
/** Et si elle a couru au moins 90 % de sa longueur (un trajet en voiture d'un bout à l'autre n'est pas un temps). */
export const PART_MIN = 0.9;
/** Les points d'une sortie relus pour savoir si elle a fait le circuit : un point sur n au-delà de 1 500. */
const POINTS_LUS_MAX = 1500;

/** Ce que le suivi garde du circuit choisi : de quoi le dessiner hors ligne, rien d'autre. */
export function circuitSuivi(c: Pick<Circuit, "id" | "nom" | "trace" | "profil" | "distanceM" | "denivelePlusM">): CircuitSuivi {
  return { id: c.id, nom: c.nom, trace: c.trace, profil: c.profil, distanceM: c.distanceM, denivelePlusM: c.denivelePlusM };
}

export type TraceSuivie = Pick<VueCircuit, "points" | "cumul" | "longueurM">;

export interface EtatCircuit {
  /** À 40 m du tracé au plus. */
  surCircuit: boolean;
  /** Distance, à vol d'oiseau, jusqu'au point du tracé le plus proche (m). */
  ecartM: number;
  /** Distance parcourue sur le circuit jusqu'à ce point (m) ; ce qui reste en est le complément. */
  progresM: number;
  resteM: number;
  /** Le point du tracé le plus proche : le bout du trait pointillé quand on s'en est écarté. */
  plusProche: Point;
}

interface Candidat {
  ecartM: number;
  progresM: number;
  point: Point;
}

/** Deux places du tracé à moins de 10 m l'une de l'autre en distance sont « au même endroit » : on garde la plus tôt (la suite de la progression), pas la plus proche de rien. */
const MEME_ENDROIT_M = 10;

/**
 * Où l'on est sur le tracé. `avantM` : la progression du relevé précédent ; parmi les places du tracé à moins de 40 m qui ne reculent pas,
 * on prend la plus proche, et, à égalité (à 10 m près : une boucle repasse à son départ, un aller-retour sur ses pas), la plus tôt : jamais
 * celle de la fin quand on vient de partir. Hors du tracé, le plus proche.
 */
export function etatSurCircuit(vue: TraceSuivie, position: Point, avantM = 0): EtatCircuit {
  let proche: Candidat | null = null;
  const suites: Candidat[] = [];
  for (let i = 1; i < vue.points.length; i++) {
    const a = vue.points[i - 1]!;
    const b = vue.points[i]!;
    const { t, ecartM } = projectionSegment(position, a, b);
    const progresM = vue.cumul[i - 1]! + t * (vue.cumul[i]! - vue.cumul[i - 1]!);
    const c: Candidat = { ecartM, progresM, point: { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t } };
    if (!proche || ecartM < proche.ecartM) proche = c;
    if (ecartM <= SUR_CIRCUIT_M && progresM >= avantM - RECUL_M) suites.push(c);
  }
  let suite: Candidat | null = null;
  if (suites.length) {
    const mini = Math.min(...suites.map((c) => c.ecartM));
    for (const c of suites) if (c.ecartM <= mini + MEME_ENDROIT_M && (!suite || c.progresM < suite.progresM)) suite = c;
  }
  const choisi = suite ?? proche ?? { ecartM: Infinity, progresM: 0, point: vue.points[0] ?? position };
  return {
    surCircuit: choisi.ecartM <= SUR_CIRCUIT_M,
    ecartM: choisi.ecartM,
    progresM: choisi.progresM,
    resteM: Math.max(0, vue.longueurM - choisi.progresM),
    plusProche: choisi.point,
  };
}

/** Arrivé : à moins de 50 m de la fin, la phrase dit « Tu es arrivé » plutôt qu'« Il reste 0 m ». */
export const ARRIVE_M = 50;
export const estArrive = (e: Pick<EtatCircuit, "surCircuit" | "resteM">): boolean => e.surCircuit && e.resteM < ARRIVE_M;

export interface Parcours {
  /** Le circuit a été fait, du début à la fin. */
  fait: boolean;
  /** Le temps entre le premier relevé sur le circuit et l'arrivée (s), sans les pauses (`s` est le temps de la sortie) ; null si pas fait. */
  dureeS: number | null;
}

/** Une sortie finie a-t-elle fait ce circuit ? `distanceM` : la distance de la sortie, `points` : son tracé avec le temps `s` (ms) de chaque point. */
export function parcoursFait(vue: TraceSuivie, points: readonly (Point & { s: number })[], distanceM: number): Parcours {
  const non: Parcours = { fait: false, dureeS: null };
  if (!points.length || distanceM < vue.longueurM * PART_MIN) return non;
  const pas = Math.max(1, Math.ceil(points.length / POINTS_LUS_MAX));
  let avant = 0;
  let debutMs: number | null = null;
  for (let i = 0; i < points.length; i += pas) {
    const p = points[i]!;
    const e = etatSurCircuit(vue, p, avant);
    if (!e.surCircuit) continue;
    avant = e.progresM;
    if (debutMs == null) {
      if (e.progresM <= DEBUT_MAX_M) debutMs = p.s;
      continue;
    }
    if (e.progresM >= vue.longueurM - FIN_MAX_M) return { fait: true, dureeS: Math.max(1, Math.round((p.s - debutMs) / 1000)) };
  }
  return non;
}

/** Le sport du départ dit les activités des circuits qu'on lui propose (D8 : le trail est de la course, le gravel du vélo). Les autres sports n'ont pas de ligne « Circuit ». */
const ACTIVITES_DU_SPORT: Record<string, readonly ActiviteCircuit[]> = {
  "cat:course": ["course"],
  "cat:randonnee": ["randonnee"],
  "cat:bicycling": ["bicycling", "vtt"],
};

export const activitesDuSport = (sportId: string): readonly ActiviteCircuit[] | null => ACTIVITES_DU_SPORT[sportId] ?? null;

/** L'activité d'un circuit donne le sport du départ qu'ouvre « Suivre ce circuit » : celle que la page montre (le Segmenté), sinon la première. */
export function sportDeActivite(a: ActiviteCircuit): string {
  return a === "course" ? "cat:course" : a === "bicycling" || a === "vtt" ? "cat:bicycling" : "cat:randonnee";
}

export interface CircuitASuivre {
  circuit: Circuit;
  /** Du point où l'on est jusqu'au départ du circuit (m) ; null sans position. */
  m: number | null;
}

/**
 * Les circuits à proposer pour un départ : ceux de la personne (importés compris, privés ou publiés) et ceux de Découvrir qui vont à
 * l'activité, du départ le plus proche au plus loin ; sans position, les siens du plus récent au plus ancien. Un circuit n'est compté
 * qu'une fois (le sien l'emporte : sa copie publique est la même). Jamais un circuit privé d'un autre : Découvrir n'en rend pas.
 */
export function circuitsASuivre(
  mes: readonly Circuit[],
  decouverts: readonly { circuit: Circuit; m: number }[],
  activites: readonly ActiviteCircuit[],
  position: Point | null,
): CircuitASuivre[] {
  const vont = (c: Circuit) => c.activites.some((a) => activites.includes(a));
  const vus = new Set<string>();
  const sortie: CircuitASuivre[] = [];
  for (const c of mes) {
    if (!vont(c) || vus.has(c.id)) continue;
    vus.add(c.id);
    const depart = position ? decoderTrace(c.trace)?.[0] : undefined;
    sortie.push({ circuit: c, m: position && depart ? haversineM(position, depart) : null });
  }
  for (const d of decouverts) {
    if (!vont(d.circuit) || vus.has(d.circuit.id)) continue;
    vus.add(d.circuit.id);
    sortie.push({ circuit: d.circuit, m: d.m });
  }
  // Sans position, rien à trier : les siens d'abord, du plus récent au plus ancien comme « Mes circuits », puis ceux de Découvrir dans l'ordre reçu.
  if (!position) return sortie;
  // Un circuit dont le départ est illisible n'a pas de distance : il passe après les autres, dans son ordre d'arrivée.
  return sortie
    .map((c, i) => ({ c, i }))
    .sort((x, y) => (x.c.m == null && y.c.m == null ? x.i - y.i : x.c.m == null ? 1 : y.c.m == null ? -1 : x.c.m - y.c.m || x.i - y.i))
    .map((x) => x.c);
}

/** Un temps fait sur un circuit, gardé sur le téléphone (jamais envoyé : ni compteur, ni classement). */
export interface TempsCircuit {
  seanceId: string;
  /** Le jour où la sortie a commencé (ms). */
  le: number;
  dureeS: number;
}

export interface MonTemps {
  fois: number;
  meilleur: TempsCircuit;
  derniere: TempsCircuit;
}

/** « Mon temps » : le meilleur temps et la dernière fois, avec le nombre de fois ; null quand le circuit n'a jamais été fait. */
export function monTemps(temps: readonly TempsCircuit[]): MonTemps | null {
  if (!temps.length) return null;
  let meilleur = temps[0]!;
  let derniere = temps[0]!;
  for (const x of temps) {
    if (x.dureeS < meilleur.dureeS) meilleur = x;
    if (x.le > derniere.le) derniere = x;
  }
  return { fois: temps.length, meilleur, derniere };
}
