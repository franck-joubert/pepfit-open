import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { t as texte } from "../../i18n/index";
import { nomSql } from "../noms";
import { nouvelId } from "../id";
import { lireFormat, lireType, type FormatWod, type TypeProgramme } from "../programmes";
import type { Exercice, RoutineExercice, TypeSerie } from "../types";
import { ajouterNote, listerNotes, type Note } from "./notes";
import { sectionParDefaut } from "./sections";
import { tempoDeSeance, titreSeance } from "./seances";

export interface LigneRoutine {
  exerciceId: string;
  nbSeries?: number;
  reposS?: number;
  groupeSuperset?: number | null;
}

export interface RoutineResume {
  id: string;
  nom: string;
  note: string | null;
  ordre: number;
  /** Section de la liste Entraînements ; null = la première. */
  sectionId: string | null;
  /** Type du programme (migration 30, D1) ; format d'un WOD et sa valeur (durée en s ou rounds). */
  type: TypeProgramme;
  format: FormatWod | null;
  formatValeur: number | null;
  /** Plan de la boutique qui l'a créée (migration 34) ; null : une routine ordinaire (ou dont le plan n'existe pas ici). */
  planId: string | null;
  nbExercices: number;
  nbSeries: number;
  derniereFois: number | null;
}

/** Charge et répétitions visées pour une série de routine ; null = reprises de la dernière séance. */
export interface CibleSerie {
  kg: number | null;
  reps: number | null;
  duree_s: number | null;
  distance_m: number | null;
  type: TypeSerie;
  /** Borne haute de la plage de répétitions (la basse est `reps`) ; null = vide. */
  reps_max: number | null;
}

export interface LigneRoutineDetail extends RoutineExercice {
  exercice: Pick<Exercice, "id" | "nom" | "muscle" | "equipement" | "nature" | "allure" | "picto" | "slug" | "tempo" | "perso" | "photo_vignette" | "coach">;
  /** Notes d'exercice : à chaque fois qu'on fait l'exercice. */
  notesExercice: Note[];
  /** Notes de routine : à chaque séance de cette routine. */
  notes: Note[];
  /** Une cible par série (longueur `nb_series`). */
  cibles: CibleSerie[];
}

/** Un bloc de routine : un exercice seul, ou un superset (≥ 2 exercices, repos unique après chaque tour). */
export interface BlocRoutine {
  groupeSuperset: number | null;
  lignes: LigneRoutineDetail[];
  /** Repos après la série de l'exercice seul, ou après chaque tour du superset. */
  reposS: number;
  /** Superset : temps entre deux exercices d'un tour (porté par chaque ligne, lu sur la première) ; 0 = on enchaîne. */
  reposTransitionS: number;
  /** Nombre de séries (de tours pour un superset : le plus grand des exercices du groupe). */
  nbTours: number;
}

export interface RoutineDetail {
  id: string;
  nom: string;
  note: string | null;
  type: TypeProgramme;
  format: FormatWod | null;
  formatValeur: number | null;
  blocs: BlocRoutine[];
}

/**
 * Qui a fait une routine (migration 62) : soi, un coach (envoi accepté) ou une IA (MCP). Une routine cachée (visible = 0) est
 * le contenu d'une séance prévue, hors de Mes routines (docs/AGENDA-ROUTINES.md).
 */
export type OrigineRoutine = "moi" | "coach" | "ia";
export const lireOrigine = (v: unknown): OrigineRoutine => (v === "coach" || v === "ia" ? v : "moi");

/**
 * Crée une routine en fin de sa section (la première si `sectionId` n'est pas donné) ; l'ordre des lignes est la position. Le repos
 * d'un superset est celui de sa dernière ligne.
 */
export async function creerRoutine(
  db: Executeur,
  nom: string,
  lignes: LigneRoutine[],
  sectionId?: string,
  o: { type?: TypeProgramme; format?: FormatWod | null; formatValeur?: number | null; visible?: boolean; origine?: OrigineRoutine } = {},
): Promise<string> {
  const id = nouvelId();
  const t = Date.now();
  await transaction(db, async (db) => {
    const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM routines", []);
    const section = sectionId ?? (await sectionParDefaut(db));
    await db.runAsync("INSERT INTO routines (id, nom, ordre, section_id, type, format, format_valeur, visible, origine, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
      id, nom, (m?.m ?? -1) + 1, section, o.type ?? "muscu", o.format ?? null, o.formatValeur ?? null, o.visible === false ? 0 : 1, o.origine ?? "moi", t, t,
    ]);
    for (const [i, l] of lignes.entries()) {
      await db.runAsync(
        "INSERT INTO routine_exercices (id, routine_id, exercice_id, position, groupe_superset, nb_series, repos_s) VALUES (?,?,?,?,?,?,?)",
        [nouvelId(), id, l.exerciceId, i, l.groupeSuperset ?? null, l.nbSeries ?? 3, l.reposS ?? 120],
      );
    }
  });
  return id;
}

/** Les lignes brutes d'une routine, dans l'ordre. */
export function lireExercicesDeRoutine(db: Executeur, routineId: string): Promise<RoutineExercice[]> {
  return db.getAllAsync<RoutineExercice>("SELECT * FROM routine_exercices WHERE routine_id = ? ORDER BY position", [routineId]);
}

/** Mes routines (les visibles) dans leur ordre, avec nombre d'exercices, de séries et date de la dernière séance. */
export async function listerRoutines(db: Executeur): Promise<RoutineResume[]> {
  const l = await db.getAllAsync<Omit<RoutineResume, "type" | "format"> & { type: string; format: string | null }>(
    `SELECT r.id, r.nom, r.note, r.ordre, r.section_id AS sectionId, r.type, r.format, r.format_valeur AS formatValeur,
            (SELECT id FROM plans WHERE id = r.plan_id) AS planId,
            (SELECT COUNT(*) FROM routine_exercices WHERE routine_id = r.id) AS nbExercices,
            COALESCE((SELECT SUM(nb_series) FROM routine_exercices WHERE routine_id = r.id), 0) AS nbSeries,
            (SELECT MAX(debut) FROM seances WHERE routine_id = r.id) AS derniereFois
     FROM routines r WHERE r.visible = 1 ORDER BY r.ordre, r.cree_le`,
    [],
  );
  return l.map((r) => ({ ...r, type: lireType(r.type), format: lireFormat(r.format) }));
}

/** Routines visibles où l'exercice sert (fiche, planche exercices-perso : « Routines Pull A »), dans l'ordre de la liste. */
export async function routinesDeLExercice(db: Executeur, exerciceId: string): Promise<{ id: string; nom: string }[]> {
  return db.getAllAsync<{ id: string; nom: string }>(
    `SELECT r.id, r.nom FROM routines r
     WHERE r.visible = 1 AND EXISTS (SELECT 1 FROM routine_exercices x WHERE x.routine_id = r.id AND x.exercice_id = ?)
     ORDER BY r.ordre, r.cree_le`,
    [exerciceId],
  );
}

export interface RoutineBreve {
  id: string;
  nom: string;
  planId: string | null;
  /** Dans Mes routines (migration 62) ; faux : le contenu d'une séance prévue. */
  visible: boolean;
  origine: OrigineRoutine;
  /** Auteur de la dernière retouche d'une séance reçue (coach, IA) ; null : telle que reçue, ou une routine à soi. */
  modifiePar: OrigineRoutine | null;
}

/** Nom, plan, visibilité et origine de chaque routine, cachées comprises, sans compte ni date (planning, rappels) : une lecture légère. */
export async function listerRoutinesBreves(db: Executeur): Promise<RoutineBreve[]> {
  const l = await db.getAllAsync<{ id: string; nom: string; planId: string | null; visible: number; origine: string; modifiePar: string | null }>(
    `SELECT r.id, r.nom, (SELECT id FROM plans WHERE id = r.plan_id) AS planId, r.visible, r.origine, r.modifie_par AS modifiePar
     FROM routines r ORDER BY r.ordre, r.cree_le`,
    [],
  );
  return l.map((r) => ({ ...r, visible: r.visible === 1, origine: lireOrigine(r.origine), modifiePar: r.modifiePar == null ? null : lireOrigine(r.modifiePar) }));
}

/** Une routine avec ses blocs (exercices seuls et supersets) et les infos d'affichage de chaque exercice. */
export async function lireRoutine(db: Executeur, routineId: string): Promise<RoutineDetail | null> {
  return (await lireRoutines(db, [routineId])).get(routineId) ?? null;
}

type LigneLue = RoutineExercice & {
  e_nom: string; e_muscle: string | null; e_equipement: Exercice["equipement"]; e_nature: Exercice["nature"]; e_allure: Exercice["allure"]; e_picto: string | null; e_slug: string | null; e_note: string | null; e_tempo: string | null;
  e_perso: number; e_vignette: string | null; e_coach: string | null;
};

/**
 * Plusieurs routines (toutes sans `ids`), en quatre lectures quel que soit leur nombre : routines, lignes, cibles, notes. Les
 * écrans qui en montrent une liste (planning, Routines) ne relisent plus chaque routine une par une. `notes: false` saute la
 * lecture des notes (durée estimée, résumés).
 */
export async function lireRoutines(db: Executeur, ids?: readonly string[], o: { notes?: boolean } = {}): Promise<Map<string, RoutineDetail>> {
  const res = new Map<string, RoutineDetail>();
  if (ids && !ids.length) return res;
  // sans liste : toutes ; avec : une sous-requête de valeurs, sans limite de paramètres pour les listes courantes
  const filtre = (col: string) => (ids ? `${col} IN (${ids.map(() => "?").join(",")})` : "1");
  const p = ids ? [...ids] : [];
  const [lues, lignes, cibles, toutes] = await Promise.all([
    db.getAllAsync<{ id: string; nom: string; note: string | null; type: string; format: string | null; formatValeur: number | null }>(
      `SELECT id, nom, note, type, format, format_valeur AS formatValeur FROM routines WHERE ${filtre("id")}`,
      p,
    ),
    db.getAllAsync<LigneLue>(
      `SELECT re.*, ${nomSql("e")} AS e_nom, e.muscle AS e_muscle, e.equipement AS e_equipement, e.nature AS e_nature, e.allure AS e_allure, e.picto AS e_picto, e.slug AS e_slug, e.tempo AS e_tempo,
              e.perso AS e_perso, e.photo_vignette AS e_vignette, e.coach AS e_coach
       FROM routine_exercices re JOIN exercices e ON e.id = re.exercice_id
       WHERE ${filtre("re.routine_id")} ORDER BY re.routine_id, re.position`,
      p,
    ),
    db.getAllAsync<CibleSerie & { ligne_id: string; rang: number }>(
      `SELECT rs.ligne_id, rs.rang, rs.kg, rs.reps, rs.duree_s, rs.distance_m, rs.type, rs.reps_max FROM routine_series rs
       JOIN routine_exercices re ON re.id = rs.ligne_id WHERE ${filtre("re.routine_id")}`,
      p,
    ),
    o.notes === false
      ? Promise.resolve([] as (Note & { exercice_id: string; ligne_id: string | null })[])
      : db.getAllAsync<Note & { exercice_id: string; ligne_id: string | null }>(
          `SELECT id, type, texte, position, exercice_id, ligne_id FROM notes
           WHERE (type = 'exercice' AND exercice_id IN (SELECT exercice_id FROM routine_exercices WHERE ${filtre("routine_id")}))
              OR (type = 'routine' AND ligne_id IN (SELECT id FROM routine_exercices WHERE ${filtre("routine_id")}))
           ORDER BY position, cree_le, id`,
          [...p, ...p],
        ),
  ]);
  const ciblesDe = new Map<string, Map<number, CibleSerie & { ligne_id: string; rang: number }>>();
  for (const c of cibles) {
    const m = ciblesDe.get(c.ligne_id) ?? new Map();
    // la première lue l'emporte, comme le find() d'avant
    if (!m.has(c.rang)) m.set(c.rang, c);
    ciblesDe.set(c.ligne_id, m);
  }
  const notesExo = new Map<string, Note[]>();
  const notesLigne = new Map<string, Note[]>();
  for (const n of toutes) {
    const note: Note = { id: n.id, type: n.type, texte: n.texte, position: n.position };
    if (n.type === "exercice") notesExo.set(n.exercice_id, [...(notesExo.get(n.exercice_id) ?? []), note]);
    else if (n.type === "routine" && n.ligne_id) notesLigne.set(n.ligne_id, [...(notesLigne.get(n.ligne_id) ?? []), note]);
  }
  const parRoutine = new Map<string, LigneRoutineDetail[]>();
  for (const l of lignes) {
    const { e_nom, e_muscle, e_equipement, e_nature, e_allure, e_picto, e_slug, e_tempo, e_perso, e_vignette, e_coach, ...base } = l;
    const cs = ciblesDe.get(l.id);
    const ligne: LigneRoutineDetail = {
      ...base,
      exercice: { id: l.exercice_id, nom: e_nom, muscle: e_muscle, equipement: e_equipement, nature: e_nature, allure: e_allure, picto: e_picto, slug: e_slug, tempo: e_tempo, perso: e_perso, photo_vignette: e_vignette, coach: e_coach },
      notesExercice: [...(notesExo.get(l.exercice_id) ?? [])],
      notes: [...(notesLigne.get(l.id) ?? [])],
      cibles: Array.from({ length: l.nb_series }, (_, rang) => {
        const c = cs?.get(rang);
        return { kg: c?.kg ?? null, reps: c?.reps ?? null, duree_s: c?.duree_s ?? null, distance_m: c?.distance_m ?? null, type: c?.type ?? "normale", reps_max: c?.reps_max ?? null };
      }),
    };
    const liste = parRoutine.get(l.routine_id);
    if (liste) liste.push(ligne);
    else parRoutine.set(l.routine_id, [ligne]);
  }
  for (const lue of lues) {
    res.set(lue.id, { ...lue, type: lireType(lue.type), format: lireFormat(lue.format), blocs: grouperBlocs(parRoutine.get(lue.id) ?? []) });
  }
  return res;
}

/** Regroupe des lignes ordonnées en blocs : exercice seul, ou superset (lignes contiguës d'un même groupe). */
export function grouperBlocs(lignes: LigneRoutineDetail[]): BlocRoutine[] {
  const blocs: BlocRoutine[] = [];
  for (const ligne of lignes) {
    const dernier = blocs[blocs.length - 1];
    if (ligne.groupe_superset !== null && dernier && dernier.groupeSuperset === ligne.groupe_superset) dernier.lignes.push(ligne);
    else blocs.push({ groupeSuperset: ligne.groupe_superset, lignes: [ligne], reposS: 0, reposTransitionS: 0, nbTours: 0 });
  }
  for (const b of blocs) {
    b.reposS = b.lignes[b.lignes.length - 1]!.repos_s;
    b.reposTransitionS = b.lignes.length > 1 ? (b.lignes[0]!.repos_transition_s ?? 0) : 0;
    b.nbTours = Math.max(...b.lignes.map((x) => x.nb_series));
  }
  return blocs;
}

/** Type d'un programme, et format d'un WOD (null : pas de format). Changer de type garde tout le contenu (D4). */
export async function modifierTypeRoutine(
  db: Executeur,
  routineId: string,
  patch: { type?: TypeProgramme; format?: FormatWod | null; formatValeur?: number | null },
): Promise<void> {
  const r = await db.getFirstAsync<{ type: string; format: string | null; format_valeur: number | null }>("SELECT type, format, format_valeur FROM routines WHERE id = ?", [routineId]);
  if (!r) return;
  await db.runAsync("UPDATE routines SET type = ?, format = ?, format_valeur = ?, maj_le = ? WHERE id = ?", [
    patch.type ?? r.type,
    patch.format === undefined ? r.format : patch.format,
    patch.formatValeur === undefined ? r.format_valeur : patch.formatValeur,
    Date.now(),
    routineId,
  ]);
}

/**
 * Sous-page Programmes : place un programme au rang `rang` parmi ceux du type `type` (il prend ce type s'il vient d'une autre
 * section). L'ordre global (`ordre`) est renuméroté : les programmes des autres types gardent leur ordre relatif.
 */
export async function rangerProgramme(db: Executeur, routineId: string, type: TypeProgramme, rang: number): Promise<void> {
  const l = await db.getAllAsync<{ id: string; type: string }>("SELECT id, type FROM routines ORDER BY ordre, cree_le", []);
  const moi = l.find((x) => x.id === routineId);
  if (!moi) return;
  const autres = l.filter((x) => x.id !== routineId);
  const memes = autres.filter((x) => lireType(x.type) === type);
  const r = Math.max(0, Math.min(memes.length, rang));
  // Juste avant le r-ième du type, ou juste après le dernier du type (à la fin s'il n'y en a pas).
  const ancre = memes[r] ?? null;
  const ap = ancre ? autres.indexOf(ancre) : memes.length ? autres.indexOf(memes[memes.length - 1]!) + 1 : autres.length;
  const ordre = [...autres.slice(0, ap), { id: routineId, type }, ...autres.slice(ap)];
  const t = Date.now();
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE routines SET type = ?, maj_le = ? WHERE id = ? AND type <> ?", [type, t, routineId, type]);
    for (const [i, x] of ordre.entries()) await db.runAsync("UPDATE routines SET ordre = ? WHERE id = ? AND ordre <> ?", [i, x.id, i]);
  });
}

/** Renomme une routine / change sa note. */
export async function modifierRoutine(db: Executeur, routineId: string, patch: { nom?: string; note?: string | null }): Promise<void> {
  const r = await db.getFirstAsync<{ nom: string; note: string | null }>("SELECT nom, note FROM routines WHERE id = ?", [routineId]);
  if (!r) return;
  await db.runAsync("UPDATE routines SET nom = ?, note = ?, maj_le = ? WHERE id = ?", [
    patch.nom ?? r.nom,
    patch.note === undefined ? r.note : patch.note,
    Date.now(),
    routineId,
  ]);
}

/**
 * Copie fidèle d'une routine (lignes, supersets, repos, notes de routine (toutes), plages, cibles et types de série), placée juste après
 * elle ; nom « … (copie) » (sinon `o.nom`). Les notes d'exercice, portées par l'exercice, valent pour les deux. La copie est à soi,
 * visible sauf `o.visible: false` (contenu propre d'une séance prévue), jamais liée à l'original. `o.garderVersion` (occurrence
 * retouchée d'une séance du coach) : la copie garde la version d'origine et la dernière retouche de l'original.
 */
export async function dupliquerRoutine(
  db: Executeur,
  routineId: string,
  o: { nom?: string; visible?: boolean; origine?: OrigineRoutine; garderVersion?: boolean } = {},
): Promise<string | null> {
  const r = await db.getFirstAsync<{
    nom: string; note: string | null; ordre: number; section_id: string | null; type: string; format: string | null; format_valeur: number | null;
    version_origine: string | null; modifie_par: string | null; modifie_le: number | null;
  }>(
    "SELECT nom, note, ordre, section_id, type, format, format_valeur, version_origine, modifie_par, modifie_le FROM routines WHERE id = ?",
    [routineId],
  );
  if (!r) return null;
  const id = nouvelId();
  const t = Date.now();
  const lignes = await lireExercicesDeRoutine(db, routineId);
  const cibles = await db.getAllAsync<{ ligne_id: string; rang: number; kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; type: TypeSerie; reps_max: number | null }>(
    "SELECT rs.ligne_id, rs.rang, rs.kg, rs.reps, rs.duree_s, rs.distance_m, rs.type, rs.reps_max FROM routine_series rs JOIN routine_exercices re ON re.id = rs.ligne_id WHERE re.routine_id = ?",
    [routineId],
  );
  await transaction(db, async (db) => {
    // Une copie cachée n'est dans aucune liste : les autres routines ne bougent pas.
    if (o.visible !== false) await db.runAsync("UPDATE routines SET ordre = ordre + 1 WHERE ordre > ?", [r.ordre]);
    await db.runAsync("INSERT INTO routines (id, nom, note, ordre, section_id, type, format, format_valeur, visible, origine, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
      id, o.nom ?? `${r.nom} (copie)`, r.note, o.visible === false ? r.ordre : r.ordre + 1, r.section_id, r.type, r.format, r.format_valeur, o.visible === false ? 0 : 1, o.origine ?? "moi", t, t,
    ]);
    for (const l of lignes) {
      const nid = nouvelId();
      await db.runAsync(
        "INSERT INTO routine_exercices (id, routine_id, exercice_id, position, groupe_superset, nb_series, repos_s, repos_transition_s, plage_reps, tempo) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [nid, id, l.exercice_id, l.position, l.groupe_superset, l.nb_series, l.repos_s, l.repos_transition_s, l.plage_reps, l.tempo],
      );
      for (const n of await listerNotes(db, { exerciceId: l.exercice_id, ligneId: l.id }, "routine")) await ajouterNote(db, { exerciceId: l.exercice_id, ligneId: nid }, "routine", n.texte);
      for (const c of cibles.filter((x) => x.ligne_id === l.id)) {
        await db.runAsync(
          "INSERT INTO routine_series (ligne_id, rang, kg, reps, duree_s, distance_m, type, reps_max) VALUES (?,?,?,?,?,?,?,?)",
          [nid, c.rang, c.kg, c.reps, c.duree_s, c.distance_m, c.type, c.reps_max],
        );
      }
    }
    // Après les lignes : les déclencheurs agenda_modif_* ne notent pas la copie elle-même comme une retouche.
    if (o.garderVersion && r.version_origine != null)
      await db.runAsync("UPDATE routines SET version_origine = ?, modifie_par = ?, modifie_le = ? WHERE id = ?", [r.version_origine, r.modifie_par, r.modifie_le, id]);
  });
  return id;
}

/**
 * « Enregistrer comme routine » : une routine reprenant la séance (exercices dans l'ordre, supersets, repos, tempo de la séance, sinon de la routine
 * d'origine), avec une série de routine par série validée, ses charge, répétitions, durée, distance et type comme cibles. Les
 * exercices sans série validée sont laissés de côté. Les notes de routine de la routine d'origine sont recopiées. Nom : celui de la séance. Placée en fin de la section de la routine d'origine (sinon de la première) ; renvoie son id.
 */
export async function creerRoutineDepuisSeance(db: Executeur, seanceId: string): Promise<string | null> {
  const s = await db.getFirstAsync<{ titre: string | null; routine_id: string | null }>("SELECT titre, routine_id FROM seances WHERE id = ?", [seanceId]);
  if (!s) return null;
  const depart = s.routine_id
    ? await db.getFirstAsync<{ nom: string; section_id: string | null; type: string }>("SELECT nom, section_id, type FROM routines WHERE id = ?", [s.routine_id])
    : null;
  const nomRoutine = depart?.nom ?? null;
  const exos = await db.getAllAsync<{ exercice_id: string; groupe_superset: number | null; repos_s: number; repos_transition_s: number; tempo: string | null }>(
    "SELECT exercice_id, groupe_superset, repos_s, repos_transition_s, tempo FROM seance_exercices WHERE seance_id = ? ORDER BY position",
    [seanceId],
  );
  const series = await db.getAllAsync<{ exercice_id: string; kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; type: TypeSerie }>(
    "SELECT exercice_id, kg, reps, duree_s, distance_m, type FROM series WHERE seance_id = ? AND faite = 1 ORDER BY position, id",
    [seanceId],
  );
  const tempos = s.routine_id
    ? await db.getAllAsync<{ id: string; exercice_id: string; tempo: string | null }>("SELECT id, exercice_id, tempo FROM routine_exercices WHERE routine_id = ?", [s.routine_id])
    : [];
  const id = nouvelId();
  const t = Date.now();
  await transaction(db, async (db) => {
    const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM routines", []);
    const section = depart?.section_id ?? (await sectionParDefaut(db));
    await db.runAsync("INSERT INTO routines (id, nom, ordre, section_id, type, cree_le, maj_le) VALUES (?,?,?,?,?,?,?)", [
      id, titreSeance(s.titre) ?? nomRoutine ?? texte("seance.seance.titreDefaut"), (m?.m ?? -1) + 1, section, depart?.type ?? "muscu", t, t,
    ]);
    let position = 0;
    for (const e of exos) {
      const faites = series.filter((x) => x.exercice_id === e.exercice_id);
      if (!faites.length) continue;
      const ligne = nouvelId();
      await db.runAsync(
        "INSERT INTO routine_exercices (id, routine_id, exercice_id, position, groupe_superset, nb_series, repos_s, repos_transition_s, tempo) VALUES (?,?,?,?,?,?,?,?,?)",
        [ligne, id, e.exercice_id, position++, e.groupe_superset, faites.length, e.repos_s, e.repos_transition_s, tempoDeSeance(e.tempo, tempos.find((x) => x.exercice_id === e.exercice_id)?.tempo)],
      );
      const origine = tempos.find((x) => x.exercice_id === e.exercice_id);
      if (origine) for (const n of await listerNotes(db, { exerciceId: e.exercice_id, ligneId: origine.id }, "routine")) await ajouterNote(db, { exerciceId: e.exercice_id, ligneId: ligne }, "routine", n.texte);
      for (const [rang, x] of faites.entries()) {
        await db.runAsync(
          "INSERT INTO routine_series (ligne_id, rang, kg, reps, duree_s, distance_m, type) VALUES (?,?,?,?,?,?,?)",
          [ligne, rang, x.kg, x.reps, x.duree_s, x.distance_m, x.type],
        );
      }
    }
  });
  return id;
}

/**
 * « Retirer de mes routines » (lot AF, règle 5) : une routine qui porte des séances prévues (une programmation, même en pause)
 * est masquée, l'agenda garde ses séances ; sinon elle est supprimée (les séances passées sont conservées, sans routine).
 * Sans transaction propre : appelable dans celle d'un appelant (suppression d'une section).
 */
export async function supprimerRoutine(db: Executeur, routineId: string): Promise<"masquee" | "supprimee"> {
  const p = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM programmations WHERE routine_id = ?", [routineId]);
  if (p?.n) {
    await db.runAsync("UPDATE routines SET visible = 0, maj_le = ? WHERE id = ? AND visible = 1", [Date.now(), routineId]);
    return "masquee";
  }
  await db.runAsync("DELETE FROM routines WHERE id = ?", [routineId]);
  return "supprimee";
}

/** Réordonne les routines : `ids` dans le nouvel ordre. */
export async function reordonnerRoutines(db: Executeur, ids: string[]): Promise<void> {
  await transaction(db, async (db) => {
    for (const [i, id] of ids.entries()) await db.runAsync("UPDATE routines SET ordre = ? WHERE id = ?", [i, id]);
  });
}

/** Ajoute un exercice en fin de routine ; renvoie l'id de la ligne. */
export async function ajouterExerciceARoutine(
  db: Executeur,
  routineId: string,
  exerciceId: string,
  opts: { nbSeries?: number; reposS?: number } = {},
): Promise<string> {
  const id = nouvelId();
  const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM routine_exercices WHERE routine_id = ?", [routineId]);
  await db.runAsync(
    "INSERT INTO routine_exercices (id, routine_id, exercice_id, position, nb_series, repos_s) VALUES (?,?,?,?,?,?)",
    [id, routineId, exerciceId, (m?.m ?? -1) + 1, opts.nbSeries ?? 3, opts.reposS ?? 120],
  );
  await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), routineId]);
  return id;
}

/** Ressenti visé d'une ligne de routine (planche exercices-perso, D6) : réserve 0 (Max) à 3 (Facile), null = aucun. */
export async function definirRirLigne(db: Executeur, ligneId: string, rir: number | null): Promise<void> {
  await db.runAsync("UPDATE routine_exercices SET rir = ? WHERE id = ?", [rir, ligneId]);
}

/** Modifie une ligne de routine (séries, repos, mode plage de répétitions, tempo). Pour un superset, le repos du groupe est celui de sa dernière ligne. */
export async function modifierLigneRoutine(
  db: Executeur,
  ligneId: string,
  patch: { nbSeries?: number; reposS?: number; plageReps?: boolean; tempo?: string | null },
): Promise<void> {
  const l = await db.getFirstAsync<RoutineExercice>("SELECT * FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l) return;
  const nb = patch.nbSeries ?? l.nb_series;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE routine_exercices SET nb_series = ?, repos_s = ?, plage_reps = ?, tempo = ? WHERE id = ?", [
      nb,
      patch.reposS ?? l.repos_s,
      patch.plageReps === undefined ? l.plage_reps : patch.plageReps ? 1 : 0,
      patch.tempo === undefined ? l.tempo : patch.tempo,
      ligneId,
    ]);
    // Repasser en « répétitions » efface les bornes hautes.
    if (patch.plageReps === false) {
      await db.runAsync("UPDATE routine_series SET reps_max = NULL WHERE ligne_id = ?", [ligneId]);
      await db.runAsync("DELETE FROM routine_series WHERE ligne_id = ? AND type = 'normale' AND kg IS NULL AND reps IS NULL AND duree_s IS NULL AND distance_m IS NULL", [ligneId]);
    }
    // Les cibles des séries retirées partent avec elles.
    await db.runAsync("DELETE FROM routine_series WHERE ligne_id = ? AND rang >= ?", [ligneId, nb]);
  });
}

/**
 * Charge et/ou répétitions visées pour la série `rang` (0 = première) d'une ligne de routine.
 * `null` efface le champ (repris de la dernière séance) ; un champ absent du patch est conservé.
 */
export async function definirCibleSerie(
  db: Executeur,
  ligneId: string,
  rang: number,
  patch: { kg?: number | null; reps?: number | null; repsMax?: number | null; dureeS?: number | null; distanceM?: number | null },
): Promise<void> {
  const l = await db.getFirstAsync<{ nb_series: number; routine_id: string }>("SELECT nb_series, routine_id FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l || rang < 0 || rang >= l.nb_series) return;
  const c = await db.getFirstAsync<CibleSerie>("SELECT kg, reps, duree_s, distance_m, type, reps_max FROM routine_series WHERE ligne_id = ? AND rang = ?", [ligneId, rang]);
  const kg = patch.kg === undefined ? (c?.kg ?? null) : patch.kg;
  const reps = patch.reps === undefined ? (c?.reps ?? null) : patch.reps;
  const repsMax = patch.repsMax === undefined ? (c?.reps_max ?? null) : patch.repsMax;
  const dureeS = patch.dureeS === undefined ? (c?.duree_s ?? null) : patch.dureeS;
  const distanceM = patch.distanceM === undefined ? (c?.distance_m ?? null) : patch.distanceM;
  await transaction(db, async (db) => {
    if (kg == null && reps == null && repsMax == null && dureeS == null && distanceM == null && (c?.type ?? "normale") === "normale") {
      await db.runAsync("DELETE FROM routine_series WHERE ligne_id = ? AND rang = ?", [ligneId, rang]);
    } else {
      await db.runAsync(
        `INSERT INTO routine_series (ligne_id, rang, kg, reps, duree_s, distance_m, type, reps_max) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT (ligne_id, rang) DO UPDATE SET kg = excluded.kg, reps = excluded.reps, duree_s = excluded.duree_s, distance_m = excluded.distance_m, reps_max = excluded.reps_max`,
        [ligneId, rang, kg, reps, dureeS, distanceM, c?.type ?? "normale", repsMax],
      );
    }
    await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), l.routine_id]);
  });
}

/** Type de la série `rang` (0 = première) d'une ligne de routine ; recopié dans la séance. 'normale' sans autre cible : la ligne disparaît. */
export async function definirTypeSerie(db: Executeur, ligneId: string, rang: number, type: TypeSerie): Promise<void> {
  const l = await db.getFirstAsync<{ nb_series: number; routine_id: string }>("SELECT nb_series, routine_id FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l || rang < 0 || rang >= l.nb_series) return;
  await transaction(db, async (db) => {
    await db.runAsync(
      `INSERT INTO routine_series (ligne_id, rang, type) VALUES (?,?,?) ON CONFLICT (ligne_id, rang) DO UPDATE SET type = excluded.type`,
      [ligneId, rang, type],
    );
    await db.runAsync(
      "DELETE FROM routine_series WHERE ligne_id = ? AND rang = ? AND type = 'normale' AND kg IS NULL AND reps IS NULL AND reps_max IS NULL AND duree_s IS NULL AND distance_m IS NULL",
      [ligneId, rang],
    );
    await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), l.routine_id]);
  });
}

/** Supprime la série `rang` d'une ligne de routine : les suivantes remontent avec leurs cibles. La dernière série reste. */
export async function supprimerSerieRoutine(db: Executeur, ligneId: string, rang: number): Promise<SerieRoutineRetiree | null> {
  const l = await db.getFirstAsync<{ nb_series: number; routine_id: string }>("SELECT nb_series, routine_id FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l || l.nb_series <= 1 || rang < 0 || rang >= l.nb_series) return null;
  const cible = await db.getFirstAsync<Record<string, unknown>>("SELECT * FROM routine_series WHERE ligne_id = ? AND rang = ?", [ligneId, rang]);
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM routine_series WHERE ligne_id = ? AND rang = ?", [ligneId, rang]);
    // En deux temps, par un détour hors des rangs réels : un décalage direct heurterait la clé (ligne_id, rang).
    await db.runAsync("UPDATE routine_series SET rang = rang + 100000 WHERE ligne_id = ? AND rang > ?", [ligneId, rang]);
    await db.runAsync("UPDATE routine_series SET rang = rang - 100001 WHERE ligne_id = ? AND rang >= 100000", [ligneId]);
    await db.runAsync("UPDATE routine_exercices SET nb_series = nb_series - 1 WHERE id = ?", [ligneId]);
    await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), l.routine_id]);
  });
  return { ligneId, rang, cible };
}

/** Glisser-déposer des séries d'une ligne : `ordre` = anciens rangs dans le nouvel ordre ; chaque cible suit sa série. */
export async function ordonnerSeriesRoutine(db: Executeur, ligneId: string, ordre: number[]): Promise<void> {
  const l = await db.getFirstAsync<{ nb_series: number; routine_id: string }>("SELECT nb_series, routine_id FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l || ordre.length !== l.nb_series || new Set(ordre).size !== ordre.length || ordre.some((r) => r < 0 || r >= l.nb_series)) return;
  await transaction(db, async (db) => {
    // Par un détour hors des rangs réels, comme supprimerSerieRoutine : la clé (ligne_id, rang) ne se heurte jamais.
    for (const [i, ancien] of ordre.entries()) await db.runAsync("UPDATE routine_series SET rang = ? WHERE ligne_id = ? AND rang = ?", [100000 + i, ligneId, ancien]);
    await db.runAsync("UPDATE routine_series SET rang = rang - 100000 WHERE ligne_id = ? AND rang >= 100000", [ligneId]);
    await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), l.routine_id]);
  });
}

/** Série retirée d'une ligne de routine, avec sa cible éventuelle : de quoi la remettre (« Annuler »). */
export interface SerieRoutineRetiree {
  ligneId: string;
  rang: number;
  cible: Record<string, unknown> | null;
}

/** Remet une série retirée à son rang (les suivantes reculent d'un cran), cible comprise. */
export async function restaurerSerieRoutine(db: Executeur, r: SerieRoutineRetiree): Promise<void> {
  const l = await db.getFirstAsync<{ nb_series: number; routine_id: string }>("SELECT nb_series, routine_id FROM routine_exercices WHERE id = ?", [r.ligneId]);
  if (!l) return;
  const rang = Math.min(r.rang, l.nb_series);
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE routine_series SET rang = rang + 100001 WHERE ligne_id = ? AND rang >= ?", [r.ligneId, rang]);
    await db.runAsync("UPDATE routine_series SET rang = rang - 100000 WHERE ligne_id = ? AND rang >= 100000", [r.ligneId]);
    if (r.cible) {
      const cols = Object.keys(r.cible);
      await db.runAsync(
        `INSERT INTO routine_series (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => (c === "rang" ? rang : (r.cible![c] as string | number | null))),
      );
    }
    await db.runAsync("UPDATE routine_exercices SET nb_series = nb_series + 1 WHERE id = ?", [r.ligneId]);
    await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), l.routine_id]);
  });
}

async function recompacter(db: Executeur, routineId: string, ordre: string[]): Promise<void> {
  for (const [i, id] of ordre.entries()) await db.runAsync("UPDATE routine_exercices SET position = ? WHERE id = ?", [i, id]);
  await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), routineId]);
}

/** Retire une ligne ; un superset réduit à une seule ligne est dissous. */
export async function retirerLigneDeRoutine(db: Executeur, ligneId: string): Promise<void> {
  const l = await db.getFirstAsync<RoutineExercice>("SELECT * FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l) return;
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM routine_exercices WHERE id = ?", [ligneId]);
    if (l.groupe_superset !== null) {
      const reste = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM routine_exercices WHERE routine_id = ? AND groupe_superset = ?",
        [l.routine_id, l.groupe_superset],
      );
      if (reste.length < 2) {
        await db.runAsync("UPDATE routine_exercices SET groupe_superset = NULL WHERE routine_id = ? AND groupe_superset = ?", [
          l.routine_id,
          l.groupe_superset,
        ]);
      }
    }
    const lignes = await lireExercicesDeRoutine(db, l.routine_id);
    await recompacter(db, l.routine_id, lignes.map((x) => x.id));
  });
}

/** Réordonne les lignes : `ligneIds` dans le nouvel ordre (glisser-déposer). */
export async function reordonnerRoutine(db: Executeur, routineId: string, ligneIds: string[]): Promise<void> {
  await transaction(db, async (db) => recompacter(db, routineId, ligneIds));
}

/** Écrit d'un coup l'ordre, le superset et le repos de chaque ligne (glisser-déposer : voir `deplacerExercice` / `deplacerBloc`). */
export async function disposerRoutine(db: Executeur, routineId: string, lignes: { id: string; groupe: number | null; repos: number }[]): Promise<void> {
  await transaction(db, async (db) => {
    for (const [i, l] of lignes.entries())
      await db.runAsync("UPDATE routine_exercices SET position = ?, groupe_superset = ?, repos_s = ? WHERE id = ? AND routine_id = ?", [i, l.groupe, l.repos, l.id, routineId]);
    await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), routineId]);
  });
}

/** Monte (-1) ou descend (+1) une ligne d'un cran ; un superset se déplace comme un bloc. */
export async function deplacerLigne(db: Executeur, ligneId: string, sens: -1 | 1): Promise<void> {
  const l = await db.getFirstAsync<RoutineExercice>("SELECT * FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l) return;
  const lignes = await lireExercicesDeRoutine(db, l.routine_id);
  const blocs: RoutineExercice[][] = [];
  for (const x of lignes) {
    const d = blocs[blocs.length - 1];
    if (x.groupe_superset !== null && d && d[0]!.groupe_superset === x.groupe_superset) d.push(x);
    else blocs.push([x]);
  }
  const i = blocs.findIndex((b) => b.some((x) => x.id === ligneId));
  const j = i + sens;
  if (i < 0 || j < 0 || j >= blocs.length) return;
  [blocs[i], blocs[j]] = [blocs[j]!, blocs[i]!];
  await transaction(db, async (db) => recompacter(db, l.routine_id, blocs.flat().map((x) => x.id)));
}

/**
 * Regroupe des lignes en superset : elles deviennent contiguës (à la place de la première), le repos unique
 * `reposTourS` est porté par la dernière, les autres passent à 0 (enchaînées sans repos).
 */
export async function creerSuperset(db: Executeur, routineId: string, ligneIds: string[], reposTourS = 90): Promise<number> {
  if (ligneIds.length < 2) throw new Error("Un superset demande au moins deux exercices");
  const lignes = await lireExercicesDeRoutine(db, routineId);
  const choisies = lignes.filter((x) => ligneIds.includes(x.id));
  if (choisies.length !== new Set(ligneIds).size) throw new Error("Ligne inconnue dans cette routine");
  const m = await db.getFirstAsync<{ m: number | null }>(
    "SELECT MAX(groupe_superset) AS m FROM routine_exercices WHERE routine_id = ?",
    [routineId],
  );
  const groupe = (m?.m ?? 0) + 1;
  const premiere = choisies[0]!.id;
  const ordre: string[] = [];
  for (const x of lignes) {
    if (x.id === premiere) ordre.push(...choisies.map((c) => c.id));
    else if (!ligneIds.includes(x.id)) ordre.push(x.id);
  }
  await transaction(db, async (db) => {
    for (const c of choisies) {
      // Un ancien superset amputé d'une ligne est dissous s'il ne lui en reste qu'une.
      await db.runAsync("UPDATE routine_exercices SET groupe_superset = ?, repos_s = 0 WHERE id = ?", [groupe, c.id]);
    }
    await db.runAsync("UPDATE routine_exercices SET repos_s = ? WHERE id = ?", [reposTourS, choisies[choisies.length - 1]!.id]);
    await dissoudreOrphelins(db, routineId);
    await recompacter(db, routineId, ordre);
  });
  return groupe;
}

async function dissoudreOrphelins(db: Executeur, routineId: string): Promise<void> {
  await db.runAsync(
    `UPDATE routine_exercices SET groupe_superset = NULL
     WHERE routine_id = ? AND groupe_superset IS NOT NULL
       AND (SELECT COUNT(*) FROM routine_exercices o WHERE o.routine_id = routine_exercices.routine_id AND o.groupe_superset = routine_exercices.groupe_superset) < 2`,
    [routineId],
  );
}

/** Sort une ligne de son superset (elle reprend un repos propre) ; le groupe est dissous s'il ne reste qu'une ligne. */
export async function retirerDuSuperset(db: Executeur, ligneId: string, reposS = 120): Promise<void> {
  const l = await db.getFirstAsync<RoutineExercice>("SELECT * FROM routine_exercices WHERE id = ?", [ligneId]);
  if (!l || l.groupe_superset === null) return;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE routine_exercices SET groupe_superset = NULL, repos_s = ? WHERE id = ?", [reposS, ligneId]);
    await dissoudreOrphelins(db, l.routine_id);
  });
}

/** Repos d'un superset : après le tour (porté par sa dernière ligne) et, si donné, entre les exercices (sur chaque ligne). */
export async function definirReposSuperset(db: Executeur, routineId: string, groupe: number, reposTourS: number, transitionS?: number): Promise<void> {
  const l = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM routine_exercices WHERE routine_id = ? AND groupe_superset = ? ORDER BY position",
    [routineId, groupe],
  );
  if (l.length === 0) return;
  await db.runAsync("UPDATE routine_exercices SET repos_s = ? WHERE id = ?", [reposTourS, l[l.length - 1]!.id]);
  if (transitionS != null) await db.runAsync("UPDATE routine_exercices SET repos_transition_s = ? WHERE routine_id = ? AND groupe_superset = ?", [transitionS, routineId, groupe]);
}
