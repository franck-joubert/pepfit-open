import type { Creneau, EvenementAgenda } from "../../agenda/calcul";

/** Un agenda du téléphone (fournisseur d'agenda d'Android). */
export interface Calendrier {
  id: string;
  titre: string;
  /** Compte : « Compte Google » (nom du compte), « Ce téléphone ». */
  compte: string;
  local: boolean;
  /** Agenda d'un compte Google. */
  google: boolean;
  couleur: string | null;
  /** On peut y écrire (propriétaire, éditeur) ; faux : lecture seule ou « libre / occupé » seulement (abonnements, fériés). */
  modifiable: boolean;
  principal: boolean;
}

/**
 * Accès à l'agenda (D18) : accordé ; refusé mais on peut redemander (premier refus) ; refusé pour de bon (Android ne montre
 * plus sa fenêtre : « Ouvrir les réglages d'Android ») ; indisponible (APK sans le module).
 */
export type Acces = "accorde" | "aDemander" | "refuse" | "indisponible";

/** Ce que pepfit écrit d'une séance (D11, ajustements du 03/11) : titre, heures, description avec le lien, lieu ; pas de rappel. */
export interface DetailsEvenement extends Creneau {
  titre: string;
  notes: string;
  lieu: string | null;
}

export type { Creneau, EvenementAgenda };
