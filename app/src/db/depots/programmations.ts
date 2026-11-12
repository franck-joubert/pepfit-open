import type { Exception, Programmation, Regle } from "../../ecrans/planification";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { ecrireReglage, lireReglage } from "./reglages";

// Planification des séances (migration 23) : règles des routines et exceptions par occurrence. Les occurrences, la
// prochaine séance et les manquées se calculent dans ecrans/planification.ts, rien de plus n'est stocké.

interface LigneProg {
  id: string;
  routine_id: string;
  texte: string;
  regle: string;
  actif: number;
  rappel_min: number | null;
  ordre: number;
}

const lireLigne = (l: LigneProg): Programmation => ({
  id: l.id, routineId: l.routine_id, texte: l.texte, regle: JSON.parse(l.regle) as Regle, actif: l.actif === 1, rappelMin: l.rappel_min, ordre: l.ordre,
});

/** Toutes les règles (ou celles d'une routine), dans leur ordre. */
export async function listerProgrammations(db: Executeur, routineId?: string): Promise<Programmation[]> {
  const l = await db.getAllAsync<LigneProg>(
    `SELECT id, routine_id, texte, regle, actif, rappel_min, ordre FROM programmations ${routineId ? "WHERE routine_id = ?" : ""} ORDER BY ordre, cree_le, id`,
    routineId ? [routineId] : [],
  );
  return l.map(lireLigne);
}

export async function listerExceptions(db: Executeur): Promise<Exception[]> {
  const l = await db.getAllAsync<{ programmation_id: string; date_origine: string; type: "retiree" | "decalee"; nouvelle_date: string | null; nouvelle_heure: string | null }>(
    "SELECT programmation_id, date_origine, type, nouvelle_date, nouvelle_heure FROM programmation_exceptions",
    [],
  );
  return l.map((e) => ({ programmationId: e.programmation_id, dateOrigine: e.date_origine, type: e.type, nouvelleDate: e.nouvelle_date, nouvelleHeure: e.nouvelle_heure }));
}

/** Ajoute une règle en fin de liste de sa routine ; elle reprend le rappel des autres règles de la routine. */
export async function ajouterProgrammation(db: Executeur, routineId: string, texte: string, regle: Regle): Promise<string> {
  const id = nouvelId();
  const t = Date.now();
  const m = await db.getFirstAsync<{ m: number | null; r: number | null }>(
    "SELECT MAX(ordre) AS m, (SELECT rappel_min FROM programmations WHERE routine_id = ? LIMIT 1) AS r FROM programmations WHERE routine_id = ?",
    [routineId, routineId],
  );
  await db.runAsync("INSERT INTO programmations (id, routine_id, texte, regle, actif, rappel_min, ordre, cree_le, maj_le) VALUES (?,?,?,?,1,?,?,?,?)", [
    id, routineId, texte.trim(), JSON.stringify(regle), m?.r ?? null, (m?.m ?? -1) + 1, t, t,
  ]);
  return id;
}

/** Interrupteur : éteinte, la règle reste mais ne donne plus aucune date (« En pause »). */
export async function activerProgrammation(db: Executeur, id: string, actif: boolean): Promise<void> {
  await db.runAsync("UPDATE programmations SET actif = ?, maj_le = ? WHERE id = ?", [actif ? 1 : 0, Date.now(), id]);
}

/** Règle réécrite (« Toute la série » décalée) : la règle et son texte régénéré. */
export async function reecrireProgrammation(db: Executeur, id: string, regle: Regle, texte: string): Promise<void> {
  await db.runAsync("UPDATE programmations SET regle = ?, texte = ?, maj_le = ? WHERE id = ?", [JSON.stringify(regle), texte, Date.now(), id]);
}

/** Supprime une règle ; la routine cachée qu'elle portait part avec elle si plus rien ne l'utilise (purgerRoutineCachee). */
export async function supprimerProgrammation(db: Executeur, id: string): Promise<void> {
  const r = await db.getFirstAsync<{ routine_id: string }>("SELECT routine_id FROM programmations WHERE id = ?", [id]);
  await db.runAsync("DELETE FROM programmations WHERE id = ?", [id]);
  if (r) await purgerRoutineCachee(db, r.routine_id);
}

/**
 * Purge d'une routine cachée (lot AF, docs/AGENDA-ROUTINES.md) : le contenu d'une séance prévue, ou une routine retirée de Mes
 * routines qui avait encore des séances prévues, quand plus aucune programmation ne l'utilise. Jamais une routine de Mes
 * routines, d'un programme (plan), ni une routine qui a des séances (l'historique garde son lien). Renvoie vrai si supprimée.
 */
export async function purgerRoutineCachee(db: Executeur, routineId: string): Promise<boolean> {
  const a = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM routines WHERE id = ?", [routineId]);
  await db.runAsync(
    `DELETE FROM routines WHERE id = ? AND visible = 0 AND plan_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM programmations WHERE routine_id = routines.id)
       AND NOT EXISTS (SELECT 1 FROM seances WHERE routine_id = routines.id)`,
    [routineId],
  );
  const b = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM routines WHERE id = ?", [routineId]);
  return (a?.n ?? 0) > (b?.n ?? 0);
}

/** Remet une règle supprimée (Annuler, après la bulle). */
export async function restaurerProgrammation(db: Executeur, p: Programmation): Promise<void> {
  const t = Date.now();
  await db.runAsync(
    "INSERT OR REPLACE INTO programmations (id, routine_id, texte, regle, actif, rappel_min, ordre, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?)",
    [p.id, p.routineId, p.texte, JSON.stringify(p.regle), p.actif ? 1 : 0, p.rappelMin, p.ordre, t, t],
  );
}

/** Rappel propre à la routine (toutes ses règles) : null = celui du profil, 0 = aucun. */
export async function reglerRappelRoutine(db: Executeur, routineId: string, rappelMin: number | null): Promise<void> {
  await db.runAsync("UPDATE programmations SET rappel_min = ?, maj_le = ? WHERE routine_id = ?", [rappelMin, Date.now(), routineId]);
}

/** Une occurrence retirée ou décalée (« Cette séance seulement ») ; remplace l'exception déjà posée sur ce jour. */
export async function poserException(
  db: Executeur,
  programmationId: string,
  dateOrigine: string,
  e: { type: "retiree" } | { type: "decalee"; nouvelleDate: string; nouvelleHeure?: string | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO programmation_exceptions (id, programmation_id, date_origine, type, nouvelle_date, nouvelle_heure, maj_le) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (programmation_id, date_origine) DO UPDATE SET type = excluded.type, nouvelle_date = excluded.nouvelle_date,
       nouvelle_heure = excluded.nouvelle_heure, maj_le = excluded.maj_le`,
    [nouvelId(), programmationId, dateOrigine, e.type, e.type === "decalee" ? e.nouvelleDate : null, e.type === "decalee" ? (e.nouvelleHeure ?? null) : null, Date.now()],
  );
}

export async function retirerException(db: Executeur, programmationId: string, dateOrigine: string): Promise<void> {
  await db.runAsync("DELETE FROM programmation_exceptions WHERE programmation_id = ? AND date_origine = ?", [programmationId, dateOrigine]);
}

// ——— Lieu d'une séance prévue (migration 68, docs/LIEU-SEANCE-FUTURE.md) ———

/** Une séance prévue, vue de sa fiche : son jour (décalage compris), si sa règle se répète, et le lieu choisi pour elle. */
export interface SeancePrevue {
  programmationId: string;
  dateOrigine: string;
  /** Jour où elle tombe : le jour d'origine, ou celui où elle a été décalée. */
  date: string;
  /** Heure de l'exception « décalée » ; null : celle de la règle. */
  heure: string | null;
  repetee: boolean;
  /** undefined : rien de choisi ; null : « Aucun lieu » choisi. */
  lieu: { id: string; nom: string } | null | undefined;
}

/**
 * Lieu choisi pour une occurrence : undefined si rien n'a été choisi (ou si le lieu a disparu), null pour « Aucun lieu »,
 * sinon son identifiant et son nom.
 */
export async function lireLieuPrevu(db: Executeur, programmationId: string, dateOrigine: string): Promise<{ id: string; nom: string } | null | undefined> {
  const l = await db.getFirstAsync<{ lieu_id: string | null; nom: string | null }>(
    "SELECT pl.lieu_id, s.nom FROM programmation_lieux pl LEFT JOIN salle s ON s.id = pl.lieu_id WHERE pl.programmation_id = ? AND pl.date_origine = ?",
    [programmationId, dateOrigine],
  );
  if (!l) return undefined;
  if (l.lieu_id == null) return null;
  return l.nom == null ? undefined : { id: l.lieu_id, nom: l.nom };
}

/** Pose le lieu d'une occurrence (null : « Aucun lieu ») ; remplace celui déjà posé ce jour-là. */
export async function poserLieuPrevu(db: Executeur, programmationId: string, dateOrigine: string, lieuId: string | null): Promise<void> {
  await db.runAsync(
    `INSERT INTO programmation_lieux (id, programmation_id, date_origine, lieu_id, maj_le) VALUES (?,?,?,?,?)
     ON CONFLICT (programmation_id, date_origine) DO UPDATE SET lieu_id = excluded.lieu_id, maj_le = excluded.maj_le`,
    [nouvelId(), programmationId, dateOrigine, lieuId, Date.now()],
  );
}

/** La séance prévue d'une fiche (« programmation|jour d'origine ») ; null si la règle n'existe plus ou si ce jour est retiré. */
export async function lireSeancePrevue(db: Executeur, programmationId: string, dateOrigine: string): Promise<SeancePrevue | null> {
  const p = await db.getFirstAsync<{ regle: string; type: string | null; nouvelle_date: string | null; nouvelle_heure: string | null }>(
    `SELECT p.regle, e.type, e.nouvelle_date, e.nouvelle_heure FROM programmations p
     LEFT JOIN programmation_exceptions e ON e.programmation_id = p.id AND e.date_origine = ?
     WHERE p.id = ?`,
    [dateOrigine, programmationId],
  );
  if (!p || p.type === "retiree") return null;
  const regle = JSON.parse(p.regle) as Regle;
  return {
    programmationId,
    dateOrigine,
    date: p.type === "decalee" && p.nouvelle_date ? p.nouvelle_date : dateOrigine,
    heure: p.type === "decalee" ? p.nouvelle_heure : null,
    repetee: regle.freq !== "unique",
    lieu: await lireLieuPrevu(db, programmationId, dateOrigine),
  };
}

// ——— Réglages (Profil › Réglages › Séance) ———

export const HEURE_DEFAUT = "18:00";
export const RAPPEL_DEFAUT_MIN = 30;
/** Valeurs de la roue « Rappel avant la séance ». */
export const RAPPELS_MIN = [0, 5, 10, 15, 30, 45, 60, 120] as const;

export async function lireReglagesPlanif(db: Executeur): Promise<{ heureDefaut: string; rappelDefautMin: number }> {
  const h = await lireReglage(db, "planif_heure_defaut");
  const r = await lireReglage(db, "planif_rappel_min");
  return {
    heureDefaut: h && /^\d{2}:\d{2}$/.test(h) ? h : HEURE_DEFAUT,
    rappelDefautMin: r != null && (RAPPELS_MIN as readonly number[]).includes(Number(r)) ? Number(r) : RAPPEL_DEFAUT_MIN,
  };
}

export async function ecrireReglagesPlanif(db: Executeur, r: { heureDefaut?: string; rappelDefautMin?: number }): Promise<void> {
  if (r.heureDefaut) await ecrireReglage(db, "planif_heure_defaut", r.heureDefaut);
  if (r.rappelDefautMin != null) await ecrireReglage(db, "planif_rappel_min", String(r.rappelDefautMin));
}

// ——— Réglages d'une séance prévue (migration 90, planche ajout-seance-v2) ———

/** Sport choisi sur la feuille, durée voulue (null : « Définir durée »), séance sans heure (aujourd'hui seulement). */
export interface ReglagesPrevus {
  sport: string | null;
  dureeMin: number | null;
  sansHeure: boolean;
}

/** Réglages d'une programmation ; undefined si elle n'en a pas (séance d'avant le parcours unifié). */
export async function lireReglagesPrevus(db: Executeur, programmationId: string): Promise<ReglagesPrevus | undefined> {
  const r = await db.getFirstAsync<{ sport: string | null; duree_min: number | null; sans_heure: number }>(
    "SELECT sport, duree_min, sans_heure FROM programmation_reglages WHERE programmation_id = ?",
    [programmationId],
  );
  return r ? { sport: r.sport, dureeMin: r.duree_min, sansHeure: r.sans_heure === 1 } : undefined;
}

/**
 * Toutes les règles avec leurs réglages (sport, durée voulue, sans heure) en une seule lecture : le planning n'ajoute ainsi
 * aucune requête (budget de budgets-perf). Les réglages sont par identifiant de programmation.
 */
export async function listerProgrammationsEtReglages(db: Executeur): Promise<{ progs: Programmation[]; reglages: Map<string, ReglagesPrevus> }> {
  const l = await db.getAllAsync<LigneProg & { r_sport: string | null; r_duree: number | null; r_sans: number | null; r_id: string | null }>(
    `SELECT p.id, p.routine_id, p.texte, p.regle, p.actif, p.rappel_min, p.ordre, r.id AS r_id, r.sport AS r_sport, r.duree_min AS r_duree, r.sans_heure AS r_sans
     FROM programmations p LEFT JOIN programmation_reglages r ON r.programmation_id = p.id ORDER BY p.ordre, p.cree_le, p.id`,
    [],
  );
  const reglages = new Map<string, ReglagesPrevus>();
  for (const x of l) if (x.r_id != null) reglages.set(x.id, { sport: x.r_sport, dureeMin: x.r_duree, sansHeure: x.r_sans === 1 });
  return { progs: l.map(lireLigne), reglages };
}

/** Pose les réglages d'une programmation (une ligne) ; la durée est tenue entre 0 et 48 h. */
export async function poserReglagesPrevus(db: Executeur, programmationId: string, r: ReglagesPrevus): Promise<void> {
  const duree = r.dureeMin == null ? null : Math.min(2880, Math.max(0, Math.round(r.dureeMin)));
  await db.runAsync(
    `INSERT INTO programmation_reglages (id, programmation_id, sport, duree_min, sans_heure, maj_le) VALUES (?,?,?,?,?,?)
     ON CONFLICT (programmation_id) DO UPDATE SET sport = excluded.sport, duree_min = excluded.duree_min, sans_heure = excluded.sans_heure, maj_le = excluded.maj_le`,
    [nouvelId(), programmationId, r.sport, duree, r.sansHeure ? 1 : 0, Date.now()],
  );
}
