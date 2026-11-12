// Le jour d'aujourd'hui (AAAA-MM-JJ) d'un écran resté ouvert : il change à minuit. Pure (tests/sommeil-minuit.test.ts) ;
// le hook est dans useJourCourant.ts.
import { ajouterJ } from "./planification";
import { instantDe, jourDe } from "./planif-donnees";

/** Millisecondes jusqu'au prochain minuit local (au moins une seconde : pas de boucle serrée autour de l'instant). */
export const msAvantMinuit = (maintenant: number): number => Math.max(1000, instantDe(ajouterJ(jourDe(maintenant), 1)) - maintenant);
