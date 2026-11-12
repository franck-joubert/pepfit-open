// Semainier par semaine (planche age-semainier, validée le 30/10, D1 à D4) : le semainier des onglets
// (ui/semainier.ts) avec une case par semaine au lieu de sept jours. Mêmes gestes, mêmes jetons ; l'unité est la case. Au centre
// la semaine, les voisines dépassent de 32 dp du bord de la colonne (jusqu'au bord de l'écran sur le Fold ouvert) ; les toucher
// affiche la semaine d'avant ou d'après. Glisser parcourt sans changer la semaine affichée (D1) : au lâcher, la bande s'aimante
// sur une semaine entière, puis revient seule sur la semaine affichée après 5 s sans geste. Pas de futur, et pas d'avant le
// début de l'historique : la bande bute en douceur aux deux bouts.
// Position de la bande : `pos`, rang (0 = la plus ancienne) de la semaine au centre, continu pendant le geste.
// Pur (sans React Native) : testé par tests/semainier-semaines.test.ts.

import { SEMAINIER } from "./semainier";

export const SEMAINES_BANDE = {
  /** Hauteur de la bande et des cases (une ligne de texte ; cible de 44 tenue). */
  haut: 48,
  /** Écart entre deux cases (dp) : les traits de semaine et de mois s'y posent. */
  ecart: 8,
  /** Part visible d'une voisine depuis le bord de la colonne (dp). */
  depasse: 32,
  /** Zone de toucher d'une voisine : sa part visible, l'écart, et ces quelques dp sur le bord de la case du centre. */
  zonePlus: 8,
  /** Butée douce : la bande tirée au-delà d'un bout ne dépasse jamais ce nombre de dp (la demi-case des jours). */
  buteePx: 28,
  /** Libellé d'une case : plein au centre, effacé à cette distance (en cases), lissé entre les deux. */
  libellePlein: 0.12,
  libelleEfface: 0.78,
} as const;

export interface GeometrieSemaines {
  /** Largeur d'une case. */
  case: number;
  /** D'une case à la suivante (case + écart). */
  pas: number;
  /** Bord gauche de la case du centre, depuis le bord gauche de la bande. */
  x0: number;
  /** Largeur de la zone de toucher d'une voisine, depuis chaque bord de la bande. */
  zone: number;
  /** Largeur de la bande : la colonne et, sur le Fold ouvert, ses marges de chaque côté. */
  largeur: number;
}

/** Géométrie pour une colonne de `colonne` dp ; `marge` : ce qui la sépare du bord de l'écran (0 sur le téléphone). */
export function geometrieSemaines(colonne: number, marge = 0): GeometrieSemaines {
  const { depasse, ecart, zonePlus } = SEMAINES_BANDE;
  const c = Math.max(1, colonne - 2 * (depasse + ecart));
  return { case: c, pas: c + ecart, x0: marge + depasse + ecart, zone: marge + depasse + ecart + zonePlus, largeur: colonne + 2 * marge };
}

/** Pendant le geste : le doigt (dx en px) déplace la bande d'autant de cases ; vers la gauche, les semaines suivantes arrivent. */
export function suivreCases(depart: number, dx: number, pas: number): number {
  "worklet";
  return depart - dx / Math.max(1, pas);
}

/**
 * Bande tirée au-delà de la première (`min`) ou de la dernière (`max`) semaine : elle résiste dès le départ et ne dépasse
 * jamais `buteePx` dp ; une butée douce, pas un rebond.
 */
export function buteeCases(v: number, min: number, max: number, pas: number): number {
  const p = SEMAINES_BANDE.buteePx / Math.max(1, pas);
  const tenir = (x: number) => p * (1 - Math.exp((-x * SEMAINIER.buteeRaideur) / p));
  if (v > max) return max + tenir(v - max);
  if (v < min) return min - tenir(min - v);
  return v;
}

/**
 * Au lâcher : la semaine où la bande s'arrête. Position + élan (vitesse du doigt en px/ms convertie en cases), aimantée à la
 * case la plus proche ; un lâcher vif passe au moins à la suivante dans le sens du doigt ; jamais plus de
 * `elanMaxSemaines` de la semaine du départ du geste, jamais hors de [min, max].
 */
export function cranCase(pos: number, vxDoigt: number, pas: number, depart: number, min: number, max: number): number {
  const vise = pos - (vxDoigt / Math.max(1, pas)) * SEMAINIER.elanMs;
  let k = Math.round(vise);
  if (vxDoigt <= -SEMAINIER.vif) k = Math.ceil(Math.max(vise, pos) - 1e-6);
  else if (vxDoigt >= SEMAINIER.vif) k = Math.floor(Math.min(vise, pos) + 1e-6);
  const base = Math.round(depart);
  const loin = SEMAINIER.elanMaxSemaines;
  return Math.max(min, Math.min(max, Math.max(base - loin, Math.min(base + loin, k))));
}

/** Durée d'un déplacement de la bande : `recadrageMs` (320) par semaine parcourue, de 160 à 480 ms. */
export function dureeCases(de: number, vers: number): number {
  return Math.round(Math.max(160, Math.min(480, SEMAINIER.recadrageMs * Math.abs(vers - de))));
}

/**
 * Semaine touchée (rang), d'après la position du doigt (`x`, depuis le bord gauche de la bande) et celle de la bande : la
 * bande calcule elle-même ce qui est sous le doigt (le décalage animé des cases n'est pas vu par Android, comme pour les
 * jours). Les voisines qui dépassent ont leur zone de toucher, de chaque bord. Null hors des semaines existantes.
 */
export function caseTouchee(pos: number, x: number, g: GeometrieSemaines, n: number): number | null {
  const c = Math.round(pos);
  let k: number;
  if (x < g.zone) k = c - 1;
  else if (x > g.largeur - g.zone) k = c + 1;
  else k = Math.floor(pos + (x - g.x0 + SEMAINES_BANDE.ecart / 2) / Math.max(1, g.pas) + 1e-6);
  return k >= 0 && k < n ? k : null;
}

/** Opacité du libellé d'une case à `d` cases du centre : au repos, les voisines ne montrent que le bord de leur case. */
export function opaciteLibelle(d: number): number {
  "worklet";
  const { libellePlein: a, libelleEfface: b } = SEMAINES_BANDE;
  const t = Math.min(1, Math.max(0, (Math.abs(d) - a) / (b - a)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Séparateurs de mois : rangs des semaines qui commencent un mois, le trait se pose dans l'écart à leur gauche. Le mois d'une
 * semaine est celui de son jeudi (règle ISO) : « du 28 septembre au 4 octobre » est une semaine d'octobre.
 * `moisDuJeudi[k]` : AAAA-MM (ou tout identifiant de mois) du jeudi de la semaine k.
 */
export function separateursMoisSemaines(moisDuJeudi: readonly string[]): number[] {
  return moisDuJeudi.flatMap((m, k) => (k > 0 && m !== moisDuJeudi[k - 1] ? [k] : []));
}

/** Traits de semaine (pendant le glissé seulement) : dans chaque écart qui n'a pas déjà un séparateur de mois. */
export function separateursEntreSemaines(n: number, mois: readonly number[]): number[] {
  const m = new Set(mois);
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1).filter((k) => !m.has(k));
}

/** Les voisines qui dépassent autour de la position : rien avant la première semaine, rien après la dernière. */
export function voisines(pos: number, n: number): { gauche: boolean; droite: boolean } {
  "worklet";
  const c = Math.round(pos);
  return { gauche: c > 0, droite: c < n - 1 };
}
