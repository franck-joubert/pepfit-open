import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { ecrireReglage, lireReglage } from "./reglages";

// FC pendant une séance de muscu (planches/suivi-gps § 6, lot 5, migration 40) : le service natif en mode « muscu » écrit la FC
// dans son tampon pendant toute la séance (pause comprise) ; à la fin, elle passe dans seance_fc (comme une course). Les repos
// de la séance (seance_repos) bornent les fenêtres d'effort. Tout est local, hors synchro, comme le tracé d'une course.

/** Le suivi natif qui porte la FC de la séance en cours : le module ne connaît que son identifiant. */
export interface FcMuscuLance {
  suiviId: string;
  seanceId: string;
}

const CLE_EN_COURS = "fc_muscu_en_cours";

export async function lireFcMuscuLance(db: Executeur): Promise<FcMuscuLance | null> {
  const v = await lireReglage(db, CLE_EN_COURS);
  if (!v) return null;
  try {
    return JSON.parse(v) as FcMuscuLance;
  } catch {
    return null;
  }
}

export const ecrireFcMuscuLance = (db: Executeur, l: FcMuscuLance | null) => ecrireReglage(db, CLE_EN_COURS, l ? JSON.stringify(l) : "");

const SEANCE_EN_COURS = "(SELECT id FROM seances WHERE fin IS NULL ORDER BY debut DESC LIMIT 1)";

/**
 * Repos lancé dans la séance en cours, de `debut` à sa fin prévue : un repos encore en cours (remplacé par celui-ci) se ferme à
 * `debut`. Sans séance en cours, rien.
 */
export async function noterRepos(db: Executeur, debut: number, fin: number): Promise<void> {
  await db.runAsync(`UPDATE seance_repos SET fin = ? WHERE seance_id = ${SEANCE_EN_COURS} AND debut < ? AND fin > ?`, [debut, debut, debut]);
  await db.runAsync(`INSERT OR REPLACE INTO seance_repos (seance_id, debut, fin) SELECT id, ?, ? FROM seances WHERE fin IS NULL ORDER BY debut DESC LIMIT 1`, [
    debut,
    Math.max(debut, fin),
  ]);
}

/** Fin réelle du repos en cours (−15 / +15, « Passer ») : le dernier repos de la séance, s'il n'était pas déjà fini à `maintenant`. */
export async function finirRepos(db: Executeur, fin: number, maintenant: number): Promise<void> {
  await db.runAsync(
    `UPDATE seance_repos SET fin = MAX(debut, ?) WHERE seance_id = ${SEANCE_EN_COURS} AND fin > ?
       AND debut = (SELECT MAX(debut) FROM seance_repos WHERE seance_id = ${SEANCE_EN_COURS})`,
    [fin, maintenant],
  );
}

/**
 * FC d'une séance de muscu terminée : les échantillons (heure réelle, `s` compté depuis le début de la séance, pauses comprises)
 * et le nom du capteur. Remplace ce qui y était.
 */
export async function ecrireFcMuscu(db: Executeur, seanceId: string, debut: number, fc: readonly { t: number; bpm: number }[], capteur: string | null): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM seance_fc WHERE seance_id = ?", [seanceId]);
    for (const f of fc) await db.runAsync("INSERT OR IGNORE INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)", [seanceId, f.t, Math.max(0, f.t - debut), f.bpm]);
    await db.runAsync("INSERT OR REPLACE INTO suivi_seance (seance_id, mode, barometre, capteur) VALUES (?, 'muscu', 0, ?)", [seanceId, capteur]);
  });
}

export interface FcMuscuEnregistree {
  /** Heure réelle (ms) et bpm. */
  fc: { t: number; bpm: number }[];
  repos: { debut: number; fin: number }[];
  /** Nom diffusé par le capteur (« WHOOP 4A0… ») ; null s'il n'est pas connu. */
  capteur: string | null;
}

/** FC et repos d'une séance de muscu ; null si la séance n'a pas de FC de muscu (pas de bloc). */
export async function lireFcMuscu(db: Executeur, seanceId: string): Promise<FcMuscuEnregistree | null> {
  const info = await db.getFirstAsync<{ capteur: string | null }>("SELECT capteur FROM suivi_seance WHERE seance_id = ? AND mode = 'muscu'", [seanceId]);
  if (!info) return null;
  const fc = await db.getAllAsync<{ t: number; bpm: number }>("SELECT t, bpm FROM seance_fc WHERE seance_id = ? ORDER BY t", [seanceId]);
  if (!fc.length) return null;
  const repos = await db.getAllAsync<{ debut: number; fin: number }>("SELECT debut, fin FROM seance_repos WHERE seance_id = ? ORDER BY debut", [seanceId]);
  return { fc, repos, capteur: info.capteur };
}
