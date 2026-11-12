// Page « agenda mensuel » des mesures (retour du 29/10, point 5) : une page plein écran, ouverte par l'icône agenda
// en haut à droite de chaque page de mesure, avec la bascule Liste / Mois (ui/BasculeVue). La page appelante lui passe ses
// lectures par ce registre (même runtime JS) : pas de données dans l'URL. Sans React Native.
import { router } from "expo-router";
import type { VueAgenda } from "../../ui/BasculeVue";
import type { Accent } from "./gabarit";

/** Une entrée : un jour (vue mois : un point, plein si `bon`) ou un relevé (vue liste : une ligne). */
export interface EntreeAgenda {
  /** Instant de la valeur (jour, nuit, pesée) ; la vue mois la range à son jour. */
  date: number;
  /** « 7 403 pas », « 77,96 kg » */
  texte: string;
  /** « Withings · 7:01 », « objectif atteint » */
  sous?: string | null;
  bon: boolean;
  /** Toucher la ligne (une pesée ouvre sa feuille) ; sans lui, toucher le jour le choisit dans la page. */
  onPress?: () => void;
}

export interface ParamsAgenda {
  /** Titre de la page (« Pas », « Poids »). */
  titre: string;
  maintenant: number;
  /** Premier jour de l'historique (borne des mois d'avant), null sans historique. */
  premier: number | null;
  /** « objectif atteint (8 000 pas) » : sens du point plein. */
  legende: string;
  /** Vue au départ (« liste » pour « Toutes les pesées »). */
  vue?: VueAgenda;
  /** Entrées entre `debut` (compris) et `fin` (exclu), de la plus ancienne à la plus récente. */
  lire: (debut: number, fin: number) => Promise<EntreeAgenda[]>;
  /** Un jour touché (vue mois, ou ligne sans onPress) : la page de mesure le montre ; l'agenda se referme. */
  onJour?: (jour: number) => void;
  /** Couleur des points : rose Santé par défaut, orange pour l'Effort (« sport »). */
  accent?: Accent;
}

let courant: ParamsAgenda | null = null;

/** Ouvre la page agenda avec ces lectures. */
export function ouvrirAgenda(p: ParamsAgenda): void {
  courant = p;
  router.push("/sante/agenda");
}

export function agendaCourant(): ParamsAgenda | null {
  return courant;
}

const changes = new Set<() => void>();

/** Une entrée a changé sous la page agenda (pesée corrigée depuis sa feuille) : la page ouverte relit ses mois. */
export function agendaChange(): void {
  changes.forEach((f) => f());
}

/** La page agenda écoute les changements ; rend de quoi se désabonner. */
export function surAgendaChange(f: () => void): () => void {
  changes.add(f);
  return () => void changes.delete(f);
}
