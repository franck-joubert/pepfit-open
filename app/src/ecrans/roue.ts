// Roue de repos : format fixe « M min SS s », zéros de tête atténués, repère des minutes pile, taille et opacité selon la distance au centre.

/** Une ligne de la roue en deux morceaux : `attenue` (zéros non significatifs), `plein`. Pas de zéro devant les minutes. */
export interface Decoupe {
  attenue: string;
  plein: string;
  /** Après la valeur, atténué (« , 120 g » : la même quantité dans l'autre unité). */
  apres?: string;
}

/** Découpe « M min SS s ». */
export function decoupeRoue(s: number): Decoupe {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  const texte = `${min} min ${String(sec).padStart(2, "0")} s`;
  if (min > 0) return { attenue: "", plein: texte };
  // 0 min : « 0 min » atténué, plus le zéro des dizaines de secondes s'il est là (0 min 05 s, 0 min 00 s)
  const coupe = sec < 10 ? "0 min 0".length : "0 min ".length;
  return { attenue: texte.slice(0, coupe), plein: texte.slice(coupe) };
}

/** Palier d'une minute pile (1 min 00 s, 2 min 00 s…) : repère visuel. */
export function minutePile(s: number): boolean {
  return s > 0 && s % 60 === 0;
}

/** Valeur lue par le lecteur d'écran : « 4 minutes », « 1 minute 30 secondes », « 5 secondes ». */
export function dureeLue(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  const mots = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  if (min === 0) return mots(sec, "seconde");
  return sec === 0 ? mots(min, "minute") : `${mots(min, "minute")} ${mots(sec, "seconde")}`;
}

/** Échelle et opacité selon la distance au centre (en lignes) : 0 = centre, puis de plus en plus petit et pâle. */
export const ECHELLES = [1, 0.85, 0.75, 0.7] as const;
export const OPACITES = [1, 0.6, 0.35, 0.2] as const;

/** Entrées et sorties d'interpolation sur la position de défilement pour la ligne `i` (hauteur de ligne `h`). */
export function interpolationLigne(i: number, h: number, sorties: readonly number[]): { inputRange: number[]; outputRange: number[] } {
  const n = sorties.length - 1;
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let d = -n; d <= n; d++) {
    inputRange.push((i + d) * h);
    outputRange.push(sorties[Math.abs(d)]!);
  }
  return { inputRange, outputRange };
}
