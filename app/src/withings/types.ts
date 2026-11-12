// Connexion Withings : types de l'API officielle (Measure - Getmeas, developer.withings.com) et de leur conversion.
// Les erreurs sont celles de la connexion Whoop (ErreurWhoop : mêmes codes, même courtier, même coffre de jetons).

/** Une mesure d'un groupe : valeur réelle = value × 10^unit. `position` : mesures segmentaires (bras, jambes, tronc). */
export interface MesureBrute {
  value: number;
  type: number;
  unit: number;
  algo?: number;
  fm?: number;
  position?: number;
}

/** Un groupe de mesures (une pesée de la balance et tout ce qu'elle mesure en même temps). `date` en secondes. */
export interface GroupeWithings {
  grpid: number;
  /** 0 : appareil, à l'utilisateur ; 1 : appareil, ambigu (peut-être un autre membre du foyer) ; 2 : saisie ; 4 : saisie à
   *  la création du compte ; 5 : automatique ; 7 : confirmée par l'utilisateur ; 8 : comme 0. */
  attrib: number;
  date: number;
  created?: number;
  modified?: number;
  /** 1 : mesure réelle ; 2 : objectif de l'utilisateur. */
  category: number;
  deviceid?: string | null;
  hash_deviceid?: string | null;
  measures: MesureBrute[];
  modelid?: number;
  model?: string;
  comment?: string | null;
}

/** `body` d'une réponse getmeas. `more` : il reste des groupes, à relire avec `offset`. */
export interface PageMesures {
  updatetime: number;
  timezone?: string;
  measuregrps: GroupeWithings[];
  more?: number | boolean;
  offset?: number;
}

/** Une mesure convertie pour pepfit : pesée (kg) ou mesure du corps (table mesure_corps, son type). `date` en ms. */
export type MesureConvertie = { genre: "pesee"; kg: number; date: number } | { genre: "corps"; type: string; valeur: number; date: number };

/** Ce qu'une synchro a laissé de côté ; que des comptes et des numéros de type, jamais une valeur. */
export interface Ecartes {
  /** Groupes d'objectifs (category 2). */
  objectifs: number;
  /** Groupes « ambigus » (attrib 1 : peut-être un autre membre du foyer). */
  ambigus: number;
  /** Mesures à une position que pepfit ne range pas, en « type@position » (« 11@13 »). */
  positions: string[];
  /** Numéros de type que pepfit ne connaît pas. */
  inconnus: number[];
  /** Mesures à valeur nulle, négative ou illisible. */
  nuls: number;
}

/** Journal de la dernière synchro (Réglages › Connexions › Withings) : ce que l'API a livré, pour que Alex le voie. */
export interface DiagnosticWithings {
  groupes: number;
  /** Numéros de type (meastype) reçus, croissants. */
  types: number[];
  ecartes: Ecartes;
  /** Date (s) du groupe le plus récent reçu ; une date, pas une mesure. */
  dernier: number | null;
  /** Vrai si cette synchro n'a rien reçu : types, écartés et date sont ceux de la dernière livraison. */
  ancien?: boolean;
}

// ---- Activité et sommeil (API Measure v2 getactivity, Sleep v2 getsummary) : scope user.activity -------------------------

/** Une ligne de getactivity : l'activité d'un jour (`date` AAAA-MM-JJ, dans le fuseau `timezone`), par appareil. */
export interface ActiviteBrute {
  date: string;
  timezone?: string;
  deviceid?: string | null;
  is_tracker?: boolean;
  steps?: number;
  /** Mètres. */
  distance?: number;
  /** Calories actives (kcal). */
  calories?: number;
  totalcalories?: number;
  hr_average?: number;
  hr_min?: number;
  hr_max?: number;
}

/** `body` de getactivity. */
export interface PageActivite {
  activities: ActiviteBrute[];
  more?: number | boolean;
  offset?: number;
}

/** Une nuit de getsummary : `startdate` et `enddate` en secondes, `date` AAAA-MM-JJ du réveil, durées de `data` en secondes. */
export interface SerieSommeilBrute {
  id?: number;
  timezone?: string;
  model?: number;
  startdate: number;
  enddate: number;
  date?: string;
  data?: {
    total_sleep_time?: number;
    total_timeinbed?: number;
    lightsleepduration?: number;
    deepsleepduration?: number;
    remsleepduration?: number;
    wakeupduration?: number;
    wakeupcount?: number;
    hr_average?: number;
    hr_min?: number;
    hr_max?: number;
    rr_average?: number;
    sleep_score?: number;
  };
  modified?: number;
}

/** `body` de getsummary. */
export interface PageSommeil {
  series: SerieSommeilBrute[];
  more?: number | boolean;
  offset?: number;
}

/** Un jour converti pour pepfit (table withings_jour) : les champs inconnus sont null. `jour` : minuit local (ms). */
export interface JourWithings {
  jour: number;
  pas: number | null;
  distanceM: number | null;
  kcalActives: number | null;
  kcalTotales: number | null;
  fcMoy: number | null;
  fcMin: number | null;
  fcMax: number | null;
  sommeilDebut: number | null;
  sommeilFin: number | null;
  sommeilMin: number | null;
  auLitMin: number | null;
  legerMin: number | null;
  profondMin: number | null;
  paradoxalMin: number | null;
  eveilMin: number | null;
  reveils: number | null;
  scoreSommeil: number | null;
  fcNuitMoy: number | null;
  fcNuitMin: number | null;
  respiration: number | null;
}

/** `body` de getintradayactivity (Measure v2, scope user.activity) : `series` est un objet dont les clés sont des instants (s) et
 *  les valeurs ce que l'appareil a mesuré à cet instant ; avec `data_fields=heart_rate`, la FC (bpm), à la minute ou mieux. */
export interface PageIntraday {
  series: Record<string, { heart_rate?: number; model?: string; model_id?: number; deviceid?: string | null }>;
}
