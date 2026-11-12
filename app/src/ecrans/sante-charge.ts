// Chargement de la page Santé (30/10 : « ça met 10 s à s'afficher ») : chaque groupe de cartes se lit dans la base
// du téléphone et se pose dès qu'il est prêt, sans attendre les autres ; l'import Santé Connect et les synchros Whoop et
// Withings (réseau) tournent en même temps, en fond, et les cartes sont relues quand ils ont fini. Avant, la page attendait
// la synchro puis lisait tout en série. Mesures : docs/SANTE-VITESSE.md. Sans rien de React Native.

export interface LecteursSante<P> {
  /** Lectures dans la base, une par groupe de cartes. `reposer` : une valeur plus juste, arrivée plus tard (l'Âge pepfit
   * gardé d'abord, puis recalculé en fond). */
  parties: { [K in keyof P]: (reposer: (v: P[K]) => void) => Promise<P[K]> };
  /** Import Santé Connect et synchros : lancés tout de suite, sans retenir les lectures ; vrai s'ils ont apporté du neuf.
   * Absents pour un jour passé. */
  rafraichir?: () => Promise<boolean>;
}

/**
 * Lit chaque partie et la pose dès qu'elle est lue (une lecture ratée est journalisée et ne retient pas les autres) ; la
 * synchro finie, relit tout si elle a apporté du neuf. `vivant` faux (page quittée, autre jour choisi) : plus rien n'est posé.
 */
export async function chargerSante<P>(l: LecteursSante<P>, poser: <K extends keyof P>(k: K, v: P[K]) => void, vivant: () => boolean = () => true): Promise<void> {
  const lire = () =>
    Promise.all(
      (Object.keys(l.parties) as (keyof P)[]).map((k) =>
        l.parties[k]((v) => {
          if (vivant()) poser(k, v);
        }).then(
          (v) => {
            if (vivant()) poser(k, v);
          },
          (e: unknown) => console.error(e),
        ),
      ),
    );
  const synchro = l.rafraichir?.().catch((e: unknown) => (console.error(e), false));
  await lire();
  if (synchro && (await synchro) && vivant()) await lire();
}

const memoire = new Map<string, { t: number; v: Promise<unknown> }>();

/**
 * Le résultat d'un calcul lourd (l'Âge pepfit d'un jour passé relit un an d'historique) gardé `validiteMs` : un retour sur
 * l'onglet, ou la relecture après la synchro, le reprend au lieu de le refaire ; deux appels en même temps partagent le même
 * calcul. Un échec n'est pas gardé. (L'âge d'aujourd'hui est gardé dans la base : age-donnees.ts.)
 */
export function enMemoire<T>(cle: string, validiteMs: number, lire: () => Promise<T>, maintenant = Date.now()): Promise<T> {
  const m = memoire.get(cle);
  if (m && maintenant - m.t < validiteMs) return m.v as Promise<T>;
  const v = lire();
  memoire.set(cle, { t: maintenant, v });
  v.catch(() => {
    if (memoire.get(cle)?.v === v) memoire.delete(cle);
  });
  return v;
}

/** Vide la mémoire (tests ; une saisie qui change l'âge peut l'appeler). */
export function oublierMemoire(): void {
  memoire.clear();
}
