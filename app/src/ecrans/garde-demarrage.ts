// Garde de démarrage (retour du 28/10, point 10) : tout chemin qui démarre une séance (bouton « Démarrer une
// séance », tuile d'un sport, programme, routine, calendrier, accueil) passe par `garderDemarrage`. Une séance déjà en cours
// (musculation ou suivi GPS) : la feuille « Tu as une séance en cours » propose de la reprendre, de la terminer et
// l'enregistrer puis démarrer (rien ne se perd, mieux que Hevy), de l'abandonner puis démarrer, ou d'annuler.
// Pur (sans React Native) : testé par tests/retours-28-10.test.ts ; le branchement réel est dans demarrer-seance.tsx.

export type EnCours = { genre: "seance"; id: string; titre: string } | { genre: "suivi"; titre: string };
export type ChoixEnCours = "reprendre" | "terminer" | "abandonner" | "annuler";
export type Issue = "lancee" | "reprise" | "annulee";

export interface OutilsGarde {
  /** La séance ou le suivi en cours, sinon null. */
  enCours(): Promise<EnCours | null>;
  /** Pose la feuille et rend le choix (« annuler » si on la ferme). */
  demander(e: EnCours): Promise<ChoixEnCours>;
  /** `retirer` : les écrans de lancement à retirer de la pile avec l'ouverture (pile-lancement.ts). */
  reprendre(e: EnCours, retirer: number): void;
  /** Enregistre la séance en cours comme terminée. */
  terminer(e: EnCours): Promise<void>;
  /** Supprime la séance en cours (même effet que l'abandon existant). */
  abandonner(e: EnCours): Promise<void>;
}

let occupe = false;

/**
 * Lance `lancer` s'il n'y a rien en cours ; sinon demande et suit le choix. Un second démarrage pendant que le premier attend
 * sa réponse (double toucher) est ignoré.
 */
export async function garderDemarrage(o: OutilsGarde, lancer: () => Promise<void>, retirer = 0): Promise<Issue> {
  if (occupe) return "annulee";
  occupe = true;
  try {
    const e = await o.enCours();
    if (!e) {
      await lancer();
      return "lancee";
    }
    const c = await o.demander(e);
    if (c === "annuler") return "annulee";
    if (c === "reprendre") {
      o.reprendre(e, retirer);
      return "reprise";
    }
    if (c === "terminer") await o.terminer(e);
    else await o.abandonner(e);
    await lancer();
    return "lancee";
  } finally {
    occupe = false;
  }
}
