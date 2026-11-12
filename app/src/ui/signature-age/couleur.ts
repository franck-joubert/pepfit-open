// Cartographie couleur de l'Âge pepfit (signature animée) : écart d'âge en années (−15 = 15 ans plus jeune, +15 = 15 ans
// plus vieux) → deux encres. Encre FROIDE : vert vif → vert-bleu → bleu pep (#3D8BFF → #2563EB) à 0, puis reste bleue.
// Encre CHAUDE : orange, qui gagne la forme à partir de 0 (part `chaud`, 0 → 1 entre 0 et +9 ans). Les deux encres ne se
// mélangent pas dans un même pixel (le gris-mauve du milieu serait sale) : le shader les pose en territoires (bord, bruit).
// Jamais de rouge : la teinte la plus chaude reste ≥ 40° en OKLCH (42° à +8 ; le rouge d'erreur du thème est sous 30°), vérifié par tests/signature-age.test.ts.
// Interpolation en OKLab entre paliers : continue, sans creux de luminosité. Fonctions pures, worklets (thread UI).
// La planche (planches/age-pepfit/generer.mjs) lit CE fichier : une seule source pour la planche et l'appli.

export type Rvb = [number, number, number]; // 0..1, sRGB

/** Palier : écart d'âge, encre froide profonde / vive, encre chaude profonde / vive. */
type Palier = [number, string, string];

// Encre froide : [écart, profond, vif]
export const PALIERS_FROID: Palier[] = [
  [-15, "#0cb45a", "#46ff8c"], // vert électrique
  [-10, "#0a9f5c", "#22e488"], // « super vert »
  [-5, "#0a8c86", "#1fd6c0"], // vert-bleu sarcelle
  [-1.5, "#1a6fd0", "#38b2f5"], // bleu-vert léger
  [0, "#2563eb", "#3d8bff"], // bleu pep (point du logo)
  [15, "#2a55c4", "#5a86e6"], // bleu qui s'éteint sous l'orange
];
// Encre chaude : [écart, profond, vif]
export const PALIERS_CHAUD: Palier[] = [
  [0, "#e2620e", "#ffa25a"], // orange clair, à peine présent
  [8, "#d9560c", "#f2741f"], // orange pepfit, plus sombre que le vert : lisible en luminosité par les daltoniens
  [15, "#c4540a", "#e4661a"], // orange chaud brûlé, jamais rouge
];
export const ECART_MIN = -15;
export const ECART_MAX = 15;

export function hexVersRvb(hex: string): Rvb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function versLin(c: number): number {
  "worklet";
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function depuisLin(c: number): number {
  "worklet";
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

/** sRGB → OKLab (Björn Ottosson). */
export function versOklab(c: Rvb): Rvb {
  "worklet";
  const r = versLin(c[0]), g = versLin(c[1]), b = versLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function depuisOklab(c: Rvb): Rvb {
  "worklet";
  const l = Math.pow(c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2], 3);
  const m = Math.pow(c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2], 3);
  const s = Math.pow(c[0] - 0.0894841775 * c[1] - 1.291485548 * c[2], 3);
  return [
    depuisLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    depuisLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    depuisLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// Paliers convertis une fois en OKLab : [écart, profond, vif]
type PalierLab = [number, Rvb, Rvb];
const lab = (p: Palier[]): PalierLab[] => p.map(([e, a, b]) => [e, versOklab(hexVersRvb(a)), versOklab(hexVersRvb(b))]);
const FROID = lab(PALIERS_FROID);
const CHAUD = lab(PALIERS_CHAUD);

function interpoler(paliers: PalierLab[], ecart: number, vif: boolean): Rvb {
  "worklet";
  const k = vif ? 2 : 1;
  const n = paliers.length;
  if (ecart <= paliers[0]![0]) return depuisOklab(paliers[0]![k] as Rvb);
  if (ecart >= paliers[n - 1]![0]) return depuisOklab(paliers[n - 1]![k] as Rvb);
  for (let i = 1; i < n; i++) {
    const b = paliers[i]!;
    if (ecart <= b[0]) {
      const a = paliers[i - 1]!;
      const t = (ecart - a[0]) / (b[0] - a[0]);
      const ca = a[k] as Rvb, cb = b[k] as Rvb;
      return depuisOklab([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
    }
  }
  return depuisOklab(paliers[n - 1]![k] as Rvb);
}

function lisser(a: number, b: number, x: number): number {
  "worklet";
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export type TeintesAge = {
  froidProfond: Rvb;
  froidVif: Rvb;
  chaudProfond: Rvb;
  chaudVif: Rvb;
  /** Part de l'encre chaude, 0 (≤ 0 an) → 1 (≥ +9 ans). À +3 ≈ 0,26 : un liseré orange sur un corps bleu. */
  chaud: number;
  /** Éclat global : 1,15 très jeune → 0,85 très vieux (la forme est plus lumineuse quand on est plus jeune). */
  eclat: number;
};

/** Les teintes de la forme pour un écart d'âge (bornées à ±15). */
export function teintesAge(ecart: number): TeintesAge {
  "worklet";
  const e = Math.min(ECART_MAX, Math.max(ECART_MIN, ecart));
  return {
    froidProfond: interpoler(FROID, e, false),
    froidVif: interpoler(FROID, e, true),
    chaudProfond: interpoler(CHAUD, e, false),
    chaudVif: interpoler(CHAUD, e, true),
    chaud: lisser(0, 9, e),
    eclat: 1.15 - 0.3 * ((e - ECART_MIN) / (ECART_MAX - ECART_MIN)),
  };
}

/** Rythme de vieillissement (−1 … 3, 1 = normal) → vitesse du temps de l'animation et agitation de la forme (0..1). */
export function allureRythme(rythme: number): { vitesse: number; agitation: number } {
  "worklet";
  const r = Math.min(3, Math.max(-1, rythme));
  return { vitesse: 0.45 + 0.3 * (r + 1) * 0.75, agitation: lisser(0.6, 3, r) };
}

/**
 * Couleur du texte d'accompagnement (ex. « 10 ans de moins ») : l'encre du sens (chaude dès +0,5 an), vive la nuit ;
 * le jour, l'encre profonde assombrie (luminosité et chroma OKLab × 0,66, même teinte) pour tenir 4,5:1 sur le fond clair.
 */
export function couleurTexteAge(ecart: number, jour = false): string {
  "worklet";
  const t = teintesAge(ecart);
  // par le signe, pas par la part d'orange : « 1 an de plus » se dit en orange même si l'anneau est encore bleu
  let c = ecart >= 0.5 ? (jour ? t.chaudProfond : t.chaudVif) : jour ? t.froidProfond : t.froidVif;
  if (jour) {
    const l = versOklab(c);
    c = depuisOklab([l[0] * 0.66, l[1] * 0.66, l[2] * 0.66]); // chroma réduite d'autant : la teinte ne glisse pas au rouge
  }
  return "#" + c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

/**
 * Sens affiché pendant une transition (−1 plus jeune, 0 pile, +1 plus vieux) : celui de la valeur animée, pour que la
 * ligne d'écart dise la même chose que le chiffre et la forme ; près de 0, celui de la cible (pas de « pile votre âge »
 * fugitif quand on traverse 0).
 */
export function sensAffiche(valeur: number, cible: number): number {
  "worklet";
  if (Math.abs(valeur) >= 0.05) return Math.sign(valeur);
  return Math.abs(cible) >= 0.05 ? Math.sign(cible) : 0;
}
