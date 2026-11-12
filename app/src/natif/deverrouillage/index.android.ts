import { requireOptionalNativeModule } from "expo";
import type { Issue } from "./types";

// Module local modules/pepfit-deverrouillage (Kotlin) : la fenêtre de déverrouillage du système (BiometricPrompt,
// empreinte ou code), avant de réafficher un lien de Connexion IA (C27) et pour le verrou d'ouverture (H3). Absent d'un APK
// plus ancien : « indisponible ».
export type { Issue } from "./types";
interface Natif {
  deverrouiller(titre: string, sousTitre: string): Promise<Issue>;
  /** Absents d'un APK d'avant le verrou d'ouverture. */
  estProtege?(): boolean;
  masquerApercu?(oui: boolean): Promise<boolean>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitDeverrouillage");

// La fenêtre du code met pepfit en arrière-plan le temps de la saisie : ce passage ne compte pas pour le verrou (verrou/etat).
let enCours = 0;
export const deverrouillageEnCours = () => enCours > 0;

export const deverrouiller = async (titre: string, sousTitre: string): Promise<Issue> => {
  if (!natif) return "indisponible";
  enCours++;
  try {
    return await natif.deverrouiller(titre, sousTitre).catch((): Issue => "annule");
  } finally {
    // le retour au premier plan arrive juste après la réponse
    setTimeout(() => enCours--, 1000);
  }
};

/** Un verrou d'écran est-il réglé ? null : on ne sait pas (APK sans cette fonction) ; la fenêtre le dira (« sansVerrou »). */
export const estProtege = (): boolean | null => {
  try {
    return natif?.estProtege ? natif.estProtege() : null;
  } catch {
    return null;
  }
};

/** Masque l'aperçu de pepfit dans les applis récentes (Android 13 et plus) ; faux : pas possible ici. */
export const masquerApercu = (oui: boolean): Promise<boolean> => (natif?.masquerApercu ? natif.masquerApercu(oui).catch(() => false) : Promise.resolve(false));
