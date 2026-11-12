// Constantes de la connexion Fitatu (import de l'historique des repas, API privée de l'appli web : docs/FITATU.md).

/** Clé du coffre (expo-secure-store) : session Fitatu. Identifiant figé, inscrit dans l'effacement (effacer/logique.ts). */
export const COFFRE_FITATU = "fonte.fitatu.session";

/** Réglages (table reglages). */
export const REGLAGE_FITATU = {
  connecte: "fitatu_connecte",
  /** Avancement de l'import (historique.ts) : JSON EtatImportFitatu. */
  import: "fitatu_import",
  /** Code de la dernière erreur (session, limite, reseau, serveur, format) ; vide sinon. */
  erreur: "fitatu_erreur",
  /** Dernier import réussi (ms) : même clé que l'import par fichier, lue par Connexions. */
  dernier: "import_dernier_fitatu",
} as const;
