/** « sansVerrou » : aucun verrou d'écran réglé, rien à déverrouiller ; « indisponible » : Android 9 et moins, ou APK sans le module. */
export type Issue = "ok" | "annule" | "sansVerrou" | "indisponible";
