import type { Regle } from "../../ecrans/planification";
import { texteRegle, type Langue } from "../../i18n/planif-saisie";
import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import type { TypeProgramme } from "../programmes";
import { ajouterProgrammation, poserException, poserLieuPrevu, poserReglagesPrevus, type ReglagesPrevus } from "./programmations";
import { creerRoutine, dupliquerRoutine, lireOrigine, type LigneRoutine, type OrigineRoutine } from "./routines";

// Agenda ≠ routines (lot AF, 02/11 ; docs/AGENDA-ROUTINES.md). Mes routines est une bibliothèque (routines visibles) ;
// l'agenda, les séances prévues à une date. Une séance prévue pointe sur une routine : une routine de la bibliothèque
// programmée (LIÉE : la modifier modifie ses séances à venir), ou son propre contenu, une routine cachée (visible = 0) créée
// avec elle par un coach, une IA ou soi-même. « Ajouter à mes routines » en fait une COPIE indépendante ; retirer une routine
// de la bibliothèque la masque tant qu'elle a des séances prévues (supprimerRoutine) ; la routine cachée part quand plus rien
// ne l'utilise (purgerRoutineCachee).

/** Une séance pour une date, avec son propre contenu (routine cachée, sauf `dansMesRoutines`), et sa programmation unique. */
export async function creerSeancePrevue(
  db: Executeur,
  s: {
    date: string; heure?: string | null; nom: string; lignes: LigneRoutine[]; origine?: OrigineRoutine; type?: TypeProgramme; dansMesRoutines?: boolean;
    /** Parcours unifié : sport, durée voulue, sans heure (migration 90), et lieu du jour (undefined : rien de choisi). */
    reglages?: ReglagesPrevus;
    lieuId?: string | null;
  },
  langue: Langue,
): Promise<{ routineId: string; programmationId: string }> {
  return transaction(db, async (db) => {
    const routineId = await creerRoutine(db, s.nom, s.lignes, undefined, { type: s.type, visible: s.dansMesRoutines === true, origine: s.origine ?? "moi" });
    const regle: Regle = { freq: "unique", intervalle: 1, jours: [], date: s.date, heure: s.heure ?? null, debut: s.date };
    const programmationId = await ajouterProgrammation(db, routineId, texteRegle(regle, langue), regle);
    if (s.reglages) await poserReglagesPrevus(db, programmationId, s.reglages);
    if (s.lieuId !== undefined) await poserLieuPrevu(db, programmationId, s.date, s.lieuId);
    return { routineId, programmationId };
  });
}

/**
 * « Ajouter à mes routines » sur une séance prévue : une copie visible, à soi, sous le même nom, jamais liée à la séance (modifier
 * l'une ne touche pas l'autre). Renvoie l'id de la copie, ou null si la routine n'existe plus.
 */
export function ajouterAMesRoutines(db: Executeur, routineId: string): Promise<string | null> {
  return transaction(db, async (db) => {
    const r = await db.getFirstAsync<{ nom: string }>("SELECT nom FROM routines WHERE id = ?", [routineId]);
    return r ? dupliquerRoutine(db, routineId, { nom: r.nom, visible: true, origine: "moi" }) : null;
  });
}

/** Une séance prévue a son propre contenu quand sa routine n'est pas dans Mes routines (cachée, ou d'un programme). */
export const contenuPropre = (r: { visible: boolean; planId: string | null } | undefined) => !!r && (!r.visible || r.planId != null);

/**
 * Retouche d'une seule occurrence (règle du 02/11) : l'occurrence `dateOrigine` de la programmation reçoit son propre
 * contenu, une copie cachée de la routine posée ce jour-là à la même heure (règle unique marquée `remplace`), et l'occurrence
 * d'origine est retirée par une exception. Modifier ensuite la routine programmée ne la touche plus. Une séance qui a déjà son
 * propre contenu (routine cachée, une seule règle unique) est rendue telle quelle. Renvoie la routine à retoucher.
 */
export function personnaliserOccurrence(db: Executeur, programmationId: string, dateOrigine: string, langue: Langue): Promise<{ routineId: string; programmationId: string } | null> {
  return transaction(db, async (db) => {
    const p = await db.getFirstAsync<{ routine_id: string; regle: string; rappel_min: number | null }>("SELECT routine_id, regle, rappel_min FROM programmations WHERE id = ?", [programmationId]);
    if (!p) return null;
    const regle = JSON.parse(p.regle) as Regle;
    const r = await db.getFirstAsync<{ visible: number; plan_id: string | null; origine: string; n: number }>(
      "SELECT visible, plan_id, origine, (SELECT COUNT(*) FROM programmations WHERE routine_id = routines.id) AS n FROM routines WHERE id = ?",
      [p.routine_id],
    );
    if (!r) return null;
    if (r.visible === 0 && r.plan_id == null && regle.freq === "unique" && r.n === 1) return { routineId: p.routine_id, programmationId };
    const e = await db.getFirstAsync<{ type: string; nouvelle_date: string | null; nouvelle_heure: string | null }>(
      "SELECT type, nouvelle_date, nouvelle_heure FROM programmation_exceptions WHERE programmation_id = ? AND date_origine = ?",
      [programmationId, dateOrigine],
    );
    if (e?.type === "retiree") return null;
    const date = e?.type === "decalee" && e.nouvelle_date ? e.nouvelle_date : dateOrigine;
    const heure = (e?.type === "decalee" && e.nouvelle_heure) || regle.heure;
    const nom = (await db.getFirstAsync<{ nom: string }>("SELECT nom FROM routines WHERE id = ?", [p.routine_id]))!.nom;
    const copie = await dupliquerRoutine(db, p.routine_id, { nom, visible: false, origine: lireOrigine(r.origine), garderVersion: true });
    if (!copie) return null;
    const unique: Regle = { freq: "unique", intervalle: 1, jours: [], date, heure, debut: date, remplace: { programmationId, date: dateOrigine } };
    const id = await ajouterProgrammation(db, copie, texteRegle(unique, langue), unique);
    if (p.rappel_min != null) await db.runAsync("UPDATE programmations SET rappel_min = ? WHERE id = ?", [p.rappel_min, id]);
    // Le lieu choisi pour ce jour suit la copie (migration 68).
    await db.runAsync(
      "INSERT INTO programmation_lieux (id, programmation_id, date_origine, lieu_id, maj_le) SELECT ?, ?, ?, lieu_id, ? FROM programmation_lieux WHERE programmation_id = ? AND date_origine = ?",
      [nouvelId(), id, date, Date.now(), programmationId, dateOrigine],
    );
    // Sport, durée voulue et « sans heure » suivent aussi (migration 90).
    await db.runAsync(
      "INSERT INTO programmation_reglages (id, programmation_id, sport, duree_min, sans_heure, maj_le) SELECT ?, ?, sport, duree_min, sans_heure, ? FROM programmation_reglages WHERE programmation_id = ?",
      [nouvelId(), id, Date.now(), programmationId],
    );
    await poserException(db, programmationId, dateOrigine, { type: "retiree" });
    return { routineId: copie, programmationId: id };
  });
}

/** L'occurrence d'une règle a-t-elle été retouchée (elle remplace une occurrence d'une autre programmation) ? */
export const estRetouchee = (regle: Regle) => regle.remplace != null;
