// Fin d'un suivi (SuiviFin) et sa séance passée (history/[id]) : ce qu'elles se partagent (revue finale du 30/10, lot L1).
import type { EffortSeance } from "./effort-donnees";
import type { VueEffort } from "./effort-vue";
import { nombre } from "./format";
import { chronoTexte, distanceTexte } from "./suivi-direct-vue";
import { libelleDistance } from "./unites";

/**
 * Durée et distance d'un suivi au format de la fin (« 0:46 », « 0,16 km ») : la séance passée dit la même chose, plus
 * « 1 min » ni « 167 m » (n° 25). Distance nulle (sports et cours, récupération, tapis sans saisie) : rien.
 */
export function chiffresSuivi(vue: Pick<VueEffort, "dureeS" | "distanceM">): { duree: string; distance: string | null } {
  return {
    duree: chronoTexte(vue.dureeS * 1000),
    distance: vue.distanceM > 0 ? `${distanceTexte(vue.distanceM)} ${libelleDistance()}` : null,
  };
}

/** Effort d'un suivi de pepfit (tracé GPS, ou suivi sans GPS avec sa série) : pas une séance vue seulement par Whoop. */
export function estSuiviPepfit(e: Pick<EffortSeance, "vue" | "saisie">): boolean {
  return e.vue.trace.length >= 2 || e.saisie != null;
}

/**
 * Distance de la machine (fin intérieur, n° 17) au clavier de séance : la molette passe de dixième en dixième de km (ou de
 * mile), de 0 à 60 ; le pavé tape les centièmes (« 8,42 »).
 */
export const PALIERS_DISTANCE: readonly number[] = Array.from({ length: 601 }, (_, i) => i / 10);

/** Texte de la case : « 8,42 », séparateur de la langue (relu par metresSaisis) ; vide sans distance. */
export function texteDistance(enUnite: number | null): string {
  return enUnite == null || enUnite <= 0 ? "" : nombre(enUnite, 2);
}

/** Course guidée : partie d'une routine (SuiviDepart avec une routine) ; ses tours sont ses étapes (n° 22). */
export function estCourseGuidee(seance: { routine_id?: string | null }): boolean {
  return seance.routine_id != null;
}

/**
 * Une seule courbe de FC par séance de muscu : quand la séance a sa FC découpée par exercice (fcMuscu), le bloc Cardio d'une
 * séance Whoop (même séance, autre fenêtre : celle de l'activité détectée) ne se montre pas, sa courbe, ses zones et sa FC
 * seraient une seconde version. Un suivi de pepfit (tracé, tapis) garde son bloc.
 */
export function cardioDansFcMuscu(fcMuscu: unknown, effort: Pick<EffortSeance, "vue" | "saisie"> | null): boolean {
  return !!fcMuscu && !!effort && !estSuiviPepfit(effort);
}
