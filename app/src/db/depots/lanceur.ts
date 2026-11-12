import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { nomAffiche } from "../noms";
import { lieuIci, lieuProbable, lireSports, MUSCULATION, sportsParDefaut, type LieuSitue } from "../../ecrans/lanceur-sports";
import { recalculerApresModification } from "./recalcul";
import { salleParDefaut } from "./salles";

// Lanceur de sports (migration 25) : local, hors synchro. Les règles (défaut, lieu probable) sont dans ecrans/lanceur-sports.

export type Sport = { id: string; nom: string; slug: string | null };

/** Posé au premier passage : ensuite, une table vide veut dire que tout a été retiré. */
const CLE_INIT = "lanceur_init";

/** Sports proposés : les activités du catalogue (sport Whoop) et Musculation, puis les activités perso. */
export async function catalogueSports(db: Executeur): Promise<Sport[]> {
  const l = await db.getAllAsync<{ id: string; nom: string; nom_en: string | null; slug: string | null }>(
    "SELECT id, nom, nom_en, slug FROM exercices WHERE whoop_ids IS NOT NULL OR id = 'cat:musculation'",
    [],
  );
  return l.map((e) => ({ id: e.id, nom: nomAffiche(e), slug: e.slug })).sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Activités faites, de la plus récente à la plus ancienne (D4). */
async function historique(db: Executeur): Promise<string[]> {
  const l = await db.getAllAsync<{ exercice_id: string }>(
    `SELECT se.exercice_id FROM seance_exercices se JOIN seances s ON s.id = se.seance_id JOIN exercices e ON e.id = se.exercice_id
     WHERE e.whoop_ids IS NOT NULL GROUP BY se.exercice_id ORDER BY MAX(s.debut) DESC`,
    [],
  );
  return l.map((x) => x.exercice_id);
}

/**
 * Dernier sport fait, ou null sans historique : l'activité de la séance la plus récente, Musculation si elle n'a que des
 * exercices (sport par défaut d'une séance à plusieurs, recette du 03/11).
 */
export async function dernierSport(db: Executeur): Promise<string | null> {
  const l = await db.getFirstAsync<{ id: string }>(
    `SELECT CASE WHEN e.whoop_ids IS NOT NULL THEN e.id ELSE '${MUSCULATION}' END AS id
     FROM seances s JOIN seance_exercices se ON se.seance_id = s.id JOIN exercices e ON e.id = se.exercice_id
     ORDER BY s.debut DESC, e.whoop_ids IS NULL, se.position LIMIT 1`,
    [],
  );
  return l?.id ?? null;
}

/** Les sports du lanceur, dans l'ordre ; au premier passage, les sports par défaut (D4) sont posés. */
export async function lireLanceur(db: Executeur): Promise<Sport[]> {
  const tous = await catalogueSports(db);
  const parId = new Map(tous.map((s) => [s.id, s]));
  const init = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [CLE_INIT]);
  if (!init && tous.length) {
    await ecrireLanceur(db, sportsParDefaut(new Set(parId.keys()), await historique(db)));
    await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, '1') ON CONFLICT(cle) DO NOTHING", [CLE_INIT]);
  }
  const lignes = await db.getAllAsync<{ exercice_id: string }>("SELECT exercice_id FROM lanceur_sport ORDER BY ordre", []);
  return lireSports(lignes, new Set(parId.keys())).map((id) => parId.get(id)!);
}

/** Remplace les sports du lanceur par `ids`, dans cet ordre. */
export async function ecrireLanceur(db: Executeur, ids: string[]): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM lanceur_sport", []);
    for (const [ordre, id] of ids.entries()) await db.runAsync("INSERT OR IGNORE INTO lanceur_sport (exercice_id, ordre) VALUES (?, ?)", [id, ordre]);
  });
}

/** Premier lieu qui a ce sport dans ses activités habituelles (lieu_activite, migration 26). */
async function lieuHabituel(db: Executeur, exerciceId: string): Promise<string | null> {
  const l = await db.getFirstAsync<{ id: string }>(
    "SELECT s.id FROM lieu_activite la JOIN salle s ON s.id = la.lieu_id WHERE la.exercice_id = ? ORDER BY s.ordre, s.nom LIMIT 1",
    [exerciceId],
  );
  return l?.id ?? null;
}

/**
 * Lieux enregistrés avec leur position, et pour chacun la dernière séance de ce sport (musculation : une séance qui a au moins
 * un exercice qui n'est pas un sport du lanceur) et la dernière séance tout court.
 */
async function lieuxSitues(db: Executeur, exerciceId: string): Promise<LieuSitue[]> {
  const duSport =
    exerciceId === MUSCULATION
      ? "EXISTS (SELECT 1 FROM seance_exercices x JOIN exercices e ON e.id = x.exercice_id WHERE x.seance_id = se.id AND (e.whoop_ids IS NULL OR e.id = ?))"
      : "EXISTS (SELECT 1 FROM seance_exercices x WHERE x.seance_id = se.id AND x.exercice_id = ?)";
  const l = await db.getAllAsync<{ id: string; lat: number; lon: number; perso: number; sport_le: number | null; vu_le: number | null }>(
    `SELECT s.id, s.lat, s.lon, s.source_id IS NULL AS perso,
       (SELECT MAX(se.debut) FROM seances se WHERE se.salle_id = s.id AND ${duSport}) AS sport_le,
       (SELECT MAX(se.debut) FROM seances se WHERE se.salle_id = s.id) AS vu_le
     FROM salle s WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL`,
    [exerciceId],
  );
  return l.map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, perso: x.perso === 1, sportLe: x.sport_le, vuLe: x.vu_le }));
}

/**
 * Lieu probable d'un sport, ou null. Position connue (`ici`) : le lieu où je suis (lieuIci, retour du 29/10) ;
 * sinon, ou aucun lieu à moins de 300 m : la règle D3.
 */
export async function lireLieuProbable(db: Executeur, exerciceId: string, ici: { lat: number; lon: number } | null = null): Promise<string | null> {
  const proche = ici ? lieuIci(await lieuxSitues(db, exerciceId), ici) : null;
  if (proche) return proche;
  const dernier = await db.getFirstAsync<{ salle_id: string }>(
    `SELECT s.salle_id FROM seances s JOIN seance_exercices se ON se.seance_id = s.id
     WHERE se.exercice_id = ? AND s.salle_id IS NOT NULL ORDER BY s.debut DESC LIMIT 1`,
    [exerciceId],
  );
  return lieuProbable(exerciceId, { dernier: dernier?.salle_id ?? null, habituel: await lieuHabituel(db, exerciceId), defaut: await salleParDefaut(db) });
}

/**
 * Séance d'un sport (hors musculation) : l'activité seule, une série de durée à remplir, au lieu choisi. `dureeS` : séance
 * saisie après coup, terminée aussitôt (début = maintenant − durée). Renvoie l'id.
 */
export async function demarrerSeanceSport(db: Executeur, s: { exerciceId: string; titre: string; salleId: string | null; dureeS?: number }): Promise<string> {
  const id = nouvelId();
  const fin = Date.now();
  const debut = s.dureeS ? fin - s.dureeS * 1000 : fin;
  await transaction(db, async (db) => {
    await db.runAsync("INSERT INTO seances (id, routine_id, titre, debut, fin, salle_id, maj_le) VALUES (?,?,?,?,?,?,?)", [
      id, null, s.titre, debut, s.dureeS ? fin : null, s.salleId, fin,
    ]);
    await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,0)", [id, s.exerciceId]);
    await db.runAsync(
      "INSERT INTO series (id, seance_id, exercice_id, position, type, duree_s, faite, fait_le) VALUES (?,?,?,0,'normale',?,?,?)",
      [nouvelId(), id, s.exerciceId, s.dureeS ?? null, s.dureeS ? 1 : 0, s.dureeS ? fin : null],
    );
    await recalculerApresModification(db, id, [s.exerciceId]);
  });
  return id;
}

/**
 * Dernier lieu utilisé pour ce sport (parcours unifié, D14) : le lieu de la séance faite la plus récente de ce sport qui existe
 * encore. null : aucun, ou lieu disparu (la ligne dit « Non défini », sans message). Musculation : une séance qui a au moins un
 * exercice qui n'est pas un sport du lanceur.
 */
export async function dernierLieuDuSport(db: Executeur, exerciceId: string): Promise<{ id: string; nom: string } | null> {
  const duSport =
    exerciceId === MUSCULATION
      ? "EXISTS (SELECT 1 FROM seance_exercices x JOIN exercices e ON e.id = x.exercice_id WHERE x.seance_id = se.id AND (e.whoop_ids IS NULL OR e.id = ?))"
      : "EXISTS (SELECT 1 FROM seance_exercices x WHERE x.seance_id = se.id AND x.exercice_id = ?)";
  const l = await db.getFirstAsync<{ id: string; nom: string }>(
    `SELECT s.id, s.nom FROM seances se JOIN salle s ON s.id = se.salle_id
     WHERE se.fin IS NOT NULL AND ${duSport} ORDER BY se.debut DESC LIMIT 1`,
    [exerciceId],
  );
  return l ?? null;
}
