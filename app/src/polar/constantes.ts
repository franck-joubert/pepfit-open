// Constantes uniques de la connexion Polar (AccessLink v3). Les adresses OAuth sont dans oauth/client.ts.

/** Réglages (table reglages, locaux comme withings_*) : état de la connexion et curseurs de la lecture incrémentale. */
export const REGLAGE = {
  connecte: "polar_connecte",
  derniereSynchro: "polar_derniere_synchro",
  derniereErreur: "polar_derniere_erreur",
  /** L'utilisateur est inscrit auprès de son application AccessLink (POST /v3/users) : sans cela, Polar ne rend rien. */
  inscrit: "polar_inscrit",
  /** Dernier jour (AAAA-MM-JJ) de FC continue lu ; absent : les 28 derniers jours au prochain passage. */
  curseurFc: "polar_curseur_fc",
  /** Dernier jour (AAAA-MM-JJ) d'activité lu ; absent : les 365 derniers jours au prochain passage. */
  curseurActivite: "polar_curseur_activite",
} as const;

/** Clés du stockage sécurisé du téléphone (inscrites à l'effacement, effacer/logique.ts). */
export const COFFRE = { jetons: "fonte.polar.jetons", attente: "fonte.polar.attente" } as const;

/** Source des mesures du corps venues de Polar (mesure_corps.source) : prime sur Santé Connect (db/depots/mesures.ts). */
export const SOURCE_POLAR = "polar";
/** Origine des données lues directement chez Polar ; distincte de PAQUET_POLAR_FLOW (les mêmes, passées par Santé Connect).
 *  nomSource() en fait « Polar ». */
export const ORIGINE_POLAR = "polar";
/** Paquet Android de Polar Flow, qui écrit dans Santé Connect les séances, les pas du jour et le sommeil. */
export const PAQUET_POLAR_FLOW = "fi.polar.polarflow";

/** API AccessLink v3 (https://www.polar.com/accesslink-api/). */
export const BASE_API = "https://www.polaraccesslink.com";
