export interface Endormir {
  /** Le module natif est présent (APK assez récent). */
  disponible: boolean;
  /** Luminosité de la fenêtre, 0 (le plus bas) à 1 ; null : rendue au réglage du téléphone. */
  luminosite(valeur: number | null): Promise<void>;
  /** Une note douce générée (Hz, ms, volume 0 à 1). */
  tonalite(hz: number, ms: number, volume: number): Promise<void>;
  /** Coupe la note en cours. */
  silence(): Promise<void>;
}
