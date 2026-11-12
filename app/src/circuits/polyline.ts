// Codage du tracé en polyline de Google (5 décimales) et des altitudes en écarts entiers : le même que le serveur
// (serveur/pb_hooks/circuits.js, encoderPolyline et encoderAltitudes), vérifié par les cas partagés (tests/circuits.test.ts).
import type { Point } from "./coupe";

function ecrire(v: number, sortie: string[]): void {
  let n = v < 0 ? ~(v << 1) : v << 1;
  while (n >= 0x20) {
    sortie.push(String.fromCharCode((0x20 | (n & 0x1f)) + 63));
    n >>= 5;
  }
  sortie.push(String.fromCharCode(n + 63));
}

/** Les entiers codés dans la chaîne ; null si elle est tronquée ou n'est pas une polyline. */
function lire(s: string): number[] | null {
  const r: number[] = [];
  let i = 0;
  while (i < s.length) {
    let n = 0;
    let decalage = 0;
    let c: number;
    do {
      if (i >= s.length) return null;
      c = s.charCodeAt(i++) - 63;
      if (c < 0 || c > 63) return null;
      n |= (c & 0x1f) << decalage;
      decalage += 5;
    } while (c >= 0x20);
    r.push(n & 1 ? ~(n >> 1) : n >> 1);
  }
  return r;
}

export function encoderTrace(pts: readonly Point[]): string {
  const s: string[] = [];
  let la = 0;
  let lo = 0;
  for (const p of pts) {
    const a = Math.round(p.lat * 1e5);
    const o = Math.round(p.lon * 1e5);
    ecrire(a - la, s);
    ecrire(o - lo, s);
    la = a;
    lo = o;
  }
  return s.join("");
}

/** Le tracé codé ; null si la chaîne n'est pas une polyline valide (un circuit reçu d'ailleurs ne casse rien). */
export function decoderTrace(chaine: string): Point[] | null {
  const v = lire(chaine);
  if (!v || v.length % 2) return null;
  const r: Point[] = [];
  let la = 0;
  let lo = 0;
  for (let i = 0; i < v.length; i += 2) {
    la += v[i]!;
    lo += v[i + 1]!;
    r.push({ lat: la / 1e5, lon: lo / 1e5 });
  }
  return r;
}

/** Altitudes (arrondies au mètre) → écarts codés. */
export function encoderAltitudes(alts: readonly number[]): string {
  const s: string[] = [];
  let avant = 0;
  for (const a of alts) {
    const v = Math.round(a);
    ecrire(v - avant, s);
    avant = v;
  }
  return s.join("");
}

export function decoderAltitudes(chaine: string): number[] | null {
  const v = lire(chaine);
  if (!v) return null;
  let a = 0;
  return v.map((d) => (a += d));
}
