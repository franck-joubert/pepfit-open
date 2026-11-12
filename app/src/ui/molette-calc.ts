// Molette du parcours (Molette.tsx), sans React Native : testée par tests/molette.test.ts. Le défilement reste natif
// (ScrollView, inertie et calage au cran sur le fil UI) ; ici, ce que le JavaScript décide autour : quand l'indice reçu du
// parent est un ordre de bouger, jusqu'où la molette défile.

/**
 * Échos du parent. La molette envoie sa valeur à chaque cran (onIndice) et la reçoit en retour (indice). Pendant un lancer,
 * le rendu du parent arrive en retard : son effet passe après d'autres événements de défilement, et l'indice qu'il rapporte
 * est une valeur déjà dépassée. Avant le 30/10, la molette y glissait (scrollTo animé), ce qui coupait l'élan natif au bout
 * de quelques crans (« je peux pas le lancer librement, il s'arrête », retours). Un indice déjà envoyé est donc un
 * écho, oublié avec ceux d'avant lui ; seul un indice que la molette n'a pas envoyé, reçu au repos, la fait glisser.
 */
export class EchosMolette {
  private envoyes: number[] = [];

  envoi(i: number) {
    this.envoyes.push(i);
    if (this.envoyes.length > 64) this.envoyes.shift();
  }

  /** Indice reçu du parent ; `courant` : la valeur de la molette ; `auRepos` : ni doigt ni élan. Vrai s'il faut y glisser. */
  recu(indice: number, courant: number, auRepos: boolean): boolean {
    const k = this.envoyes.indexOf(indice);
    if (k >= 0) this.envoyes.splice(0, k + 1);
    if (indice === courant) {
      if (auRepos) this.envoyes = [];
      return false;
    }
    return k < 0 && auRepos;
  }

  /** Saut imposé (touche du pavé) : les envois d'avant ne sont plus des échos. */
  oublier() {
    this.envoyes = [];
  }

  /** Fin du geste : le parent a déjà rattrapé la molette, les envois en attente ne reviendront plus. */
  repos(indice: number, courant: number) {
    if (indice === courant) this.envoyes = [];
  }
}

/** Valeur sous la bande pour un défilement `y` (lignes de `ligne`), bornée à [0, dernier]. */
export function indiceMolette(y: number, ligne: number, dernier: number): number {
  return Math.max(0, Math.min(dernier, Math.round(y / ligne)));
}

/**
 * Marge sous la dernière ligne, en lignes : `demi` (la bande au centre) moins les valeurs exclues après `dernier`. La
 * molette ne défile pas au-delà de `dernier` (le jour s'arrête au dernier du mois, sans revenir en arrière), et les
 * valeurs exclues restent visibles dessous, en t3.
 */
export function margeBas(demi: number, longueur: number, dernier: number): number {
  return Math.max(0, demi - (longueur - 1 - dernier));
}

/**
 * Lignes rendues d'une molette fenêtrée (clavier de séance, audit M5) : [debut, fin], au moins `fenetre` crans de chaque côté
 * du centre, recentrées seulement quand le centre passe un multiple de fenetre / 2 (pas un rendu à chaque cran). Sans
 * fenêtre : toutes les lignes.
 */
export function fenetreMolette(centre: number, longueur: number, fenetre?: number): { debut: number; fin: number } {
  if (!fenetre) return { debut: 0, fin: longueur - 1 };
  const pas = Math.max(1, Math.floor(fenetre / 2));
  const bloc = Math.floor(centre / pas);
  return { debut: Math.max(0, (bloc - 2) * pas), fin: Math.min(longueur - 1, (bloc + 3) * pas - 1) };
}
