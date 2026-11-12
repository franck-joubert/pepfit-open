// Tempo d'une répétition (descente-pause bas-montée-pause haut, en secondes) et durée d'une répétition par défaut.

import { t } from "../i18n/index";
import type { Nature } from "../db/natures";

export const TEMPO_MAX_S = 10;

/** Les 4 phases : descente, pause en bas, montée, pause en haut. */
export type Tempo = [number, number, number, number];

export const phasesTempo = (): string[] => [t("seance.tempo.descente"), t("seance.tempo.pauseBas"), t("seance.tempo.montee"), t("seance.tempo.pauseHaut")];

/** Notation des coachs : « 3-1-1-0 ». */
export function tempoTexte(phases: Tempo): string {
  return phases.join("-");
}

/** Lit « 3-1-1-0 » ; null si le texte n'est pas 4 entiers de 0 à 10 ou si le tempo est vide (0-0-0-0). */
export function lireTempo(texte: string | null | undefined): Tempo | null {
  if (!texte) return null;
  const p = texte.split("-");
  if (p.length !== 4 || !p.every((x) => /^\d{1,2}$/.test(x))) return null;
  const phases = p.map(Number) as Tempo;
  if (phases.some((x) => x > TEMPO_MAX_S) || phases.every((x) => x === 0)) return null;
  return phases;
}

export const dureeTempo = (phases: Tempo): number => phases[0] + phases[1] + phases[2] + phases[3];

/** Natures à répétitions : seules elles ont un tempo (29/10). Durée, distance : ni option, ni ruban, ni défaut. */
const NATURES_TEMPO: ReadonlySet<Nature> = new Set<Nature>(["poids_reps", "reps", "leste", "assiste"]);

/** Vrai si un tempo a un sens pour cette nature d'exercice (répétitions comptées). */
export const tempoApplicable = (nature: Nature): boolean => NATURES_TEMPO.has(nature);

/** Tempo d'un exercice coupé (colonne exercices.tempo, migration 36) : ni option, ni ruban, ni défaut. */
export const TEMPO_OFF = "off";

/** L'exercice tel que le tempo le lit : sa nature et son tempo propre (null : défaut de la famille ; « off » : aucun). */
type ExerciceAvecTempo = { nature: Nature; tempo?: string | null };

/** Vrai si l'exercice a un tempo : nature à répétitions et tempo pas coupé (« off »). Montre ou masque l'option des menus. */
export const tempoActif = (e: ExerciceAvecTempo): boolean => tempoApplicable(e.nature) && e.tempo !== TEMPO_OFF;

/** Tempo d'une ligne (routine ou séance), lu seulement si l'exercice en a un : sinon ignoré (il reste en base, intact). */
export const tempoDe = (texte: string | null | undefined, e: ExerciceAvecTempo): Tempo | null => (tempoActif(e) ? lireTempo(texte) : null);

interface ExerciceTempo {
  nom: string;
  slug: string | null;
  muscle: string | null;
}

const REP_LOURDE_S = 4;
const REP_ISOLATION_S = 3;

// Mots (slug anglais ou nom français, sans accent) d'un mouvement d'isolation, et de petits muscles qui le sont presque toujours.
const MOTS_ISOLATION = /curl|extension|elevation|raise|fly|flye|ecarte|kickback|pullover|pull-over|shrug|haussement|oiseau|face-pull|crunch|releve|rotation|abduction|adduction|pec-deck|pushdown|skull/;
const MOTS_LOURDS = /press|developpe|squat|souleve|deadlift|pull-up|chin-up|traction|row|rowing|tirage|dip|pompe|push-up|fente|lunge|thrust|clean|snatch/;
const PETITS_MUSCLES = new Set(["biceps", "triceps", "avant-bras", "mollets", "abducteurs", "adducteurs", "cou", "abdominaux"]);

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Famille = "poly" | "isolation";

/** Famille d'un exercice : isolation (mots du nom ou du slug, sinon petit muscle) ou polyarticulaire. */
export function familleExercice(e: ExerciceTempo): Famille {
  const mots = `${sansAccent(e.slug ?? "")} ${sansAccent(e.nom)}`;
  if (MOTS_ISOLATION.test(mots)) return "isolation";
  if (MOTS_LOURDS.test(mots)) return "poly";
  return PETITS_MUSCLES.has(sansAccent(e.muscle ?? "")) ? "isolation" : "poly";
}

/** Durée d'une répétition par défaut : 4 s pour un polyarticulaire lourd, 3 s pour de l'isolation (mots du nom ou du slug, sinon muscle). */
export function dureeRepDefaut(e: ExerciceTempo): number {
  return familleExercice(e) === "isolation" ? REP_ISOLATION_S : REP_LOURDE_S;
}

/** D5 : tempos par défaut d'usine, mêmes durées que l'estimation (4 s et 3 s) ; modifiables dans « Guidage ». */
export const TEMPOS_USINE: Record<Famille, string> = { poly: "3-0-1-0", isolation: "2-0-1-0" };

/** Tempo par défaut d'un exercice : celui de sa famille dans les réglages, sinon celui d'usine. */
export function tempoDefaut(e: ExerciceTempo, reglages: Partial<Record<Famille, string>> = {}): string {
  const f = familleExercice(e);
  return lireTempo(reglages[f]) ? reglages[f]! : TEMPOS_USINE[f];
}

/** Tempo de référence d'un exercice, hors ligne : le sien s'il en a un, sinon celui de sa famille (Guidage). */
export function tempoDefautExercice(e: ExerciceTempo & ExerciceAvecTempo, reglages: Partial<Record<Famille, string>> = {}): string {
  return lireTempo(e.tempo) ? e.tempo! : tempoDefaut(e, reglages);
}

/**
 * Tempo joué (plein écran) : celui de la ligne de routine ou de séance > celui de l'exercice > le défaut de sa famille.
 * Rien pour un exercice sans répétitions (gainage, course…) ni pour un exercice coupé (« off »), même avec un tempo en base.
 */
export function tempoJoue(e: { tempo: string | null; exercice: ExerciceTempo & ExerciceAvecTempo }, reglages: Partial<Record<Famille, string>> = {}): Tempo | null {
  if (!tempoActif(e.exercice)) return null;
  return lireTempo(e.tempo) ?? lireTempo(tempoDefautExercice(e.exercice, reglages));
}

/** Valeurs des roues du tempo : 0 à 10 s. */
export const valeursTempo = (): number[] => Array.from({ length: TEMPO_MAX_S + 1 }, (_, i) => i);
