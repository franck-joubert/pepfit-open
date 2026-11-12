import type { AlerteSieste } from "../../ecrans/alerte-sieste";

/** iPhone : les réglages de notifications de l'appli (getNotificationSettings). */
export interface DiagIos {
  autorisees: boolean;
  /** Les sons des notifications de l'appli sont permis. */
  sons: boolean;
  /** « Notifications urgentes » : « absent » si l'appli n'a pas le droit de les demander (ou avant iOS 15). */
  urgentes: "oui" | "non" | "absent";
  verrou: boolean;
}

/** Ce qui pourrait couper l'alarme, lu au démarrage de la sieste. iPhone : champs Android neutres, et `ios`. */
export interface DiagAlarme {
  ios?: DiagIos;
  /** « Ne pas déranger » : « non », « priorite », « alarmes » (alarmes seulement) ou « total » (silence total). */
  neDeranger: "non" | "priorite" | "alarmes" | "total";
  /** En priorité, l'exception « alarmes » est cochée (vrai hors de ce mode). */
  alarmesPermises: boolean;
  sonnerie: "normal" | "vibreur" | "silencieux";
  /** Volume du flux alarme. */
  volumeAlarme: number;
  pleinEcran: boolean;
  heureExacte: boolean;
  economie: boolean;
}

export interface AlarmeRecup {
  /** Une vraie alarme native (service, flux ALARME, vibration USAGE_ALARM, plein écran) : l'appli n'a rien à sonner elle-même. */
  natif: boolean;
  /** Fait taire l'alarme qui sonne (« Je suis réveillé », notification touchée). */
  arreter(): Promise<void>;
  /** Ce qui pourrait couper l'alarme ; null sans le module natif. */
  diagnostic(): Promise<DiagAlarme | null>;
  /** Ouvre le réglage « notifications plein écran » de l'appli (Android 14+). */
  ouvrirPleinEcran(): Promise<void>;
  /**
   * Au moment où une alarme va servir (repos, sieste) : si « Alarmes et rappels » n'est pas accordée (Android 12+,
   * SCHEDULE_EXACT_ALARM), la feuille d'explication puis le réglage d'Android. Refusée, l'alarme sonne quand même, parfois
   * en retard.
   */
  demanderHeureExacte(): Promise<void>;
  /**
   * L'alarme de fin d'une sieste ou d'une activité : une notification à `fin` (setAlarmClock), sur le canal fin-sieste du
   * réglage ; null l'annule. Elle sonne appli fermée, écran éteint ou verrouillé.
   */
  programmer(o: { fin: number | null; sieste: boolean; nom: string; alerte: AlerteSieste; sonUri: string | null }): Promise<boolean>;
  /** Une sieste « Libre » : la notification silencieuse de sa fermeture d'office au bout de 3 h ; null l'annule. */
  fermetureLibre(fin: number | null): Promise<void>;
  /** Le rappel du jour (canal de faible importance, sans son ni vibration, bouton « Démarrer ») ; null l'annule. */
  rappel(o: { quand: number; dette: string } | null): Promise<void>;
}
