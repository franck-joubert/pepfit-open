// Règles pures du parcours de séance unifié (planche ajout-seance-v2, D1 à D15) : sports de la feuille, durée jusqu'à 48 h,
// « Aujourd'hui » seul sans heure, lieu « Non défini », étiquette « Programme ». Pur : testé par
// tests/parcours-seance.test.ts.
import { t, tp } from "../i18n/index";
import { DEFAUT } from "./lanceur-sports";

// ----- Feuille du sport (D13) -----

/** Les trois sports proposés d'office, toujours les mêmes : musculation, course, vélo. */
export const SPORTS_DEFAUT: readonly string[] = DEFAUT;

/** Sports de la feuille : ceux de la personne, sinon les trois par défaut (jamais une feuille vide). */
export const sportsAffiches = (choisis: readonly string[]): string[] => (choisis.length ? [...choisis] : [...SPORTS_DEFAUT]);

/** Au moins une tuile reste : le dernier sport ne se retire pas (aucun message, le geste est simplement absent). */
export const peutRetirerSport = (affiches: readonly string[]): boolean => affiches.length > 1;

// ----- Durée (D4) -----

/** 48 h, côté appli comme côté serveur. */
export const DUREE_MAX_MIN = 2880;
export const DUREE_PAS_MIN = 1;

/** Durée tenue dans les bornes (0 à 48 h), entière ; null reste null (durée non définie). */
export function dureeBornee(min: number | null): number | null {
  if (min == null || !Number.isFinite(min)) return null;
  return Math.min(DUREE_MAX_MIN, Math.max(0, Math.round(min)));
}

/** « 2 h », « 1 h 30 », « 45 min » ; null ou 0 : « Définir durée » (aucun texte « non définie »). */
export function dureeLibelle(min: number | null): string {
  const m = dureeBornee(min);
  if (m == null || m === 0) return t("ps.dureeDefinir");
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return t("communs.min", { n: r });
  return r === 0 ? t("communs.h", { n: h }) : `${t("communs.h", { n: h })} ${String(r).padStart(2, "0")}`;
}

/** Valeurs des deux colonnes du sélecteur : heures 0 à 48, minutes 0 à 59 (48 h 00 au plus). */
export const heuresDuree = (): number[] => Array.from({ length: DUREE_MAX_MIN / 60 + 1 }, (_, i) => i);
export const minutesDuree = (heures: number): number[] => Array.from({ length: heures >= DUREE_MAX_MIN / 60 ? 1 : 60 }, (_, i) => i);
/** Durée depuis les deux colonnes, bornée. */
export const dureeDepuisColonnes = (heures: number, minutes: number): number => dureeBornee(heures * 60 + minutes) ?? 0;

// ----- Quand (D11) -----

export interface Quand {
  /** Jour visé (AAAA-MM-JJ). */
  jour: string;
  /** « HH:MM », ou null : sans heure. */
  heure: string | null;
}

/** « Sans heure » n'existe qu'aujourd'hui : l'heure de démarrage fixe alors le début. */
export const sansHeurePermis = (jour: string, aujourdhui: string): boolean => jour === aujourdhui;

/** Un autre jour que celui d'aujourd'hui ne peut pas rester sans heure : l'heure par défaut revient. */
export function quandAuJour(q: Quand, jour: string, aujourdhui: string, heureDefaut: string): Quand {
  return { jour, heure: q.heure == null && !sansHeurePermis(jour, aujourdhui) ? heureDefaut : q.heure };
}

/** Texte de la ligne « Quand » : « Aujourd'hui » seul sans heure ; sinon le jour et l'heure, séparés par une virgule. */
export function quandLibelle(q: Quand, aujourdhui: string, jourTexte: (jour: string) => string, heureTexte: (heure: string) => string): string {
  const jour = q.jour === aujourdhui ? t("planif.aujourdhui") : jourTexte(q.jour);
  return q.heure == null ? jour : `${jour}, ${heureTexte(q.heure)}`;
}

// ----- Lieu (D14) -----

export interface LieuChoisi {
  id: string | null;
  nom: string;
}

/**
 * Lieu proposé : le dernier lieu utilisé pour ce sport s'il existe encore, sinon « Non défini » (aucun lieu, ou lieu
 * disparu), sans message.
 */
export function lieuParDefaut(dernier: { id: string; nom: string } | null | undefined): LieuChoisi {
  return dernier ? { id: dernier.id, nom: dernier.nom } : { id: null, nom: t("ps.lieuNonDefini") };
}

// ----- Étiquette « Programme » -----

/** Une séance qui vient d'un programme porte l'étiquette « Programme » (même gabarit que les autres). */
export const etiquetteProgramme = (programmeId: string | null | undefined): string | null => (programmeId ? t("ps.programme") : null);

// ----- Résumé d'une routine -----

/** « 6 exercices, 18 séries » (sans point médian) : la ligne sous le nom d'une routine du drawer et du récap. */
export const resumeExercices = (exercices: number, series: number): string => `${tp("tiroirs.exercices", exercices)}, ${tp("tiroirs.series", series)}`;
