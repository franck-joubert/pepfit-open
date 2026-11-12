// Connexion Whoop : types communs (API officielle v2, courtier pepfit, pas par l'API privée).

export interface Jetons {
  access_token: string;
  /** null : l'appli n'a pas reçu le droit « offline » (pas de renouvellement possible). */
  refresh_token: string | null;
  /** Instant d'expiration (ms). */
  expire: number;
  scope?: string;
}

/** Ce que renvoie le courtier (et le serveur d'autorisation de Whoop) : expires_in en secondes. */
export interface ReponseJeton {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  scope?: string;
}

export interface PageWhoop<T> {
  records: T[];
  next_token?: string | null;
}

export interface RecuperationWhoop {
  cycle_id: number;
  sleep_id: string;
  created_at: string;
  updated_at: string;
  score_state: string;
  score?: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number; spo2_percentage?: number; skin_temp_celsius?: number };
}

export interface CycleWhoop {
  id: number;
  start: string;
  end?: string | null;
  score_state: string;
  score?: { strain: number; kilojoule: number; average_heart_rate: number; max_heart_rate: number };
}

export interface SommeilWhoop {
  id: string;
  cycle_id?: number;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    sleep_needed?: { baseline_milli: number; need_from_sleep_debt_milli: number; need_from_recent_strain_milli: number; need_from_recent_nap_milli: number };
    sleep_performance_percentage?: number;
    respiratory_rate?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
}

export interface SeanceWhoop {
  id: string;
  start: string;
  end: string;
  sport_name?: string;
  sport_id?: number;
  score_state: string;
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    distance_meter?: number;
    zone_durations?: Record<string, number>;
  };
}

export interface CorpsWhoop {
  height_meter?: number;
  weight_kilogram?: number;
  max_heart_rate?: number;
}

export type Collection = "recovery" | "cycle" | "sleep" | "workout";

/** Un jour de données Whoop (minuit local, ms) ; chaque champ null tant que Whoop ne l'a pas noté. */
export interface JourWhoop {
  jour: number;
  recup?: number | null; vfc?: number | null; fcRepos?: number | null; spo2?: number | null; tempPeau?: number | null;
  sommeilDebut?: number | null; sommeilFin?: number | null; sommeilMin?: number | null; sommeilPerf?: number | null; sommeilDetteMin?: number | null;
  legerMin?: number | null; profondMin?: number | null; paradoxalMin?: number | null; eveilMin?: number | null;
  respiration?: number | null; sommeilEfficacite?: number | null; sommeilRegularite?: number | null; sommeilReveils?: number | null; sommeilCycles?: number | null;
  auLitMin?: number | null; besoinBaseMin?: number | null; besoinEffortMin?: number | null; besoinSiesteMin?: number | null;
  strain?: number | null; kj?: number | null; fcMoy?: number | null; fcMax?: number | null;
  pas?: number | null;
}

export interface SeanceConvertie {
  id: string;
  debut: number;
  fin: number;
  sportId: number | null;
  sport: string;
  strain: number | null; kj: number | null; fcMoy: number | null; fcMax: number | null; distanceM: number | null;
  /** Minutes passées dans chaque zone (0 à 5). */
  zones: number[] | null;
}

/** Erreur que l'écran peut montrer telle quelle (clé i18n « whoop.erreur.* »). */
export class ErreurWhoop extends Error {
  // Champ déclaré à part : les tests tournent en « strip-only » (node --experimental-strip-types), sans propriété de paramètre.
  /** « acces-refuse » : l'utilisateur a refusé l'accès sur la page de Whoop (access_denied) ; « refuse » : une réponse 4xx. */
  readonly code: "reseau" | "refuse" | "acces-refuse" | "expire" | "limite" | "serveur" | "non-connecte";
  constructor(code: ErreurWhoop["code"], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
