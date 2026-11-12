// D5 : un circuit qui passe à moins de 150 m du domicile ou d'un lieu personnel ne peut pas être public. La coupe du début et de
// la fin (profil-public/coupe.ts) ne protège pas un domicile que le tracé croise au milieu du parcours. Le test se fait ICI, sur
// le téléphone, qui seul connaît le domicile : la position d'un lieu personnel ne part jamais au serveur en clair.
import { ecartTraceM } from "./geo";
import { DOMICILE_M } from "./regles";
import type { Point } from "./types";

/** Un lieu qui ne se montre pas : le domicile, ou un lieu perso (créé à la main, sans fiche publique). */
export interface LieuPersonnel extends Point {
  id?: string;
}

export interface ProcheDuDomicile<L extends LieuPersonnel = LieuPersonnel> {
  lieu: L;
  /** Distance du lieu au tracé, en mètres. */
  distanceM: number;
}

/**
 * Le lieu personnel le plus proche du tracé, s'il en est à `seuilM` m ou moins ; null sinon. Le tracé testé est celui qui
 * partirait (gardé : coupé, simplifié) : l'écart de la simplification (3 m) reste très en deçà du seuil.
 */
export function procheDuDomicile<L extends LieuPersonnel>(trace: readonly Point[], lieux: readonly L[], seuilM = DOMICILE_M): ProcheDuDomicile<L> | null {
  let meilleur: ProcheDuDomicile<L> | null = null;
  for (const lieu of lieux) {
    if (!Number.isFinite(lieu.lat) || !Number.isFinite(lieu.lon)) continue;
    const d = ecartTraceM(lieu, trace);
    if (d <= seuilM && (!meilleur || d < meilleur.distanceM)) meilleur = { lieu, distanceM: d };
  }
  return meilleur;
}

/** Peut-on publier ce tracé ? Non dès qu'il passe près d'un lieu personnel. */
export const publiableSansDomicile = (trace: readonly Point[], lieux: readonly LieuPersonnel[]): boolean => procheDuDomicile(trace, lieux) === null;
