// Logique du volet du profil (glissé depuis la gauche), sans React Native (testée dans tests/volet.test.ts).

import { geste } from "../theme/mouvement";

export const VOLET = {
  /** Largeur la plus grande ; sur un écran étroit, `marge` px de la page restent visibles à droite. */
  largeurMax: 372,
  marge: 40,
  /** Bande du bord gauche qui ouvre le volet (dp), sur l'Accueil seulement. Avec la navigation par gestes,
   * Android prend les ~24 premiers dp pour son « Retour » (vu sur l'émulateur : l'appli passait en arrière-plan) ; le
   * volet a donc la suite, jusqu'à 40 dp. Ailleurs, le glissé horizontal reste au contenu (bande de la semaine, lignes à
   * supprimer, roues, personnage de Santé). */
  bord: 40,
  /** Distance (px) avant de prendre le geste : en deçà, c'est un appui. */
  declenche: 10,
  /** Au lâcher : ouvert au-delà de la moitié, ou si le geste est vif (px/ms). */
  seuil: 0.5,
  vitesse: geste.vitesse,
  /** Reste du trajet après un lâcher : jamais plus court (un saut se verrait). */
  lacherMin: 120,
} as const;

export function largeurVolet(ecran: number): number {
  return Math.max(0, Math.min(VOLET.largeurMax, ecran - VOLET.marge));
}

const borne = (p: number) => Math.min(1, Math.max(0, p));

/** Ouverture (0 à 1) pendant un glissé parti du bord, fermé. */
export function progresOuverture(dx: number, largeur: number): number {
  return largeur > 0 ? borne(dx / largeur) : 0;
}

/** Ouverture (0 à 1) pendant un glissé vers la gauche, ouvert. */
export function progresFermeture(dx: number, largeur: number): number {
  return largeur > 0 ? borne(1 + dx / largeur) : 1;
}

/** Au lâcher : le volet reste-t-il ouvert ? La vitesse l'emporte sur la distance. */
export function resteOuvert(p: number, vx: number): boolean {
  if (vx >= VOLET.vitesse) return true;
  if (vx <= -VOLET.vitesse) return false;
  return p >= VOLET.seuil;
}

/**
 * Au lâcher après un glissé : durée (ms) du reste du trajet. Le volet garde l'élan du doigt (vitesse `vx` en px/ms, celle
 * du PanResponder) : le reste à cette vitesse, entre `VOLET.lacherMin` et `base` (durée d'une ouverture ou d'une fermeture
 * entière). Sans élan, la durée suit la part qui reste : lâché à 90 %, il finit en 10 % de `base`, pas en `base` entier.
 */
export function dureeLacher(p: number, vers: 0 | 1, largeur: number, vx: number, base: number): number {
  const reste = Math.abs(vers - borne(p)) * largeur;
  const vitesse = Math.abs(vx);
  const brute = vitesse > 0.05 ? reste / vitesse : base * Math.abs(vers - borne(p));
  return Math.round(Math.min(base, Math.max(VOLET.lacherMin, brute)));
}

/** Le bord gauche n'ouvre le volet que sur Moi, le premier onglet (retours du 28/10, b) : ailleurs, glisser change de jour ou d'onglet. */
export function bordOuvreVolet(chemin: string): boolean {
  return chemin === "/health";
}

/** Le glissé part-il du bord gauche, vers la droite, plus horizontal que vertical ? */
export function prendBord(x0: number, dx: number, dy: number): boolean {
  return x0 <= VOLET.bord && dx > VOLET.declenche && dx > Math.abs(dy);
}

/** Le glissé ferme-t-il le volet (vers la gauche, plus horizontal que vertical) ? */
export function prendFermeture(dx: number, dy: number): boolean {
  return dx < -VOLET.declenche && -dx > Math.abs(dy);
}

/** Largeur d'une carte de record : deux visibles à la fois dans le volet. */
export function largeurCarte(largeur: number, marge: number, ecart: number): number {
  return Math.max(0, Math.floor((largeur - 2 * marge - ecart) / 2));
}
