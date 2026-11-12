// Teinte du menu flottant et vague de changement de section, sans React Native (testée dans tests/vague-menu.test.ts).
// Fonctions « worklet » : elles tournent aussi sur le thread UI (Skia, à chaque image).

export type Rvb = readonly [number, number, number];
export type ArretTeinte = { offset: number; couleur: string };

/** Nombre d'échantillons du dégradé dessiné : la bande de la vague (60 % de la pilule) en couvre une quinzaine. */
export const ECHANTILLONS = 24;
/** Largeur du fondu de la vague (smoothstep de 0 à 1), en part de la pilule : de 5 % à 95 %, il en couvre 44 %. */
export const BANDE = 0.6;
/** Vers l'arrière (côté opposé au nouvel onglet), la vague avance plus lentement. */
const ARRIERE = 1.6;

export function rvbDe(hex: string): Rvb {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

/** Couleur du dégradé (interpolé en sRGB, comme le dessinent Skia et SVG) à la position `x` (0 → 1), assombrie. */
export function echantillon(arrets: readonly { offset: number; rvb: Rvb }[], assombrir: number, x: number): Rvb {
  "worklet";
  let a = arrets[0]!;
  let b = arrets[arrets.length - 1]!;
  for (let i = 0; i < arrets.length - 1; i++) {
    if (x >= arrets[i]!.offset && x <= arrets[i + 1]!.offset) {
      a = arrets[i]!;
      b = arrets[i + 1]!;
      break;
    }
  }
  const t = b.offset > a.offset ? Math.min(1, Math.max(0, (x - a.offset) / (b.offset - a.offset))) : 0;
  const k = 1 - assombrir;
  return [(a.rvb[0] + (b.rvb[0] - a.rvb[0]) * t) * k, (a.rvb[1] + (b.rvb[1] - a.rvb[1]) * t) * k, (a.rvb[2] + (b.rvb[2] - a.rvb[2]) * t) * k];
}

function versLineaire(c: number) {
  "worklet";
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function versSrgb(c: number) {
  "worklet";
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

/** sRGB → OKLCH (L, C, h en radians). */
export function oklch(c: Rvb): Rvb {
  "worklet";
  const r = versLineaire(c[0]);
  const g = versLineaire(c[1]);
  const b = versLineaire(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.sqrt(A * A + B * B), Math.atan2(B, A)];
}

/** OKLCH → sRGB, ramené dans le gamut par écrêtage. */
export function srgbDe(c: Rvb): Rvb {
  "worklet";
  const A = c[1] * Math.cos(c[2]);
  const B = c[1] * Math.sin(c[2]);
  const l = Math.pow(c[0] + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(c[0] - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(c[0] - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    versSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    versSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    versSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Luminance relative (WCAG). */
export function luminance(c: Rvb): number {
  "worklet";
  return 0.2126 * versLineaire(c[0]) + 0.7152 * versLineaire(c[1]) + 0.0722 * versLineaire(c[2]);
}

/**
 * Mélange en OKLCH par le plus court chemin de teinte : orange → vert passe par le jaune, bleu → rose par le violet.
 * Jamais plus lumineux que la plus claire des deux couleurs (l'écrêtage au gamut peut éclaircir) : le blanc des icônes
 * garde le contraste de ses deux teintes.
 */
export function melanger(a: Rvb, b: Rvb, t: number): Rvb {
  "worklet";
  if (t <= 0) return a;
  if (t >= 1) return b;
  const x = oklch(a);
  const y = oklch(b);
  let dh = y[2] - x[2];
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  const m = srgbDe([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + dh * t]);
  const plafond = Math.max(luminance(a), luminance(b));
  const lm = luminance(m);
  if (lm <= plafond) return m;
  // Luminance linéaire dans l'espace linéaire : on y réduit les trois canaux d'un même facteur.
  const k = plafond / lm;
  return [versSrgb(versLineaire(m[0]) * k), versSrgb(versLineaire(m[1]) * k), versSrgb(versLineaire(m[2]) * k)];
}

function lisse(a: number, b: number, x: number) {
  "worklet";
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Part de la nouvelle teinte au point `x` (0 → 1) de la pilule, à l'avancement `e` (0 → 1, la courbe de la pastille).
 * La vague part de l'ancien onglet (`depart`), file vers le nouveau (`sens` > 0 : à droite) et, plus lentement, vers
 * l'arrière ; son bord est un fondu smoothstep large de `BANDE`. Rien à 0, tout à 1.
 */
export function poidsVague(x: number, depart: number, sens: number, e: number): number {
  "worklet";
  const v = sens > 0 ? x - depart : depart - x;
  const dist = v >= 0 ? v : -v * ARRIERE;
  const devant = sens > 0 ? 1 - depart : depart;
  const derriere = sens > 0 ? depart : 1 - depart;
  const fin = Math.max(devant, derriere * ARRIERE);
  const p = -BANDE / 2 + (fin + BANDE) * e;
  return 1 - lisse(p - BANDE / 2, p + BANDE / 2, dist);
}

/** Centre de l'onglet de rang `rang` sur `n`, en part de la pilule. */
export function centreOnglet(rang: number, n: number) {
  "worklet";
  return (rang + 0.5) / n;
}

/**
 * Couleurs des `ECHANTILLONS` arrêts de la pilule (positions i / (n − 1)) pendant la vague, en [r, v, b, a] 0 → 1.
 * `fondu` (« Réduire les animations ») : même mélange partout, sans vague.
 */
export function couleursVague(
  avant: readonly { offset: number; rvb: Rvb }[],
  sombreAvant: number,
  apres: readonly { offset: number; rvb: Rvb }[],
  sombreApres: number,
  depart: number,
  sens: number,
  e: number,
  opacite: number,
  fondu: boolean,
): number[][] {
  "worklet";
  const sortie: number[][] = [];
  for (let i = 0; i < ECHANTILLONS; i++) {
    const x = i / (ECHANTILLONS - 1);
    const w = fondu ? lisse(0, 1, e) : poidsVague(x, depart, sens, e);
    const c = melanger(echantillon(avant, sombreAvant, x), echantillon(apres, sombreApres, x), w);
    sortie.push([c[0], c[1], c[2], opacite]);
  }
  return sortie;
}
