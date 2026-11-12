// Synchro Whoop en cours, vue de partout (29/10) : la ligne Whoop de Connexions fait tourner son icône « actualiser »
// aussi pour la première synchro lancée au retour de la connexion (route « whoop ») ou à l'ouverture de Santé. Pur.
// Withings a sa propre instance (creerEtatSynchro) : chaque ligne de Connexions ne tourne que pour sa synchro.

export function creerEtatSynchro() {
  let enCours = 0;
  const abonnes = new Set<() => void>();
  const prevenir = () => abonnes.forEach((f) => f());
  return {
    synchroEnCours: () => enCours > 0,
    /** Pour useSyncExternalStore : renvoie de quoi se désabonner. */
    abonnerSynchro(f: () => void): () => void {
      abonnes.add(f);
      return () => void abonnes.delete(f);
    },
    /** Marque la synchro en cours le temps de `f`, même si elle échoue. */
    async pendantSynchro<T>(f: () => Promise<T>): Promise<T> {
      enCours++;
      prevenir();
      try {
        return await f();
      } finally {
        enCours--;
        prevenir();
      }
    },
  };
}

const whoop = creerEtatSynchro();
export const { synchroEnCours, abonnerSynchro, pendantSynchro } = whoop;
