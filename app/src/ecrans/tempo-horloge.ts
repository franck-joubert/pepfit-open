// Horloge du tempo (planche idee-plein-ecran, lot 3) : une seule horloge donne le temps écoulé dans la série ; tout en
// découle (consigne, décompte, ruban, temps du clip 3D). Pur : testé sous Node.
import type { Tempo } from "./tempo";

export type TypePhase = "descente" | "pauseBas" | "montee" | "pauseHaut";

/** Position de départ du clip (D6) : un squat part en haut (descente d'abord), une traction en bas (montée d'abord). */
export type Depart = "haut" | "bas";

export interface Phase {
  type: TypePhase;
  /** Répétition (0 = la première). */
  rep: number;
  debut: number;
  duree: number;
}

const ORDRE: Record<Depart, [TypePhase, number][]> = {
  haut: [["descente", 0], ["pauseBas", 1], ["montee", 2], ["pauseHaut", 3]],
  bas: [["montee", 2], ["pauseHaut", 3], ["descente", 0], ["pauseBas", 1]],
};

export const estPause = (t: TypePhase) => t === "pauseBas" || t === "pauseHaut";

/** Les phases d'une série de `reps` répétitions, bout à bout ; les phases de 0 s sont sautées. */
export function phasesSerie(tempo: Tempo, reps: number, depart: Depart = "haut"): Phase[] {
  const out: Phase[] = [];
  let t = 0;
  for (let rep = 0; rep < reps; rep++) {
    for (const [type, i] of ORDRE[depart]) {
      const duree = tempo[i]!;
      if (duree <= 0) continue;
      out.push({ type, rep, debut: t, duree });
      t += duree;
    }
  }
  return out;
}

/** Série vierge (ni reps saisies, ni plage, ni précédente) : ▶ joue quand même ce nombre de répétitions. */
export const REPS_SANS_REPERE = 10;

/** Répétitions jouées au tempo : la saisie, sinon le haut de la plage visée, sinon la série précédente, sinon 10. */
export function repsPrevues(s: { reps: number | null; plage_min: number | null; plage_max: number | null; precedent_reps: number | null }): number {
  for (const n of [s.reps, s.plage_max, s.plage_min, s.precedent_reps]) if (n != null && n > 0) return n;
  return REPS_SANS_REPERE;
}

export const dureeSerie = (phases: Phase[]): number => {
  const d = phases[phases.length - 1];
  return d ? d.debut + d.duree : 0;
};

export interface EtatTempo {
  /** Indice de la phase en cours (la dernière une fois la série finie). */
  i: number;
  phase: Phase;
  /** Secondes restantes dans la phase, arrondies au-dessus (le décompte : 3, 2, 1). */
  restant: number;
  /** Avancement dans la phase, de 0 à 1. */
  p: number;
  fini: boolean;
}

/** État à `t` secondes du début de la série. */
export function etatA(phases: Phase[], t: number): EtatTempo | null {
  if (!phases.length) return null;
  const fin = dureeSerie(phases);
  if (t >= fin) {
    const i = phases.length - 1;
    return { i, phase: phases[i]!, restant: 0, p: 1, fini: true };
  }
  const x = Math.max(0, t);
  let i = 0;
  while (i < phases.length - 1 && x >= phases[i + 1]!.debut) i++;
  const phase = phases[i]!;
  const dans = x - phase.debut;
  return { i, phase, restant: Math.max(1, Math.ceil(phase.duree - dans - 1e-9)), p: dans / phase.duree, fini: false };
}

/** Repères d'un clip qui va d'une position extrême à l'autre et revient : instants (s) du point haut et du point bas. */
export interface ReperesClip {
  haut: number;
  bas: number;
  duree: number;
  depart: Depart;
}

/**
 * Repères mesurés sur des hauteurs échantillonnées régulièrement sur la boucle (piste qui bouge le plus : barre, mains ou
 * bassin) : null si l'amplitude est trop faible pour un mouvement à tempo (gainage, étirement : boucle libre).
 */
export function reperesDepuisHauteurs(hauteurs: number[], duree: number, amplitudeMin = 0.03): ReperesClip | null {
  if (hauteurs.length < 4 || duree <= 0) return null;
  let iMax = 0;
  let iMin = 0;
  hauteurs.forEach((h, i) => {
    if (h > hauteurs[iMax]!) iMax = i;
    if (h < hauteurs[iMin]!) iMin = i;
  });
  if (hauteurs[iMax]! - hauteurs[iMin]! < amplitudeMin) return null;
  const pas = duree / hauteurs.length;
  const h0 = hauteurs[0]!;
  // Départ : l'extrême le plus proche de la première image.
  const depart: Depart = Math.abs(h0 - hauteurs[iMax]!) <= Math.abs(h0 - hauteurs[iMin]!) ? "haut" : "bas";
  return { haut: iMax * pas, bas: iMin * pas, duree, depart };
}

const modulo = (x: number, d: number) => ((x % d) + d) % d;

/**
 * Temps du clip pour une phase et son avancement : descente du point haut au point bas, montée du bas au haut (dans le
 * sens du clip, qui garde son accélération propre), pauses figées sur l'extrême.
 */
export function tempsClip(r: ReperesClip, type: TypePhase, p: number): number {
  const versBas = modulo(r.bas - r.haut, r.duree);
  const versHaut = r.duree - versBas;
  const q = Math.min(1, Math.max(0, p));
  switch (type) {
    case "descente":
      return modulo(r.haut + q * versBas, r.duree);
    case "pauseBas":
      return r.bas;
    case "montee":
      return modulo(r.bas + q * versHaut, r.duree);
    case "pauseHaut":
      return r.haut;
  }
}

/** Hauteur du geste au début d'une phase (courbe du ruban) : 1 en haut, 0 en bas. */
export function hauteurDebut(type: TypePhase): number {
  "worklet";
  return type === "descente" || type === "pauseHaut" ? 1 : 0;
}

/** Hauteur du geste à la fin d'une phase : 1 en haut, 0 en bas. */
export function hauteurFin(type: TypePhase): number {
  "worklet";
  return type === "montee" || type === "pauseHaut" ? 1 : 0;
}

/** Un trait de la courbe : `x` en secondes depuis le début de la série, `h` de 0 (bas) à 1 (haut) ; `i` : sa phase. */
export interface SegmentCourbe {
  i: number;
  pause: boolean;
  x0: number;
  h0: number;
  x1: number;
  h1: number;
}

/**
 * Courbe du ruban (planche tempo-courbe, A) : un trait par phase, bout à bout, rampe pour la descente et la montée,
 * palier pour les pauses. Une phase à 0 s n'a pas de trait ; si elle change la hauteur (descente à 0 s d'un 0-0-2-0),
 * un trait vertical, compté dans la phase qui suit, la remplace.
 */
export function segmentsCourbe(phases: Phase[]): SegmentCourbe[] {
  const out: SegmentCourbe[] = [];
  let avant: number | null = null;
  phases.forEach((ph, i) => {
    const h0 = hauteurDebut(ph.type);
    const h1 = hauteurFin(ph.type);
    if (avant !== null && avant !== h0) out.push({ i, pause: false, x0: ph.debut, h0: avant, x1: ph.debut, h1: h0 });
    out.push({ i, pause: estPause(ph.type), x0: ph.debut, h0, x1: ph.debut + ph.duree, h1 });
    avant = h1;
  });
  return out;
}

/** Hauteur du geste à `t` secondes (point du ruban, sur le fil UI) : la phase en cours à son avancement ; après la fin, la dernière. */
export function hauteurA(phases: Phase[], t: number): number {
  "worklet";
  if (!phases.length) return 0;
  let i = 0;
  while (i < phases.length - 1 && t >= phases[i + 1]!.debut) i++;
  const ph = phases[i]!;
  const p = Math.min(1, Math.max(0, (t - ph.debut) / ph.duree));
  const h0 = hauteurDebut(ph.type);
  return h0 + (hauteurFin(ph.type) - h0) * p;
}
