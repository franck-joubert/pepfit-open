import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { SECTION_ROUTINES } from "../migrations";
import { supprimerRoutine } from "./routines";

// Sections de la liste Entraînements (migration 21). L'ordre des routines reste global (routines.ordre) : dans une section,
// elles suivent cet ordre ; une routine déplacée prend le plus grand rang + 1, elle arrive donc en fin de section.

export interface Section {
  id: string;
  nom: string;
  ordre: number;
  repliee: boolean;
}

/** Ce que deviennent les routines d'une section supprimée : déplacées dans une autre section, ou supprimées avec elle. */
export type DevenirRoutines = { vers: string } | "supprimer";

/** Les sections dans leur ordre. */
export async function listerSections(db: Executeur): Promise<Section[]> {
  const l = await db.getAllAsync<{ id: string; nom: string; ordre: number; repliee: number }>(
    "SELECT id, nom, ordre, repliee FROM routine_sections ORDER BY ordre, cree_le, id",
    [],
  );
  return l.map((s) => ({ ...s, repliee: s.repliee === 1 }));
}

/**
 * Range des routines (déjà dans leur ordre) sous leurs sections ; une routine sans section, ou dont la section n'existe plus,
 * va dans la première.
 */
export function grouperParSection<R extends { sectionId: string | null }>(sections: Section[], routines: R[]): { section: Section; routines: R[] }[] {
  const groupes = sections.map((section) => ({ section, routines: [] as R[] }));
  const parId = new Map(groupes.map((g) => [g.section.id, g]));
  for (const r of routines) (parId.get(r.sectionId ?? "") ?? groupes[0])?.routines.push(r);
  return groupes;
}

async function rangSuivant(db: Executeur, table: "routines" | "routine_sections"): Promise<number> {
  const m = await db.getFirstAsync<{ m: number | null }>(`SELECT MAX(ordre) AS m FROM ${table}`, []);
  return (m?.m ?? -1) + 1;
}

/** Crée une section en fin de liste ; renvoie son id. */
export async function creerSection(db: Executeur, nom: string): Promise<string> {
  const id = nouvelId();
  const t = Date.now();
  await db.runAsync("INSERT INTO routine_sections (id, nom, ordre, repliee, cree_le, maj_le) VALUES (?,?,?,0,?,?)", [
    id, nom.trim(), await rangSuivant(db, "routine_sections"), t, t,
  ]);
  return id;
}

/** La section qui reçoit une routine sans section précisée : la première ; « Routines » est recréée s'il n'y en a plus aucune. */
export async function sectionParDefaut(db: Executeur): Promise<string> {
  const s = await db.getFirstAsync<{ id: string }>("SELECT id FROM routine_sections ORDER BY ordre, cree_le, id LIMIT 1", []);
  if (s) return s.id;
  const t = Date.now();
  await db.runAsync("INSERT INTO routine_sections (id, nom, ordre, repliee, cree_le, maj_le) VALUES (?, 'Routines', 0, 0, ?, ?)", [SECTION_ROUTINES, t, t]);
  return SECTION_ROUTINES;
}

/** La section de ce nom (sans tenir compte de la casse ni des espaces autour), créée en fin de liste s'il n'y en a pas. */
export async function sectionParNom(db: Executeur, nom: string): Promise<string> {
  const s = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM routine_sections WHERE lower(trim(nom)) = lower(trim(?)) ORDER BY ordre, cree_le, id LIMIT 1",
    [nom],
  );
  return s?.id ?? creerSection(db, nom);
}

export async function renommerSection(db: Executeur, id: string, nom: string): Promise<void> {
  await db.runAsync("UPDATE routine_sections SET nom = ?, maj_le = ? WHERE id = ?", [nom.trim(), Date.now(), id]);
}

export async function replierSection(db: Executeur, id: string, repliee: boolean): Promise<void> {
  await db.runAsync("UPDATE routine_sections SET repliee = ?, maj_le = ? WHERE id = ?", [repliee ? 1 : 0, Date.now(), id]);
}

/** Réordonne les sections : `ids` dans le nouvel ordre (glisser-déposer). Seules les sections dont le rang change sont écrites. */
export async function reordonnerSections(db: Executeur, ids: string[]): Promise<void> {
  const avant = new Map((await listerSections(db)).map((s) => [s.id, s.ordre]));
  const t = Date.now();
  await transaction(db, async (db) => {
    for (const [i, id] of ids.entries()) {
      if (avant.get(id) !== i) await db.runAsync("UPDATE routine_sections SET ordre = ?, maj_le = ? WHERE id = ?", [i, t, id]);
    }
  });
}

/** Monte (-1) ou descend (1) une section d'un rang (menu ⋯). */
export async function deplacerSection(db: Executeur, id: string, sens: -1 | 1): Promise<void> {
  const ids = (await listerSections(db)).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await reordonnerSections(db, ids);
}

/** Met une routine en fin d'une autre section. */
export async function deplacerRoutineVers(db: Executeur, routineId: string, sectionId: string): Promise<void> {
  await db.runAsync("UPDATE routines SET section_id = ?, ordre = ?, maj_le = ? WHERE id = ?", [
    sectionId, await rangSuivant(db, "routines"), Date.now(), routineId,
  ]);
}

/**
 * Ordre à plat des routines après avoir posé `routineId` au rang `rang` de la section `sectionId` (glisser-déposer).
 * `groupes` : les ids des routines par section, dans l'ordre affiché.
 */
export function placerRoutine(groupes: { sectionId: string; ids: string[] }[], routineId: string, sectionId: string, rang: number): { sectionId: string; ids: string[] }[] {
  const l = groupes.map((g) => ({ sectionId: g.sectionId, ids: g.ids.filter((id) => id !== routineId) }));
  const cible = l.find((g) => g.sectionId === sectionId);
  if (!cible) return groupes;
  cible.ids.splice(Math.max(0, Math.min(rang, cible.ids.length)), 0, routineId);
  return l;
}

/**
 * Pose une routine au rang `rang` de la section `sectionId` (glisser-déposer) : l'ordre global est renuméroté dans l'ordre affiché,
 * seules les routines dont le rang ou la section change sont écrites (et synchronisées).
 */
export async function rangerRoutine(db: Executeur, routineId: string, sectionId: string, rang: number): Promise<void> {
  const routines = await db.getAllAsync<{ id: string; ordre: number; sectionId: string | null }>(
    "SELECT id, ordre, section_id AS sectionId FROM routines ORDER BY ordre, cree_le",
    [],
  );
  const groupes = grouperParSection(await listerSections(db), routines).map((g) => ({ sectionId: g.section.id, ids: g.routines.map((r) => r.id) }));
  const avant = new Map(routines.map((r) => [r.id, r]));
  const t = Date.now();
  await transaction(db, async (db) => {
    let i = 0;
    for (const g of placerRoutine(groupes, routineId, sectionId, rang)) {
      for (const id of g.ids) {
        const r = avant.get(id)!;
        const section = id === routineId ? sectionId : r.sectionId;
        if (r.ordre !== i || section !== r.sectionId) {
          await db.runAsync("UPDATE routines SET ordre = ?, section_id = ?, maj_le = ? WHERE id = ?", [i, section, t, id]);
        }
        i++;
      }
    }
  });
}

/**
 * Supprime une section. Ses routines vont en fin de la section `vers` (dans leur ordre), ou sont retirées avec elle (les séances
 * passées restent, sans routine ; une routine programmée est masquée, l'agenda la garde). Une routine sans section rangée dans la première l'est aussi par cette suppression si c'est la première.
 */
export async function supprimerSection(db: Executeur, id: string, devenir: DevenirRoutines): Promise<void> {
  const premiere = (await listerSections(db))[0]?.id;
  const ou = id === premiere ? "(section_id = ? OR section_id IS NULL OR section_id NOT IN (SELECT id FROM routine_sections))" : "section_id = ?";
  const routines = await db.getAllAsync<{ id: string }>(`SELECT id FROM routines WHERE ${ou} ORDER BY ordre, cree_le`, [id]);
  await transaction(db, async (db) => {
    if (devenir === "supprimer") {
      // Une routine qui porte des séances prévues est masquée, pas supprimée (supprimerRoutine, lot AF).
      for (const r of routines) await supprimerRoutine(db, r.id);
    } else {
      let rang = await rangSuivant(db, "routines");
      const t = Date.now();
      for (const r of routines) await db.runAsync("UPDATE routines SET section_id = ?, ordre = ?, maj_le = ? WHERE id = ?", [devenir.vers, rang++, t, r.id]);
    }
    await db.runAsync("DELETE FROM routine_sections WHERE id = ?", [id]);
  });
}
