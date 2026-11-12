// Chrono d'une série en durée (D16), partagé par le ▶ de la ligne et le grand ▶ du plein écran. Il compte le temps
// réellement fait, depuis zéro : la durée prévue (cible de la routine, précédent) ne s'y ajoute jamais (bug du 29/10 : une
// série prévue à 1:00 comptait 1:01, 1:02… et vibrait aussitôt). Planche seance-duree (D1 A, validée le 29/10) : il s'affiche
// en compte à rebours depuis la cible, puis compte le dépassement à part (« +0:07 ») ; la coche enregistre le temps réel.
// Pur : testé par tests/chrono-serie.test.ts.
import { INFO_NATURE, type Nature } from "../db/natures";
import { tempsTexte } from "./format";

export interface ChronoSerie {
  /** ms déjà comptées avant la marche en cours. */
  cumul: number;
  /** Début de la marche en cours (ms) ; null en pause. */
  debut: number | null;
  /** Cible atteinte : la vibration est déjà partie. */
  vibre: boolean;
  /** Durée prévue (s) au lancement : le compte à rebours part d'elle ; null sans cible (le chrono monte). */
  cibleS: number | null;
}

// Chronos lancés (en marche ou en pause) : survivent aux rendus (la liste se redessine à chaque série cochée).
const chronos = new Map<string, ChronoSerie>();
// Séries arrêtées d'un toucher pour corriger leur temps : relancées, elles repartent du temps de la case.
const reprises = new Set<string>();
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

export const ecouleMs = (x: ChronoSerie, maintenant = Date.now()) => x.cumul + (x.debut == null ? 0 : maintenant - x.debut);
export const ecouleS = (x: ChronoSerie, maintenant = Date.now()) => Math.floor(ecouleMs(x, maintenant) / 1000);

export const chronoDe = (serieId: string): ChronoSerie | undefined => chronos.get(serieId);

/** Natures dont la série a un temps : le grand ▶ du plein écran y lance le chrono (le tempo reste aux répétitions). */
export const aUnChrono = (nature: Nature): boolean => INFO_NATURE[nature].colonnes.some((c) => c.champ === "duree_s");

/**
 * ▶ / ⏸ : lance, met en pause ou reprend. Lancé, il part de zéro avec la cible `cibleS` ; seulement après un toucher pour
 * corriger, il repart de `caseS`, le temps (corrigé) de la case, sans cible ni vibration : la case ne porte plus la durée prévue.
 */
export function basculerChrono(serieId: string, caseS: number | null, maintenant = Date.now(), cibleS: number | null = null): void {
  const x = chronos.get(serieId);
  if (!x) {
    const reprise = reprises.delete(serieId);
    chronos.set(serieId, { cumul: (reprise ? (caseS ?? 0) : 0) * 1000, debut: maintenant, vibre: reprise, cibleS: reprise || !cibleS ? null : cibleS });
  } else if (x.debut != null) {
    x.cumul = ecouleMs(x, maintenant);
    x.debut = null;
  } else x.debut = maintenant;
  prevenir();
}

/** Valider la série arrête son chrono : rend la durée comptée (s, une au moins), ou null s'il n'était pas lancé. */
export function arreterChrono(serieId: string, maintenant = Date.now()): number | null {
  reprises.delete(serieId);
  const x = chronos.get(serieId);
  if (!x) return null;
  chronos.delete(serieId);
  prevenir();
  return Math.max(1, Math.round(ecouleMs(x, maintenant) / 1000));
}

/** Toucher le chrono : il s'arrête et rend le temps compté, que la case reçoit pour être corrigé. */
export function toucherChrono(serieId: string, maintenant = Date.now()): number | null {
  const x = chronos.get(serieId);
  if (!x) return null;
  chronos.delete(serieId);
  reprises.add(serieId);
  prevenir();
  return ecouleS(x, maintenant);
}

/** Vrai une seule fois, quand le temps fait atteint la cible : la vibration part à ce moment-là. */
export function cibleAtteinte(serieId: string, cibleS: number | null, maintenant = Date.now()): boolean {
  const x = chronos.get(serieId);
  if (!x || x.vibre || !cibleS || ecouleMs(x, maintenant) < cibleS * 1000) return false;
  x.vibre = true;
  return true;
}

export interface AffichageChrono {
  /** Temps qui reste, puis le dépassement (« +0:07 ») ; sans cible, le temps écoulé. */
  texte: string;
  /** Cible atteinte : la case et le grand chiffre passent au vert, le dépassement compte à part. */
  depasse: boolean;
  /** Temps réellement fait (s) : le total au-delà de la cible (« 1:07 au total »). */
  ecouleS: number;
  /** Part restante de la cible (1 au lancement, 0 à la cible) : le trait du geste se vide ; null sans cible. */
  reste: number | null;
  marche: boolean;
}

/** Ce que montrent la case et le grand chiffre d'une série dont le chrono est lancé (null s'il ne l'est pas). */
export function affichageChrono(serieId: string, maintenant = Date.now()): AffichageChrono | null {
  const x = chronos.get(serieId);
  if (!x) return null;
  const ms = ecouleMs(x, maintenant), s = Math.floor(ms / 1000), marche = x.debut != null;
  if (!x.cibleS) return { texte: tempsTexte(s), depasse: false, ecouleS: s, reste: null, marche };
  if (s < x.cibleS) return { texte: tempsTexte(x.cibleS - s), depasse: false, ecouleS: s, reste: Math.max(0, 1 - ms / (x.cibleS * 1000)), marche };
  return { texte: `+${tempsTexte(s - x.cibleS)}`, depasse: true, ecouleS: s, reste: 0, marche };
}

/** Échéance (ms) du premier chrono en marche qui n'a pas encore atteint sa cible : l'alerte (son, écran verrouillé) y part. */
export function prochaineFinCible(maintenant = Date.now()): number | null {
  let fin: number | null = null;
  for (const x of chronos.values()) {
    if (x.debut == null || !x.cibleS || x.vibre) continue;
    const f = x.debut + x.cibleS * 1000 - x.cumul;
    if (f > maintenant && (fin == null || f < fin)) fin = f;
  }
  return fin;
}

/** Écart du temps enregistré à la cible, sous le temps d'une série validée : « +7 s », « −12 s », « +1:05 » ; vide sinon. */
export function ecartCible(dureeS: number | null | undefined, cibleS: number | null | undefined): string {
  if (dureeS == null || !cibleS) return "";
  const d = Math.round(dureeS - cibleS);
  if (!d) return "";
  const n = Math.abs(d);
  return `${d > 0 ? "+" : "−"}${n < 60 ? `${n} s` : tempsTexte(n)}`;
}

/** Abonnement aux lancements, pauses et arrêts (ligne de série, grand ▶ du plein écran) ; rend le désabonnement. */
export function ecouterChronos(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}
