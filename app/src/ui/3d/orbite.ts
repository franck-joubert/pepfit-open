// Caméra de la vue 3D : orbite autour du personnage, comme OrbitControls dans picto-3d/v4/visionneuse.html
// (vue de dos au départ, distance 2,5 à 8, pas de déplacement latéral). Coordonnées sphériques de three.js :
// theta autour de l'axe vertical, phi depuis le zénith.

export interface Orbite {
  theta: number;
  phi: number;
  rayon: number;
}

/** Point visé (milieu du dos) et vue de dos de la visionneuse : caméra en (0 ; 1,6 ; −4,8). */
export const CIBLE = { x: 0, y: 1.45, z: 0 } as const;
const dos = { x: 0, y: 1.6 - CIBLE.y, z: -4.8 };
const rayonDos = Math.hypot(dos.x, dos.y, dos.z);
export const ORBITE_DOS: Orbite = { theta: Math.atan2(dos.x, dos.z), phi: Math.acos(dos.y / rayonDos), rayon: rayonDos };
/** Vue de 3/4 face de la planche (la vue de dos des clips montre le personnage presque de profil) : séance, confirmation d'un lien. */
export const AZIMUT_TROIS_QUARTS = -0.35;
export const BORNES = { phiMin: 0.15, phiMax: Math.PI - 0.15, rayonMin: 2.5, rayonMax: 8 } as const;

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Glisser de (dx, dy) pixels sur une vue haute de `hauteur` : un tour complet pour une hauteur d'écran, comme OrbitControls. */
export function tourner(o: Orbite, dx: number, dy: number, hauteur: number): Orbite {
  const k = (2 * Math.PI) / Math.max(1, hauteur);
  return { theta: o.theta - dx * k, phi: borner(o.phi - dy * k, BORNES.phiMin, BORNES.phiMax), rayon: o.rayon };
}

/** Pincer : écarter les doigts (facteur > 1) rapproche la caméra, jusqu'à `max` (le cadrage de la vue) au plus loin. */
export function zoomer(o: Orbite, facteur: number, max: number = BORNES.rayonMax): Orbite {
  return { ...o, rayon: borner(o.rayon / Math.max(0.01, facteur), BORNES.rayonMin, Math.max(BORNES.rayonMin, max)) };
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * Étendue du contenu (corps sur tout le clip et agrès) : centre de sa boîte englobante, que vise la caméra, demi-hauteur
 * et rayon horizontal (demi-diagonale au sol : le contenu tient dans ce cercle quel que soit l'angle de vue).
 */
export interface Etendue {
  centre: Point;
  demiHauteur: number;
  rayon: number;
  /** Demi-largeurs de la boîte au sol, en x et en z (cadrage pour un angle donné). */
  demiX: number;
  demiZ: number;
}

export function etendueDe(min: Point, max: Point): Etendue {
  return {
    centre: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    demiHauteur: (max.y - min.y) / 2,
    rayon: Math.hypot(max.x - min.x, max.z - min.z) / 2,
    demiX: (max.x - min.x) / 2,
    demiZ: (max.z - min.z) / 2,
  };
}

const DEMI_FOV = (15 * Math.PI) / 180; // caméra à 30° de champ vertical

/**
 * Distance, depuis le centre du contenu, qui le montre en entier quel que soit l'angle autour du personnage, dans une
 * vue de rapport `aspect` (largeur / hauteur), avec `marge` d'air autour. La face proche est prise à mi-profondeur
 * (compromis simple entre le centre et le bord).
 */
export function rayonCadrage(x: Etendue, aspect: number, marge = 0.1): number {
  const t = Math.tan(DEMI_FOV);
  const vertical = x.demiHauteur / t;
  const horizontal = x.rayon / (t * Math.max(0.1, aspect));
  return Math.max(vertical, horizontal) * (1 + marge) + x.rayon / 2;
}

/**
 * Comme `rayonCadrage`, mais pour une caméra fixe à l'angle `theta` (plein écran : le personnage garde son angle) : la
 * boîte projetée est plus étroite que le cercle de tous les angles, le personnage paraît plus grand.
 */
export function rayonCadrageAngle(x: Etendue, aspect: number, theta: number, marge = 0.06): number {
  const t = Math.tan(DEMI_FOV);
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const largeur = x.demiX * c + x.demiZ * s;
  const profondeur = x.demiX * s + x.demiZ * c;
  const vertical = x.demiHauteur / t;
  const horizontal = largeur / (t * Math.max(0.1, aspect));
  return Math.max(vertical, horizontal) * (1 + marge) + profondeur;
}

/** Position de la caméra pour une orbite autour de `cible`. */
export function position(o: Orbite, cible: Point = CIBLE): Point {
  const s = Math.sin(o.phi) * o.rayon;
  return { x: cible.x + s * Math.sin(o.theta), y: cible.y + Math.cos(o.phi) * o.rayon, z: cible.z + s * Math.cos(o.theta) };
}

/** Lancer : la vitesse du doigt (px/ms) décroît de moitié toutes les 120 ms ; sous 0,01 px/ms, on s'arrête. */
export function amortir(vitesse: number, dtMs: number): number {
  const v = vitesse * Math.pow(0.5, dtMs / 120);
  return Math.abs(v) < 0.01 ? 0 : v;
}
