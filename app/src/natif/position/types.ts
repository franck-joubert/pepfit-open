// Le sous-ensemble d'expo-location qu'utilise l'appli : sur Android, modules/pepfit-position le remplace (sans Play Services).

/** Valeurs d'expo-location. */
export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 } as const;
export type Accuracy = (typeof Accuracy)[keyof typeof Accuracy];

export interface LocationPermissionResponse {
  granted: boolean;
  canAskAgain: boolean;
}

export interface LocationObject {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
}

export interface LocationOptions {
  accuracy?: Accuracy;
  timeInterval?: number;
  distanceInterval?: number;
  /** Ignoré sur Android (pas de boîte « Précision de la localisation » de Google sans Play Services). */
  mayShowUserSettingsDialog?: boolean;
}

export interface LocationSubscription {
  remove(): void;
}
