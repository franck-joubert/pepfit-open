import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";

/**
 * Les notes d'un exercice, autant qu'on veut par type : d'exercice (à chaque fois qu'on le fait), de routine (à chaque séance
 * de la routine) et de séance (cette séance seulement). Table notes (migration 16) ; les colonnes `note` des migrations
 * précédentes ne sont plus lues ni écrites.
 */
export type TypeNote = "exercice" | "routine" | "seance";

/** Où vit la note : l'exercice, plus la ligne de routine (note de routine) ou la séance (note de séance). */
export interface LieuNote {
  exerciceId: string;
  ligneId?: string | null;
  seanceId?: string | null;
}

export interface Note {
  id: string;
  type: TypeNote;
  texte: string;
  position: number;
}

function exiger(v: string | null | undefined, type: TypeNote): string {
  if (!v) throw new Error(`Note ${type} : lieu manquant`);
  return v;
}

/** Colonnes de lieu d'une note selon son type. */
function colonnes(ou: LieuNote, type: TypeNote): { ligne: string | null; seance: string | null } {
  return {
    ligne: type === "routine" ? exiger(ou.ligneId, type) : null,
    seance: type === "seance" ? exiger(ou.seanceId, type) : null,
  };
}

const CHAMPS = "id, type, texte, position";

/** Les notes d'un type à un lieu, dans l'ordre. */
export async function listerNotes(db: Executeur, ou: LieuNote, type: TypeNote): Promise<Note[]> {
  const c = colonnes(ou, type);
  if (type === "exercice") return db.getAllAsync<Note>(`SELECT ${CHAMPS} FROM notes WHERE type = 'exercice' AND exercice_id = ? ORDER BY position, cree_le, id`, [ou.exerciceId]);
  if (type === "routine") return db.getAllAsync<Note>(`SELECT ${CHAMPS} FROM notes WHERE type = 'routine' AND ligne_id = ? ORDER BY position, cree_le, id`, [c.ligne]);
  return db.getAllAsync<Note>(`SELECT ${CHAMPS} FROM notes WHERE type = 'seance' AND seance_id = ? AND exercice_id = ? ORDER BY position, cree_le, id`, [c.seance, ou.exerciceId]);
}

/** Ajoute une note à la suite des autres de son type ; renvoie son id (null si le texte est vide). Sans transaction propre. */
export async function ajouterNote(db: Executeur, ou: LieuNote, type: TypeNote, texte: string | null): Promise<string | null> {
  const t = texte?.trim();
  if (!t) return null;
  const c = colonnes(ou, type);
  const id = nouvelId();
  const maintenant = Date.now();
  const rang =
    type === "exercice"
      ? await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM notes WHERE type = 'exercice' AND exercice_id = ?", [ou.exerciceId])
      : type === "routine"
        ? await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM notes WHERE type = 'routine' AND ligne_id = ?", [c.ligne])
        : await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM notes WHERE type = 'seance' AND seance_id = ? AND exercice_id = ?", [c.seance, ou.exerciceId]);
  await db.runAsync(
    "INSERT INTO notes (id, type, exercice_id, ligne_id, seance_id, texte, position, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, type, ou.exerciceId, c.ligne, c.seance, t, (rang?.m ?? -1) + 1, maintenant, maintenant],
  );
  return id;
}

/** Change le texte d'une note précise ; texte vide = note supprimée. */
export async function modifierNote(db: Executeur, noteId: string, texte: string | null): Promise<void> {
  const t = texte?.trim();
  if (!t) {
    await supprimerNote(db, noteId);
    return;
  }
  await db.runAsync("UPDATE notes SET texte = ?, maj_le = ? WHERE id = ?", [t, Date.now(), noteId]);
}

export async function supprimerNote(db: Executeur, noteId: string): Promise<void> {
  await db.runAsync("DELETE FROM notes WHERE id = ?", [noteId]);
}

/** Change le type d'une note précise : elle passe en fin des notes du nouveau type, au même lieu (ex. séance → exercice). */
export async function changerTypeNote(db: Executeur, ou: LieuNote, noteId: string, vers: TypeNote): Promise<void> {
  const n = await db.getFirstAsync<{ type: TypeNote }>("SELECT type FROM notes WHERE id = ?", [noteId]);
  if (!n || n.type === vers) return;
  const c = colonnes(ou, vers);
  await transaction(db, async (db) => {
    const rang =
      vers === "exercice"
        ? await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM notes WHERE type = 'exercice' AND exercice_id = ?", [ou.exerciceId])
        : vers === "routine"
          ? await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM notes WHERE type = 'routine' AND ligne_id = ?", [c.ligne])
          : await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM notes WHERE type = 'seance' AND seance_id = ? AND exercice_id = ?", [c.seance, ou.exerciceId]);
    await db.runAsync("UPDATE notes SET type = ?, exercice_id = ?, ligne_id = ?, seance_id = ?, position = ?, maj_le = ? WHERE id = ?", [
      vers,
      ou.exerciceId,
      c.ligne,
      c.seance,
      (rang?.m ?? -1) + 1,
      Date.now(),
      noteId,
    ]);
  });
}
