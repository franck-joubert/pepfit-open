// Constantes uniques de la connexion Whoop. Les adresses OAuth sont dans oauth/client.ts, les identifiants dans identifiants/.

/** Réglages (table reglages) : état de la connexion. */
export const REGLAGE = {
  connecte: "whoop_connecte",
  derniereSynchro: "whoop_derniere_synchro",
  derniereErreur: "whoop_derniere_erreur",
  /** Avancement de la relecture de l'historique des jours (historique.ts) : JSON { ancre, faites, fini }. */
  historique: "whoop_historique",
  curseur: (c: string) => `whoop_curseur_${c}`,
  /** Dernière lecture du profil corps (body_measurement) hors synchro complète. */
  corpsLu: "whoop_corps_lu",
} as const;

/** Clés du stockage sécurisé du téléphone. */
export const COFFRE = { jetons: "fonte.whoop.jetons", attente: "fonte.whoop.attente" } as const; // identifiant de protocole figé : ne pas renommer
