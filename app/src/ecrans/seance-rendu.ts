// Rendu de la séance (audit M5, M6, docs/PERF-D.md), sans React Native : testé par tests/budgets-perf.test.ts. Une coche ou
// une touche ne doivent redessiner que ce qui change : ici, ce qui décide qu'une carte d'exercice se redessine.

/** La série active, pour la carte d'un exercice : elle seulement si elle est à lui. Quand elle passe à la suivante, seules
 *  deux cartes changent, pas toutes. */
export const activeDeCarte = (series: readonly { id: string }[], activeId: string | null): string | null =>
  activeId != null && series.some((x) => x.id === activeId) ? activeId : null;

/** Ce que la carte reçoit (CarteExercice, seance-vue.tsx), pour la comparaison. */
export interface ProprietesComparees {
  e: unknown;
  dansSuperset: boolean;
  unite: string;
  activeId: string | null;
  actions: unknown;
  enCours: boolean;
  replie: boolean;
  ordonnable: boolean;
  margeBas: number;
  appui: object;
  blessures: readonly { id: string; statut: string; titre: string }[] | null;
}

const signatureReperes = (l: ProprietesComparees["blessures"]) => (l ?? []).map((x) => `${x.id}:${x.statut}:${x.titre}`).join("|");

/**
 * Les props qui changent ce que la carte montre. `appui`, `recent` et `onSerieTenue` sont refaits à chaque rendu du parent
 * sans rien changer (mêmes gestes pour le même exercice) : comparés par leur forme seulement. Repères de blessure comparés
 * par contenu (relus en tableau neuf à chaque rendu).
 */
export const memeCarte = (a: ProprietesComparees, b: ProprietesComparees): boolean =>
  a.e === b.e &&
  a.dansSuperset === b.dansSuperset &&
  a.unite === b.unite &&
  a.activeId === b.activeId &&
  a.actions === b.actions &&
  a.enCours === b.enCours &&
  a.replie === b.replie &&
  a.ordonnable === b.ordonnable &&
  a.margeBas === b.margeBas &&
  Object.keys(a.appui).length === Object.keys(b.appui).length &&
  signatureReperes(a.blessures) === signatureReperes(b.blessures);
