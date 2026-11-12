// Zones blessées sur le personnage en verre (planche sante-suivi, D2 et D3), sans rien de React Native. Le shader du verre
// (verre.ts) reçoit le masque de l'écorché (id du muscle × pas dans R, présence dans G) : chaque zone allumée (muscle + côté)
// prend le rouge « muscle » des jetons. Le toucher : une passe d'identifiants (même maillage, même pose) dont on lit le pixel
// sous le doigt (id du muscle, côté) ; rien n'est dessiné à l'écran par elle.
import type { Cote } from "../../db/depots/suivi";
import { FRAG, VERT } from "./verre";

/** Zones allumées à la fois (une blessure active chacune ; au-delà, les premières). */
export const MAX_ZONES = 4;

/** Côté du modèle : le personnage regarde la caméra, son côté droit est en x < 0 (comme la planche). */
const SIGNE: Record<Cote, number> = { d: -1, g: 1, "2": 0, "-": 0 };

/** Le verre déclare déjà l'UV (relief) ; les zones y ajoutent le x de repos (côté). */
const VARYING_X = "varying float vX;";
const VARYINGS = `varying vec2 vUv; ${VARYING_X}`;

/** Même sommet que le verre, plus le x de repos (côté). */
export const VERT_ZONES = VERT.replace("varying vec3 vN;", `${VARYING_X} varying vec3 vN;`).replace("void main() {", "void main() {\n  vX = position.x;");

const UNIFORMES_GLSL = `uniform sampler2D uMasque; uniform float uPas; uniform vec2 uZones[${MAX_ZONES}]; uniform vec3 uBless;`;

/** Ce muscle (id) et ce côté (signe, 0 = les deux) sont-ils sous ce fragment ? */
const EST = `
float idIci() { return floor(texture2D(uMasque, vUv).r * 255.0 / uPas + 0.5); }
float dansMuscle() { return smoothstep(0.45, 0.62, texture2D(uMasque, vUv).g); }`;

export const FRAG_ZONES = FRAG.replace("void main() {", `${UNIFORMES_GLSL}\n${VARYING_X}\n${EST}\nvoid main() {`).replace(
  "  gl_FragColor = vec4(clamp(col",
  `  float id = idIci(), est = 0.0;
  for (int k = 0; k < ${MAX_ZONES}; k++) {
    vec2 z = uZones[k];
    if (z.x > 0.5 && abs(id - z.x) < 0.5 && (z.y == 0.0 || vX * z.y >= 0.0)) est = 1.0;
  }
  est *= dansMuscle();
  // zone blessée : le muscle dans la couleur « muscle », plus opaque que le verre
  col = mix(col, uBless * (0.75 + 0.45 * dif) + vec3(spec * 0.3), est * 0.92);
  a = mix(a, 0.97, est);
  gl_FragColor = vec4(clamp(col`,
);

/** Passe d'identifiants : R = id du muscle / 255 (0 hors muscle), G = 1 côté droit, 0 côté gauche ; A = 1 sur le corps. */
export const FRAG_PICK = `
${UNIFORMES_GLSL}
${VARYINGS}
${EST}
void main() {
  float id = dansMuscle() > 0.5 ? idIci() : 0.0;
  gl_FragColor = vec4(id / 255.0, vX < 0.0 ? 1.0 : 0.0, 0.0, 1.0);
}`;

/** Valeurs de uZones : (id du muscle, signe du côté) ; (0, 0) = rien. */
export function valeursZones(zones: readonly { zone: string; cote: Cote }[], muscles: Readonly<Record<string, number>>): [number, number][] {
  const v: [number, number][] = zones
    .filter((z) => muscles[z.zone] != null)
    .slice(0, MAX_ZONES)
    .map((z) => [muscles[z.zone]!, SIGNE[z.cote]]);
  while (v.length < MAX_ZONES) v.push([0, 0]);
  return v;
}

/** Pixel lu sous le doigt → muscle touché et côté ; null hors muscle (ou hors corps). */
export function lirePixel(rgba: ArrayLike<number>, muscles: Readonly<Record<string, number>>): { zone: string; cote: "g" | "d" } | null {
  if ((rgba[3] ?? 0) < 128) return null;
  const id = Math.round(rgba[0] ?? 0);
  const zone = Object.keys(muscles).find((m) => muscles[m] === id);
  return zone ? { zone, cote: (rgba[1] ?? 0) >= 128 ? "d" : "g" } : null;
}

/** Rouge de la zone blessée (planche : « muscle » des jetons le jour, plus vif la nuit pour ressortir dans le verre). */
export const COULEUR_ZONE: Record<"nuit" | "jour", string> = { nuit: "#ff3b3b", jour: "#b5111b" };

/**
 * Centre (fraction de la largeur et de la hauteur, depuis le haut) des pixels d'un muscle dans la passe d'identifiants lue en
 * entier (lignes du bas vers le haut, comme readPixels) : la bulle « Zone » y relie son trait. Un pixel sur `pas`.
 */
export function centreZone(px: ArrayLike<number>, l: number, h: number, id: number, cote: Cote, pas = 3): { fx: number; fy: number } | null {
  let sx = 0, sy = 0, n = 0;
  const s = SIGNE[cote];
  for (let y = 0; y < h; y += pas) {
    for (let x = 0; x < l; x += pas) {
      const i = (y * l + x) * 4;
      if ((px[i + 3] ?? 0) < 128 || Math.round(px[i] ?? 0) !== id) continue;
      const droit = (px[i + 1] ?? 0) >= 128;
      if (s !== 0 && droit !== (s < 0)) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  return n ? { fx: sx / n / l, fy: 1 - sy / n / h } : null;
}
