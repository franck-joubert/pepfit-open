// Calendrier de l'ouverture et du retour de la page Âge pepfit (planches/age-coeur, validée le 29/10), sans React Native :
// tout est fonction de deux horloges en ms, `t` (depuis l'ouverture) et `r` (depuis le début du retour, 0 tant qu'on ne
// revient pas). Worklets : lues à chaque image sur le fil UI. Testé dans tests/age-entree.test.ts.
import { ame, courbe } from "../../theme/mouvement";

/** Cubic-bezier CSS (x1, y1, x2, y2) en fonction de x ∈ [0, 1] : Newton puis dichotomie. */
function bezier(c: readonly [number, number, number, number], x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = c;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  let u = x;
  for (let i = 0; i < 8; i++) {
    const fx = ((ax * u + bx) * u + cx) * u - x;
    const d = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(fx) < 1e-6 || Math.abs(d) < 1e-6) break;
    u -= fx / d;
  }
  if (u < 0 || u > 1 || Math.abs(((ax * u + bx) * u + cx) * u - x) > 1e-4) {
    let a = 0, b = 1;
    u = x;
    for (let i = 0; i < 30; i++) {
      if (((ax * u + bx) * u + cx) * u < x) a = u;
      else b = u;
      u = (a + b) / 2;
    }
  }
  return ((ay * u + by) * u + cy) * u;
}

/** Avancement (0..1) de [debut, debut + duree] au temps `t`. */
export function entre(t: number, debut: number, duree: number): number {
  "worklet";
  return Math.min(1, Math.max(0, (t - debut) / duree));
}
export function sortie(x: number): number {
  "worklet";
  return bezier(courbe.sortie, x);
}
export function deplacement(x: number): number {
  "worklet";
  return bezier(courbe.deplacement, x);
}

export type ModeEntree = "vol" | "fondu" | "reduit";

/** Fin de l'ouverture (ms) : tout est posé, le personnage de Santé peut s'arrêter. */
export function finOuverture(mode: ModeEntree): number {
  "worklet";
  return mode === "vol" ? ame.chiffre + ame.entree : ame.fondu;
}
/** Fin du retour (ms) : l'âme est rendue au corps, la page peut partir. */
export function finRetour(mode: ModeEntree): number {
  "worklet";
  return mode === "vol" ? ame.retour : ame.fondu;
}

/** Opacité d'ouverture d'un élément (sans le retour). `rang` : -1 le chiffre, 0 l'en-tête et « quand », 1 le rythme, 2… */
function ouverture(mode: ModeEntree, t: number, quoi: "fond" | "rang", rang = 0): number {
  "worklet";
  if (mode !== "vol") return sortie(entre(t, 0, ame.fondu));
  if (quoi === "fond") return sortie(entre(t, 0, ame.couvre));
  if (rang < 0) return sortie(entre(t, ame.chiffre, ame.entree));
  return sortie(entre(t, ame.debutEntrees + ame.ecart * rang, ame.entree));
}

/** Le fond de la page Âge (il couvre Santé à l'aller, la découvre au retour). */
export function opaciteFond(mode: ModeEntree, t: number, r: number): number {
  "worklet";
  const o = ouverture(mode, t, "fond");
  if (r <= 0) return o;
  return o * (1 - (mode === "vol" ? sortie(entre(r, ame.sortieFondDebut, ame.fondu)) : sortie(entre(r, 0, ame.fondu))));
}

/** Un bloc de contenu (chiffre : rang −1) : opacité et montée (dp) ; au retour il part en 120 ms. */
export function bloc(mode: ModeEntree, t: number, r: number, rang: number): { opacite: number; y: number; echelle: number } {
  "worklet";
  const o = ouverture(mode, t, "rang", rang);
  const part = r <= 0 ? 0 : mode === "vol" ? sortie(entre(r, 0, ame.sortieContenu)) : sortie(entre(r, 0, ame.fondu));
  const monte = mode === "reduit" ? 0 : rang < 0 ? 0 : 6 * (1 - o);
  return { opacite: o * (1 - part), y: monte, echelle: mode === "vol" && rang < 0 ? 0.96 + 0.04 * o : 1 };
}

/**
 * Signature : avancement du vol (0 = dans la poitrine, 1 = à sa place) et légèreté (1 = l'âme, 0 = la signature). Le retour
 * part de là où en était l'ouverture (`t` gelé au début du retour) : un retour pendant le vol fait demi-tour sans saut.
 */
export function vol(mode: ModeEntree, t: number, r: number): { p: number; leger: number; opacite: number } {
  "worklet";
  if (mode !== "vol") {
    const o = sortie(entre(t, 0, ame.fondu)) * (r <= 0 ? 1 : 1 - sortie(entre(r, 0, ame.fondu)));
    return { p: 1, leger: 0, opacite: o };
  }
  const p0 = deplacement(entre(t, 0, ame.vol));
  const l0 = 1 - deplacement(entre(t, ame.morphoseDebut, ame.morphose));
  if (r <= 0) return { p: p0, leger: l0, opacite: 1 };
  return {
    p: p0 * (1 - deplacement(entre(r, 0, ame.retour))),
    leger: 1 - (1 - l0) * (1 - deplacement(entre(r, 0, ame.morphoseRetour))),
    opacite: 1,
  };
}
