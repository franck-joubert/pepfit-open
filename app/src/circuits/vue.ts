// Ce que la page d'un circuit dessine (planche Circuits, page, carte plein écran) : le tracé décodé avec ses altitudes et sa distance
// cumulée, les morceaux colorés par l'altitude (la rampe d'une sortie terminée) et la courbe du profil. Pur (sans React) : les écrans
// ne font que poser ce que ce module calcule.
import { echelleAltitude, melange, niveauAlt } from "../ecrans/effort-vue";
import type { Pt } from "../ecrans/suivi-direct-vue";
import { haversineM } from "./geo";
import { decoderAltitudes, decoderTrace } from "./polyline";
import type { Circuit, Point } from "./types";

export interface VueCircuit {
  points: Point[];
  /** Une altitude (m) par point ; null quand le circuit n'en a pas (ou qu'elles ne collent pas au tracé). */
  alts: number[] | null;
  /** Distance parcourue (m) à chaque point : 0 au départ. */
  cumul: number[];
  /** Longueur du tracé (m), la dernière valeur de `cumul`. */
  longueurM: number;
}

/** Le tracé d'un circuit prêt à dessiner ; null si sa polyline est illisible ou trop courte. */
export function vueDuCircuit(c: Pick<Circuit, "trace" | "profil">): VueCircuit | null {
  const points = decoderTrace(c.trace);
  if (!points || points.length < 2) return null;
  const lues = c.profil ? decoderAltitudes(c.profil) : null;
  const cumul: number[] = [0];
  for (let i = 1; i < points.length; i++) cumul.push(cumul[i - 1]! + haversineM(points[i - 1]!, points[i]!));
  return { points, alts: lues && lues.length === points.length ? lues : null, cumul, longueurM: cumul[cumul.length - 1]! };
}

/** Un morceau du tracé de même couleur : les points `a` à `b` inclus. */
export interface MorceauTrace {
  a: number;
  b: number;
  couleur: string;
}

/** Points par morceau : comme le tracé d'une sortie terminée (BlocEffort), assez fin pour que la rampe se lise comme un dégradé. */
export const PAS_MORCEAU = 6;

/**
 * Le tracé par petits morceaux colorés par l'altitude (turquoise en bas, jaune en haut) ; d'une seule couleur `neutre` sans altitudes.
 * Chaque morceau garde son premier point (`a`) et son dernier (`b`) : les morceaux se touchent, le trait est continu.
 */
export function morceauxCircuit(alts: readonly number[] | null, n: number, bas: string, haut: string, neutre: string, pas = PAS_MORCEAU): MorceauTrace[] {
  if (n < 2) return [];
  const sortie: MorceauTrace[] = [];
  const min = alts ? Math.min(...alts) : 0;
  const max = alts ? Math.max(...alts) : 0;
  for (let a = 0; a < n - 1; a += pas) {
    const b = Math.min(a + pas, n - 1);
    sortie.push({ a, b, couleur: alts ? melange(bas, haut, niveauAlt(alts[a]!, min, max)) : neutre });
  }
  return sortie;
}

/** Le tracé en GeoJSON pour une carte MapLibre : un trait par morceau, sa couleur dans la propriété `c` (la carte pleine et celle de Découvrir le posent pareil). */
export function traceGeoJson(vue: Pick<VueCircuit, "points" | "alts">, bas: string, haut: string, neutre: string) {
  return {
    type: "FeatureCollection" as const,
    features: morceauxCircuit(vue.alts, vue.points.length, bas, haut, neutre).map((m) => ({
      type: "Feature" as const,
      properties: { c: m.couleur },
      geometry: { type: "LineString" as const, coordinates: vue.points.slice(m.a, m.b + 1).map((p) => [p.lon, p.lat]) },
    })),
  };
}

export interface CadreCourbe {
  /** Largeur et hauteur du dessin (dp). */
  l: number;
  h: number;
  /** Place gardée au-dessus et au-dessous de la courbe. */
  haut: number;
  bas: number;
}

export interface CourbeProfil {
  /** Un point par point du tracé : la distance en abscisse (0 à `l`), l'altitude en ordonnée (le haut est en haut). */
  xy: Pt[];
  /** Les altitudes en bas et en haut du cadre (une marge de 1 m, une amplitude d'au moins celle qu'impose l'échelle commune). */
  lo: number;
  hi: number;
}

/** La courbe du profil d'altitude : la distance parcourue en abscisse, comme la séance passée (planche Lieux). */
export function courbeProfil(vue: Pick<VueCircuit, "alts" | "cumul" | "longueurM">, cadre: CadreCourbe): CourbeProfil | null {
  const alts = vue.alts;
  if (!alts || alts.length < 2 || cadre.l <= 0 || cadre.h <= cadre.haut + cadre.bas) return null;
  const { lo, hi } = echelleAltitude(Math.min(...alts), Math.max(...alts), 1);
  const total = vue.longueurM || 1;
  const yBas = cadre.h - cadre.bas;
  const xy = alts.map((a, i) => ({ x: (vue.cumul[i]! / total) * cadre.l, y: yBas - ((a - lo) / (hi - lo)) * (yBas - cadre.haut) }));
  return { xy, lo, hi };
}

/** Le point du tracé le plus proche d'une distance parcourue (m) : l'indice, pour poser un repère sur la courbe ou sur la carte. */
export function indiceALaDistance(cumul: readonly number[], d: number): number {
  let bas = 0;
  let haut = cumul.length - 1;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (cumul[m]! < d) bas = m + 1;
    else haut = m;
  }
  return bas > 0 && d - cumul[bas - 1]! < cumul[bas]! - d ? bas - 1 : bas;
}
