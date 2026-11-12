// Cadrage de la carte du suivi en direct (retour du 29/10) : calcul seul, sans React Native (testé dans
// tests/cadrage-carte.test.ts). Au départ, environ 500 m autour de la position ; la vue suit la position et s'élargit pour
// garder tout le tracé, sans dépasser 3 km de rayon. Le rayon tient dans le petit côté de la carte (Fold plié ou déplié).
import { haversineM } from "../natif/suivi/logique";

type Coord = { lat: number; lon: number };

export const RAYON_DEPART_M = 500;
export const RAYON_MAX_M = 3000;
/** Le tracé ne touche pas le bord : 10 % d'air autour du point le plus loin. */
const MARGE = 1.1;
/** Pas du zoom : la vue ne bouge pas à chaque mètre, elle saute d'un quart de niveau. */
const PAS_ZOOM = 0.25;
/** Circonférence de la Terre à l'équateur (m) et largeur du monde au zoom 0 chez MapLibre (tuiles de 512). */
const TOUR_TERRE_M = 40_075_016.686;
const MONDE_DP = 512;

/** Rayon à montrer : 500 m au moins, tout le tracé (le point le plus loin de la position), 3 km au plus. */
export function rayonCadrage(ici: Coord, points: readonly Coord[]): number {
  let loin = 0;
  for (const p of points) loin = Math.max(loin, haversineM(ici, p));
  return Math.min(RAYON_MAX_M, Math.max(RAYON_DEPART_M, loin * MARGE));
}

/** Zoom de MapLibre pour que `rayonM` tienne dans la moitié du petit côté de la carte (dp), arrondi au quart inférieur. */
export function zoomPourRayon(rayonM: number, lat: number, largeurDp: number, hauteurDp: number): number {
  const cote = Math.max(1, Math.min(largeurDp, hauteurDp));
  const metresParDpAuZoom0 = (TOUR_TERRE_M * Math.cos((lat * Math.PI) / 180)) / MONDE_DP;
  const z = Math.log2((metresParDpAuZoom0 * cote) / (2 * rayonM));
  return Math.floor(z / PAS_ZOOM) * PAS_ZOOM;
}

/** Vue de la carte qui suit : centrée sur la position, au zoom qui garde le tracé. */
export function cadrage(ici: Coord, points: readonly Coord[], largeurDp: number, hauteurDp: number): { centre: [number, number]; zoom: number } {
  return { centre: [ici.lon, ici.lat], zoom: zoomPourRayon(rayonCadrage(ici, points), ici.lat, largeurDp, hauteurDp) };
}
