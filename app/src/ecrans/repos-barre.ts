// Progression de la barre de repos (pure : testée sous Node).
/**
 * Barre de repos continue : le décompte n'arrive qu'à la seconde, la barre glisse vers la part restante à la seconde
 * suivante, en ligne droite sur 1 s. Un écart de plus d'une seconde (+15 / −15, reprise) est un saut, rejoint vite.
 */
export function cibleBarre(restantS: number, totalS: number, actuelle: number): { part: number; saut: boolean } {
  if (totalS <= 0) return { part: 0, saut: true };
  const part = Math.min(1, Math.max(0, restantS - 1) / totalS);
  return { part, saut: Math.abs(part - actuelle) * totalS > 1.5 };
}

/** Où se pose la barre de repos : sur la bande du bas, sur le clavier de séance (pavé), ou sur le clavier du téléphone. */
export type PositionRepos = "bande" | "clavierSeance" | "clavierSysteme";

/**
 * Le pavé de pepfit gagne : il se pose lui-même au bas de l'écran et le clavier du téléphone est alors fermé. Sinon, dès que
 * le clavier du téléphone est ouvert (note, titre, feuille de durée…), la barre monte sur lui au lieu de rester cachée dessous.
 */
export function positionRepos(o: { clavierSeance: boolean; clavierSysteme: boolean }): PositionRepos {
  if (o.clavierSeance) return "clavierSeance";
  return o.clavierSysteme ? "clavierSysteme" : "bande";
}

/**
 * De combien monter la barre pour qu'elle pose sur le clavier du téléphone : son bord bas (mesuré sans décalage, donc
 * `bas` = bord bas actuel + décalage actuel) moins le haut du clavier. Jamais négatif, jamais plus que le clavier (clavier
 * flottant ou partagé : la barre ne grimpe pas au milieu de l'écran).
 */
export function decalageSurClavier(bas: number, hautClavier: number, hauteurClavier: number): number {
  return Math.max(0, Math.min(hauteurClavier, bas - hautClavier));
}
