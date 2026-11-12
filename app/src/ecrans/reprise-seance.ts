// Reprise d'une séance en cours (bulle « Séance en cours », bandeau, relance de l'appli) : la liste s'ouvre avec l'exercice à
// faire visible, au milieu de la zone quand la liste est assez longue (docs/CODE-REPRISE-SEANCE.md). Ici, le pur : quel
// exercice, puis à quelle position défiler. L'écran (session.tsx) mesure et défile.
import type { SeanceDetail } from "../db";
import { ordreExecution } from "./ordre-seance";

/** Durée du défilement de reprise (ms) ; sans animation si « Réduire les animations ». */
export const DUREE_REPRISE_MS = 250;

/** Ce que la reprise montre : un exercice, le bas de la liste (tout est fait), ou rien (séance sans série). */
export type CibleReprise = { genre: "exercice"; exerciceId: string } | { genre: "fin" } | null;

/**
 * La première série pas faite dans l'ordre d'exécution (tours d'un superset compris) donne son exercice ; tout fait : le bas
 * de la liste (« Ajouter un exercice »), où l'on finit ; aucune série : rien ne bouge.
 */
export function cibleReprise(s: SeanceDetail): CibleReprise {
  const ordre = ordreExecution(s);
  if (!ordre.length) return null;
  const a = ordre.find((x) => !x.faite);
  return a ? { genre: "exercice", exerciceId: a.exercice_id } : { genre: "fin" };
}

export interface MesuresReprise {
  /** Haut et hauteur de l'exercice visé dans le contenu de la liste (null : pas mesuré, ou plus dans la séance). */
  exercice: { haut: number; hauteur: number } | null;
  /** Hauteur visible de la liste et hauteur de son contenu. */
  zone: number;
  contenu: number;
  /** Défilement actuel. */
  y: number;
}

/** Marge sous laquelle le défilement ne vaut pas le mouvement (px). */
const SEUIL_PX = 8;

/**
 * Où défiler pour la cible : l'exercice centré dans la zone, borné au début et à la fin du contenu (pas d'espace vide : près
 * du début ou de la fin il est au plus près de son milieu). Null : rien à faire (liste qui tient dans la zone, cible
 * absente, déjà en place, mesures absentes).
 */
export function positionReprise(cible: CibleReprise, m: MesuresReprise): number | null {
  if (!cible || m.zone <= 0 || m.contenu <= m.zone) return null;
  const max = m.contenu - m.zone;
  let y: number;
  if (cible.genre === "fin") y = max;
  else if (!m.exercice) return null;
  else y = m.exercice.haut + m.exercice.hauteur / 2 - m.zone / 2;
  // Un exercice plus haut que la zone : son début (et ses séries à faire) reste visible plutôt que son milieu.
  if (cible.genre === "exercice" && m.exercice && m.exercice.hauteur > m.zone) y = m.exercice.haut;
  y = Math.max(0, Math.min(max, Math.round(y)));
  return Math.abs(y - m.y) < SEUIL_PX ? null : y;
}
