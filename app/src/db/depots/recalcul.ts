import { transaction } from "../exclusif";
import { arrondir2, chargeEffective, e1rmEpley, poidsAvant, volumeSerie } from "../calculs";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { allureSecParKm, compteLePoidsDuCorps, type Nature } from "../natures";
import type { RecordExercice, TypeRecord } from "../types";
import { aUneFamille, familleDe } from "../../ecrans/familles-sports";

interface Ligne {
  id: string;
  seance_id: string;
  type: string;
  kg: number | null;
  reps: number | null;
  duree_s: number | null;
  distance_m: number | null;
  faite: number;
  fait_le: number | null;
  volume: number;
  e1rm: number | null;
  charge_eff: number | null;
  precedent_kg: number | null;
  precedent_reps: number | null;
  precedent_duree_s: number | null;
  precedent_distance_m: number | null;
  debut: number;
  fin: number | null;
}

interface Evenement {
  type: TypeRecord;
  valeur: number;
  serieId: string | null;
  seanceId: string;
  le: number;
  /** Meilleure valeur de la première séance où ce type a une valeur : la référence, pas un record. */
  premier: boolean;
}

/**
 * Un temps n'est un record que pour un exercice (gainage, planche) ou un sport d'endurance : jamais pour un sport et cours, une
 * récupération ni une activité de musculation (« Padel 0:43 · Meilleur temps » ; revue finale du 30/10, n° 2, D4).
 */
export function tempsEstUnRecord(slug: string | null): boolean {
  if (!slug || !aUneFamille(slug)) return true;
  const f = familleDe(slug);
  return f === "dehors" || f === "interieur";
}

/** Exercice tel que le recalcul le lit. */
interface InfoExercice {
  nature: Nature;
  avecTemps: boolean;
  avecCorps: boolean;
  pesees: { date: number; kg: number }[];
}

/** Où en est le parcours de l'historique : séries faites de la dernière séance (« précédent »), meilleures valeurs, records. */
interface Parcours {
  prec: { echauffement: PrecSerie[]; travail: PrecSerie[] };
  meilleur: Map<TypeRecord, number>;
  /** Séance qui a posé la référence de chaque type. */
  reference: Map<TypeRecord, string>;
  evenements: Evenement[];
}

type PrecSerie = Pick<Ligne, "kg" | "reps" | "duree_s" | "distance_m">;

async function lireInfoExercice(db: Executeur, exerciceId: string): Promise<InfoExercice | null> {
  const ex = await db.getFirstAsync<{ nature: Nature; muscle: string | null; slug: string | null }>("SELECT nature, muscle, slug FROM exercices WHERE id = ?", [exerciceId]);
  if (!ex) return null;
  const avecCorps = compteLePoidsDuCorps(ex.nature, ex.muscle);
  const pesees = avecCorps ? await db.getAllAsync<{ date: number; kg: number }>("SELECT date, kg FROM pesee ORDER BY date", []) : [];
  return { nature: ex.nature, avecTemps: tempsEstUnRecord(ex.slug), avecCorps, pesees };
}

/** Plus bas = mieux : l'aide en assisté, l'allure. */
const recordBas = (type: TypeRecord, nature: Nature) => type === "allure" || (type === "charge" && nature === "assiste");

/**
 * Une séance de l'historique (ses séries de l'exercice, dans l'ordre) : met à jour volume, 1RM, charge effective et
 * « précédent » de chaque série qui a changé, et ajoute ses records au parcours.
 */
async function parcourirSeance(db: Executeur, g: Ligne[], ex: InfoExercice, p: Parcours): Promise<void> {
  const { nature, avecCorps, avecTemps, pesees } = ex;
  // Le premier résultat pose la référence ; dans cette première séance, rien n'est un record (D4 : pas de médaille la
  // première fois, même pour 1 min de padel) : la meilleure valeur de la séance remplace la référence.
  const battre = (type: TypeRecord, valeur: number, serieId: string | null, seanceId: string, le: number, bas = false) => {
    const m = p.meilleur.get(type);
    if (m === undefined ? valeur > 0 || (bas && valeur >= 0) : bas ? valeur < m : valeur > m) {
      p.meilleur.set(type, valeur);
      if (m === undefined) p.reference.set(type, seanceId);
      const premier = p.reference.get(type) === seanceId;
      const e = { type, valeur, serieId, seanceId, le, premier };
      const i = premier ? p.evenements.findIndex((x) => x.type === type && x.premier) : -1;
      if (i >= 0) p.evenements[i] = e;
      else p.evenements.push(e);
    }
  };
  let rangE = 0;
  let rangT = 0;
  let volumeSeance = 0;
  let dernierLe = g[0]!.fin ?? g[0]!.debut;
  const faitesE: Ligne[] = [];
  const faitesT: Ligne[] = [];
  for (const l of g) {
    const echauf = l.type === "echauffement";
    const eff = avecCorps ? chargeEffective(nature, l.kg, poidsAvant(pesees, l.fait_le ?? l.debut)) : null;
    const base = avecCorps ? eff : nature === "poids_reps" ? l.kg : null;
    const vol = avecCorps || nature === "poids_reps" ? volumeSerie(base !== null && base > 0 ? base : null, l.reps) : 0;
    const e1 = echauf || !(avecCorps || nature === "poids_reps") ? null : e1rmEpley(base, l.reps);
    const pr = echauf ? p.prec.echauffement[rangE++] : p.prec.travail[rangT++];
    const pKg = pr?.kg ?? null;
    const pReps = pr?.reps ?? null;
    const pDuree = pr?.duree_s ?? null;
    const pDistance = pr?.distance_m ?? null;
    if (
      vol !== l.volume || e1 !== l.e1rm || eff !== l.charge_eff || pKg !== l.precedent_kg || pReps !== l.precedent_reps ||
      pDuree !== l.precedent_duree_s || pDistance !== l.precedent_distance_m
    ) {
      await db.runAsync(
        "UPDATE series SET volume = ?, e1rm = ?, charge_eff = ?, precedent_kg = ?, precedent_reps = ?, precedent_duree_s = ?, precedent_distance_m = ? WHERE id = ?",
        [vol, e1, eff, pKg, pReps, pDuree, pDistance, l.id],
      );
    }
    if (!l.faite) continue;
    (echauf ? faitesE : faitesT).push(l);
    if (echauf) continue;
    const le = l.fait_le ?? l.fin ?? l.debut;
    dernierLe = Math.max(dernierLe, le);
    volumeSeance += vol;
    const kg = l.kg ?? 0;
    switch (nature) {
      case "poids_reps":
        if (kg > 0) {
          battre("charge", kg, l.id, l.seance_id, le);
          if (e1) battre("e1rm", e1, l.id, l.seance_id, le);
          if (vol > 0) battre("volume_serie", vol, l.id, l.seance_id, le);
        } else if ((l.reps ?? 0) > 0) {
          battre("reps", l.reps!, l.id, l.seance_id, le);
        }
        break;
      case "reps": case "leste": case "assiste":
        if ((l.reps ?? 0) > 0) battre("reps", l.reps!, l.id, l.seance_id, le);
        if (nature === "leste" && kg > 0) battre("charge", kg, l.id, l.seance_id, le);
        if (nature === "assiste" && l.kg !== null && (l.reps ?? 0) > 0) battre("charge", kg, l.id, l.seance_id, le, true);
        if (e1) battre("e1rm", e1, l.id, l.seance_id, le);
        if (vol > 0) battre("volume_serie", vol, l.id, l.seance_id, le);
        break;
      case "duree": case "duree_poids":
        if (avecTemps && (l.duree_s ?? 0) > 0) battre("duree", l.duree_s!, l.id, l.seance_id, le);
        if (nature === "duree_poids" && kg > 0) battre("charge", kg, l.id, l.seance_id, le);
        break;
      case "distance_duree": {
        if ((l.distance_m ?? 0) > 0) battre("distance", l.distance_m!, l.id, l.seance_id, le);
        const allure = allureSecParKm(l.distance_m, l.duree_s);
        if (allure !== null) battre("allure", arrondir2(allure), l.id, l.seance_id, le, true);
        break;
      }
      case "poids_distance":
        if (kg > 0) battre("charge", kg, l.id, l.seance_id, le);
        if ((l.distance_m ?? 0) > 0) battre("distance", l.distance_m!, l.id, l.seance_id, le);
        break;
    }
  }
  if (volumeSeance > 0) battre("volume_seance", volumeSeance, null, g[0]!.seance_id, dernierLe);
  if (faitesE.length + faitesT.length > 0) p.prec = { echauffement: faitesE, travail: faitesT };
}

const COLONNES_LIGNE = `s.id, s.seance_id, s.type, s.kg, s.reps, s.duree_s, s.distance_m, s.faite, s.fait_le, s.volume, s.e1rm, s.charge_eff,
            s.precedent_kg, s.precedent_reps, s.precedent_duree_s, s.precedent_distance_m, se.debut, se.fin`;

const INSERER_RECORD = "INSERT INTO records (id, exercice_id, type, valeur, serie_id, seance_id, atteint_le, actuel) VALUES (?,?,?,?,?,?,?,?)";

/**
 * Reconstruit, pour un exercice, tout ce qui dérive des séries : charge effective (D8), volume et 1RM de chaque série,
 * « précédent », et la table des records. Parcourt l'historique dans l'ordre : une modification passée se répercute sur les séances suivantes.
 * Sans transaction propre : l'appelant ouvre la sienne.
 */
export async function recalculerExercice(db: Executeur, exerciceId: string): Promise<void> {
  const ex = await lireInfoExercice(db, exerciceId);
  if (!ex) return;
  const lignes = await db.getAllAsync<Ligne>(
    `SELECT ${COLONNES_LIGNE}
     FROM series s JOIN seances se ON se.id = s.seance_id
     WHERE s.exercice_id = ?
     ORDER BY se.debut, se.id, s.position, s.id`,
    [exerciceId],
  );
  const groupes: Ligne[][] = [];
  for (const l of lignes) {
    const g = groupes[groupes.length - 1];
    if (g && g[0]!.seance_id === l.seance_id) g.push(l);
    else groupes.push([l]);
  }
  const p: Parcours = { prec: { echauffement: [], travail: [] }, meilleur: new Map(), reference: new Map(), evenements: [] };
  for (const g of groupes) await parcourirSeance(db, g, ex, p);

  // La référence est gardée sans série : elle reste la meilleure valeur (Progression) et « l'ancien record » des cartes de
  // fin, mais tout ce qui compte les records battus (médailles, volet, Accueil, profil) ne lit que les lignes à série.
  await db.runAsync("DELETE FROM records WHERE exercice_id = ?", [exerciceId]);
  const dernier = new Map<TypeRecord, number>();
  p.evenements.forEach((e, i) => dernier.set(e.type, i));
  for (const [i, e] of p.evenements.entries()) {
    await db.runAsync(INSERER_RECORD, [nouvelId(), exerciceId, e.type, e.valeur, e.premier ? null : e.serieId, e.seanceId, e.le, dernier.get(e.type) === i ? 1 : 0]);
  }
}

/**
 * Même résultat que `recalculerExercice`, limité à une séance quand elle est la dernière de l'exercice (la séance en cours,
 * presque toujours) : rien après elle ne dépend de ses séries. On repart de l'état laissé par les séances d'avant, déjà à
 * jour : le « précédent » (séries faites de la dernière séance d'avant) et les meilleures valeurs (records d'avant). Une
 * dizaine de requêtes au lieu de tout l'historique de l'exercice relu et de tous ses records réécrits (audit M6 : la coche
 * attendait 0,3 à 0,5 s de transaction). Une séance suivie d'une autre de l'exercice : recalcul complet.
 * Sans transaction propre : l'appelant ouvre la sienne.
 */
export async function recalculerExerciceSeance(db: Executeur, exerciceId: string, seanceId: string): Promise<void> {
  const se = await db.getFirstAsync<{ debut: number }>("SELECT debut FROM seances WHERE id = ?", [seanceId]);
  if (!se) return recalculerExercice(db, exerciceId);
  // Même ordre que le parcours complet : début, puis identifiant de la séance.
  const apres = await db.getFirstAsync<{ n: number }>(
    `SELECT 1 AS n FROM series s JOIN seances x ON x.id = s.seance_id
     WHERE s.exercice_id = ? AND s.seance_id != ? AND (x.debut > ? OR (x.debut = ? AND x.id > ?)) LIMIT 1`,
    [exerciceId, seanceId, se.debut, se.debut, seanceId],
  );
  if (apres) return recalculerExercice(db, exerciceId);
  const ex = await lireInfoExercice(db, exerciceId);
  if (!ex) return;
  const [lignes, avant, records] = await Promise.all([
    db.getAllAsync<Ligne>(
      `SELECT ${COLONNES_LIGNE} FROM series s JOIN seances se ON se.id = s.seance_id
       WHERE s.exercice_id = ? AND s.seance_id = ? ORDER BY s.position, s.id`,
      [exerciceId, seanceId],
    ),
    // Dernière séance d'avant avec au moins une série faite : son « précédent ».
    db.getFirstAsync<{ id: string }>(
      `SELECT x.id FROM series s JOIN seances x ON x.id = s.seance_id
       WHERE s.exercice_id = ? AND s.faite = 1 AND s.seance_id != ? AND (x.debut < ? OR (x.debut = ? AND x.id < ?))
       ORDER BY x.debut DESC, x.id DESC LIMIT 1`,
      [exerciceId, seanceId, se.debut, se.debut, seanceId],
    ),
    db.getAllAsync<{ id: string; type: TypeRecord; valeur: number; actuel: number }>(
      "SELECT id, type, valeur, actuel FROM records WHERE exercice_id = ? AND seance_id != ?",
      [exerciceId, seanceId],
    ),
  ]);
  const precedentes = avant
    ? await db.getAllAsync<PrecSerie & { type: string }>(
        "SELECT type, kg, reps, duree_s, distance_m FROM series WHERE seance_id = ? AND exercice_id = ? AND faite = 1 ORDER BY position, id",
        [avant.id, exerciceId],
      )
    : [];
  // Meilleure valeur d'avant, par type : la dernière de chaque type (chaque record bat le précédent).
  const meilleurs = new Map<TypeRecord, { id: string; valeur: number }>();
  for (const r of records) {
    const m = meilleurs.get(r.type);
    if (!m || (recordBas(r.type, ex.nature) ? r.valeur < m.valeur : r.valeur > m.valeur)) meilleurs.set(r.type, { id: r.id, valeur: r.valeur });
  }
  const p: Parcours = {
    prec: { echauffement: precedentes.filter((x) => x.type === "echauffement"), travail: precedentes.filter((x) => x.type !== "echauffement") },
    meilleur: new Map([...meilleurs].map(([type, m]) => [type, m.valeur])),
    // Un type qui a déjà une meilleure valeur a sa référence avant : rien de cette séance n'est « la première fois ».
    reference: new Map(),
    evenements: [],
  };
  if (lignes.length) await parcourirSeance(db, lignes, ex, p);

  await db.runAsync("DELETE FROM records WHERE exercice_id = ? AND seance_id = ?", [exerciceId, seanceId]);
  const dernier = new Map<TypeRecord, number>();
  p.evenements.forEach((e, i) => dernier.set(e.type, i));
  for (const [i, e] of p.evenements.entries()) {
    await db.runAsync(INSERER_RECORD, [nouvelId(), exerciceId, e.type, e.valeur, e.premier ? null : e.serieId, e.seanceId, e.le, dernier.get(e.type) === i ? 1 : 0]);
  }
  // Record « actuel » : le dernier de chaque type, celui de cette séance s'il y en a un, sinon le meilleur d'avant.
  for (const r of records) {
    const actuel = !dernier.has(r.type) && meilleurs.get(r.type)?.id === r.id ? 1 : 0;
    if (r.actuel !== actuel) await db.runAsync("UPDATE records SET actuel = ? WHERE id = ?", [actuel, r.id]);
  }
}

/**
 * Série qui porte une référence (record sans série, posé par la première séance) : celle de sa séance qui a la valeur, pour
 * la ligne « Meilleure série » de la Progression. Null si aucune ne l'a (volume de séance).
 */
export async function serieDeReference(db: Executeur, r: Pick<RecordExercice, "exercice_id" | "seance_id" | "type" | "valeur">): Promise<string | null> {
  const l = await db.getAllAsync<{ id: string; kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; e1rm: number | null; volume: number }>(
    "SELECT id, kg, reps, duree_s, distance_m, e1rm, volume FROM series WHERE seance_id = ? AND exercice_id = ? AND faite = 1 AND type != 'echauffement' ORDER BY position, id",
    [r.seance_id, r.exercice_id],
  );
  const valeur = (x: (typeof l)[number]): number | null => {
    switch (r.type) {
      case "e1rm": return x.e1rm;
      case "charge": return x.kg;
      case "reps": return x.reps;
      case "duree": return x.duree_s;
      case "distance": return x.distance_m;
      case "volume_serie": return x.volume;
      case "allure": {
        const a = allureSecParKm(x.distance_m, x.duree_s);
        return a === null ? null : arrondir2(a);
      }
      default: return null;
    }
  };
  return l.find((x) => valeur(x) === r.valeur)?.id ?? null;
}

/** Recalcule volume et nombre de séries validées d'une séance (échauffements exclus). */
export async function recalculerSeance(db: Executeur, seanceId: string): Promise<void> {
  await db.runAsync(
    `UPDATE seances SET
       volume_kg = COALESCE((SELECT SUM(volume) FROM series WHERE seance_id = seances.id AND faite = 1 AND type != 'echauffement'), 0),
       nb_series = (SELECT COUNT(*) FROM series WHERE seance_id = seances.id AND faite = 1 AND type != 'echauffement'),
       maj_le = ?
     WHERE id = ?`,
    [Date.now(), seanceId],
  );
}

/** Idem pour toutes les séances (import en masse). */
export async function recalculerToutesSeances(db: Executeur): Promise<void> {
  await db.runAsync(
    `UPDATE seances SET
       volume_kg = COALESCE((SELECT SUM(volume) FROM series WHERE seance_id = seances.id AND faite = 1 AND type != 'echauffement'), 0),
       nb_series = (SELECT COUNT(*) FROM series WHERE seance_id = seances.id AND faite = 1 AND type != 'echauffement')`,
    [],
  );
}

/** Recalcule tout ce qui dépend d'une série modifiée : les exercices touchés puis la séance. */
export async function recalculerApresModification(db: Executeur, seanceId: string, exerciceIds: string[]): Promise<void> {
  for (const id of new Set(exerciceIds)) await recalculerExerciceSeance(db, id, seanceId);
  await recalculerSeance(db, seanceId);
}

/** Exercices dont la charge effective dépend du poids du corps, et qui ont des séries. */
export async function exercicesAuPoidsDuCorps(db: Executeur): Promise<string[]> {
  const l = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM exercices WHERE nature IN ('reps','leste','assiste') AND EXISTS (SELECT 1 FROM series WHERE exercice_id = exercices.id)",
    [],
  );
  return l.map((e) => e.id);
}

/**
 * Recalcule les exercices dont la charge effective dépend du poids du corps (après une pesée ajoutée, modifiée ou supprimée),
 * puis les séances. Un exercice par transaction (audit M14) : une écriture de l'écran passe entre deux, au lieu d'attendre
 * tout le lot. Appelé dans une transaction, tout s'y fait.
 */
export async function recalculerPoidsDuCorps(db: Executeur): Promise<void> {
  for (const e of await exercicesAuPoidsDuCorps(db)) await transaction(db, (t) => recalculerExercice(t, e));
  await transaction(db, (t) => recalculerToutesSeances(t));
}

/** Recalcule tous les exercices qui ont des séries (après la migration 4, qui change la façon de calculer le volume). */
export async function recalculerTout(db: Executeur): Promise<void> {
  await transaction(db, async (db) => {
    const l = await db.getAllAsync<{ exercice_id: string }>("SELECT DISTINCT exercice_id FROM series", []);
    for (const e of l) await recalculerExercice(db, e.exercice_id);
    await recalculerToutesSeances(db);
  });
}

/** Règle des records en vigueur : 2 = la première séance pose la référence sans record (30/10, D4). */
const VERSION_RECORDS = "2";

/**
 * Après la migration 4, ou quand la règle des records change : un seul recalcul de tout l'historique (charge effective,
 * volumes, records), puis le drapeau est levé et la version notée.
 */
export async function recalculerSiEnAttente(db: Executeur): Promise<boolean> {
  const f = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = 'recalcul_en_attente'", []);
  const v = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = 'records_version'", []);
  if (f?.valeur !== "1" && v?.valeur === VERSION_RECORDS) return false;
  await recalculerTout(db);
  await db.runAsync("DELETE FROM reglages WHERE cle = 'recalcul_en_attente'", []);
  await db.runAsync("INSERT OR REPLACE INTO reglages (cle, valeur) VALUES ('records_version', ?)", [VERSION_RECORDS]);
  return true;
}
