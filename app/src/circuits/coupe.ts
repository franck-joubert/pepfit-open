// Parcours publiés (NOTES § 3.8, D5) : le début et la fin de chaque sortie sont coupés SUR LE TÉLÉPHONE, chacun d'une
// longueur tirée entre 400 et 800 m, différente à chaque sortie. Pas de cercle fixe autour du domicile : les extrémités
// d'un cercle se recoupent en deux ou trois sorties (Hassan et al., USENIX Security 2018).
// La longueur est tirée d'une graine secrète du téléphone et de l'id de la séance : elle reste la même à chaque nouvel
// envoi (sinon des envois successifs, coupés différemment, finiraient par révéler ce qui était coupé), et personne
// d'autre ne peut la recalculer. Ce qui est coupé ne part jamais.

export const COUPE_MIN_M = 400;
export const COUPE_MAX_M = 800;
/** Ce qui doit rester au milieu pour publier un tracé : en deçà, pas de tracé du tout. */
export const RESTE_MIN_M = 200;
/** Points au plus après simplification (serveur : 400). */
export const POINTS_MAX = 300;

export interface Point {
  lat: number;
  lon: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const longueurM = (pts: readonly Point[]) => pts.slice(1).reduce((t, p, i) => t + distanceM(pts[i]!, p), 0);

/** Hachage 53 bits (cyrb53) : mélange stable de la graine et de l'id ; la graine reste secrète. */
function hache(s: string, graine: number): number {
  let h1 = 0xdeadbeef ^ graine;
  let h2 = 0x41c6ce57 ^ graine;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Longueurs coupées au début et à la fin (m) d'une séance : entre 400 et 800, propres à la séance, stables. */
export function longueursCoupees(graine: string, seanceId: string): [number, number] {
  const tirer = (cote: string) => COUPE_MIN_M + (hache(`${graine}|${seanceId}|${cote}`, 7) / 2 ** 53) * (COUPE_MAX_M - COUPE_MIN_M);
  return [tirer("debut"), tirer("fin")];
}

/** Point à `d` m du début de `pts` (interpolé), avec l'indice du segment. */
function pointA(pts: readonly Point[], d: number): { p: Point; i: number } {
  let parcouru = 0;
  for (let i = 1; i < pts.length; i++) {
    const s = distanceM(pts[i - 1]!, pts[i]!);
    if (parcouru + s >= d) {
      const f = s > 0 ? (d - parcouru) / s : 0;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      return { p: { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }, i };
    }
    parcouru += s;
  }
  return { p: pts[pts.length - 1]!, i: pts.length - 1 };
}

/** Tracé sans ses `debutM` premiers ni ses `finM` derniers mètres ; null s'il ne reste pas assez. */
export function couper(pts: readonly Point[], debutM: number, finM: number): Point[] | null {
  if (pts.length < 2) return null;
  const total = longueurM(pts);
  if (total - debutM - finM < RESTE_MIN_M) return null;
  const a = pointA(pts, debutM);
  const b = pointA(pts, total - finM);
  return [a.p, ...pts.slice(a.i, b.i), b.p];
}

/** Distance d'un point au segment ab, en mètres (plan local, assez juste à cette échelle). */
function ecart(p: Point, a: Point, b: Point): number {
  const k = Math.cos(rad(a.lat));
  const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * (Math.PI / 180) * R;
}

/** Douglas-Peucker à `tolerance` m, relevée jusqu'à tenir en `max` points. */
export function simplifier(pts: readonly Point[], max = POINTS_MAX, tolerance = 3): Point[] {
  if (pts.length <= 2) return [...pts];
  const garder = (tol: number) => {
    const ok = new Uint8Array(pts.length);
    ok[0] = ok[pts.length - 1] = 1;
    const pile: [number, number][] = [[0, pts.length - 1]];
    while (pile.length) {
      const [i, j] = pile.pop()!;
      let m = -1, dm = tol;
      for (let k = i + 1; k < j; k++) {
        const d = ecart(pts[k]!, pts[i]!, pts[j]!);
        if (d > dm) (dm = d), (m = k);
      }
      if (m > 0) (ok[m] = 1), pile.push([i, m], [m, j]);
    }
    return pts.filter((_, i) => ok[i]);
  };
  let tol = tolerance;
  let r = garder(tol);
  while (r.length > max) r = garder((tol *= 1.6));
  return r;
}

const arrondi = (n: number) => Math.round(n * 1e5) / 1e5;

/** Le tracé tel qu'il part : coupé, simplifié, arrondi à 5 décimales (≈ 1 m). Null : rien ne part. La distance publiée
 * reste celle de la sortie entière (planche : « 10,2 km ») ; seul le dessin est coupé. */
export function tracePublic(pts: readonly Point[], graine: string, seanceId: string): [number, number][] | null {
  const [d, f] = longueursCoupees(graine, seanceId);
  const c = couper(pts, d, f);
  return c ? simplifier(c).map((p) => [arrondi(p.lat), arrondi(p.lon)]) : null;
}
