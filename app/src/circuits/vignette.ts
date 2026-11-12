// La vignette d'un circuit (planche Circuits, D14, « Ce que donne un circuit à découvrir » 1) : le tracé en couleurs d'altitude dans un carré, et
// le rond du départ. Pur (sans React) : l'écran pose ce que ce module calcule. Le tracé est allégé (une vignette de 56 dp n'a que faire des
// 400 points du circuit), projeté comme la carte du circuit (nord en haut, échelle égale), jamais vide : un tracé illisible ne donne pas de vignette.
import type { Pt } from "../ecrans/suivi-direct-vue";
import { projeter } from "../ecrans/suivi-direct-vue";
import type { Circuit } from "./types";
import { morceauxCircuit, vueDuCircuit } from "./vue";

/** Points gardés d'un tracé pour la vignette : assez pour que les boucles se lisent, peu pour qu'une liste de cent circuits reste légère. */
export const POINTS_VIGNETTE = 60;
/** Points par morceau de couleur : la rampe d'altitude se lit en une quinzaine de teintes. */
const PAS_VIGNETTE = 4;

export interface TraceVignette {
  /** Un trait par morceau de même couleur : `d` est le chemin SVG, déjà en dp de la vignette. */
  morceaux: { d: string; couleur: string }[];
  /** Le départ, en dp de la vignette. */
  depart: Pt;
}

/** Au plus `max` points, le premier et le dernier toujours gardés (un tracé allégé garde son départ et son arrivée). */
export function alleger<T>(valeurs: readonly T[], max: number): T[] {
  if (valeurs.length <= max) return [...valeurs];
  const sortie: T[] = [];
  for (let i = 0; i < max; i++) sortie.push(valeurs[Math.round((i * (valeurs.length - 1)) / (max - 1))]!);
  return sortie;
}

const un = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Le tracé d'un circuit dans un carré de `taille` dp avec `marge` autour ; null si le tracé est illisible. `bas` et `haut` : la rampe d'altitude
 * (turquoise à jaune, celle de la nuit : le tracé repose sur un voile sombre, jamais sur le fond de l'écran) ; `neutre` : sans altitudes.
 */
export function traceVignette(c: Pick<Circuit, "trace" | "profil">, taille: number, marge: number, bas: string, haut: string, neutre: string): TraceVignette | null {
  const vue = vueDuCircuit(c);
  if (!vue) return null;
  const garde = alleger(vue.points.map((p, i) => i), POINTS_VIGNETTE);
  const xy = projeter(garde.map((i) => vue.points[i]!), taille, taille, marge, marge);
  const alts = vue.alts ? garde.map((i) => vue.alts![i]!) : null;
  const morceaux = morceauxCircuit(alts, xy.length, bas, haut, neutre, PAS_VIGNETTE).map((m) => {
    let d = "";
    for (let i = m.a; i <= m.b; i++) d += `${i === m.a ? "M" : "L"}${un(xy[i]!.x)} ${un(xy[i]!.y)}`;
    return { d, couleur: m.couleur };
  });
  return { morceaux, depart: xy[0]! };
}
