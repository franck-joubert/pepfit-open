/** Point du tracé tel que l'écrit le module natif (un par seconde au plus, rien en pause). */
export interface Point {
  /** Horodatage, ms depuis 1970. */
  t: number;
  /** Temps de séance hors pauses, ms. */
  s: number;
  lat: number;
  lon: number;
  /** Altitude barométrique lissée (m) ; null sans baromètre. */
  altBaro: number | null;
  /** Altitude GPS (m) ; null si le fix n'en donne pas. */
  altGps: number | null;
  /** Précision horizontale (m). */
  precision: number;
  /** Vitesse donnée par le GPS (m/s) ; null si absente. */
  vitesse: number | null;
}

/** Échantillon de FC (BLE 0x2A37). */
export interface EchantillonFc {
  t: number;
  s: number;
  bpm: number;
}

/** « course » : GPS, baromètre et FC (service location|connectedDevice). « fc » : FC seule, sans GPS (service connectedDevice
 *  seul : tapis, intérieur). « muscu » : FC seule pendant une séance de muscu (lot 5) : notification sans action Pause (la pause
 *  est celle de la séance), chrono calé sur celui de la séance. */
export type ModeSuivi = "course" | "fc" | "muscu";

export type StatutSuivi = "arrete" | "en_cours" | "pause";
export type EtatGps = "coupe" | "attente" | "ok" | "perdu";
export type EtatFc = "coupe" | "recherche" | "connexion" | "connecte" | "perdu" | "sans_bluetooth";

export interface TourNatif {
  n: number;
  /** Temps de séance hors pauses au toucher, ms. */
  s: number;
  /** Distance cumulée au toucher, m. */
  d: number;
}

/** Instantané envoyé par le module (événement « etat », environ 1 Hz) et rendu par `etat()`. */
export interface EtatSuivi {
  statut: StatutSuivi;
  id: string | null;
  mode: ModeSuivi | null;
  /** Même chrono que la séance de muscu (ecrans/duree-seance.ts), en ms. */
  debut: number | null;
  pauseDebut: number | null;
  pauseCumulMs: number;
  /** Temps de séance hors pauses, ms, au moment de l'instantané. */
  tempsMs: number;
  /** Distance tenue par le natif (filtrée, comme pour la notification), m. */
  distanceM: number;
  gps: {
    etat: EtatGps;
    lat: number | null;
    lon: number | null;
    precision: number | null;
    altitude: number | null;
    vitesse: number | null;
    /** Âge du dernier fix, ms ; null sans fix. */
    ageMs: number | null;
  };
  fc: {
    etat: EtatFc;
    bpm: number | null;
    contact: boolean | null;
    ageMs: number | null;
    appareil: string | null;
    adresse: string | null;
  };
  baro: {
    present: boolean;
    pression: number | null;
    altitude: number | null;
  };
  tours: TourNatif[];
  nbPoints: number;
  nbFc: number;
}

export interface Capteurs {
  barometre: boolean;
  gps: boolean;
  bluetooth: boolean;
  android: number;
  /** Android 16 : l'appli peut poster une notification promue (puce Live Update). */
  promu: boolean;
}

export interface AppareilFc {
  adresse: string;
  nom: string | null;
  rssi: number;
  /** Annonce le service Heart Rate 0x180D (diffusion de la FC active). */
  fc: boolean;
}

export interface Batterie {
  /** L'appli est soumise à l'optimisation de batterie. */
  optimisee: boolean;
  /** Proposée par un APK du 30/10 (une fois, première séance avec la FC) : vaut le moment « seance » (ecrans/batterie.ts). */
  dejaProposee: boolean;
  /** Téléphone Samsung (One UI) : le réglage est « Non restreinte » dans Batterie de l'appli. Absent d'un APK plus ancien. */
  samsung?: boolean;
}

/** Ligne du journal des coupures (natif) : heure (ms), événement (« deconnexion », « reprise », « ecran »…), détail. */
export interface LigneJournal {
  t: number;
  evenement: string;
  detail: string;
}

export interface OptionsSuivi {
  mode: ModeSuivi;
  /** Lire la FC en Bluetooth (par défaut oui). */
  fc?: boolean;
  /** Adresse du capteur ; sinon le dernier utilisé, sinon le premier qui diffuse 0x180D. */
  appareil?: string | null;
  /** Titre de la notification (« Course », « Muscu »…). */
  titre?: string;
  /** Muscu : début de la séance (ms) et pauses déjà faites (ms), pour le chrono de la notification. */
  debut?: number | null;
  pauseCumulMs?: number;
}

export interface Suivi {
  disponible: boolean;
  capteurs(): Promise<Capteurs | null>;
  /** Demande les autorisations du mode (position et notifications ; Bluetooth si FC). true si tout est accordé. */
  autoriser(o: { position: boolean; bluetooth: boolean }): Promise<boolean>;
  /** « Appareils à proximité » (Bluetooth, Android 12+) accordés ; toujours vrai avant Android 12. */
  appareils(): Promise<boolean>;
  /** Demande « Appareils à proximité » : « bloque » quand Android ne la montre plus (à autoriser dans ses réglages). */
  demanderAppareils(): Promise<"accorde" | "refuse" | "bloque">;
  demarrer(o: OptionsSuivi): Promise<EtatSuivi>;
  pause(): Promise<EtatSuivi>;
  reprendre(): Promise<EtatSuivi>;
  /** null en pause ou à l'arrêt. */
  tour(): Promise<TourNatif | null>;
  /** Arrête le service ; le tampon reste sur disque jusqu'à `effacer(id)`. */
  terminer(): Promise<EtatSuivi>;
  etat(): Promise<EtatSuivi | null>;
  /** Abonnement à l'état (environ 1 Hz) ; renvoie la fonction de désabonnement. */
  ecouter(f: (e: EtatSuivi) => void): () => void;
  points(id: string, depuis?: number): Promise<Point[]>;
  frequences(id: string, depuis?: number): Promise<EchantillonFc[]>;
  /** Tampons restés sur disque (suivis terminés non encore enregistrés, ou appli tuée). */
  tampons(): Promise<string[]>;
  effacer(id: string): Promise<void>;
  /** « Effacer les données de ce téléphone » : service arrêté, tous les tampons et les préférences (capteur FC) effacés. */
  oublier(): Promise<void>;
  chercherFc(dureeMs: number): Promise<AppareilFc[]>;
  batterie(): Promise<Batterie | null>;
  /** Ouvre le réglage de batterie de pepfit : la fiche de l'appli (Samsung, ou repli) ou la liste « Optimisation de la
   *  batterie » ; null sans le module. */
  ouvrirReglagesBatterie(): Promise<"fiche" | "liste" | null>;
  /** Journal local des coupures du capteur (diagnostic), sans donnée personnelle ; vide sur un APK plus ancien. */
  journal(): Promise<LigneJournal[]>;
  /** Ouvre une autre appli par son paquet (« Ouvrir Whoop ») ; faux si elle n'est pas installée. */
  ouvrirAppli(paquet: string): Promise<boolean>;
}
