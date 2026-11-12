import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { estimerVma, JOURS_ESTIMATION, vmaRetenue } from "../../ecrans/mesures/vma-calc";
import { COURSE } from "../../ecrans/lanceur-sports";
import { lireSuivi } from "./suivi-gps";
import { TYPE_TEST_VMA } from "./zones-fc";

// VMA (NOTES-VMA.md, planche vma-vo2max validée le 29/10) : les tests VMA et l'estimation de chaque course GPS, gardés dans
// mesure_corps (locale, comme le tracé) : « vma_test » (valeur = distance des 6 min, origine = la séance) et « vma_course »
// (valeur = VMA estimée de la course, 0 si aucune portion n'a été courue à fond, origine = la séance). L'estimation d'une
// course se calcule une fois (à la fin du suivi, sinon à la première lecture) : les cartes ne relisent pas les tracés.

const JOUR = 86_400_000;
export const TYPE_VMA_COURSE = "vma_course";
/** Courses dont on garde l'estimation (le graphique « 1 an ») ; la VMA estimée, elle, ne lit que les 90 derniers jours. */
export const JOURS_HISTORIQUE_VMA = 365;

export interface TestVmaLu {
  date: number;
  distanceM: number;
  seanceId: string | null;
}

/** Tests VMA, du plus ancien au plus récent (ceux dont la séance a été supprimée ne comptent plus). */
export async function lireTestsVma(db: Executeur): Promise<TestVmaLu[]> {
  const l = await db.getAllAsync<{ date: number; valeur: number; origine: string | null }>(
    "SELECT m.date, m.valeur, m.origine FROM mesure_corps m WHERE m.type = ? AND (m.origine IS NULL OR EXISTS (SELECT 1 FROM seances s WHERE s.id = m.origine)) ORDER BY m.date",
    [TYPE_TEST_VMA],
  );
  return l.map((x) => ({ date: x.date, distanceM: x.valeur, seanceId: x.origine }));
}

/** Le test VMA d'une séance (la fin d'un suivi repris le remplace). */
export async function enregistrerTestVma(db: Executeur, seanceId: string, date: number, distanceM: number, maintenant = Date.now()): Promise<void> {
  await db.runAsync("DELETE FROM mesure_corps WHERE type = ? AND origine = ?", [TYPE_TEST_VMA, seanceId]);
  await db.runAsync("INSERT OR REPLACE INTO mesure_corps (id, type, date, valeur, source, origine, cree_le) VALUES (?,?,?,?,?,?,?)", [
    nouvelId(), TYPE_TEST_VMA, date, Math.round(distanceM), "pepfit", seanceId, maintenant,
  ]);
}

export async function lireTestVmaSeance(db: Executeur, seanceId: string): Promise<TestVmaLu | null> {
  const x = await db.getFirstAsync<{ date: number; valeur: number }>("SELECT date, valeur FROM mesure_corps WHERE type = ? AND origine = ?", [TYPE_TEST_VMA, seanceId]);
  return x ? { date: x.date, distanceM: x.valeur, seanceId } : null;
}

/** Corriger la distance (piste de 400 m : tours et mètres en plus, ou saisie). */
export async function corrigerTestVma(db: Executeur, seanceId: string, distanceM: number): Promise<void> {
  await db.runAsync("UPDATE mesure_corps SET valeur = ? WHERE type = ? AND origine = ?", [Math.round(distanceM), TYPE_TEST_VMA, seanceId]);
}

/** Oublie l'estimation d'une course (suivi repris puis terminé à nouveau) : elle sera recalculée. */
export async function oublierEstimationCourse(db: Executeur, seanceId: string): Promise<void> {
  await db.runAsync("DELETE FROM mesure_corps WHERE type = ? AND origine = ?", [TYPE_VMA_COURSE, seanceId]);
}

/** Calcule l'estimation des courses GPS de l'année qui n'en ont pas encore. `fcMax` : pour écarter les portions pas à fond. */
export async function majEstimationsCourses(db: Executeur, fcMax: number, maintenant = Date.now()): Promise<number> {
  const l = await db.getAllAsync<{ id: string; debut: number }>(
    `SELECT s.id, s.debut FROM seances s JOIN suivi_seance ss ON ss.seance_id = s.id
     WHERE ss.mode = 'course' AND s.debut >= ?
       AND EXISTS (SELECT 1 FROM seance_exercices se WHERE se.seance_id = s.id AND se.exercice_id = ?)
       AND NOT EXISTS (SELECT 1 FROM mesure_corps m WHERE m.type = ? AND m.origine = s.id)`,
    [maintenant - JOURS_HISTORIQUE_VMA * JOUR, COURSE, TYPE_VMA_COURSE],
  );
  for (const c of l) {
    const s = await lireSuivi(db, c.id);
    const e = s ? estimerVma([{ id: c.id, date: c.debut, points: s.points, fc: s.fc }], fcMax, c.debut) : null;
    await db.runAsync("INSERT OR REPLACE INTO mesure_corps (id, type, date, valeur, source, origine, cree_le) VALUES (?,?,?,?,?,?,?)", [
      nouvelId(), TYPE_VMA_COURSE, c.debut, e ? Math.round(e.vma * 100) / 100 : 0, "pepfit", c.id, maintenant,
    ]);
  }
  return l.length;
}

/** Estimations des courses depuis `depuis` (celles qui ont une portion à fond, hors tests VMA : le test fait déjà foi), de la plus
 *  ancienne à la plus récente. */
export async function lireEstimationsCourses(db: Executeur, depuis: number): Promise<{ date: number; vma: number; seanceId: string }[]> {
  const l = await db.getAllAsync<{ date: number; valeur: number; origine: string }>(
    `SELECT m.date, m.valeur, m.origine FROM mesure_corps m JOIN seances s ON s.id = m.origine
     WHERE m.type = ? AND m.valeur > 0 AND m.date >= ? AND NOT EXISTS (SELECT 1 FROM mesure_corps t WHERE t.type = ? AND t.origine = m.origine) ORDER BY m.date`,
    [TYPE_VMA_COURSE, depuis, TYPE_TEST_VMA],
  );
  return l.map((x) => ({ date: x.date, vma: x.valeur, seanceId: x.origine }));
}

/** Courses GPS lues pour l'estimation (90 derniers jours), qu'elles aient donné une portion à fond ou non. */
export async function compterCoursesEstimees(db: Executeur, depuis: number): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM mesure_corps m JOIN seances s ON s.id = m.origine WHERE m.type = ? AND m.date >= ? AND NOT EXISTS (SELECT 1 FROM mesure_corps t WHERE t.type = ? AND t.origine = m.origine)",
    [TYPE_VMA_COURSE, depuis, TYPE_TEST_VMA],
  );
  return r?.n ?? 0;
}

/** VMA connue maintenant (test de moins de 6 mois, sinon la meilleure course des 90 jours), sans recalculer les courses. */
export async function lireVmaCourante(db: Executeur, maintenant = Date.now()): Promise<{ vma: number; estimee: boolean } | null> {
  const [tests, courses] = await Promise.all([lireTestsVma(db), lireEstimationsCourses(db, maintenant - JOURS_ESTIMATION * JOUR)]);
  const meilleure = courses.reduce<(typeof courses)[number] | null>((a, c) => (!a || c.vma > a.vma ? c : a), null);
  const v = vmaRetenue(tests, meilleure, maintenant);
  return v ? { vma: v.vma, estimee: v.source === "estimee" } : null;
}
