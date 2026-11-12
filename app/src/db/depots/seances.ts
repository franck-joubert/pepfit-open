import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nomSql } from "../noms";
import { nouvelId } from "../id";
import type { Exercice, RecordExercice, Seance, Serie, TypeRecord, TypeSerie } from "../types";
import { materielDe, premierEssai } from "../../boutique/poids";
import { effortsDeSeance, rirPourSeance, rirVise, type EffortExercice } from "./effort";
import type { Note } from "./notes";
import { paliersPour, salleParDefaut } from "./salles";
import { recalculerApresModification, recalculerExercice, recalculerSeance } from "./recalcul";

export interface PatchSerie {
  kg?: number | null;
  reps?: number | null;
  type?: TypeSerie;
  faite?: boolean;
  rpe?: number | null;
  dureeS?: number | null;
  /** Cible du compte à rebours quand dureeS est le temps réel (migration 38). */
  dureeCibleS?: number | null;
  distanceM?: number | null;
}

export interface SerieDetail extends Serie {
  /** Records battus par cette série (vide le plus souvent). */
  records: TypeRecord[];
}

export interface ExerciceDeSeance {
  exercice: Pick<Exercice, "id" | "nom" | "muscle" | "equipement" | "picto" | "slug" | "nature" | "allure" | "poids_corps" | "tempo" | "perso" | "photo_vignette" | "coach">;
  position: number;
  groupeSuperset: number | null;
  reposS: number;
  /** Superset : temps entre deux exercices d'un tour (« Machine suivante »), 0 = on enchaîne. */
  reposTransitionS: number;
  /** Notes de séance : cette séance seulement. */
  notes: Note[];
  /** Notes de séance de l'exercice à sa séance précédente, bout à bout (placeholder du champ de séance), ou null. */
  notePrecedente: string | null;
  /** Notes d'exercice : à chaque fois qu'on fait l'exercice. */
  notesExercice: Note[];
  /** Notes de routine, lues sur la ligne de la routine d'origine. */
  notesRoutine: Note[];
  /** Ligne de la routine d'origine (lieu de la note de routine) ; null : séance libre ou exercice hors routine. */
  ligneRoutineId: string | null;
  /** Tempo de la ligne de la routine d'origine (lecture seule en séance), ou null. */
  tempo: string | null;
  /** Exercice que celui-ci remplace dans la séance, avec le motif (Alternative), ou null. */
  remplace: { id: string; nom: string; raison: "occupe" | "manquant" | null } | null;
  /** Exercice qui a pris la place de celui-ci (l'ancien garde ses séries validées), ou null. */
  remplacePar: { id: string; nom: string } | null;
  series: SerieDetail[];
  /** Séance d'un programme : cible d'effort de la ligne, exercice à découvrir, poids proposé (planche programmes-charges). */
  effort?: EffortExercice | null;
  /** Ressenti visé de la ligne de routine (D6), ou null. */
  rirRoutine: number | null;
  /** Ressenti visé pour cette séance : celui de la séance s'il a été changé, sinon celui de la routine ; null = aucun. */
  rirVise: number | null;
}

/** Superset d'une séance : à enchaîner sans repos, un seul repos à la fin de chaque tour. */
export interface BlocSeance {
  groupeSuperset: number | null;
  exercices: ExerciceDeSeance[];
  reposS: number;
  /** Superset : temps entre deux exercices d'un tour (porté par chaque membre, lu sur le premier). */
  reposTransitionS: number;
}

export interface SeanceDetail {
  seance: Seance;
  routineNom: string | null;
  /** Note de la routine d'origine (consigne d'effort d'un programme…), affichée en haut de la séance ; null sans routine. */
  routineNote: string | null;
  /** Salle de la séance (D17), ou null. */
  /** Lieu de la séance (table salle) et son type (db/lieux.ts). */
  salle: { id: string; nom: string; type: string } | null;
  exercices: ExerciceDeSeance[];
  blocs: BlocSeance[];
}

/** Démarre une séance vide (ou liée à une routine, sans séries) et renvoie son id. */
/**
 * Titre par défaut d'une séance libre : rien en base, l'écran met le sien dans la langue du moment. Avant le 29/10, il était
 * écrit en base dans la langue de la création : ces titres-là se lisent comme absents (audit du 28/10, n° 36).
 */
const TITRES_LIBRES = new Set(["Séance libre", "Open workout"]);
export const titreSeance = (titre: string | null): string | null => (titre != null && TITRES_LIBRES.has(titre) ? null : titre);

export async function demarrerSeance(db: Executeur, routineId: string | null, titre?: string): Promise<string> {
  const id = nouvelId();
  const t = Date.now();
  await db.runAsync("INSERT INTO seances (id, routine_id, titre, debut, salle_id, maj_le) VALUES (?,?,?,?,?,?)", [id, routineId, titre ?? null, t, await salleParDefaut(db), t]);
  return id;
}

/**
 * Démarre une séance depuis une routine : exercices, séries vides (supersets entrelacés tour par tour) et,
 * avec `prefill`, kg/reps repris du « précédent ». Renvoie l'id.
 */
export async function demarrerSeanceDepuisRoutine(db: Executeur, routineId: string, prefill = true): Promise<string> {
  const r = await db.getFirstAsync<{ nom: string }>("SELECT nom FROM routines WHERE id = ?", [routineId]);
  if (!r) throw new Error("Routine inconnue");
  const lignes = await db.getAllAsync<{ id: string; exercice_id: string; position: number; groupe_superset: number | null; nb_series: number; repos_s: number; repos_transition_s: number; plage_reps: number; zone: number | null }>(
    "SELECT id, exercice_id, position, groupe_superset, nb_series, repos_s, repos_transition_s, plage_reps, zone FROM routine_exercices WHERE routine_id = ? ORDER BY position",
    [routineId],
  );
  // Étapes (D3, option b) : la zone de chaque ligne (colonne, sinon « Z4 » de sa note de programme), et la récup de chaque
  // ligne quand l'exercice revient sur plusieurs lignes (course d'un programme : échauffement, fractionné, retour au calme).
  const notesLignes = await db.getAllAsync<{ ligne_id: string; texte: string }>(
    "SELECT ligne_id, texte FROM notes WHERE type = 'routine' AND ligne_id IN (SELECT id FROM routine_exercices WHERE routine_id = ?)",
    [routineId],
  ).catch(() => [] as { ligne_id: string; texte: string }[]);
  const zoneDe = (l: { id: string; zone: number | null }) => l.zone ?? Number(/\bZ([1-5])\b/.exec(notesLignes.find((n) => n.ligne_id === l.id)?.texte ?? "")?.[1] ?? 0) ?? null;
  const parExercice = new Map<string, number>();
  for (const l of lignes) parExercice.set(l.exercice_id, (parExercice.get(l.exercice_id) ?? 0) + 1);
  const etape = (l: (typeof lignes)[number]) => ({ ligneId: l.id, zone: zoneDe(l) || null, reposS: (parExercice.get(l.exercice_id) ?? 0) > 1 ? l.repos_s : null });
  // Cibles de la routine (migration 3) : elles priment sur le précédent, champ par champ.
  const cibles = await db.getAllAsync<{ ligne_id: string; rang: number; kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; type: TypeSerie; reps_max: number | null }>(
    "SELECT rs.* FROM routine_series rs JOIN routine_exercices re ON re.id = rs.ligne_id WHERE re.routine_id = ?",
    [routineId],
  );
  const cible = (ligneId: string, rang: number) => cibles.find((c) => c.ligne_id === ligneId && c.rang === rang);
  const plage = new Map(lignes.map((l) => [l.id, l.plage_reps === 1]));
  const id = nouvelId();
  const t = Date.now();
  const salleId = await salleParDefaut(db);
  await transaction(db, async (db) => {
    await db.runAsync("INSERT INTO seances (id, routine_id, titre, debut, salle_id, maj_le) VALUES (?,?,?,?,?,?)", [id, routineId, r.nom, t, salleId, t]);
    // La note de routine n'est pas recopiée : la séance la lit sur la routine (lireSeance).
    for (const l of lignes) {
      await db.runAsync(
        "INSERT OR IGNORE INTO seance_exercices (seance_id, exercice_id, position, groupe_superset, repos_s, repos_transition_s) VALUES (?,?,?,?,?,?)",
        [id, l.exercice_id, l.position, l.groupe_superset, l.repos_s, l.groupe_superset === null ? 0 : l.repos_transition_s],
      );
    }
    let pos = 0;
    const faits = new Set<number>();
    for (const l of lignes) {
      if (l.groupe_superset === null) {
        for (let i = 0; i < l.nb_series; i++) {
          const c = cible(l.id, i);
          await insererSerie(db, id, l.exercice_id, pos++, null, c?.type ?? "normale", c, plage.get(l.id), undefined, etape(l));
        }
      } else if (!faits.has(l.groupe_superset)) {
        faits.add(l.groupe_superset);
        const g = lignes.filter((x) => x.groupe_superset === l.groupe_superset);
        const tours = Math.max(...g.map((x) => x.nb_series));
        for (let tour = 0; tour < tours; tour++) {
          for (const x of g) {
            if (tour >= x.nb_series) continue;
            const c = cible(x.id, tour);
            await insererSerie(db, id, x.exercice_id, pos++, x.groupe_superset, c?.type ?? "normale", c, plage.get(x.id), undefined, { ...etape(x), reposS: null });
          }
        }
      }
    }
    for (const ex of new Set(lignes.map((l) => l.exercice_id))) {
      await recalculerExercice(db, ex);
      if (prefill) {
        await db.runAsync(
          `UPDATE series SET kg = COALESCE(kg, precedent_kg), reps = COALESCE(reps, precedent_reps),
             duree_s = COALESCE(duree_s, precedent_duree_s), distance_m = COALESCE(distance_m, precedent_distance_m)
           WHERE seance_id = ? AND exercice_id = ? AND faite = 0`,
          [id, ex],
        );
      }
    }
    // Séance d'un programme (planche programmes-charges) : le poids proposé d'après la dernière fois, sauf là où la routine
    // fixe le poids (5×5) ; un exercice jamais fait part de la barre à vide (sa première séance cherche le poids).
    if (prefill) {
      const exos = await db.getAllAsync<Pick<Exercice, "id" | "equipement" | "nature">>(
        "SELECT id, equipement, nature FROM exercices WHERE id IN (SELECT exercice_id FROM routine_exercices WHERE routine_id = ?)",
        [routineId],
      );
      const efforts = await effortsDeSeance(db, routineId, t, exos, (ex) => paliersPour(db, ex, salleId));
      for (const [ex, ef] of efforts) {
        if (lignes.some((l) => l.exercice_id === ex && cibles.some((c) => c.ligne_id === l.id && c.kg != null))) continue;
        if (ef.proposition) {
          await db.runAsync("UPDATE series SET kg = ? WHERE seance_id = ? AND exercice_id = ? AND faite = 0 AND type = 'normale'", [ef.proposition.kg, id, ex]);
        } else if (ef.decouverte) {
          const depart = premierEssai(materielDe(exos.find((x) => x.id === ex)?.equipement));
          if (depart != null) {
            await db.runAsync(
              "UPDATE series SET kg = ? WHERE id = (SELECT id FROM series WHERE seance_id = ? AND exercice_id = ? AND faite = 0 AND type = 'normale' ORDER BY position LIMIT 1)",
              [depart, id, ex],
            );
          }
        }
      }
    }
  });
  return id;
}

async function insererSerie(
  db: Executeur,
  seanceId: string,
  exerciceId: string,
  position: number,
  groupe: number | null,
  type: TypeSerie,
  cible: { kg?: number | null; reps?: number | null; reps_max?: number | null; duree_s?: number | null; distance_m?: number | null } | null | undefined,
  enPlage = false,
  idImpose?: string,
  etape?: { ligneId: string; zone: number | null; reposS: number | null },
): Promise<string> {
  const id = idImpose ?? nouvelId();
  // En mode plage, min et max ne sont qu'une indication : `reps` reste vide (repris du précédent s'il existe).
  await db.runAsync(
    "INSERT INTO series (id, seance_id, exercice_id, position, groupe_superset, type, kg, reps, duree_s, distance_m, plage_min, plage_max, ligne_id, zone, repos_s) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      id, seanceId, exerciceId, position, groupe, type, cible?.kg ?? null, enPlage ? null : (cible?.reps ?? null), cible?.duree_s ?? null, cible?.distance_m ?? null,
      enPlage ? (cible?.reps ?? null) : null, enPlage ? (cible?.reps_max ?? null) : null, etape?.ligneId ?? null, etape?.zone ?? null, etape?.reposS ?? null,
    ],
  );
  return id;
}

async function assurerExerciceDeSeance(db: Executeur, seanceId: string, exerciceId: string, groupe: number | null): Promise<void> {
  const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM seance_exercices WHERE seance_id = ?", [seanceId]);
  await db.runAsync(
    "INSERT OR IGNORE INTO seance_exercices (seance_id, exercice_id, position, groupe_superset) VALUES (?,?,?,?)",
    [seanceId, exerciceId, (m?.m ?? -1) + 1, groupe],
  );
}

/** Ajoute une série (vide ou préremplie) à la fin de la séance ; renvoie son id. Le « précédent » est calculé aussitôt. */
export async function ajouterSerie(
  db: Executeur,
  s: {
    seanceId: string;
    exerciceId: string;
    position?: number;
    type?: TypeSerie;
    kg?: number;
    reps?: number;
    dureeS?: number;
    distanceM?: number;
    groupeSuperset?: number | null;
    /** Id imposé (ajout optimiste : l'écran l'affiche déjà). */
    id?: string;
  },
): Promise<string> {
  let id = "";
  await transaction(db, async (db) => {
    let position = s.position;
    if (position === undefined) {
      const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM series WHERE seance_id = ?", [s.seanceId]);
      position = (m?.m ?? -1) + 1;
    }
    await assurerExerciceDeSeance(db, s.seanceId, s.exerciceId, s.groupeSuperset ?? null);
    id = await insererSerie(db, s.seanceId, s.exerciceId, position, s.groupeSuperset ?? null, s.type ?? "normale", { kg: s.kg, reps: s.reps, duree_s: s.dureeS, distance_m: s.distanceM }, false, s.id);
    await recalculerApresModification(db, s.seanceId, [s.exerciceId]);
  });
  return id;
}

/** Ajoute un exercice à la séance avec `nbSeries` séries vides (préremplies du précédent) ; renvoie les ids des séries. */
export async function ajouterExerciceASeance(
  db: Executeur,
  seanceId: string,
  exerciceId: string,
  opts: { nbSeries?: number; reposS?: number; prefill?: boolean } = {},
): Promise<string[]> {
  const ids: string[] = [];
  await transaction(db, async (db) => {
    await assurerExerciceDeSeance(db, seanceId, exerciceId, null);
    if (opts.reposS !== undefined) {
      await db.runAsync("UPDATE seance_exercices SET repos_s = ? WHERE seance_id = ? AND exercice_id = ?", [opts.reposS, seanceId, exerciceId]);
    }
    const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM series WHERE seance_id = ?", [seanceId]);
    let pos = (m?.m ?? -1) + 1;
    // Une course, une sortie à vélo ou au rameur (distance et durée) : une seule série, pas trois (audit A10).
    const nature = (await db.getFirstAsync<{ nature: string | null }>("SELECT nature FROM exercices WHERE id = ?", [exerciceId]))?.nature;
    const nb = nature === "distance_duree" ? 1 : (opts.nbSeries ?? 3);
    for (let i = 0; i < nb; i++) ids.push(await insererSerie(db, seanceId, exerciceId, pos++, null, "normale", null));
    await recalculerApresModification(db, seanceId, [exerciceId]);
    if (opts.prefill ?? true) {
      await db.runAsync(
        `UPDATE series SET kg = precedent_kg, reps = precedent_reps, duree_s = precedent_duree_s, distance_m = precedent_distance_m
         WHERE seance_id = ? AND exercice_id = ? AND kg IS NULL AND reps IS NULL AND duree_s IS NULL AND distance_m IS NULL`,
        [seanceId, exerciceId],
      );
      await recalculerApresModification(db, seanceId, [exerciceId]);
    }
  });
  return ids;
}

/**
 * Modifie une série, à tout moment (E1) : en cours, cochée, exercice terminé, séance passée.
 * Recalcule volume, 1RM, records et « précédent » de toutes les séances de l'exercice, et le total de la séance.
 */
export async function modifierSerie(db: Executeur, serieId: string, patch: PatchSerie): Promise<void> {
  // La série est relue dans la transaction : deux modifications rapprochées (la case qui s'enregistre en perdant le focus,
  // la coche) ne s'écrasent plus l'une l'autre avec une ligne lue avant l'écriture de l'autre (docs/ALERTE-REPS.md).
  await transaction(db, async (db) => {
    const s = await db.getFirstAsync<Serie>("SELECT * FROM series WHERE id = ?", [serieId]);
    if (!s) return;
    const faite = patch.faite === undefined ? s.faite : patch.faite ? 1 : 0;
    const faitLe = patch.faite === undefined ? s.fait_le : patch.faite ? (s.fait_le ?? Date.now()) : null;
    await db.runAsync(
      "UPDATE series SET kg = ?, reps = ?, type = ?, faite = ?, fait_le = ?, rpe = ?, duree_s = ?, duree_cible_s = ?, distance_m = ? WHERE id = ?",
      [
        patch.kg === undefined ? s.kg : patch.kg,
        patch.reps === undefined ? s.reps : patch.reps,
        patch.type ?? s.type,
        faite,
        faitLe,
        patch.rpe === undefined ? s.rpe : patch.rpe,
        patch.dureeS === undefined ? s.duree_s : patch.dureeS,
        patch.dureeCibleS === undefined ? (s.duree_cible_s ?? null) : patch.dureeCibleS,
        patch.distanceM === undefined ? s.distance_m : patch.distanceM,
        serieId,
      ],
    );
    await recalculerApresModification(db, s.seance_id, [s.exercice_id]);
  });
}

/** Ce qu'une case de série saisit : un seul champ. */
export type PatchSaisie = Pick<PatchSerie, "kg" | "reps" | "dureeS" | "distanceM">;

/**
 * Saisie en cours au clavier de séance : la valeur tapée, écrite telle quelle (une écriture par rafale de touches, en différé),
 * sans recalcul ; la fin de la saisie passe par modifierSerie, qui recalcule. Une appli tuée en pleine saisie la retrouve.
 */
export async function ecrireSaisieSerie(db: Executeur, serieId: string, patch: PatchSaisie): Promise<void> {
  const colonne = { kg: "kg", reps: "reps", dureeS: "duree_s", distanceM: "distance_m" } as const;
  const champs = (Object.keys(colonne) as (keyof PatchSaisie)[]).filter((k) => patch[k] !== undefined);
  if (!champs.length) return;
  await db.runAsync(`UPDATE series SET ${champs.map((k) => `${colonne[k]} = ?`).join(", ")} WHERE id = ?`, [...champs.map((k) => patch[k] ?? null), serieId]);
}

/** Coche ou décoche une série (voir modifierSerie) ; `saisie` : la valeur encore en saisie, écrite avec la coche. */
export function cocherSerie(db: Executeur, serieId: string, faite: boolean, saisie?: PatchSaisie | null): Promise<void> {
  return modifierSerie(db, serieId, { ...saisie, faite });
}

/** Supprime une série et recalcule. */
export async function supprimerSerie(db: Executeur, serieId: string): Promise<void> {
  const s = await db.getFirstAsync<Serie>("SELECT * FROM series WHERE id = ?", [serieId]);
  if (!s) return;
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM series WHERE id = ?", [serieId]);
    await retirerExerciceVide(db, s.seance_id, s.exercice_id);
    await recalculerApresModification(db, s.seance_id, [s.exercice_id]);
  });
}

async function retirerExerciceVide(db: Executeur, seanceId: string, exerciceId: string): Promise<void> {
  const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE seance_id = ? AND exercice_id = ?", [seanceId, exerciceId]);
  if ((n?.n ?? 0) === 0) {
    await db.runAsync("DELETE FROM notes WHERE type = 'seance' AND seance_id = ? AND exercice_id = ?", [seanceId, exerciceId]);
    await db.runAsync("DELETE FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?", [seanceId, exerciceId]);
  }
}

/** Retire un exercice (et ses séries) d'une séance et recalcule. */
export async function retirerExerciceDeSeance(db: Executeur, seanceId: string, exerciceId: string): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM series WHERE seance_id = ? AND exercice_id = ?", [seanceId, exerciceId]);
    await db.runAsync("DELETE FROM notes WHERE type = 'seance' AND seance_id = ? AND exercice_id = ?", [seanceId, exerciceId]);
    await db.runAsync("DELETE FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?", [seanceId, exerciceId]);
    await recalculerApresModification(db, seanceId, [exerciceId]);
  });
}

/** Tempo retiré pour la séance : masque aussi celui de la routine (null en base = celui de la routine). */
export const SANS_TEMPO_SEANCE = "0-0-0-0";

/** Tempo d'un exercice dans la séance : celui de la séance, sinon celui de la routine ; « 0-0-0-0 » = retiré pour cette séance. */
export function tempoDeSeance(seance: string | null, routine: string | null | undefined): string | null {
  return seance === null ? routine ?? null : seance === SANS_TEMPO_SEANCE ? null : seance;
}

/** Tempo « 3-1-1-0 » d'un exercice pour cette séance seulement ; null le retire pour cette séance, même s'il vient de la routine. */
export async function definirTempoSeance(db: Executeur, seanceId: string, exerciceId: string, tempo: string | null): Promise<void> {
  await db.runAsync("UPDATE seance_exercices SET tempo = ? WHERE seance_id = ? AND exercice_id = ?", [tempo ?? SANS_TEMPO_SEANCE, seanceId, exerciceId]);
}

/** Ressenti visé de l'exercice pour cette séance seulement (D6) ; `choisi` null = « Aucun ». La routine garde le sien. */
export async function definirRirSeance(db: Executeur, seanceId: string, exerciceId: string, choisi: number | null, rirRoutine: number | null): Promise<void> {
  await db.runAsync("UPDATE seance_exercices SET rir = ? WHERE seance_id = ? AND exercice_id = ?", [rirPourSeance(choisi, rirRoutine), seanceId, exerciceId]);
}

/** Termine la séance (fin = maintenant, ou la date donnée). */
export async function terminerSeance(db: Executeur, seanceId: string, fin?: number): Promise<void> {
  await db.runAsync("UPDATE seances SET fin = ?, maj_le = ? WHERE id = ?", [fin ?? Date.now(), Date.now(), seanceId]);
  await recalculerSeance(db, seanceId);
}

/**
 * Recalcul complet des exercices d'une séance, un exercice par transaction (aucune écriture de l'écran n'attend derrière
 * tout le lot). Pendant la séance, chaque geste ne recalcule que la séance (`recalculerExerciceSeance`, même résultat) ;
 * à la fin, ce recalcul complet remet d'aplomb un historique qu'une synchro aurait changé entre-temps.
 */
export async function consoliderSeance(db: Executeur, seanceId: string): Promise<void> {
  const ex = await db.getAllAsync<{ exercice_id: string }>("SELECT DISTINCT exercice_id FROM series WHERE seance_id = ?", [seanceId]);
  for (const e of ex) await transaction(db, (t) => recalculerExercice(t, e.exercice_id));
  await recalculerSeance(db, seanceId);
}

/** Réglages du chrono de la séance en cours : début, pause. N'ajuste pas les heures des séries (≠ modifierSeance). */
export async function reglerChrono(db: Executeur, seanceId: string, r: { debut?: number; pauseDebut?: number | null; pauseCumulS?: number }): Promise<void> {
  const s = await db.getFirstAsync<Seance>("SELECT * FROM seances WHERE id = ?", [seanceId]);
  if (!s) return;
  await db.runAsync("UPDATE seances SET debut = ?, pause_debut = ?, pause_cumul_s = ?, maj_le = ? WHERE id = ?", [
    r.debut ?? s.debut,
    r.pauseDebut === undefined ? s.pause_debut : r.pauseDebut,
    r.pauseCumulS ?? s.pause_cumul_s,
    Date.now(),
    seanceId,
  ]);
}

/** Modifie titre, note, message, salle (id), début ou fin d'une séance (même passée) ; un changement de début recalcule l'ordre des records. */
export async function modifierSeance(
  db: Executeur,
  seanceId: string,
  patch: { titre?: string | null; note?: string | null; message?: string | null; score?: string | null; salleId?: string | null; debut?: number; fin?: number | null },
): Promise<void> {
  const s = await db.getFirstAsync<Seance>("SELECT * FROM seances WHERE id = ?", [seanceId]);
  if (!s) return;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE seances SET titre = ?, note = ?, message = ?, score = ?, salle_id = ?, debut = ?, fin = ?, maj_le = ? WHERE id = ?", [
      patch.titre === undefined ? s.titre : patch.titre,
      patch.note === undefined ? s.note : patch.note,
      patch.message === undefined ? (s.message ?? null) : patch.message,
      patch.score === undefined ? (s.score ?? null) : patch.score,
      patch.salleId === undefined ? s.salle_id : patch.salleId,
      patch.debut ?? s.debut,
      patch.fin === undefined ? s.fin : patch.fin,
      Date.now(),
      seanceId,
    ]);
    if (patch.debut !== undefined && patch.debut !== s.debut) {
      // les heures de validation suivent le déplacement : la charge effective (pesée avant la date) et les records se recalent sur la nouvelle date
      await db.runAsync("UPDATE series SET fait_le = fait_le + ? WHERE seance_id = ? AND fait_le IS NOT NULL", [patch.debut - s.debut, seanceId]);
      const ex = await db.getAllAsync<{ exercice_id: string }>("SELECT DISTINCT exercice_id FROM series WHERE seance_id = ?", [seanceId]);
      await recalculerApresModification(db, seanceId, ex.map((e) => e.exercice_id));
    }
  });
}

/** Supprime une séance et recalcule les exercices qu'elle contenait. */
export async function supprimerSeance(db: Executeur, seanceId: string): Promise<void> {
  await transaction(db, (db) => effacerSeance(db, seanceId));
}

/** Idem, dans la transaction de l'appelant. */
export async function effacerSeance(db: Executeur, seanceId: string): Promise<void> {
  const ex = await db.getAllAsync<{ exercice_id: string }>("SELECT DISTINCT exercice_id FROM series WHERE seance_id = ?", [seanceId]);
  await db.runAsync("DELETE FROM seances WHERE id = ?", [seanceId]);
  for (const e of ex) await recalculerExercice(db, e.exercice_id);
}

/** Les séries d'une séance dans l'ordre. */
export function lireSeries(db: Executeur, seanceId: string): Promise<Serie[]> {
  return db.getAllAsync<Serie>("SELECT * FROM series WHERE seance_id = ? ORDER BY position", [seanceId]);
}

/** La séance non terminée la plus récente, ou null. */
export async function seanceEnCours(db: Executeur): Promise<Seance | null> {
  const s = await db.getFirstAsync<Seance>("SELECT * FROM seances WHERE fin IS NULL ORDER BY debut DESC LIMIT 1", []);
  return s && { ...s, titre: titreSeance(s.titre) };
}

/** Une séance complète : exercices dans l'ordre, séries avec précédent et records battus, blocs de superset. */
/** Id de la séance terminée au rang `rang` (0 : la plus récente), pour le lien pepfitopen://history/derniere. */
export async function seanceTermineeAuRang(db: Executeur, rang: number): Promise<string | null> {
  const r = await db.getFirstAsync<{ id: string }>("SELECT id FROM seances WHERE fin IS NOT NULL ORDER BY debut DESC LIMIT 1 OFFSET ?", [Math.max(0, rang)]);
  return r?.id ?? null;
}

export async function lireSeance(db: Executeur, seanceId: string): Promise<SeanceDetail | null> {
  const lue = await db.getFirstAsync<Seance>("SELECT * FROM seances WHERE id = ?", [seanceId]);
  if (!lue) return null;
  const seance = { ...lue, titre: titreSeance(lue.titre) };
  const r = seance.routine_id ? await db.getFirstAsync<{ nom: string; note: string | null }>("SELECT nom, note FROM routines WHERE id = ?", [seance.routine_id]) : null;
  const routineNom = r?.nom ?? null;
  const series = await db.getAllAsync<Serie>("SELECT * FROM series WHERE seance_id = ? ORDER BY position, id", [seanceId]);
  const records = await db.getAllAsync<RecordExercice>("SELECT * FROM records WHERE seance_id = ? AND serie_id IS NOT NULL", [seanceId]);
  const parSerie = new Map<string, TypeRecord[]>();
  for (const r of records) parSerie.set(r.serie_id!, [...(parSerie.get(r.serie_id!) ?? []), r.type]);
  const lignes = await db.getAllAsync<{
    exercice_id: string; position: number; groupe_superset: number | null; repos_s: number; repos_transition_s: number; tempo: string | null;
    remplace_id: string | null; raison_alternative: "occupe" | "manquant" | null; remplace_nom: string | null; rir: number | null;
    nom: string; muscle: string | null; equipement: Exercice["equipement"]; picto: string | null; slug: string | null; nature: Exercice["nature"]; allure: Exercice["allure"]; poids_corps: number; e_tempo: string | null;
    perso: number; photo_vignette: string | null; coach: string | null;
  }>(
    `SELECT se.exercice_id, se.position, se.groupe_superset, se.repos_s, se.repos_transition_s, se.tempo, se.remplace_id, se.raison_alternative, ${nomSql("r")} AS remplace_nom, se.rir,
            ${nomSql("e")} AS nom, e.muscle, e.equipement, e.picto, e.slug, e.nature, e.allure, e.poids_corps, e.tempo AS e_tempo, e.perso, e.photo_vignette, e.coach
     FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id LEFT JOIN exercices r ON r.id = se.remplace_id
     WHERE se.seance_id = ? ORDER BY se.position`,
    [seanceId],
  );
  const routine = seance.routine_id
    ? await db.getAllAsync<{ id: string; exercice_id: string; tempo: string | null; rir: number | null }>(
        "SELECT id, exercice_id, tempo, rir FROM routine_exercices WHERE routine_id = ? ORDER BY position",
        [seance.routine_id],
      )
    : [];
  const toutes = await db.getAllAsync<Note & { exercice_id: string; ligne_id: string | null; seance_id: string | null }>(
    `SELECT id, type, texte, position, exercice_id, ligne_id, seance_id FROM notes
     WHERE (type = 'exercice' AND exercice_id IN (SELECT exercice_id FROM seance_exercices WHERE seance_id = ?))
        OR (type = 'seance' AND seance_id = ?)
        OR (type = 'routine' AND ligne_id IN (SELECT id FROM routine_exercices WHERE routine_id = ?))
     ORDER BY position, cree_le, id`,
    [seanceId, seanceId, seance.routine_id],
  );
  // Note de séance de la séance terminée précédente où l'exercice figure (placeholder du champ de séance).
  const precedentes = await db.getAllAsync<{ exercice_id: string; texte: string }>(
    `SELECT n.exercice_id, n.texte FROM notes n JOIN seance_exercices se ON se.seance_id = n.seance_id AND se.exercice_id = n.exercice_id
     WHERE n.type = 'seance'
       AND n.seance_id = (SELECT s2.id FROM seance_exercices x JOIN seances s2 ON s2.id = x.seance_id
                   WHERE x.exercice_id = n.exercice_id AND s2.fin IS NOT NULL AND s2.debut < ? AND s2.id <> ?
                   ORDER BY s2.debut DESC LIMIT 1)
       AND n.exercice_id IN (SELECT exercice_id FROM seance_exercices WHERE seance_id = ?)
     ORDER BY n.position, n.cree_le, n.id`,
    [seance.debut, seanceId, seanceId],
  );
  const exercices: ExerciceDeSeance[] = lignes.map((l) => ({
    exercice: { id: l.exercice_id, nom: l.nom, muscle: l.muscle, equipement: l.equipement, picto: l.picto, slug: l.slug, nature: l.nature, allure: l.allure, poids_corps: l.poids_corps, tempo: l.e_tempo, perso: l.perso, photo_vignette: l.photo_vignette, coach: l.coach },
    position: l.position,
    groupeSuperset: l.groupe_superset,
    reposS: l.repos_s,
    reposTransitionS: l.groupe_superset === null ? 0 : l.repos_transition_s,
    notes: toutes.filter((n) => n.type === "seance" && n.exercice_id === l.exercice_id).map(({ id, type, texte, position }) => ({ id, type, texte, position })),
    notePrecedente: precedentes.filter((p) => p.exercice_id === l.exercice_id).map((p) => p.texte).join("\n") || null,
    notesExercice: toutes.filter((n) => n.type === "exercice" && n.exercice_id === l.exercice_id).map(({ id, type, texte, position }) => ({ id, type, texte, position })),
    notesRoutine: toutes.filter((n) => n.type === "routine" && n.ligne_id === routine.find((r) => r.exercice_id === l.exercice_id)?.id).map(({ id, type, texte, position }) => ({ id, type, texte, position })),
    ligneRoutineId: routine.find((r) => r.exercice_id === l.exercice_id)?.id ?? null,
    tempo: tempoDeSeance(l.tempo, routine.find((r) => r.exercice_id === l.exercice_id)?.tempo),
    remplace: l.remplace_id && l.remplace_nom ? { id: l.remplace_id, nom: l.remplace_nom, raison: l.raison_alternative } : null,
    remplacePar: ((p) => (p ? { id: p.exercice_id, nom: p.nom } : null))(lignes.find((x) => x.remplace_id === l.exercice_id)),
    series: series.filter((s) => s.exercice_id === l.exercice_id).map((s) => ({ ...s, records: parSerie.get(s.id) ?? [] })),
    rirRoutine: routine.find((r) => r.exercice_id === l.exercice_id)?.rir ?? null,
    rirVise: rirVise(l.rir, routine.find((r) => r.exercice_id === l.exercice_id)?.rir),
  }));
  const blocs = grouperBlocsSeance(exercices);
  const salle = seance.salle_id ? await db.getFirstAsync<{ id: string; nom: string; type: string }>("SELECT id, nom, type FROM salle WHERE id = ?", [seance.salle_id]) : null;
  const efforts = await effortsDeSeance(db, seance.routine_id, seance.debut, exercices.map((e) => e.exercice), (id) => paliersPour(db, id, seance.salle_id));
  for (const e of exercices) e.effort = efforts.get(e.exercice.id) ?? null;
  return { seance, routineNom, routineNote: r?.note || null, salle, exercices, blocs };
}

/** Blocs d'une séance : un superset = exercices contigus d'un même groupe ; repos du tour sur le dernier, temps entre exercices sur le premier. */
export function grouperBlocsSeance(exercices: ExerciceDeSeance[]): BlocSeance[] {
  const blocs: BlocSeance[] = [];
  for (const e of exercices) {
    const d = blocs[blocs.length - 1];
    if (e.groupeSuperset !== null && d && d.groupeSuperset === e.groupeSuperset) d.exercices.push(e);
    else blocs.push({ groupeSuperset: e.groupeSuperset, exercices: [e], reposS: 0, reposTransitionS: 0 });
  }
  for (const b of blocs) {
    b.reposS = b.exercices[b.exercices.length - 1]!.reposS;
    b.reposTransitionS = b.exercices.length > 1 ? b.exercices[0]!.reposTransitionS : 0;
  }
  return blocs;
}

/** Repos à lancer après une série : sa durée et, entre deux exercices d'un superset, l'exercice suivant (« Machine suivante »). */
export interface ReposApres {
  s: number;
  suivant: { id: string; nom: string } | null;
}

/**
 * Repos à lancer après avoir validé cette série : dans un superset dont le tour n'est pas fini, le temps « entre les
 * exercices » (null s'il vaut 0 : on enchaîne) ; sinon le repos de l'exercice, ou celui du groupe en fin de tour.
 */
export async function reposApresSerie(db: Executeur, serieId: string): Promise<ReposApres | null> {
  const s = await db.getFirstAsync<Serie>("SELECT * FROM series WHERE id = ?", [serieId]);
  if (!s) return null;
  const exos = await db.getAllAsync<{ exercice_id: string; repos_s: number; repos_transition_s: number; groupe_superset: number | null; nom: string }>(
    `SELECT se.exercice_id, se.repos_s, se.repos_transition_s, se.groupe_superset, ${nomSql("e")} AS nom
     FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id WHERE se.seance_id = ? ORDER BY se.position`,
    [s.seance_id],
  );
  const moi = exos.find((e) => e.exercice_id === s.exercice_id);
  if (!moi) return null;
  // Récup propre à l'étape (D3) : celle de la ligne de routine de la série, quand l'exercice revient sur plusieurs lignes.
  if (moi.groupe_superset === null) return { s: s.repos_s ?? moi.repos_s, suivant: null };
  const groupe = exos.filter((e) => e.groupe_superset === moi.groupe_superset);
  const i = groupe.indexOf(moi);
  if (i === groupe.length - 1) return { s: moi.repos_s, suivant: null };
  if (moi.repos_transition_s <= 0) return null;
  const suivant = groupe[i + 1]!;
  return { s: moi.repos_transition_s, suivant: { id: suivant.exercice_id, nom: suivant.nom } };
}

/**
 * Même calcul que `reposApresSerie`, sur la séance déjà à l'écran (aucune lecture) : le repos part dans l'image de la coche
 * (audit M6). Les exercices sont dans l'ordre de la séance.
 */
export function reposApresDans(s: SeanceDetail, serieId: string): ReposApres | null {
  const moi = s.exercices.find((e) => e.series.some((x) => x.id === serieId));
  const serie = moi?.series.find((x) => x.id === serieId);
  if (!moi || !serie) return null;
  if (moi.groupeSuperset === null) return { s: serie.repos_s ?? moi.reposS, suivant: null };
  const groupe = s.exercices.filter((e) => e.groupeSuperset === moi.groupeSuperset);
  const i = groupe.indexOf(moi);
  if (i === groupe.length - 1) return { s: moi.reposS, suivant: null };
  if (moi.reposTransitionS <= 0) return null;
  const suivant = groupe[i + 1]!;
  return { s: moi.reposTransitionS, suivant: { id: suivant.exercice.id, nom: suivant.exercice.nom } };
}

/**
 * Glisser-déposer des exercices d'une séance (même calcul que l'éditeur de routine : `deplacerExercice` / `deplacerBloc`) :
 * écrit d'un coup l'ordre, le superset et le repos de chaque exercice. Qui entre dans un superset prend son temps entre
 * exercices. Les séries gardent leurs valeurs et leur coche ; leurs positions suivent le nouvel ordre d'exécution.
 */
export async function disposerSeance(db: Executeur, seanceId: string, lignes: { id: string; groupe: number | null; repos: number }[]): Promise<void> {
  const avant = await db.getAllAsync<{ exercice_id: string; groupe_superset: number | null; repos_transition_s: number }>(
    "SELECT exercice_id, groupe_superset, repos_transition_s FROM seance_exercices WHERE seance_id = ?",
    [seanceId],
  );
  const transition = new Map<number, number>();
  for (const e of avant) if (e.groupe_superset !== null) transition.set(e.groupe_superset, Math.max(transition.get(e.groupe_superset) ?? 0, e.repos_transition_s));
  await transaction(db, async (db) => {
    for (const [i, l] of lignes.entries()) {
      const ancienne = avant.find((e) => e.exercice_id === l.id)?.repos_transition_s ?? 0;
      await db.runAsync("UPDATE seance_exercices SET position = ?, groupe_superset = ?, repos_s = ?, repos_transition_s = ? WHERE seance_id = ? AND exercice_id = ?", [
        i, l.groupe, l.repos, l.groupe === null ? ancienne : (transition.get(l.groupe) ?? ancienne), seanceId, l.id,
      ]);
      await db.runAsync("UPDATE series SET groupe_superset = ? WHERE seance_id = ? AND exercice_id = ?", [l.groupe, seanceId, l.id]);
    }
    await renumeroterSeries(db, seanceId);
    await db.runAsync("UPDATE seances SET maj_le = ? WHERE id = ?", [Date.now(), seanceId]);
  });
}

/**
 * Glisser-déposer des séries d'un exercice : `serieIds` dans le nouvel ordre. Coche, valeurs et heure de validation restent
 * sur la série ; le numéro (calculé) suit le rang, et le « précédent » aussi (il se lit par rang).
 */
export async function ordonnerSeriesSeance(db: Executeur, seanceId: string, exerciceId: string, serieIds: string[]): Promise<void> {
  const series = await db.getAllAsync<{ id: string; position: number }>("SELECT id, position FROM series WHERE seance_id = ? AND exercice_id = ? ORDER BY position, id", [seanceId, exerciceId]);
  if (series.length !== serieIds.length || series.some((s) => !serieIds.includes(s.id))) return;
  await transaction(db, async (db) => {
    // Les séries reprennent les mêmes places dans la séance, dans le nouvel ordre : les autres exercices ne bougent pas.
    for (const [i, id] of serieIds.entries()) await db.runAsync("UPDATE series SET position = ? WHERE id = ?", [series[i]!.position, id]);
    await recalculerApresModification(db, seanceId, [exerciceId]);
    await db.runAsync("UPDATE seances SET maj_le = ? WHERE id = ?", [Date.now(), seanceId]);
  });
}

/** Positions des séries dans l'ordre d'exécution : exercice par exercice, tour par tour dans un superset (comme `ordreExecution`). */
async function renumeroterSeries(db: Executeur, seanceId: string): Promise<void> {
  const exos = await db.getAllAsync<{ exercice_id: string; groupe_superset: number | null }>(
    "SELECT exercice_id, groupe_superset FROM seance_exercices WHERE seance_id = ? ORDER BY position",
    [seanceId],
  );
  const series = await db.getAllAsync<{ id: string; exercice_id: string }>("SELECT id, exercice_id FROM series WHERE seance_id = ? ORDER BY position, id", [seanceId]);
  const blocs: string[][] = [];
  exos.forEach((e, k) => {
    if (e.groupe_superset !== null && exos[k - 1]?.groupe_superset === e.groupe_superset) blocs[blocs.length - 1]!.push(e.exercice_id);
    else blocs.push([e.exercice_id]);
  });
  const ordre: string[] = [];
  for (const b of blocs) {
    const parExo = b.map((ex) => series.filter((s) => s.exercice_id === ex));
    const tours = Math.max(0, ...parExo.map((l) => l.length));
    for (let t = 0; t < tours; t++) for (const l of parExo) if (l[t]) ordre.push(l[t]!.id);
  }
  // Séries d'un exercice absent de seance_exercices (bases anciennes) : à la fin, dans leur ordre.
  for (const s of series) if (!ordre.includes(s.id)) ordre.push(s.id);
  for (const [i, id] of ordre.entries()) await db.runAsync("UPDATE series SET position = ? WHERE id = ?", [i, id]);
}

/** Superset d'une séance : temps entre les exercices (sur chaque membre) et repos après le tour (sur le dernier). */
export async function changerReposSupersetSeance(db: Executeur, seanceId: string, groupe: number, transitionS: number, tourS: number): Promise<void> {
  const l = await db.getAllAsync<{ exercice_id: string }>(
    "SELECT exercice_id FROM seance_exercices WHERE seance_id = ? AND groupe_superset = ? ORDER BY position",
    [seanceId, groupe],
  );
  if (l.length === 0) return;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE seance_exercices SET repos_transition_s = ? WHERE seance_id = ? AND groupe_superset = ?", [transitionS, seanceId, groupe]);
    await db.runAsync("UPDATE seance_exercices SET repos_s = ? WHERE seance_id = ? AND exercice_id = ?", [tourS, seanceId, l[l.length - 1]!.exercice_id]);
  });
}

/** Les séries de la dernière séance antérieure où l'exercice a été fait (le « précédent »), échauffements exclus. */
export function lirePrecedent(db: Executeur, exerciceId: string, avantDebut: number = Date.now() + 1): Promise<Serie[]> {
  return db.getAllAsync<Serie>(
    `SELECT s.* FROM series s
     WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement'
       AND s.seance_id = (
         SELECT se.id FROM seances se JOIN series x ON x.seance_id = se.id
         WHERE x.exercice_id = ? AND x.faite = 1 AND se.debut < ?
         ORDER BY se.debut DESC LIMIT 1)
     ORDER BY s.position`,
    [exerciceId, exerciceId, avantDebut],
  );
}

/** `lirePrecedent` de plusieurs exercices en une lecture (vue d'une routine) : exercice → séries faites de sa dernière séance. */
export async function lirePrecedents(db: Executeur, exerciceIds: readonly string[], avantDebut: number = Date.now() + 1): Promise<Record<string, Serie[]>> {
  const res: Record<string, Serie[]> = {};
  for (const e of exerciceIds) res[e] = [];
  if (!exerciceIds.length) return res;
  const l = await db.getAllAsync<Serie>(
    `WITH dern AS (
       SELECT x.value AS exercice_id,
         (SELECT se.id FROM seances se JOIN series y ON y.seance_id = se.id
          WHERE y.exercice_id = x.value AND y.faite = 1 AND se.debut < ? ORDER BY se.debut DESC LIMIT 1) AS seance_id
       FROM json_each(?) x)
     SELECT s.* FROM series s JOIN dern d ON s.exercice_id = d.exercice_id AND s.seance_id = d.seance_id
     WHERE s.faite = 1 AND s.type != 'echauffement'
     ORDER BY s.position`,
    [avantDebut, JSON.stringify([...new Set(exerciceIds)])],
  );
  for (const x of l) res[x.exercice_id]?.push(x);
  return res;
}
