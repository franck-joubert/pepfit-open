/** Compteur de pas du téléphone (capteur Android TYPE_STEP_COUNTER), en repli quand aucun appareil ne donne les pas. */
export interface PasTelephone {
  /** Le téléphone a-t-il le capteur et ce build le module natif ? Faux sur iPhone (Apple Santé suffit) et sur un APK ancien. */
  disponible(): Promise<boolean>;
  /** Permission « activité physique » (Android 10 et plus) déjà accordée ? */
  autorise(): Promise<boolean>;
  /** Demande la permission (boîte du système) ; vrai si accordée. À appeler sur un geste, jamais au lancement. */
  demander(): Promise<boolean>;
  /** Compteur cumulé depuis le dernier démarrage du téléphone ; null sans capteur, sans permission ou sans réponse. */
  compteur(): Promise<number | null>;
}
