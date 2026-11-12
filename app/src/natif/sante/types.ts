export type PermissionSante =
  | "poids" | "pas" | "sommeil" | "frequence-cardiaque" | "seances"
  // page Santé : composition (balance), métabolisme de base, VFC, respiration, séances et kcal des autres applis
  | "gras" | "maigre" | "os" | "eau" | "bmr" | "vfc" | "respiration" | "sport" | "kcal-actives"
  // distance du jour : longueur réelle du pas (kcal par pas Automatique)
  | "distance"
  // page Corps (29/10) : la taille déposée par une autre appli
  | "taille"
  // activité détectée (29/10) : les échantillons de FC de la montre
  | "fc-montre"
  // suivi du cycle (planche cycle, D7) : règles et intensité, sous la seule permission READ_MENSTRUATION ; jamais les autres
  // types de la famille (tests, glaire, saignements entre les règles, activité sexuelle, température basale)
  | "regles"
  // historique (3/11) : au-delà des 30 jours d'avant la première autorisation (READ_HEALTH_DATA_HISTORY) ; facultative, demandée
  // avec les autres quand Santé Connect sait la donner
  | "historique";

/** Mesures datées lues dans Santé Connect : gras (%), maigre, os, eau (kg), bmr (kcal/j), vfc (ms), respiration (/min), fc au repos (bpm), taille (cm). */
export type TypeMesureSante = "gras" | "maigre" | "os" | "eau" | "bmr" | "vfc" | "respiration" | "fc" | "taille";

export interface MesureSante {
  valeur: number;
  date: number;
  origine: string | null;
}

/** Séance de sport d'une autre appli (Whoop, Samsung Health…), avec ses kcal actives et ses pas si on peut les lire. */
export interface SeanceSport {
  debut: number;
  fin: number;
  /** Type ExerciseSessionRecord (EXERCISE_TYPE_*). */
  type: number;
  titre: string | null;
  origine: string | null;
  /** kcal actives (déjà sans le métabolisme) sur l'intervalle ; null sans donnée. */
  kcal: number | null;
  /** Pas pendant la séance ; null sans donnée. */
  pas: number | null;
}

export interface PoidsCorporel {
  kg: number;
  date: number;
  /** Paquet Android de l'appli qui a déposé la pesée (ex. com.withings.wiscale2). */
  origine?: string | null;
}

/** absent : Santé Connect n'est pas sur le téléphone (ou doit être mis à jour) ; non-branche : le module natif manque
 *  dans cette version ; a-autoriser : pepfit n'a pas encore le droit de lire le poids ; pret : lecture possible. */
export type Connecteur = "absent" | "non-branche" | "a-autoriser" | "pret";

export interface AppliSante {
  paquet: string;
  installee: boolean;
  /** L'appli a déjà déposé au moins une pesée dans Santé Connect (30 derniers jours). */
  partage: boolean;
}

export interface EtatSante {
  connecteur: Connecteur;
  applis: AppliSante[];
}

export interface SeanceExportee {
  debut: number;
  fin: number;
  titre: string;
  /** Identifiant stable (id de la séance) : réexporter remplace au lieu de doubler. */
  id?: string;
}

export interface PasJour {
  /** Minuit (heure locale) du jour. */
  jour: number;
  /** null : aucune donnée de pas ce jour-là. */
  pas: number | null;
}

export interface SommeilNuit {
  debut: number;
  fin: number;
  /** Temps endormi : la session moins les éveils quand les phases sont connues. */
  minutes: number;
  /** Minutes par phase, null si l'appli n'en dépose pas. */
  phases: { leger: number; profond: number; paradoxal: number; eveil: number } | null;
  origine: string | null;
  /** Tranches de stades dans le temps (type Santé Connect), vide si l'appli n'en dépose pas. */
  etapes?: { debut: number; fin: number; type: number }[];
}

export interface FrequenceRepos {
  bpm: number;
  date: number;
  origine: string | null;
}

/** Toutes les lectures renvoient null sans autorisation : aucune lecture n'est tentée tant qu'elle n'est pas accordée. */
export interface Sante {
  disponible(): Promise<boolean>;
  /** Autorisations déjà accordées (sans rien demander). */
  autorisees(): Promise<PermissionSante[]>;
  /** Demande à Santé Connect ; true si toutes sont accordées. Les facultatives (« historique ») sont demandées dans la même
   *  fenêtre quand Santé Connect sait les donner, sans compter dans le résultat (sauf demandées seules). */
  demanderPermissions(p: PermissionSante[]): Promise<boolean>;
  /** Santé Connect sait donner l'historique (permission « historique ») ; false avec un module natif plus ancien. */
  historiquePossible?(): Promise<boolean>;
  dernierPoids(): Promise<PoidsCorporel | null>;
  /** Pesées des `jours` derniers jours (toutes applis), de la plus récente à la plus ancienne. */
  pesees(jours: number): Promise<PoidsCorporel[] | null>;
  /** État du connecteur et des applis connues (paquets de SERVICES_SANTE). */
  etatPoids(paquets: string[]): Promise<EtatSante>;
  /** Pas depuis minuit. */
  pasDuJour(): Promise<number | null>;
  /** Pas des `jours` derniers jours, du plus ancien à aujourd'hui (7 par défaut). */
  pasSurJours(jours?: number): Promise<PasJour[] | null>;
  /** Nuit qui s'est terminée depuis 18 h la veille. */
  sommeilDeLaNuit(): Promise<SommeilNuit | null>;
  /** Dernière fréquence cardiaque au repos des 7 derniers jours. */
  frequenceRepos(): Promise<FrequenceRepos | null>;
  /** Nuits terminées entre `debut` et `fin`, une par jour de réveil (la plus longue session), de la plus ancienne à la plus récente ;
   *  les siestes (sessions de journée, D4 de la planche recuperer) n'en sont pas. */
  nuits(debut: number, fin: number): Promise<SommeilNuit[] | null>;
  /** Toutes les sessions de sommeil terminées entre `debut` et `fin` (siestes comprises), de la plus ancienne à la plus récente. */
  sessionsSommeil?(debut: number, fin: number): Promise<SommeilNuit[] | null>;
  /** Mesures d'un type sur les `jours` derniers jours, de la plus récente à la plus ancienne. */
  mesures(type: TypeMesureSante, jours: number): Promise<MesureSante[] | null>;
  /** Mesures d'un type entre `debut` et `fin` (reprise de l'historique par tranches), de la plus récente à la plus ancienne. */
  mesuresEntre?(type: TypeMesureSante, debut: number, fin: number): Promise<MesureSante[] | null>;
  /** Pesées entre `debut` et `fin` (reprise de l'historique par tranches), de la plus récente à la plus ancienne. */
  peseesEntre?(debut: number, fin: number): Promise<PoidsCorporel[] | null>;
  /** Séances de sport des autres applis (pas celles que pepfit a écrites) entre `debut` et `fin`. */
  seancesSport(debut: number, fin: number): Promise<SeanceSport[] | null>;
  /** Pas de l'intervalle ; null sans autorisation ou sans donnée. */
  pasEntre(debut: number, fin: number): Promise<number | null>;
  /** Applis qui ont écrit des pas sur l'intervalle, même hors des priorités de Santé Connect (l'agrégat ne les compte pas) ;
   * null sans autorisation ou module ancien. */
  originesPas?(debut: number, fin: number): Promise<string[] | null>;
  /** Applis (paquets) qui écrivent dans Santé Connect sur l'intervalle (pas, FC, sommeil, séances : ceux dont l'autorisation est
   * accordée), en une seule lecture légère ; null sans aucune autorisation ou Santé Connect absent. Un module natif ancien ne rend
   * que les applis des pas. */
  originesDonnees?(debut: number, fin: number): Promise<string[] | null>;
  /** Échantillons de FC de l'intervalle (toutes applis), du plus ancien au plus récent ; null sans autorisation. */
  fcEntre(debut: number, fin: number): Promise<{ t: number; bpm: number }[] | null>;
  /** Distance parcourue sur l'intervalle (m), toutes applis ; null sans autorisation ou sans donnée. */
  distanceEntre(debut: number, fin: number): Promise<number | null>;
  /** Pas de chaque intervalle [bornes[i], bornes[i+1]] en une seule lecture (jours d'une période, heures d'une journée) ;
   *  null sans autorisation, null par intervalle sans donnée. */
  pasIntervalles(bornes: number[]): Promise<(number | null)[] | null>;
  /** Distance (m) de chaque intervalle [bornes[i], bornes[i+1]] en une seule lecture (jours d'un bilan d'énergie) ; null sans
   *  autorisation, null par intervalle sans donnée. */
  distanceIntervalles(bornes: number[]): Promise<(number | null)[] | null>;
  /** Règles de l'intervalle : périodes (MenstruationPeriodRecord) et jours de flux (MenstruationFlowRecord) ; null sans
   *  autorisation ou avec un module natif plus ancien. */
  regles(debut: number, fin: number): Promise<{ periodes: { debut: number; fin: number; id: string }[]; flux: { date: number; flux: number; id: string }[] } | null>;
  /** Ouvre l'appli `paquet` (pour qu'elle partage vers Santé Connect), sinon les réglages de pepfit dans Santé Connect. */
  ouvrirReglages(paquet?: string): Promise<void>;
  /** Oublie `statut` et `autorisees` gardés 30 s : relus à la prochaine lecture (retour au premier plan, réglages changés). */
  oublierAutorisations(): void;
  /** Écrit la séance dans Santé Connect ; false sans autorisation. */
  exporterSeance(s: SeanceExportee): Promise<boolean>;
}
