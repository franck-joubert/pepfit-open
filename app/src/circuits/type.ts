// Boucle, aller-retour ou linéaire : la même règle que le serveur (serveur/pb_hooks/circuits.js, typeDuTrace). Le type est
// déduit du tracé, et modifiable par la personne.
import { BOUCLE_M, RETOUR_PART, RETOUR_PAS_M, RETOUR_TOL_M } from "./regles";
import { densifier, ecartTraceM, haversineM, longueurM } from "./geo";
import type { Point, TypeCircuit } from "./types";

/** Part des points de `b` (échantillonnés tous les `pas` m) à moins de `tol` m du tracé `a`. */
function partProche(a: readonly Point[], b: readonly Point[], pas: number, tol: number): number {
  const points = densifier(b, pas);
  let proches = 0;
  for (const p of points) if (ecartTraceM(p, a) <= tol) proches++;
  return proches / points.length;
}

/** Le tracé jusqu'à la distance `d` (m) et le reste, coupés en un point interpolé. */
function couperA(pts: readonly Point[], d: number): [Point[], Point[]] {
  let parcouru = 0;
  for (let i = 1; i < pts.length; i++) {
    const s = haversineM(pts[i - 1]!, pts[i]!);
    if (parcouru + s >= d) {
      const f = s > 0 ? (d - parcouru) / s : 0;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const p = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
      return [[...pts.slice(0, i), p], [p, ...pts.slice(i)]];
    }
    parcouru += s;
  }
  return [pts.slice(), [pts[pts.length - 1]!, pts[pts.length - 1]!]];
}

/**
 * Boucle (le début et la fin à moins de 150 m), aller-retour (idem, mais la seconde moitié reprend la première : 85 % de ses
 * points à moins de 40 m) ou linéaire (le début et la fin sont éloignés).
 */
export function typeDuTrace(pts: readonly Point[]): TypeCircuit {
  if (pts.length < 2) return "lineaire";
  if (haversineM(pts[0]!, pts[pts.length - 1]!) > BOUCLE_M) return "lineaire";
  const total = longueurM(pts);
  if (total < 2 * BOUCLE_M) return "boucle";
  const [premiere, seconde] = couperA(pts, total / 2);
  return partProche(premiere, seconde, RETOUR_PAS_M, RETOUR_TOL_M) >= RETOUR_PART ? "aller-retour" : "boucle";
}
