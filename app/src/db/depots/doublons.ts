import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { CORRESPONDANCES_HEVY } from "../../import/correspondances";
import { recalculerExercice, recalculerToutesSeances } from "./recalcul";
import { ecrireReglage, PREFIXE_CACHE } from "./reglages";

interface Paire {
  perso: string;
  cat: string;
  nom_norm: string | null;
}

export type VerdictFusion = { ok: true; seances: number; series: number } | { ok: false; raison: string };

interface Ligne {
  id: string;
  nature: string;
  perso: number;
  nom_norm: string | null;
}

/** Peut-on fusionner `source` dans `cible` ? Refus : même exercice, source non perso, natures différentes avec des séries. */
export async function verifierFusion(db: Executeur, sourceId: string, cibleId: string): Promise<VerdictFusion> {
  if (sourceId === cibleId) return { ok: false, raison: "Un exercice ne peut pas être fusionné avec lui-même." };
  const src = await db.getFirstAsync<Ligne>("SELECT id, nature, perso, nom_norm FROM exercices WHERE id = ?", [sourceId]);
  const cib = await db.getFirstAsync<Ligne>("SELECT id, nature, perso, nom_norm FROM exercices WHERE id = ?", [cibleId]);
  if (!src || !cib) return { ok: false, raison: "Exercice introuvable." };
  if (!src.perso) return { ok: false, raison: "Seul un exercice perso peut être fusionné dans un autre." };
  const n = await db.getFirstAsync<{ series: number; seances: number }>(
    "SELECT COUNT(*) AS series, COUNT(DISTINCT seance_id) AS seances FROM series WHERE exercice_id = ?",
    [sourceId],
  );
  const series = n?.series ?? 0;
  if (src.nature !== cib.nature && series > 0) {
    return { ok: false, raison: "Les deux exercices ne se mesurent pas de la même façon : leurs séries seraient mal lues." };
  }
  return { ok: true, seances: n?.seances ?? 0, series };
}

/** Déplace tout ce qui tient à `perso` vers `cat`, supprime `perso`. À appeler dans une transaction, après vérification. */
async function deplacer(db: Executeur, perso: string, cat: string, nomNorm: string | null): Promise<void> {
  const t = Date.now();
  await db.runAsync("UPDATE series SET exercice_id = ? WHERE exercice_id = ?", [cat, perso]);
  await db.runAsync("UPDATE routine_exercices SET exercice_id = ? WHERE exercice_id = ?", [cat, perso]);
  await db.runAsync(
    `INSERT INTO seance_exercices (seance_id, exercice_id, position, groupe_superset, repos_s, note, tempo)
     SELECT seance_id, ?, position, groupe_superset, repos_s, note, tempo FROM seance_exercices p
     WHERE exercice_id = ? AND NOT EXISTS (SELECT 1 FROM seance_exercices c WHERE c.seance_id = p.seance_id AND c.exercice_id = ?)`,
    [cat, perso, cat],
  );
  await db.runAsync(
    `UPDATE seance_exercices SET
       note = COALESCE(NULLIF(note, ''), (SELECT p.note FROM seance_exercices p WHERE p.seance_id = seance_exercices.seance_id AND p.exercice_id = ?)),
       tempo = COALESCE(tempo, (SELECT p.tempo FROM seance_exercices p WHERE p.seance_id = seance_exercices.seance_id AND p.exercice_id = ?))
     WHERE exercice_id = ? AND seance_id IN (SELECT seance_id FROM seance_exercices WHERE exercice_id = ?)`,
    [perso, perso, cat, perso],
  );
  await db.runAsync("DELETE FROM seance_exercices WHERE exercice_id = ?", [perso]);
  await db.runAsync(
    "INSERT OR IGNORE INTO appareil_exercice (appareil_id, exercice_id) SELECT appareil_id, ? FROM appareil_exercice WHERE exercice_id = ?",
    [cat, perso],
  );
  await db.runAsync("DELETE FROM appareil_exercice WHERE exercice_id = ?", [perso]);
  await db.runAsync(
    "INSERT OR IGNORE INTO lieu_activite (lieu_id, exercice_id, ordre) SELECT lieu_id, ?, ordre FROM lieu_activite WHERE exercice_id = ?",
    [cat, perso],
  );
  await db.runAsync("DELETE FROM lieu_activite WHERE exercice_id = ?", [perso]);
  await db.runAsync("DELETE FROM records WHERE exercice_id = ?", [perso]);
  await db.runAsync("UPDATE exercice_alias SET exercice_id = ? WHERE exercice_id = ?", [cat, perso]);
  if (nomNorm) await db.runAsync("INSERT OR REPLACE INTO exercice_alias (nom_norm, exercice_id, source) VALUES (?,?,'fusion')", [nomNorm, cat]);
  await db.runAsync(
    "UPDATE exercices SET note = (SELECT note FROM exercices WHERE id = ?), maj_le = ? WHERE id = ? AND (note IS NULL OR note = '')",
    [perso, t, cat],
  );
  // Notes (table notes, migration 16) : rattachées à la cible avant la suppression de la source (cascade).
  await db.runAsync("UPDATE notes SET exercice_id = ?, maj_le = ? WHERE exercice_id = ?", [cat, t, perso]);
  await db.runAsync("DELETE FROM exercices WHERE id = ?", [perso]);
  await recalculerExercice(db, cat);
}

/**
 * Fusionne l'exercice perso `sourceId` dans `cibleId` : séries, séances (note, tempo), routines, notes, appareils, alias (source 'fusion')
 * suivent la cible, records recalculés, la source est supprimée. Les clés composées sont déplacées par INSERT + DELETE (et non UPDATE) :
 * les déclencheurs de synchro ne journalisent que la nouvelle clé d'un UPDATE. Lève une erreur si la fusion est refusée (voir verifierFusion).
 */
export async function fusionnerExercices(db: Executeur, sourceId: string, cibleId: string): Promise<void> {
  const v = await verifierFusion(db, sourceId, cibleId);
  if (!v.ok) throw new Error(v.raison);
  const src = await db.getFirstAsync<{ nom_norm: string | null }>("SELECT nom_norm FROM exercices WHERE id = ?", [sourceId]);
  await transaction(db, async (db) => {
    await deplacer(db, sourceId, cibleId, src?.nom_norm ?? null);
    await recalculerToutesSeances(db);
  });
}

/**
 * Rattache au catalogue les exercices perso dont le nom (ou un alias) est celui d'un exercice du catalogue, ou celui d'un nom Hevy de
 * la table de correspondances (correspondances.ts), puis les supprime. Idempotent, sans effet si rien à faire.
 * Un perso de nature différente qui a un historique est laissé tel quel (ses séries seraient mal lues).
 */
/** Ce qui décide des fusions, à la fin du dernier passage : réglage de cache (ni synchronisé ni sauvegardé). */
export const CLE_DOUBLONS_VUS = `${PREFIXE_CACHE}doublons_vus`;

/**
 * Empreinte de tout ce que lit fusionnerDoublons : exercices perso (noms, nature, séries ou pas), leurs alias, la version du
 * catalogue et la table des correspondances Hevy.
 */
async function empreinteDoublons(db: Executeur): Promise<string> {
  const r = await db.getFirstAsync<{ p: string | null; a: string | null; v: string | null }>(
    `SELECT
       (SELECT group_concat(e.id || ':' || COALESCE(e.nom_norm, '') || ':' || COALESCE(e.nom_en_norm, '') || ':' || e.nature || ':'
          || EXISTS (SELECT 1 FROM series s WHERE s.exercice_id = e.id), '|') FROM exercices e WHERE e.perso = 1) AS p,
       (SELECT group_concat(a.exercice_id || ':' || a.nom_norm, '|') FROM exercice_alias a JOIN exercices e ON e.id = a.exercice_id
          WHERE e.perso = 1) AS a,
       (SELECT valeur FROM reglages WHERE cle = 'catalogue_version') AS v`,
    [],
  );
  return `${CORRESPONDANCES_HEVY.size}#${r?.v ?? ""}#${r?.p ?? ""}#${r?.a ?? ""}`;
}

/**
 * Au lancement (db/index.ts) : fusionnerDoublons seulement si un exercice perso, un alias ou le catalogue a changé depuis le
 * dernier passage (docs/AUDIT-PERF.md, M11 : refaite à chaque lancement avant le premier écran).
 */
export async function fusionnerDoublonsSiChange(db: Executeur): Promise<number> {
  const avant = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [CLE_DOUBLONS_VUS]);
  if (avant?.valeur === (await empreinteDoublons(db))) return 0;
  const n = await fusionnerDoublons(db);
  await ecrireReglage(db, CLE_DOUBLONS_VUS, await empreinteDoublons(db));
  return n;
}

export async function fusionnerDoublons(db: Executeur): Promise<number> {
  const paires = await db.getAllAsync<Paire>(
    `SELECT p.id AS perso, c.id AS cat, p.nom_norm AS nom_norm
     FROM exercices p JOIN exercices c ON c.perso = 0 AND c.slug IS NOT NULL
     WHERE p.perso = 1 AND p.nom_norm IS NOT NULL AND (
       c.nom_norm = p.nom_norm
       OR c.nom_en_norm = p.nom_norm
       OR (p.nom_en_norm IS NOT NULL AND c.nom_en_norm = p.nom_en_norm)
       OR EXISTS (SELECT 1 FROM exercice_alias a WHERE a.exercice_id = p.id AND a.nom_norm = c.nom_norm))
       AND (p.nature = c.nature OR NOT EXISTS (SELECT 1 FROM series s WHERE s.exercice_id = p.id))
     GROUP BY p.id ORDER BY p.id`,
    [],
  );
  const faits = new Set(paires.map((p) => p.perso));
  const persos = await db.getAllAsync<Ligne>("SELECT id, nature, perso, nom_norm FROM exercices WHERE perso = 1 AND nom_norm IS NOT NULL", []);
  for (const p of persos) {
    if (faits.has(p.id)) continue;
    const alias = await db.getAllAsync<{ nom_norm: string }>("SELECT nom_norm FROM exercice_alias WHERE exercice_id = ?", [p.id]);
    const slug = [p.nom_norm!, ...alias.map((a) => a.nom_norm)].map((n) => CORRESPONDANCES_HEVY.get(n)).find(Boolean);
    if (!slug) continue;
    const cat = await db.getFirstAsync<{ id: string; nature: string }>("SELECT id, nature FROM exercices WHERE slug = ? AND perso = 0", [slug]);
    if (!cat) continue;
    if (p.nature !== cat.nature) {
      const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE exercice_id = ?", [p.id]);
      if ((n?.n ?? 0) > 0) continue;
    }
    paires.push({ perso: p.id, cat: cat.id, nom_norm: p.nom_norm });
  }
  if (paires.length === 0) return 0;
  await transaction(db, async (db) => {
    for (const { perso, cat, nom_norm } of paires) await deplacer(db, perso, cat, nom_norm);
    await recalculerToutesSeances(db);
  });
  return paires.length;
}
