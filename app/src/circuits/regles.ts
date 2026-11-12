// Les seuils des circuits. Ceux qui ont un jumeau côté serveur (serveur/pb_hooks/circuits.js) portent la même valeur : les cas
// partagés (serveur/tests/circuits-cas.json, tests/circuits.test.ts) échouent si l'une des deux écritures dérive.

/** Points au plus d'un tracé gardé, tolérance de la simplification (m), seuil du dénivelé (m : la règle de l'appli, `denivele()`). */
export const POINTS_MAX = 400;
export const TOLERANCE_M = 3;
export const SEUIL_DENIVELE_M = 3;

/** Un début et une fin à moins de 150 m font une boucle (ou un aller-retour). */
export const BOUCLE_M = 150;
/** Aller-retour : au moins 85 % des points de la seconde moitié, échantillonnés tous les 25 m, à moins de 40 m de la première. */
export const RETOUR_PART = 0.85;
export const RETOUR_TOL_M = 40;
export const RETOUR_PAS_M = 25;

/** D5 : un tracé qui passe à moins de 150 m du domicile ou d'un lieu personnel ne peut pas être public. */
export const DOMICILE_M = 150;

/** Un fichier GPX de plus de 20 Mo est refusé avant d'être lu. */
export const GPX_OCTETS_MAX = 20 * 1024 * 1024;
/** Nom d'un circuit : 80 caractères au plus (le serveur refuse au-delà). */
export const NOM_MAX = 80;
/** Altitudes : au moins 80 % des points doivent en avoir une (sinon le circuit n'en a pas : jamais un chiffre inventé). */
export const ALTITUDES_MIN = 0.8;
