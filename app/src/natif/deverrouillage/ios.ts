import type { Issue } from "./types";

// Couche iPhone du déverrouillage, sans import d'Expo (testée avec un faux module : tests/ios-divers.test.ts). Le module
// Swift modules/pepfit-deverrouillage/ios porte les mêmes noms que le Kotlin : Face ID, Touch ID ou code (LocalAuthentication),
// et l'aperçu masqué dans le sélecteur d'applications (une vue opaque posée au passage en arrière-plan).
export interface NatifDeverrouillage {
  deverrouiller(titre: string, sousTitre: string): Promise<Issue>;
  estProtege?(): boolean;
  masquerApercu?(oui: boolean): Promise<boolean>;
}

export function fabriquerDeverrouillage(natif: NatifDeverrouillage | null, attendre: (f: () => void) => void = (f) => setTimeout(f, 1000)) {
  // La fenêtre de Face ID rend pepfit inactif le temps de la saisie : ce passage ne compte pas pour le verrou (verrou/etat).
  let enCours = 0;
  return {
    deverrouillageEnCours: () => enCours > 0,
    deverrouiller: async (titre: string, sousTitre: string): Promise<Issue> => {
      if (!natif) return "indisponible";
      enCours++;
      try {
        return await natif.deverrouiller(titre, sousTitre).catch((): Issue => "annule");
      } finally {
        // le retour au premier plan arrive juste après la réponse
        attendre(() => enCours--);
      }
    },
    /** Un code est-il réglé sur l'iPhone ? null : on ne sait pas. */
    estProtege: (): boolean | null => {
      try {
        return natif?.estProtege ? natif.estProtege() : null;
      } catch {
        return null;
      }
    },
    masquerApercu: (oui: boolean): Promise<boolean> => (natif?.masquerApercu ? natif.masquerApercu(oui).catch(() => false) : Promise.resolve(false)),
  };
}
