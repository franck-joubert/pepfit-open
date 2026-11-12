// Changer d'activité (planche activite-detectee) : associer un sport à une activité détectée, ou changer le sport de
// n'importe quelle séance enregistrée. Le picto, la famille et les calculs suivent le nouveau sport ; une séance de muscu
// garde ses exercices, une séance GPS son tracé, la FC et les kcal mesurées ne bougent pas. Pur : décide quoi écrire et
// quoi recalculer, sans base (tests/changer-activite.test.ts).
import { familleExercices, type Famille } from "../whoop/sports";
import { baremeSport } from "./effort-pepfit";

/** Un sport du lanceur (db/depots/lanceur.ts) : une activité du catalogue qui porte un sport Whoop, ou Musculation. */
export const SQL_SPORT = "(e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation')";
export const COURSE = "cat:course";
export const MUSCULATION = "cat:musculation";
/** Sports où la distance se lit en vitesse (km/h) plutôt qu'en allure (min/km). */
const EN_VITESSE = new Set(["cat:bicycling", "cat:vtt", "cat:roller", "cat:ski-de-fond"]);

export interface Activite {
  id: string;
  slug: string | null;
  nom: string;
  categorie: string | null;
}

export interface SeanceAChanger {
  /** Activité qui donne aujourd'hui son sport à la séance (l'exercice d'activité, ou la marque d'une séance d'exercices). */
  activite: Activite | null;
  /** Exercices de la séance (hors activité) et leurs séries faites. */
  exercices: readonly { id: string; slug: string | null; categorie: string | null; perso: number; series: number }[];
  titre: string | null;
  /** Tracé GPS (suivi pepfit). */
  trace: boolean;
  distanceM: number;
  /** FC enregistrée (suivi, ceinture, Whoop rattachée). */
  fc: boolean;
  /** Une VMA a été estimée d'après cette course (vma : mesure gardée en base). */
  vmaEstimee: boolean;
}

export type Ecriture =
  /** Séance d'une seule activité (lanceur, Whoop, suivi GPS) : l'activité est remplacée, ses séries (durée, distance) restent. */
  | { genre: "remplacer"; de: string; vers: string }
  /** Séance sans exercice (activité détectée, Whoop non nommée) : l'activité est posée avec une série de la durée. */
  | { genre: "poser"; activite: string }
  /** Séance d'exercices (muscu, circuit) : les exercices restent, la séance porte le sport (null : son sport redevient
   *  celui de ses exercices). */
  | { genre: "marquer"; activite: string | null };

export interface Changement {
  ecriture: Ecriture;
  /** Nouveau titre ; null : on garde celui de l'utilisateur. */
  titre: string | null;
  famille: Famille;
  garde: { exercices: number; series: number; trace: boolean; fc: boolean };
  /** Ce qui bouge dans les calculs, pour le dire avant de valider. */
  effort: { genre: "fc" } | { genre: "estime"; de: number; vers: number };
  /** Les kcal se calculent chez nous (kcal-seance.ts) : à la FC, qui ne dépend pas du sport, sinon aux MET du sport. */
  depense: "fc" | "estimee";
  vma: "calculer" | "retirer" | null;
  /** Lecture de la distance : allure (min/km) ou vitesse (km/h) ; null sans distance ou si rien ne change. */
  lecture: "allure" | "vitesse" | null;
  /** Rien à faire : c'est déjà ce sport. */
  inchange: boolean;
}

const intensite = (id: string | null) => baremeSport(id);
const familleDe = (a: Activite): Famille => familleExercices([{ slug: a.slug, categorie: a.categorie, perso: 0 }]);
const lectureDe = (id: string | null) => (id && EN_VITESSE.has(id) ? "vitesse" : "allure");

/** Sport d'une séance d'exercices sans marque : celui de ses exercices (muscu, ou autre). */
export function familleSeance(s: Pick<SeanceAChanger, "activite" | "exercices">): Famille {
  return s.activite ? familleDe(s.activite) : familleExercices(s.exercices.map((e) => ({ slug: e.slug, categorie: e.categorie, perso: e.perso })));
}

/**
 * Ce que fait « Changer d'activité » vers `vers`. Le titre suit le sport s'il en était le nom (ou s'il n'y en avait pas) ; un
 * titre choisi (« Push A ») reste. Effort : la FC et Whoop ne dépendent pas du sport ; sans eux, l'intensité estimée du
 * sport change. Dépense : mesurée ou d'après la FC, elle ne bouge pas ; estimée, elle suit le sport. VMA : une course GPS en
 * donne une ; une course qui n'en est plus une la retire.
 */
export function planChangement(s: SeanceAChanger, vers: Activite): Changement {
  const de = s.activite?.id ?? null;
  const series = s.exercices.reduce((a, e) => a + e.series, 0);
  const avecExercices = s.exercices.length > 0;
  const ecriture: Ecriture = avecExercices
    ? { genre: "marquer", activite: vers.id === MUSCULATION && familleExercices(s.exercices) === "muscu" ? null : vers.id }
    : de
      ? { genre: "remplacer", de, vers: vers.id }
      : { genre: "poser", activite: vers.id };
  const titreAuto = s.titre == null || s.titre.trim() === "" || (s.activite != null && s.titre === s.activite.nom);
  const distance = s.distanceM > 0;
  return {
    ecriture,
    titre: titreAuto ? vers.nom : null,
    famille: familleDe(vers),
    garde: { exercices: s.exercices.length, series, trace: s.trace, fc: s.fc },
    // L'Effort pepfit : par la FC (capteur, ceinture, Whoop), il ne dépend pas du sport ; sans FC, le barème du sport (une
    // séance d'exercices sans marque a celui de son sport, la muscu). Le score de Whoop n'y entre plus (31/10, D3).
    effort: s.fc ? { genre: "fc" } : { genre: "estime", de: intensite(de ?? (familleSeance(s) === "muscu" ? MUSCULATION : null)), vers: intensite(vers.id) },
    depense: s.fc ? "fc" : "estimee",
    vma: vers.id === COURSE && s.trace && distance ? (s.vmaEstimee ? null : "calculer") : de === COURSE && s.vmaEstimee ? "retirer" : null,
    lecture: distance && lectureDe(de) !== lectureDe(vers.id) ? lectureDe(vers.id) : null,
    inchange: de === vers.id,
  };
}
