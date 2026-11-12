import type { SeanceDetail } from "../db/api";

// Repos d'un superset coché dans le désordre (du dernier au premier, 2 puis 1 puis 3…) : le repos de la série la plus avancée
// du tour reste, un cochage « en arrière » ne le remet pas à zéro. Décision pure, sans minuteur (docs/CODE-REPOS-SUPERSET.md).

/** Place d'un repos dans la chaîne de superset d'une séance : tour (rang de la série dans son exercice), puis position de l'exercice dans le bloc. */
export interface RangRepos {
  chaine: string;
  tour: number;
  pos: number;
}

/** Rang de la série dans son superset ; null pour un exercice hors superset (son repos remplace toujours le précédent). */
export function rangDeSerie(s: SeanceDetail, serieId: string): RangRepos | null {
  const moi = s.exercices.find((e) => e.series.some((x) => x.id === serieId));
  if (!moi || moi.groupeSuperset === null) return null;
  const pos = s.exercices.filter((e) => e.groupeSuperset === moi.groupeSuperset).indexOf(moi);
  return { chaine: `${s.seance.id}:${moi.groupeSuperset}`, tour: moi.series.findIndex((x) => x.id === serieId), pos };
}

/**
 * Faut-il garder le repos déjà lancé (`dernier`, le rang du dernier repos démarré) plutôt que d'en démarrer un pour `nouveau` ?
 * Oui si les deux sont de la même chaîne et que `nouveau` est strictement en arrière (tour d'avant, ou même tour et exercice
 * d'avant). Le même rang (série recochée) ou un rang en avant : le nouveau repos remplace. Hors chaîne ou hors superset : il remplace.
 * Le repos gardé peut être fini : on ne relance rien pour une série qu'on rattrape.
 */
export function garderReposEnCours(dernier: RangRepos | null, nouveau: RangRepos | null): boolean {
  if (!dernier || !nouveau || dernier.chaine !== nouveau.chaine) return false;
  return nouveau.tour < dernier.tour || (nouveau.tour === dernier.tour && nouveau.pos < dernier.pos);
}
