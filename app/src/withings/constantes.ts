// Constantes uniques de la connexion Withings. Les adresses OAuth sont dans oauth/client.ts.

/** Réglages (table reglages) : état de la connexion et curseur de la lecture incrémentale. */
export const REGLAGE = {
  connecte: "withings_connecte",
  derniereSynchro: "withings_derniere_synchro",
  derniereErreur: "withings_derniere_erreur",
  /** `updatetime` (s) de Withings à la dernière lecture complète ; absent : tout l'historique au prochain passage. */
  curseur: "withings_curseur",
  /** Journal de la dernière synchro (DiagnosticWithings en JSON : comptes et numéros de type, aucune valeur de santé). */
  diagnostic: "withings_diagnostic",
  /** Version de la conversion qui a lu l'historique : une conversion plus riche (zones, viscéral…) relit tout une fois. */
  versionConversion: "withings_version_conversion",
  /** Activité et sommeil (scope user.activity) : `lastupdate` (s) de la dernière lecture complète ; absent : première lecture. */
  plusCurseur: "withings_plus_curseur",
  /** Première lecture par tranches : dernier jour (minuit, ms) rangé ; une lecture interrompue reprend au lendemain. */
  plusJusqua: "withings_plus_jusqua",
  /** Code de la dernière erreur de la lecture de l'activité et du sommeil (jamais fatale à la synchro des pesées). */
  plusErreur: "withings_plus_erreur",
  /** « 1 » : la connexion date d'avant user.activity, il faut se reconnecter pour lire le sommeil et les pas. */
  reconnexion: "withings_reconnexion",
  /** Code de la dernière erreur de la lecture de la FC à la minute (jamais fatale, ni pour les pesées ni pour le sommeil). */
  fcErreur: "withings_fc_erreur",
} as const;

/** Nuits relues pour la FC au repos : les 7 derniers jours, 3 demandes au plus par synchro. */
export const FC_NUITS_JOURS = 7;
export const FC_NUITS_PAR_SYNCHRO = 3;

/** Droit à demander en plus de user.info et user.metrics pour l'activité (pas, distance, calories, FC du jour) et le sommeil. */
export const SCOPE_ACTIVITE = "user.activity";

/** Jours relus à la première lecture de l'activité et du sommeil, et taille d'une tranche (une demande par tranche et par sorte). */
export const JOURS_HISTORIQUE = 365;
export const JOURS_TRANCHE = 90;

/** Passe à N+1 quand `convertir.ts` lit de nouveaux types : le curseur est remis à zéro une fois (les écritures sont idempotentes). */
export const VERSION_CONVERSION = 3; // 3 : températures (types 71 et 73)

/** Clés du stockage sécurisé du téléphone (inscrites à l'effacement, effacer/logique.ts). */
export const COFFRE = { jetons: "fonte.withings.jetons", attente: "fonte.withings.attente" } as const; // identifiant de protocole figé : ne pas renommer

/** Source des mesures du corps venues de Withings (mesure_corps.source), prioritaire sur Santé Connect (db/depots/mesures.ts). */
export const SOURCE_WITHINGS = "withings";
/** Origine des pesées et mesures lues directement chez Withings ; distincte de « com.withings.wiscale2 » (les mêmes, passées
 * par Santé Connect) : la déconnexion n'efface que les siennes. nomSource() en fait « Withings ». */
export const ORIGINE_WITHINGS = "withings";
