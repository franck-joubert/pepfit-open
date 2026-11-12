// Tracé du contour d'une tuile carrée arrondie (ContourTuile) : pur, testé sans l'appli.

/** Le tracé : un carré de `taille` arrondi de `r`, trait de `ep` posé à l'intérieur, départ au milieu du bord haut. */
export function traceContour(taille: number, ep: number, r: number): { d: string; longueur: number } {
  const a = ep / 2;
  const c = taille - ep; // côté du carré tracé
  const rr = Math.max(0, Math.min(r - a, c / 2));
  const m = taille / 2;
  const f = (n: number) => +n.toFixed(3);
  const d = [
    `M ${f(m)} ${f(a)}`,
    `H ${f(taille - a - rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(taille - a)} ${f(a + rr)}`,
    `V ${f(taille - a - rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(taille - a - rr)} ${f(taille - a)}`,
    `H ${f(a + rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(a)} ${f(taille - a - rr)}`,
    `V ${f(a + rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(a + rr)} ${f(a)}`,
    `Z`,
  ].join(" ");
  return { d, longueur: 4 * (c - 2 * rr) + 2 * Math.PI * rr };
}

/**
 * Épaisseur de trait en dp qui tombe sur un nombre entier de pixels de l'écran (au moins 1) : 2 dp valent 5,25 px à 2,625, et un
 * trait de 5,25 px a un bord flou, qu'on ne voit qu'à certains endroits du tour. 5 px (1,905 dp) donne le même trait net partout.
 */
export function epaisseurAuPixel(ep: number, densite: number): number {
  if (!(ep > 0) || !(densite > 0)) return ep;
  return Math.max(1, Math.round(ep * densite)) / densite;
}
