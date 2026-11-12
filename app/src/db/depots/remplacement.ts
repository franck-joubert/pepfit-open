// « Remplacer l'exercice » et « Alternative » (menu de l'exo en séance) : change l'exercice d'une ligne de la séance en cours.
import { transaction } from "../exclusif";
import { lireActif } from "../../i18n/index";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import type { Exercice, Serie } from "../types";
import { recalculerApresModification } from "./recalcul";
import { rechercherExercices } from "./exercices";

export type RaisonAlternative = "occupe" | "manquant";

export interface OptionsRemplacement {
  /** Les séries validées restent sur l'ancien exercice (défaut). Faux : elles passent au nouvel exercice. Sans effet s'il n'y en a pas. */
  garderSeries?: boolean;
  /** Remplace aussi l'exercice de la ligne de la routine d'origine (défaut : non). */
  routine?: boolean;
  /** Alternative : motif noté sous le nom du nouvel exercice. */
  raison?: RaisonAlternative | null;
}

export interface ResumeRemplacement {
  /** Séries validées de l'ancien exercice. */
  nbValidees: number;
  /** Nom de la routine d'origine si elle contient l'ancien exercice, sinon null. */
  routineNom: string | null;
}

export async function resumeRemplacement(db: Executeur, seanceId: string, exerciceId: string): Promise<ResumeRemplacement> {
  const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE seance_id = ? AND exercice_id = ? AND faite = 1", [seanceId, exerciceId]);
  const r = await db.getFirstAsync<{ nom: string }>(
    `SELECT r.nom FROM seances s JOIN routines r ON r.id = s.routine_id JOIN routine_exercices re ON re.routine_id = r.id AND re.exercice_id = ?
     WHERE s.id = ? LIMIT 1`,
    [exerciceId, seanceId],
  );
  return { nbValidees: n?.n ?? 0, routineNom: r?.nom ?? null };
}

/**
 * Remplace `ancienId` par `nouveauId` dans la séance. Les séries non validées de l'ancien sont refaites, vides, sur le nouveau (même
 * nombre) ; les validées restent sur l'ancien (`garderSeries`) ou passent au nouveau. Sans série validée gardée, la ligne de l'ancien disparaît.
 */
export async function remplacerExercice(db: Executeur, seanceId: string, ancienId: string, nouveauId: string, opts: OptionsRemplacement = {}): Promise<void> {
  if (ancienId === nouveauId) throw new Error("Même exercice");
  const ancien = await db.getFirstAsync<{ position: number; groupe_superset: number | null; repos_s: number; repos_transition_s: number }>(
    "SELECT position, groupe_superset, repos_s, repos_transition_s FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?",
    [seanceId, ancienId],
  );
  if (!ancien) throw new Error("Exercice absent de la séance");
  const present = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?", [seanceId, nouveauId]);
  if ((present?.n ?? 0) > 0) throw new Error("Exercice déjà dans la séance");

  await transaction(db, async (db) => {
    const series = await db.getAllAsync<Serie>("SELECT * FROM series WHERE seance_id = ? AND exercice_id = ? ORDER BY position, id", [seanceId, ancienId]);
    const validees = series.filter((s) => s.faite === 1);
    const vides = series.filter((s) => s.faite !== 1);
    const garder = (opts.garderSeries ?? true) && validees.length > 0;

    let position = ancien.position;
    if (garder) {
      position = ancien.position + 1;
      await db.runAsync("UPDATE seance_exercices SET position = position + 1 WHERE seance_id = ? AND position > ?", [seanceId, ancien.position]);
    }
    await db.runAsync(
      "INSERT INTO seance_exercices (seance_id, exercice_id, position, groupe_superset, repos_s, repos_transition_s, remplace_id, raison_alternative) VALUES (?,?,?,?,?,?,?,?)",
      [seanceId, nouveauId, position, ancien.groupe_superset, ancien.repos_s, ancien.repos_transition_s, ancienId, opts.raison ?? null],
    );

    // Séries vides : refaites sur le nouvel exercice, à la même place dans la séance (au moins une si rien ne passe au nouvel exercice).
    const emplacements = vides.map((s) => s.position);
    if (emplacements.length === 0 && (garder || validees.length === 0)) {
      const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(position) AS m FROM series WHERE seance_id = ?", [seanceId]);
      emplacements.push((m?.m ?? -1) + 1);
    }
    await db.runAsync("DELETE FROM series WHERE seance_id = ? AND exercice_id = ? AND faite = 0", [seanceId, ancienId]);
    for (let i = 0; i < emplacements.length; i++) {
      await db.runAsync(
        "INSERT INTO series (id, seance_id, exercice_id, position, groupe_superset, type) VALUES (?,?,?,?,?,?)",
        [nouvelId(), seanceId, nouveauId, emplacements[i]!, ancien.groupe_superset, vides[i]?.type === "echauffement" ? "echauffement" : "normale"],
      );
    }
    if (!garder && validees.length > 0) await db.runAsync("UPDATE series SET exercice_id = ? WHERE seance_id = ? AND exercice_id = ?", [nouveauId, seanceId, ancienId]);

    if (!garder) {
      await db.runAsync("DELETE FROM notes WHERE type = 'seance' AND seance_id = ? AND exercice_id = ?", [seanceId, ancienId]);
      await db.runAsync("DELETE FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?", [seanceId, ancienId]);
    }

    if (opts.routine) {
      const s = await db.getFirstAsync<{ routine_id: string | null }>("SELECT routine_id FROM seances WHERE id = ?", [seanceId]);
      if (s?.routine_id) {
        await db.runAsync(
          "UPDATE notes SET exercice_id = ? WHERE type = 'routine' AND ligne_id IN (SELECT id FROM routine_exercices WHERE routine_id = ? AND exercice_id = ?)",
          [nouveauId, s.routine_id, ancienId],
        );
        await db.runAsync("UPDATE routine_exercices SET exercice_id = ? WHERE routine_id = ? AND exercice_id = ?", [nouveauId, s.routine_id, ancienId]);
        await db.runAsync("UPDATE routines SET maj_le = ? WHERE id = ?", [Date.now(), s.routine_id]);
      }
    }

    await recalculerApresModification(db, seanceId, [ancienId, nouveauId]);
    await db.runAsync(
      `UPDATE series SET kg = COALESCE(kg, precedent_kg), reps = COALESCE(reps, precedent_reps),
         duree_s = COALESCE(duree_s, precedent_duree_s), distance_m = COALESCE(distance_m, precedent_distance_m)
       WHERE seance_id = ? AND exercice_id = ? AND faite = 0`,
      [seanceId, nouveauId],
    );
  });
}

export interface Alternative {
  exercice: Exercice;
  /** Dernière séance terminée où l'exercice a été fait : date, dernière série validée ; null = jamais fait. */
  derniere: { le: number; kg: number | null; reps: number | null; dureeS: number | null } | null;
}

/**
 * Alternatives à un exercice de la séance : même muscle principal et même catégorie, équipement présent dans la salle de la séance,
 * hors exercices déjà dans la séance. Déjà faits d'abord (le plus récent en premier), puis jamais faits (par nom).
 */
export async function alternativesPour(db: Executeur, seanceId: string, exerciceId: string): Promise<{ faits: Alternative[]; jamais: Alternative[] }> {
  const base = await db.getFirstAsync<{ muscle: string | null; categorie: string | null }>("SELECT muscle, categorie FROM exercices WHERE id = ?", [exerciceId]);
  const seance = await db.getFirstAsync<{ salle_id: string | null }>("SELECT salle_id FROM seances WHERE id = ?", [seanceId]);
  if (!base?.muscle) return { faits: [], jamais: [] };
  const dedans = new Set((await db.getAllAsync<{ exercice_id: string }>("SELECT exercice_id FROM seance_exercices WHERE seance_id = ?", [seanceId])).map((x) => x.exercice_id));
  const candidats = (await rechercherExercices(db, { muscles: [base.muscle], salleId: seance?.salle_id ?? undefined, limite: 1000 })).filter(
    (e) => !dedans.has(e.id) && e.categorie === base.categorie,
  );
  const faits: Alternative[] = [];
  const jamais: Alternative[] = [];
  for (const exercice of candidats) {
    const d = await db.getFirstAsync<{ debut: number; kg: number | null; reps: number | null; duree_s: number | null }>(
      `SELECT se.debut, s.kg, s.reps, s.duree_s FROM series s JOIN seances se ON se.id = s.seance_id
       WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement' AND se.fin IS NOT NULL AND se.id <> ?
       ORDER BY se.debut DESC, s.position DESC LIMIT 1`,
      [exercice.id, seanceId],
    );
    if (d) faits.push({ exercice, derniere: { le: d.debut, kg: d.kg, reps: d.reps, dureeS: d.duree_s } });
    else jamais.push({ exercice, derniere: null });
  }
  faits.sort((a, b) => b.derniere!.le - a.derniere!.le);
  jamais.sort((a, b) => a.exercice.nom.localeCompare(b.exercice.nom, lireActif().langue));
  return { faits, jamais };
}
