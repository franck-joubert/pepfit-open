// Travaux de fond du lancement (docs/AUDIT-PERF.md, M11) : synchro, imports, préchargements de Santé et recalculs ne partent
// plus tous en même temps que le premier écran. Ils attendent que l'Accueil ait sa première valeur (signalerPremierEcran ;
// au plus SECOURS_MS si l'Accueil ne s'affiche pas, lien direct ou parcours d'accueil) et APRES_ECRAN_MS de plus (le temps
// du premier toucher : un préchargement occupe seul le fil JS 1 à 2 s sur l'émulateur), puis passent un par un : chacun attend
// que le fil JS soit libre (requestIdleCallback) et qu'aucun geste n'ait eu lieu depuis CALME_MS (le premier toucher
// passe avant eux), puis la fin du précédent, PLAFOND_MS au plus (une synchro qui attend le réseau ne retient pas la suite).
// Au retour au premier plan, l'écran est déjà là : les travaux repassent par la même file, étalés de la même façon.

/** Sans signal du premier écran, la file part quand même au bout de ce délai (ms, depuis la première tâche). */
export const SECOURS_MS = 4000;
/** Après le premier écran, rien pendant ce délai (ms) : le premier toucher passe seul. */
export const APRES_ECRAN_MS = 3000;
/** Pas de geste depuis ce délai (ms) avant de lancer une tâche. */
export const CALME_MS = 600;
/** Au-delà, la tâche suivante n'attend plus la fin de la précédente (ms). */
export const PLAFOND_MS = 1500;
/** Attente maximale du fil JS libre (requestIdleCallback) et du calme des gestes (ms) : la tâche part ensuite. */
export const ATTENTE_MAX_MS = 5000;

export interface Horloge {
  maintenant(): number;
  attendre(ms: number): Promise<void>;
  /** Fil JS libre, ou `delaiMax` ms au plus. */
  libre(delaiMax: number): Promise<void>;
  /** Temps (ms) depuis le dernier geste. */
  inactivite(): number;
}

interface Tache {
  nom: string;
  faire: () => unknown;
}

export interface FileDemarrage {
  /** L'Accueil a sa première valeur : la file peut partir. */
  signalerPremierEcran(): void;
  /** Une tâche de fond, lancée à son tour ; son échec va au journal. */
  enFond(nom: string, faire: () => unknown): void;
  /** Les tâches en attente sont toutes parties (tests). */
  vide(): Promise<void>;
}

export function creerFileDemarrage(h: Horloge, journal: (nom: string, e: unknown) => void = () => {}): FileDemarrage {
  const file: Tache[] = [];
  let pret = false;
  let ouvrir: () => void = () => {};
  const ouverte = new Promise<void>((ok) => {
    ouvrir = () => {
      pret = true;
      ok();
    };
  });
  let secours = false;
  let tourne: Promise<void> | null = null;

  const calme = async () => {
    const fin = h.maintenant() + ATTENTE_MAX_MS;
    await h.libre(ATTENTE_MAX_MS);
    for (;;) {
      const reste = CALME_MS - h.inactivite();
      if (reste <= 0 || h.maintenant() >= fin) return;
      await h.attendre(Math.min(reste, fin - h.maintenant()));
    }
  };

  let premiere = true;
  const derouler = async () => {
    await ouverte;
    if (premiere) {
      premiere = false;
      await h.attendre(APRES_ECRAN_MS);
    }
    for (let t = file.shift(); t; t = file.shift()) {
      await calme();
      let fini: Promise<unknown>;
      try {
        fini = Promise.resolve(t.faire());
      } catch (e) {
        fini = Promise.reject(e);
      }
      const nom = t.nom;
      fini = fini.catch((e) => journal(nom, e));
      await Promise.race([fini, h.attendre(PLAFOND_MS)]);
    }
    tourne = null;
  };

  return {
    signalerPremierEcran: () => {
      if (!pret) ouvrir();
    },
    enFond(nom, faire) {
      file.push({ nom, faire });
      if (!pret && !secours) {
        secours = true;
        void h.attendre(SECOURS_MS).then(() => ouvrir());
      }
      tourne ??= derouler();
    },
    vide: () => tourne ?? Promise.resolve(),
  };
}
