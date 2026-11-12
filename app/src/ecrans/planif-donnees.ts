// Planification : de la base aux écrans (bande semaine, page du mois, cartes, bloc « Prochaines séances » de l'accueil).
// Les jours sont lus dans le fuseau choisi (i18n/temps) ; le calcul lui-même est dans planification.ts.
import {
  listerExceptions, lireReglagesPlanif, lireRoutines, listerRoutinesBreves, seancesEntre, type Executeur, type OrigineRoutine,
  type SeanceResume,
} from "../db/api";
import { listerProgrammationsEtReglages, type ReglagesPrevus } from "../db/depots/programmations";
import { deMurale, parties } from "../i18n/temps";
import { MUSCULATION, SQL_SPORT } from "./changer-activite";
import { dureeEstimee } from "./donnees";
import {
  ajouterJ, faite, iso, laPlusProche, marqueDuJour, occurrences, prochaines, type Exception, type Marque, type Occurrence, type Programmation,
  type InfoRoutine, type SeanceJour,
} from "./planification";

/** Jour (AAAA-MM-JJ) d'un instant, dans le fuseau choisi. */
export function jourDe(ms: number): string {
  const p = parties(ms);
  return iso(p.an, p.mois + 1, p.jour);
}

/** Instant du jour `j` à l'heure `heure` (« 18:00 » ; minuit par défaut), dans le fuseau choisi. */
export function instantDe(j: string, heure = "00:00"): number {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  const [h, mn] = heure.split(":").map(Number) as [number, number];
  return deMurale(new Date(a, m - 1, d, h, mn));
}

/**
 * Sport (« cat:padel ») de chaque séance commencée entre `de` et `a`, et de chaque routine, en une lecture : pour une séance, sa
 * marque (activité détectée ou importée), sinon son premier exercice qui porte un sport, sinon la muscu si elle a des
 * exercices (même règle que l'Effort) ; pour une routine, le premier de ses exercices qui porte un sport, sinon la muscu.
 */
async function sportsDuPlanning(db: Executeur, de: number, a: number): Promise<{ routines: Map<string, string>; seances: Map<string, string> }> {
  const l = await db.getAllAsync<{ k: string; id: string; sport: string | null }>(
    `SELECT 's' AS k, s.id, COALESCE(s.activite_id,
       (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id WHERE se.seance_id = s.id AND ${SQL_SPORT} ORDER BY se.position LIMIT 1),
       (SELECT '${MUSCULATION}' FROM seance_exercices se WHERE se.seance_id = s.id LIMIT 1)) AS sport
     FROM seances s WHERE s.debut >= ? AND s.debut < ?
     UNION ALL
     SELECT 'r', r.id, COALESCE(
       (SELECT re.exercice_id FROM routine_exercices re JOIN exercices e ON e.id = re.exercice_id WHERE re.routine_id = r.id AND ${SQL_SPORT} ORDER BY re.position LIMIT 1),
       (SELECT '${MUSCULATION}' FROM routine_exercices re WHERE re.routine_id = r.id LIMIT 1))
     FROM routines r`,
    [de, a],
  );
  const out = { routines: new Map<string, string>(), seances: new Map<string, string>() };
  for (const x of l) if (x.sport) (x.k === "r" ? out.routines : out.seances).set(x.id, x.sport);
  return out;
}

/** Une ligne de la liste d'un jour : séance prévue (à venir ou manquée) ou séance de l'historique. */
export type LigneJour =
  | {
      genre: "prevue";
      occ: Occurrence;
      nom: string;
      /** Durée voulue (réglages) sinon estimée de la routine, en secondes ; 0 : aucune. */
      dureeS: number;
      /** Vrai quand la durée est celle choisie (sans « ≈ »), faux quand elle est estimée. */
      dureeChoisie: boolean;
      /** « Sans heure » (aujourd'hui seulement) : la carte n'écrit pas d'heure. */
      sansHeure: boolean;
      /** Sport choisi sur la feuille (identifiant du catalogue), pour le picto d'une séance d'un sport seul. */
      sport: string | null;
      manquee: boolean;
      /** Qui l'a proposée (migration 62) : « proposée par ton coach » sur la ligne, ou « modifiée par toi » après une retouche. */
      origine: OrigineRoutine;
      modifiePar: OrigineRoutine | null;
      /** Son propre contenu, hors de Mes routines (routine cachée ou d'un programme) : « Ajouter à mes routines ». */
      propre: boolean;
    }
  | { genre: "faite"; seance: SeanceResume };

export interface RoutinePlanning {
  nom: string;
  dureeS: number;
  planId: string | null;
  visible: boolean;
  origine: OrigineRoutine;
  modifiePar: OrigineRoutine | null;
}

export interface Planning {
  aujourdhui: string;
  heureDefaut: string;
  rappelDefautMin: number;
  progs: Programmation[];
  exceptions: Exception[];
  /**
   * Routines : nom, durée estimée (s), plan de la boutique (null : une routine ordinaire), dans Mes routines ou non (le contenu
   * propre d'une séance prévue, migration 62) et origine.
   */
  routines: Map<string, RoutinePlanning>;
  /** Réglages des séances prévues (sport, durée voulue, sans heure), par programmation (migration 90). */
  reglages: Map<string, ReglagesPrevus>;
  /** Fenêtre lue : premier et dernier jour. */
  de: string;
  a: string;
  occ: Occurrence[];
  seances: SeanceResume[];
  jours: SeanceJour[];
  /** Prochaine séance de chaque routine programmée, et la plus proche (étiquette orange). */
  prochaines: Map<string, Occurrence>;
  plusProche: string | null;
}

/**
 * Lit tout ce qu'il faut pour les jours de `de` à `a` (inclus), en lectures groupées et parallèles (une dizaine, quel que soit
 * le nombre de routines). `durees: false` (points du semainier de Nutrition) : sans la durée estimée des routines (0).
 */
export async function lirePlanning(db: Executeur, de: string, a: string, maintenant: number = Date.now(), o: { durees?: boolean } = {}): Promise<Planning> {
  const aujourdhui = jourDe(maintenant);
  const debut = de < aujourdhui ? de : aujourdhui;
  const finLecture = instantDe(ajouterJ(a > aujourdhui ? a : aujourdhui, 1));
  const [{ progs, reglages }, exceptions, reg, liste, details, seances, sports] = await Promise.all([
    listerProgrammationsEtReglages(db),
    listerExceptions(db),
    lireReglagesPlanif(db),
    listerRoutinesBreves(db),
    o.durees === false ? Promise.resolve(null) : lireRoutines(db, undefined, { notes: false }),
    seancesEntre(db, instantDe(debut), finLecture),
    sportsDuPlanning(db, instantDe(debut), finLecture),
  ]);
  const routines = new Map<string, RoutinePlanning>();
  for (const r of liste) {
    const d = details?.get(r.id);
    routines.set(r.id, { nom: r.nom, dureeS: d ? dureeEstimee(d) : 0, planId: r.planId, visible: r.visible, origine: r.origine, modifiePar: r.modifiePar });
  }
  const infos = new Map<string, InfoRoutine>();
  for (const [id, r] of routines) infos.set(id, { sport: sports.routines.get(id) ?? null, dureeMin: Math.round(r.dureeS / 60) });
  const jours = seances.map((s): SeanceJour => {
    const q = parties(s.debut);
    const debutMin = q.h * 60 + q.min;
    return {
      id: s.id, routineId: s.routineId, date: jourDe(s.debut), faite: s.fin != null,
      sport: sports.seances.get(s.id) ?? null, debutMin, finMin: debutMin + (s.fin != null ? Math.round((s.fin - s.debut) / 60_000) : 0),
    };
  });
  // Une routine supprimée ailleurs (synchro) : ses règles ne donnent plus rien. Une routine retirée de Mes routines qui porte
  // des séances prévues n'est que masquée (supprimerRoutine) : elle est encore là, cachée, et ses séances restent.
  const vivantes = progs.filter((p) => routines.has(p.routineId));
  const pr = prochaines(vivantes, exceptions, jours, aujourdhui, reg.heureDefaut, infos);
  return {
    aujourdhui,
    heureDefaut: reg.heureDefaut,
    rappelDefautMin: reg.rappelDefautMin,
    progs: vivantes,
    exceptions,
    routines,
    reglages,
    de,
    a,
    // Une routine sans sport reconnu prend celui choisi sur la feuille de la séance prévue : une séance de ce sport sur le créneau la valide
    occ: occurrences(vivantes, exceptions, de, a, reg.heureDefaut, infos).map((o) => {
      const sport = o.sport == null ? reglages.get(o.programmationId)?.sport : null;
      return sport ? { ...o, sport } : o;
    }),
    seances,
    jours,
    prochaines: pr,
    plusProche: laPlusProche(pr),
  };
}

export const marque = (p: Planning, j: string): Marque => marqueDuJour(j, p.occ, p.jours, p.aujourdhui);

// Lignes et résumés d'un jour : index calculé une fois par planning (jours-planning.ts, sans base, testé seul).
export { lignesDuJour, resumeJour, sansEmoji, type ResumeJour } from "./jours-planning";


/** Les `n` prochaines séances prévues (bloc « Prochaines séances » de l'accueil), aujourd'hui compris. */
export async function prochainesSeances(db: Executeur, n = 4, maintenant: number = Date.now()) {
  const auj = jourDe(maintenant);
  const p = await lirePlanning(db, auj, ajouterJ(auj, 60), maintenant);
  return p.occ
    .filter((o) => !faite(o, p.jours, p.occ))
    .slice(0, n)
    .map((o) => ({ ...o, nom: p.routines.get(o.routineId)?.nom ?? "", dureeS: p.routines.get(o.routineId)?.dureeS ?? 0, aujourdhui: o.date === auj }));
}
export type ProchaineSeance = Awaited<ReturnType<typeof prochainesSeances>>[number];
