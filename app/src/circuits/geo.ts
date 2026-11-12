// Géométrie des circuits, sur des points { lat, lon }.
// Les distances sont celles du suivi (haversine, rayon 6 371 008,8 m) ; l'écart d'un point à un segment est celui de la
// simplification (plan local, rayon 6 371 000 m, comme profil-public/coupe.ts).
import { haversineM } from "../natif/suivi/logique";
import type { Point } from "./coupe";

export { haversineM };
/** Zone d'un degré d'un point (« 48_2 ») : le regroupement grossier des circuits. */
export const zoneDe = (lat: number, lon: number) => `${Math.floor(lat)}_${Math.floor(lon)}`;

const R_SIMPLIFICATION_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const arrondi5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Longueur d'un tracé, en mètres. */
export function longueurM(pts: readonly Point[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += haversineM(pts[i - 1]!, pts[i]!);
  return t;
}

/** Le point du segment ab le plus proche de p (plan local, assez juste à cette échelle) : sa place `t` sur le segment (0 en a, 1 en b) et la distance, en mètres. */
export function projectionSegment(p: Point, a: Point, b: Point): { t: number; ecartM: number } {
  const k = Math.cos(rad(a.lat));
  const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return { t, ecartM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * (Math.PI / 180) * R_SIMPLIFICATION_M };
}

/** Distance d'un point au segment ab (plan local, assez juste à cette échelle), en mètres. */
export const ecartSegmentM = (p: Point, a: Point, b: Point): number => projectionSegment(p, a, b).ecartM;

/** Distance d'un point à un tracé (le segment le plus proche), en mètres ; l'infini sans tracé. */
export function ecartTraceM(p: Point, pts: readonly Point[]): number {
  if (!pts.length) return Infinity;
  if (pts.length === 1) return haversineM(p, pts[0]!);
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, ecartSegmentM(p, pts[i - 1]!, pts[i]!));
  return m;
}

/** Ajoute des points tous les `pas` m au plus entre deux points du tracé. */
export function densifier(pts: readonly Point[], pas: number): Point[] {
  if (!pts.length) return [];
  const out: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = Math.ceil(haversineM(a, b) / pas);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
    }
    out.push(b);
  }
  return out;
}

/** Sud, ouest, nord, est (5 décimales). */
export function bbox(pts: readonly Point[]): [number, number, number, number] {
  let s = 90, o = 180, n = -90, e = -180;
  for (const p of pts) {
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
    if (p.lon < o) o = p.lon;
    if (p.lon > e) e = p.lon;
  }
  return [arrondi5(s), arrondi5(o), arrondi5(n), arrondi5(e)];
}

export const arrondiCodage = arrondi5;
