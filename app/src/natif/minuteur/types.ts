import type { AlerteRepos } from "../../ecrans/alerte-repos";

export interface EtatMinuteur {
  actif: boolean;
  restantS: number;
  totalS: number;
}

export interface MinuteurRepos {
  demarrer(dureeS: number): void;
  ajuster(deltaS: number): void;
  passer(): void;
  reprendre(finMs: number, totalS: number): void;
  echeance(): number;
  /** Alerte de fin de repos (même écran verrouillé) et son choisi (null : son par défaut). */
  regler(alerte: AlerteRepos, sonUri: string | null): void;
  /** Vrai si l'appli doit vibrer elle-même à la fin (aucune notification programmée ne le fait). */
  vibrerEnApp(): boolean;
  /** Le réglage de fin du repos vibre (l'appli vibre à la place d'une notification retenue au premier plan). */
  alerteVibre(): boolean;
  /**
   * Fin du compte à rebours d'une série en durée (planche seance-duree, D5) : une notification à `finMs`, sur le canal de fin
   * du repos (son selon le réglage, écran verrouillé compris) ; null l'annule (pause, coche, correction).
   */
  alerteCible(finMs: number | null): void;
  etat(): EtatMinuteur;
  ecouter(cb: (e: EtatMinuteur) => void): () => void;
}
