// Connexion Polar : types de l'API AccessLink v3 (https://www.polar.com/accesslink-api/, exemples de la documentation) et de
// leur conversion. Les erreurs sont celles de la connexion Whoop (ErreurWhoop : mêmes codes, même courtier).

/** Ce que rend le courtier (serveur/pb_hooks/polar-courtier.js) : jeton v3, sans refresh, valable environ un an. */
/** Jetons gardés sur le téléphone. */
export interface JetonsPolar {
  access_token: string;
  /** Instant d'expiration (ms). */
  expire: number;
  user_id: string | null;
}

/** Une séance (GET /v3/exercises, /v3/exercises/{id}?samples=true&zones=true&route=true). */
export interface SeancePolar {
  id: string;
  upload_time?: string;
  device?: string;
  /** Heure locale de l'appareil, sans fuseau : « 2008-10-13T10:40:02 ». */
  start_time: string;
  /** Décalage de l'heure locale sur UTC, en minutes (180 : UTC+3). */
  start_time_utc_offset?: number | null;
  /** Durée ISO 8601 : « PT2H44M45S ». */
  duration: string;
  calories?: number | null;
  distance?: number | null;
  heart_rate?: { average?: number | null; maximum?: number | null } | null;
  training_load?: number | null;
  sport?: string | null;
  detailed_sport_info?: string | null;
  has_route?: boolean;
  heart_rate_zones?: { index: number; "lower-limit": number; "upper-limit": number; "in-zone": string }[] | null;
  /** `recording-rate` en secondes ; `data` : valeurs séparées par des virgules, « null » quand le capteur décroche. */
  samples?: { "recording-rate": number | null; "sample-type": string; data: string }[] | null;
  /** `time` : durée depuis le début (« PT210.026S »). */
  route?: { latitude: number; longitude: number; time: string; satellites?: number; fix?: number; altitude?: number }[] | null;
}

/** FC continue d'un jour (GET /v3/users/continuous-heart-rate/{date}) : un point toutes les 5 min, heure de l'appareil. */
export interface FcContinuePolar {
  date: string;
  heart_rate_samples: { heart_rate: number; sample_time: string }[];
}

/** Une nuit (GET /v3/users/sleep : { nights: [...] }, 28 derniers jours). Durées en secondes. */
export interface NuitPolar {
  date: string;
  sleep_start_time: string;
  sleep_end_time: string;
  light_sleep?: number | null;
  deep_sleep?: number | null;
  rem_sleep?: number | null;
  unrecognized_sleep_stage?: number | null;
  total_interruption_duration?: number | null;
  sleep_score?: number | null;
  sleep_cycles?: number | null;
  /** « HH:MM » -> stade : 0 éveil, 1 paradoxal, 2 et 3 léger, 4 profond, 5 inconnu. */
  hypnogram?: Record<string, number> | null;
  /** « HH:MM » -> FC moyenne sur 5 min. */
  heart_rate_samples?: Record<string, number> | null;
}

/** Nightly Recharge (GET /v3/users/nightly-recharge : { recharges: [...] }) : moyennes sur 4 h dès 30 min de sommeil. */
export interface RechargePolar {
  date: string;
  heart_rate_avg?: number | null;
  beat_to_beat_avg?: number | null;
  /** RMSSD, ms. */
  heart_rate_variability_avg?: number | null;
  breathing_rate_avg?: number | null;
  nightly_recharge_status?: number | null;
  ans_charge?: number | null;
}

/** Activité d'un jour (GET /v3/users/activities?from&to : 28 jours au plus par appel, 365 jours en arrière). */
export interface ActivitePolar {
  start_time: string;
  end_time?: string;
  active_duration?: string | null;
  inactive_duration?: string | null;
  calories?: number | null;
  active_calories?: number | null;
  steps?: number | null;
  distance_from_steps?: number | null;
}

/** Séance convertie pour pepfit. Instants en ms ; `zones` : minutes par zone de FC de Polar (index croissant). */
export interface SeanceConvertie {
  id: string;
  debut: number;
  fin: number;
  sport: string | null;
  kcal: number | null;
  distanceM: number | null;
  fcMoy: number | null;
  fcMax: number | null;
  zones: number[] | null;
  fc: { t: number; bpm: number }[];
  trace: { t: number; lat: number; lon: number; alt: number | null }[];
}

/** Nuit convertie : sommeil et stades (SommeilNuit de Santé Connect) et FC de la nuit. */
export interface NuitConvertie {
  jour: string;
  debut: number;
  fin: number;
  minutes: number;
  phases: { leger: number; profond: number; paradoxal: number; eveil: number };
  /** Types de stade de Santé Connect (1 éveil, 4 léger, 5 profond, 6 paradoxal, 0 inconnu). */
  etapes: { debut: number; fin: number; type: number }[];
  fc: { t: number; bpm: number }[];
}

export interface RechargeConvertie {
  jour: string;
  fcMoy: number | null;
  rmssd: number | null;
  respiration: number | null;
}

export interface JourConverti {
  jour: string;
  pas: number | null;
  kcal: number | null;
  kcalActives: number | null;
  distanceM: number | null;
  actifMin: number | null;
}
