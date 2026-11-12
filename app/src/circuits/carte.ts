// Ce que la carte en plein écran d'un circuit décide avant de dessiner (planche Circuits, « La carte en plein écran », lot C2) : le cadrage
// du tracé entier, les limites du zoom, la position de la personne (seulement connue et dans la zone), son cercle de précision, l'échelle,
// l'épaisseur du tracé selon le zoom et le geste de « Ma position ». Pur (sans React ni MapLibre) : l'écran ne fait que poser ce que ce
// module calcule. Mercator comme MapLibre : le monde fait 512 dp au zoom 0.
import { haversineM } from "./geo";
import type { Point } from "./types";

export type Bbox = [number, number, number, number];
/** Une vue de MapLibre : centre [lon, lat] et zoom. */
export interface VueCarte {
  centre: [number, number];
  zoom: number;
}
/** Place prise sur l'écran par les boutons et la carte du bas : le tracé se cadre dans ce qui reste. */
export interface Marges {
  haut: number;
  bas: number;
  gauche: number;
  droite: number;
}

/** Zoom limité (D : un tracé de randonnée n'a rien à montrer plus loin que la rue, ni plus près que la région). */
export const ZOOM_MIN = 8;
export const ZOOM_MAX = 18;
const MONDE_DP = 512;
const TOUR_TERRE_M = 40_075_016.686;
const LAT_MAX = 85.0511;
/** Une position plus loin que ça du circuit n'est pas « dans la zone » : le point n'est pas dessiné et « Ma position » le dit. */
export const ZONE_MARGE_M = 30_000;
/** Précision au-delà de laquelle le cercle ne dit plus rien (une position de réseau, à plusieurs kilomètres) et en deçà de laquelle il n'est pas plus petit que le point. */
const PRECISION_MIN_M = 10;
const PRECISION_MAX_M = 500;

const rad = (d: number) => (d * Math.PI) / 180;
const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => {
  const s = Math.sin(rad(Math.max(-LAT_MAX, Math.min(LAT_MAX, lat))));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const lonDe = (x: number) => x * 360 - 180;
const latDe = (y: number) => {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Mètres que couvre un dp au zoom donné, à cette latitude. */
export function metresParDp(zoom: number, lat: number): number {
  return (TOUR_TERRE_M * Math.cos(rad(lat))) / (MONDE_DP * 2 ** zoom);
}

export function limiterZoom(z: number): number {
  return Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : ZOOM_MIN;
}
export const zoomPlus = (z: number) => limiterZoom(z + 1);
export const zoomMoins = (z: number) => limiterZoom(z - 1);
/** Les boutons « + » et « − » se grisent au bout de la course (à un centième près : le zoom des doigts n'est jamais rond). */
export const peutZoomer = (z: number) => z < ZOOM_MAX - 0.01;
export const peutDezoomer = (z: number) => z > ZOOM_MIN + 0.01;

/**
 * La vue qui montre tout le tracé (sa bbox : sud, ouest, nord, est) dans ce que les marges laissent de l'écran de `l` sur `h` dp : au zoom
 * le plus grand où il tient, centré sur cet espace libre (le tracé ne passe pas sous les boutons ni sous la carte du bas). Un tracé réduit
 * à un point (ou une bbox dégénérée) ne zoome pas à l'infini : le zoom est limité.
 */
export function cadrerBbox(bbox: Bbox, l: number, h: number, marges: Marges): VueCarte {
  const [s, o, n, e] = bbox;
  const dx = Math.max(mercX(e) - mercX(o), 1e-9);
  const dy = Math.max(mercY(s) - mercY(n), 1e-9);
  const libreL = Math.max(1, l - marges.gauche - marges.droite);
  const libreH = Math.max(1, h - marges.haut - marges.bas);
  const zoom = limiterZoom(Math.log2(Math.min(libreL / (MONDE_DP * dx), libreH / (MONDE_DP * dy))));
  const monde = MONDE_DP * 2 ** zoom;
  // Le centre du tracé doit tomber au centre de l'espace libre : la caméra, au centre de l'écran, est décalée d'autant.
  const cx = (mercX(o) + mercX(e)) / 2 + (l / 2 - (marges.gauche + libreL / 2)) / monde;
  const cy = (mercY(s) + mercY(n)) / 2 + (h / 2 - (marges.haut + libreH / 2)) / monde;
  return { centre: [lonDe(cx), latDe(cy)], zoom };
}

/** La vue est-elle celle du tracé entier ? Sinon « Voir tout le circuit » apparaît (zoomé ou déplacé : un quart de niveau, ou 24 dp d'écart). */
export function estVueCircuit(vue: VueCarte, cadre: VueCarte): boolean {
  if (Math.abs(vue.zoom - cadre.zoom) > 0.25) return false;
  const ecartM = haversineM({ lat: vue.centre[1], lon: vue.centre[0] }, { lat: cadre.centre[1], lon: cadre.centre[0] });
  return ecartM / metresParDp(cadre.zoom, cadre.centre[1]) <= 24;
}

export interface PositionPrecise extends Point {
  /** Précision de la mesure en mètres ; absente si l'appareil ne la donne pas. */
  precisionM?: number | null;
}

/** Connue et dans la zone du circuit (sa bbox, plus `marge`) : sinon le point et le cercle ne sont pas dessinés. */
export function positionDansLaZone(p: Point | null, bbox: Bbox, margeM = ZONE_MARGE_M): boolean {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
  const [s, o, n, e] = bbox;
  const proche = { lat: Math.min(n, Math.max(s, p.lat)), lon: Math.min(e, Math.max(o, p.lon)) };
  return haversineM(p, proche) <= margeM;
}

/** Le rayon du cercle de précision : jamais plus petit que le point, jamais plus grand qu'une demi-lieue. */
export function rayonPrecision(precisionM: number | null | undefined): number {
  return Math.min(PRECISION_MAX_M, Math.max(PRECISION_MIN_M, Number.isFinite(precisionM) ? (precisionM as number) : PRECISION_MIN_M));
}

/** Le cercle de précision en anneau fermé de [lon, lat] (un polygone GeoJSON), `pas` points. */
export function cerclePrecision(p: PositionPrecise, pas = 48): [number, number][] {
  const r = rayonPrecision(p.precisionM);
  const dLat = r / 111_320;
  const dLon = r / (111_320 * Math.max(0.01, Math.cos(rad(p.lat))));
  const anneau: [number, number][] = [];
  for (let i = 0; i < pas; i++) {
    const a = (2 * Math.PI * i) / pas;
    anneau.push([p.lon + dLon * Math.cos(a), p.lat + dLat * Math.sin(a)]);
  }
  anneau.push(anneau[0]!);
  return anneau;
}

/** Épaisseur du tracé (dp) selon le zoom : fin de loin, épais de près ; la même courbe sert l'expression de MapLibre et le test. */
export const ARRETS_EPAISSEUR: readonly (readonly [number, number])[] = [
  [10, 3],
  [14, 5],
  [18, 9],
];
export function epaisseurTrace(zoom: number): number {
  const a = ARRETS_EPAISSEUR;
  if (zoom <= a[0]![0]) return a[0]![1];
  for (let i = 1; i < a.length; i++) {
    const [z1, e1] = a[i]!;
    const [z0, e0] = a[i - 1]!;
    if (zoom <= z1) return e0 + ((zoom - z0) / (z1 - z0)) * (e1 - e0);
  }
  return a[a.length - 1]![1];
}

export interface Echelle {
  valeur: number;
  unite: "m" | "km" | "ft" | "mi";
  /** Largeur de la barre à dessiner (dp), au plus `maxDp`. */
  largeurDp: number;
}

/** La plus grande valeur ronde (1, 2, 5 × 10^n) qui ne dépasse pas `x`. */
function ronde(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

/** La barre d'échelle : une distance ronde (« 100 m », « 1 km », « 500 ft », « 1 mi ») dont la barre tient dans `maxDp`. */
export function echelle(zoom: number, lat: number, maxDp: number, miles: boolean): Echelle {
  const mpd = metresParDp(zoom, lat);
  const maxM = mpd * maxDp;
  if (!miles) {
    const m = maxM >= 1000 ? ronde(maxM / 1000) * 1000 : ronde(maxM);
    return { valeur: m >= 1000 ? m / 1000 : m, unite: m >= 1000 ? "km" : "m", largeurDp: m / mpd };
  }
  const maxFt = maxM / 0.3048;
  if (maxFt >= 5280) {
    const mi = ronde(maxFt / 5280);
    return { valeur: mi, unite: "mi", largeurDp: (mi * 1609.344) / mpd };
  }
  const ft = ronde(maxFt);
  return { valeur: ft, unite: "ft", largeurDp: (ft * 0.3048) / mpd };
}

export type Permission = "accordee" | "demandable" | "refusee";
export type GesteMaPosition = "demander" | "refuse" | "chercher" | "centrer" | "loin";

/**
 * Ce que fait « Ma position » : demander l'autorisation (planche : le bouton ouvre la demande), dire qu'elle est refusée pour de bon,
 * chercher la position quand l'autorisation est là mais qu'aucune mesure n'est connue, centrer la carte sur elle, ou dire qu'on est loin
 * du circuit (une carte déplacée à des centaines de kilomètres ne montrerait rien).
 */
export function gesteMaPosition(permission: Permission, position: Point | null, bbox: Bbox): GesteMaPosition {
  if (permission === "demandable") return "demander";
  if (permission === "refusee") return "refuse";
  if (!position) return "chercher";
  return positionDansLaZone(position, bbox) ? "centrer" : "loin";
}

/** Le zoom d'une carte « sur soi » : la rue (assez près pour se repérer par rapport au tracé sans perdre le circuit). */
export const ZOOM_SUR_SOI = 15.5;
