// Règles pures du récap commun « avant séance » : ligne du quand, provenance, actions du ⋯ (planche ajout-seance-v2, D2, D5, D15).
// Testé par tests/recap-calc.test.ts.
import { t } from "../../i18n/index";
import type { DonneesRecap } from "./donnees-recap";
import type { OrigineRoutine } from "../../db/depots/routines";
import { COURSE, genreSport } from "../lanceur-sports";
import { dureeLibelle, quandLibelle } from "../parcours-seance";

/** Ligne sous le titre : « Jeu. 5 nov., 18:00, 1 h 30 » ; « Aujourd'hui » seul sans heure ; la durée seulement si elle est connue. */
export function sousRecap(
  o: { jour: string | null; heure: string | null; dureeMin: number | null },
  aujourdhui: string,
  jourTexte: (jour: string) => string,
  heureTexte: (heure: string) => string,
): string {
  const morceaux: string[] = [];
  if (o.jour) morceaux.push(quandLibelle({ jour: o.jour, heure: o.heure }, aujourdhui, jourTexte, heureTexte));
  if (o.dureeMin != null && o.dureeMin > 0) morceaux.push(dureeLibelle(o.dureeMin));
  return morceaux.join(", ");
}

/** Provenance d'une séance reçue : « proposée par ton coach », « modifiée par toi » après une retouche ; rien pour une séance à soi. */
export function origineRecap(origine: OrigineRoutine, modifiePar: OrigineRoutine | null): string | null {
  if (origine === "moi") return null;
  if (modifiePar === "moi") return t("planif.modifieeParToi");
  return t(origine === "coach" ? "planif.parCoach" : "planif.parIa");
}

export type ActionMenu = "modifier" | "annuler" | "ajouterRoutines";

/**
 * Actions du ⋯ : Modifier et Annuler pour une séance prévue (un seul verbe, « Annuler », D15) ; « Ajouter à mes routines » pour
 * une séance prévue qui a son propre contenu (D5). Une routine ou un sport du moment n'ont pas de ⋯.
 */
export function actionsMenu(o: { prevue: boolean; contenuPropre: boolean }): ActionMenu[] {
  if (!o.prevue) return [];
  return o.contenuPropre ? ["modifier", "ajouterRoutines", "annuler"] : ["modifier", "annuler"];
}

/** La séance d'une règle qui se répète demande « Cette séance » ou « Toute la série » avant d'être annulée (D15). */
export const annulerDemandeSerie = (o: { repetee: boolean }): boolean => o.repetee;

/**
 * Quelle manière de lancer la séance, sur l'écran de lancement noir (SuiviDepart, retour du 06 et du 07/11 : un seul écran
 * avant une séance, jamais le récap à halo) : « suivi » pour une routine de course (course guidée par ses étapes) ou un sport au
 * suivi GPS, quand le module de suivi est là : l'écran lance le suivi natif (GPS, Dehors / Tapis) ; « seance » pour le reste
 * (musculation, routine d'exercices, séance sans module de suivi) : le même écran, sans GPS ni Dehors / Tapis, et Démarrer lance la
 * séance au chrono (gestes-recap.ts, demarrerDepuisRecap). Mêmes règles que ce geste.
 */
export type DepartRecap = { mode: "suivi"; sport: string; routineId: string | null } | { mode: "seance" };

export function departDuRecap(o: {
  suiviDisponible: boolean;
  routineId: string | null;
  /** Nombre de lignes d'exercices de la routine. */
  lignes: number;
  /** Type de la routine (« course », « muscu »…), null sans routine. */
  typeRoutine: string | null;
  /** Sport de la séance (identifiant du catalogue), s'il est connu du catalogue. */
  sport: string | null;
}): DepartRecap {
  if (!o.suiviDisponible) return { mode: "seance" };
  if (o.routineId && o.lignes > 0) return o.typeRoutine === "course" ? { mode: "suivi", sport: COURSE, routineId: o.routineId } : { mode: "seance" };
  if (!o.sport || genreSport(o.sport) === "muscu") return { mode: "seance" };
  return { mode: "suivi", sport: o.sport, routineId: null };
}

/**
 * Ligne sous le titre de l'écran de lancement : le jour et l'heure d'une séance prévue (« Jeu. 5 nov., 18:00 ») ; un lancement
 * maintenant ne dit pas « Aujourd'hui » : rien (null).
 */
export function quandDepart(
  o: { prevue: boolean; jour: string | null; heure: string | null },
  aujourdhui: string,
  jourTexte: (jour: string) => string,
  heureTexte: (heure: string) => string,
): string | null {
  return o.prevue ? sousRecap({ jour: o.jour, heure: o.heure, dureeMin: null }, aujourdhui, jourTexte, heureTexte) || null : null;
}

/** Les exercices de la routine de la séance (vide pour un sport seul ou une séance sans exercices). */
export const exercicesDe = (r: Pick<DonneesRecap, "routineId" | "tiroir">) => (r.routineId ? (r.tiroir?.routine.blocs.flatMap((b) => b.lignes) ?? []) : []);

/** La séance appartient à un programme en cours (ou en est une séance prévue que celle-ci ne fait pas avancer) : sa ligne « Programme ». */
export const aUnProgramme = (r: Pick<DonneesRecap, "tiroir">): boolean => {
  const x = r.tiroir;
  return !!x?.lien?.avancement && (x.genre === "programme" || x.genre === "horsProgramme");
};
