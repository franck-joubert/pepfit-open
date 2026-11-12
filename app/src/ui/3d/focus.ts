// Muscle mis en avant dans la 3D (tap sur sa ligne) : le reste du personnage et l'agrès s'estompent pendant 5 s, puis
// reviennent en fondu. Un autre muscle pendant ce temps prend la place et relance les 5 s ; le même muscle arrête.
// Logique pure, horloge en millisecondes (performance.now() dans l'appli) : testée sans écran.

export const DUREE_FOCUS = 5000;
/** Fondus d'entrée et de sortie du voile. */
export const ENTREE = 250;
export const SORTIE = 400;

export interface Focus {
  muscle: string;
  /** Début du fondu d'entrée (reculé si le voile était déjà là : pas de clignement en changeant de muscle). */
  debut: number;
  /** Fin de la mise en avant ; le fondu de sortie suit. */
  fin: number;
}

const borne = (v: number) => Math.min(1, Math.max(0, v));

/** Force du voile sur le reste du corps, de 0 (normal) à 1 (estompé). */
export function voile(f: Focus | null, t: number): number {
  if (!f) return 0;
  return borne(Math.min((t - f.debut) / ENTREE, (f.fin + SORTIE - t) / SORTIE));
}

/** Le muscle est-il en avant (sélectionné) à l'instant t ? */
export const focusActif = (f: Focus | null, t: number): f is Focus => !!f && t < f.fin;

/** Plus rien à montrer : fondu de sortie terminé. */
export const focusFini = (f: Focus | null, t: number) => !f || t >= f.fin + SORTIE;

/** Tap sur un muscle : le même pendant sa mise en avant l'arrête (fondu de sortie), sinon il passe devant pour 5 s. */
export function toucherMuscle(f: Focus | null, muscle: string, t: number): Focus {
  if (focusActif(f, t) && f.muscle === muscle) return { ...f, fin: t };
  return { muscle, debut: t - ENTREE * voile(f, t), fin: t + DUREE_FOCUS };
}
