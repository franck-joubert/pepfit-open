// Retour depuis une séance lancée (retour du 06/11) : Back depuis la séance ramène sur l'ORIGINE du lancement (l'onglet
// Sport, la page Routines, la fiche du programme), jamais sur un écran de lancement resté empilé dessous (le récap
// « Maintenant », le départ du suivi GPS, « Participer »). Une fois la séance créée, ces écrans sont donc retirés de la pile
// avant d'ouvrir la séance. Pur (sans React Native) : testé par tests/retour-seance.test.ts avec une pile simulée ; le routeur
// réel est branché dans ouvrir-seance.ts.

export interface Routeur<H> {
  push(href: H): void;
  replace(href: H): void;
  dismiss(count: number): void;
}

/**
 * Ouvre `href` (la séance ou son suivi en direct). `retirer` : le nombre d'écrans de lancement empilés au-dessus de l'origine,
 * en comptant l'écran d'où part le geste (0 : le geste part de l'origine elle-même, une fiche de routine par exemple : la
 * séance s'empile dessus, Back y revient). Un seul écran : il est remplacé ; deux (récap puis départ GPS) : le premier est
 * dépilé, le second remplacé.
 */
export function ouvrirDepuisLancement<H>(routeur: Routeur<H>, href: H, retirer: number): void {
  if (retirer <= 0) return routeur.push(href);
  if (retirer > 1) routeur.dismiss(retirer - 1);
  routeur.replace(href);
}
