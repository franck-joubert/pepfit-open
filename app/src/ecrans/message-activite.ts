// Message d'une activité (planche Effort, D2 et D3) : un champ à la fin de la séance, 280 signes au plus, compteur gris à
// partir de 240. Logique pure : la saisie, la valeur écrite, le compteur et l'aperçu de deux lignes de la carte.

export const MESSAGE_MAX = 280;
export const MESSAGE_COMPTEUR_DES = 240;

/** Signes d'un texte (points de code : un emoji compte pour un). */
export function signes(texte: string): number {
  return Array.from(texte).length;
}

/** Saisie : au plus 280 signes (la saisie est coupée, jamais refusée) ; les sauts de ligne sont gardés. */
export function limiterMessage(saisie: string): string {
  const l = Array.from(saisie);
  return l.length > MESSAGE_MAX ? l.slice(0, MESSAGE_MAX).join("") : saisie;
}

/** Saisie → valeur écrite : espaces de bord retirés, trois sauts de ligne de suite réduits à deux, vide = null. */
export function messageFinal(saisie: string | null | undefined): string | null {
  const net = limiterMessage((saisie ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n")).trim();
  return net ? net : null;
}

/** Compteur « 240 / 280 » : seulement près de la limite ; un champ vide n'affiche rien. */
export function compteurMessage(saisie: string): { visible: boolean; texte: string; plein: boolean } {
  const n = signes(saisie);
  return { visible: n >= MESSAGE_COMPTEUR_DES, texte: `${n} / ${MESSAGE_MAX}`, plein: n >= MESSAGE_MAX };
}

/** Lignes montrées d'un message dans la carte et en haut de la page d'activité, avant « Voir plus » (D3). */
export const MESSAGE_LIGNES_APERCU = 2;

/** « Voir plus » seulement si le message dépasse l'aperçu : `lignes` est le nombre de lignes du texte entier, mesuré à l'écran. */
export function messageTronque(lignes: number): boolean {
  return lignes > MESSAGE_LIGNES_APERCU;
}
