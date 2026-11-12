// Point de couleur du jour (retour du 29/10) : VFC, FC au repos et Sommeil, sur leurs pages et leurs cartes.
// Quatre niveaux, pour ne pas mettre d'orange quand tout va bien : vert = meilleur que d'habitude, bleu = dans ta zone
// normale, orange = un peu en dessous, rouge = nettement en dessous ; neutre (anneau vide) sans donnée ou sans référence.
// Couleurs : les jetons des zones de FC (zone3 vert, zone2 bleu, zone4 orange, zone5 rouge), jamais le rouge d'erreur ;
// neutre : un anneau t3 vide (revue finale n° 46 : plus de point gris opaque). VFC et FC au repos : écart à ta normale
// (coeur-calc.ts) ; sommeil : la performance de la nuit, ci-dessous.
// Pur (sans React Native) : tests/mesures-coeur.test.ts.

export type NiveauPoint = "mieux" | "normal" | "bas" | "tresBas" | "neutre";

/** Jeton de couleur de chaque niveau ; null : l'anneau vide du neutre. */
export const JETON_POINT = { mieux: "zone3", normal: "zone2", bas: "zone4", tresBas: "zone5", neutre: null } as const;

/**
 * Sommeil : la part du besoin dormie (page Sommeil : le besoin de pepfit, planche sommeil D18 ; cartes : encore celui de
 * Whoop). Vert dès 85 % (la cible « Perform » du planificateur de sommeil Whoop, entre « Get by » 70 % et « Peak » 100 %),
 * bleu de 67 à 84 %, orange de 34 à 66 %, rouge jusqu'à 33 % (les seuils de la récupération Whoop, demandés) ;
 * sans pourcentage (sous 40 % de précision), neutre.
 */
export const SEUILS_SOMMEIL = { optimal: 85, haut: 67, bas: 34 } as const;

export function niveauSommeil(perf: number | null): NiveauPoint {
  if (perf == null || !Number.isFinite(perf)) return "neutre";
  if (perf >= SEUILS_SOMMEIL.optimal) return "mieux";
  if (perf >= SEUILS_SOMMEIL.haut) return "normal";
  return perf >= SEUILS_SOMMEIL.bas ? "bas" : "tresBas";
}
