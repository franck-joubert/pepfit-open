// Écritures Polar dans la base locale. Polar alimente les calculs comme les autres sources, sans calcul à lui :
//   - séances : une séance Polar enrichit la séance pepfit, Hevy ou Whoop de même famille qui la chevauche (±10 min), sinon
//     devient une séance à son nom (activité du catalogue, picto) ; sa FC va dans seance_fc et son tracé dans suivi_point
//     quand la séance n'en a pas déjà (l'Effort, les kcal, la courbe, la Précision et la FC max les lisent comme ceux d'un
//     capteur). La copie de Polar Flow dans Santé Connect s'efface d'elle-même : une séance pepfit passe toujours devant
//     la séance Santé Connect aux mêmes heures (ecrans/sante-donnees.ts) ;
//   - VFC (RMSSD) et FC de nuit du Nightly Recharge : mesures du corps (source « polar », datées du réveil),
//     qui priment sur Santé Connect à moins de 12 h (db/depots/mesures.ts) et nourrissent la Récupération ;
//   - sommeil, FC continue, pas : tables polar_*, lues par la source Santé fusionnée (polar/source.ts).
import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import { supprimerSeance } from "../db/depots/seances";
import { nomAffiche } from "../db/noms";
import { familleActivite, familleSeance, lireActivites, poserActivite, TOLERANCE_MS } from "../whoop/depot";
import { famillesCompatibles, type ActiviteWhoop, type Famille } from "../whoop/sports";
import { ORIGINE_POLAR, SOURCE_POLAR } from "./constantes";
import { libelleSport, sportWhoop } from "./convertir";
import type { JourConverti, NuitConvertie, RechargeConvertie, SeanceConvertie } from "./types";

const H = 3_600_000;
const PAQUET = 200;

export interface BilanSeances {
  enrichies: number;
  creees: number;
}

/** Séance (pas créée pour Polar) qui chevauche [debut, fin] à ±10 min, de famille compatible ; la plus proche par le début. */
export async function seanceCorrespondante(db: Executeur, debut: number, fin: number, famille: Famille): Promise<string | null> {
  const l = await db.getAllAsync<{ id: string; debut: number }>(
    "SELECT id, debut FROM seances WHERE fin IS NOT NULL AND (source_ref IS NULL OR source_ref NOT LIKE 'polar:%') AND debut < ? AND fin > ?",
    [fin + TOLERANCE_MS, debut - TOLERANCE_MS],
  );
  l.sort((a, b) => Math.abs(a.debut - debut) - Math.abs(b.debut - debut));
  for (const s of l) if (famillesCompatibles(famille, await familleSeance(db, s.id))) return s.id;
  return null;
}

async function creerSeance(db: Executeur, p: SeanceConvertie, a: ActiviteWhoop | undefined, maintenant: number): Promise<string> {
  const id = nouvelId();
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, source_ref, maj_le) VALUES (?,?,?,?,?,?)", [
    id, a ? nomAffiche(a) : libelleSport(p.sport), p.debut, p.fin, `polar:${p.id}`, maintenant,
  ]);
  if (a) await poserActivite(db, id, a, p);
  return id;
}

/** FC de la séance Polar dans seance_fc, si la séance n'en a aucune (un capteur en direct garde la sienne). */
async function poserFc(db: Executeur, seanceId: string, debut: number, fc: SeanceConvertie["fc"]): Promise<boolean> {
  if (!fc.length || (await db.getFirstAsync("SELECT 1 AS x FROM seance_fc WHERE seance_id = ? LIMIT 1", [seanceId]))) return false;
  for (let i = 0; i < fc.length; i += PAQUET) {
    const l = fc.slice(i, i + PAQUET);
    await db.runAsync(
      `INSERT OR IGNORE INTO seance_fc (seance_id, t, s, bpm) VALUES ${l.map(() => "(?,?,?,?)").join(",")}`,
      l.flatMap((x) => [seanceId, x.t, Math.max(0, x.t - debut), x.bpm]),
    );
  }
  return true;
}

/** Tracé GPS de la séance Polar dans suivi_point, si la séance n'en a aucun. */
async function poserTrace(db: Executeur, seanceId: string, debut: number, trace: SeanceConvertie["trace"]): Promise<boolean> {
  if (!trace.length || (await db.getFirstAsync("SELECT 1 AS x FROM suivi_point WHERE seance_id = ? LIMIT 1", [seanceId]))) return false;
  for (let i = 0; i < trace.length; i += PAQUET) {
    const l = trace.slice(i, i + PAQUET);
    await db.runAsync(
      `INSERT OR IGNORE INTO suivi_point (seance_id, t, s, lat, lon, alt_gps) VALUES ${l.map(() => "(?,?,?,?,?,?)").join(",")}`,
      l.flatMap((x) => [seanceId, x.t, Math.max(0, x.t - debut), x.lat, x.lon, x.alt]),
    );
  }
  return true;
}

/**
 * Range les séances Polar. Une déjà connue garde sa séance (celle créée pour elle suit ses heures). Une nouvelle enrichit la
 * séance de même famille qui la chevauche, sinon devient une séance. Rejouable sans doublon. Une séance par transaction.
 */
export async function enregistrerSeances(db: Executeur, l: readonly SeanceConvertie[], maintenant: number = Date.now()): Promise<BilanSeances> {
  const bilan: BilanSeances = { enrichies: 0, creees: 0 };
  if (!l.length) return bilan;
  const activites = await lireActivites(db);
  for (const p of l) {
    if (!(p.fin > p.debut)) continue;
    await transaction(db, async (db) => {
      const connue = await db.getFirstAsync<{ seance_id: string | null; fc_ecrite: number; trace_ecrite: number }>(
        "SELECT seance_id, fc_ecrite, trace_ecrite FROM polar_seance WHERE id = ?",
        [p.id],
      );
      const idSport = sportWhoop(p.sport);
      const a = idSport != null ? activites.get(idSport) : undefined;
      let seanceId = connue?.seance_id ?? null;
      if (!connue) {
        seanceId = await seanceCorrespondante(db, p.debut, p.fin, familleActivite(a));
        if (seanceId) bilan.enrichies++;
        else {
          seanceId = await creerSeance(db, p, a, maintenant);
          bilan.creees++;
        }
      } else if (seanceId) {
        await db.runAsync("UPDATE seances SET debut = ?, fin = ?, maj_le = ? WHERE id = ? AND source_ref = ? AND (debut != ? OR fin != ?)", [
          p.debut, p.fin, maintenant, seanceId, `polar:${p.id}`, p.debut, p.fin,
        ]);
      }
      const fc = (connue?.fc_ecrite ?? 0) === 1 || (seanceId != null && (await poserFc(db, seanceId, p.debut, p.fc)));
      const trace = (connue?.trace_ecrite ?? 0) === 1 || (seanceId != null && (await poserTrace(db, seanceId, p.debut, p.trace)));
      await db.runAsync(
        `INSERT INTO polar_seance (id, debut, fin, sport, kcal, distance_m, fc_moy, fc_max, zones, seance_id, fc_ecrite, trace_ecrite, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET debut = excluded.debut, fin = excluded.fin, sport = excluded.sport, kcal = excluded.kcal, distance_m = excluded.distance_m,
           fc_moy = excluded.fc_moy, fc_max = excluded.fc_max, zones = excluded.zones, seance_id = excluded.seance_id, fc_ecrite = excluded.fc_ecrite,
           trace_ecrite = excluded.trace_ecrite, maj_le = excluded.maj_le`,
        [p.id, p.debut, p.fin, p.sport, p.kcal, p.distanceM, p.fcMoy, p.fcMax, p.zones ? JSON.stringify(p.zones) : null, seanceId, fc ? 1 : 0, trace ? 1 : 0, maintenant],
      );
    });
  }
  return bilan;
}

/** FC (continue, de nuit) dans polar_fc ; un même instant est remplacé. Renvoie le nombre de points écrits. */
export async function enregistrerFc(db: Executeur, points: readonly { t: number; bpm: number }[]): Promise<number> {
  if (!points.length) return 0;
  await transaction(db, async (db) => {
    for (let i = 0; i < points.length; i += PAQUET) {
      const l = points.slice(i, i + PAQUET);
      await db.runAsync(`INSERT OR REPLACE INTO polar_fc (t, bpm) VALUES ${l.map(() => "(?,?)").join(",")}`, l.flatMap((x) => [x.t, x.bpm]));
    }
  });
  return points.length;
}

/**
 * Une mesure Polar d'une nuit : une seule par type à moins de 12 h (la nuit lue d'abord sans son sommeil, datée de 7 h, puis
 * avec, datée du réveil, ne compte pas deux fois) ; la valeur suit Polar. Renvoie le nombre de lignes changées.
 */
async function poserMesure(db: Executeur, type: string, valeur: number, date: number, maintenant: number): Promise<number> {
  await db.runAsync("DELETE FROM mesure_corps WHERE source = ? AND type = ? AND date > ? AND date < ? AND date != ?", [SOURCE_POLAR, type, date - 12 * H, date + 12 * H, date]);
  const r = (await db.runAsync(
    `INSERT INTO mesure_corps (id, type, date, valeur, source, origine, cree_le) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(type, date, source) DO UPDATE SET valeur = excluded.valeur WHERE ABS(valeur - excluded.valeur) > 0.0005`,
    [nouvelId(), type, date, valeur, SOURCE_POLAR, ORIGINE_POLAR, maintenant],
  )) as { changes?: number } | undefined;
  return Number(r?.changes ?? 0);
}

/** 7 h (heure locale) du jour AAAA-MM-JJ : date d'une mesure de nuit dont on n'a pas le réveil. */
const septHeures = (jour: string) => {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(a!, m! - 1, j!, 7).getTime();
};

/**
 * Nuits (sommeil, stades, FC) et Nightly Recharge (respiration comprise), rangés par jour de réveil ; VFC et FC de nuit dans
 * les mesures du corps. Renvoie le nombre de mesures ajoutées ou corrigées.
 */
export async function enregistrerNuits(db: Executeur, nuits: readonly NuitConvertie[], recharges: readonly RechargeConvertie[], maintenant: number = Date.now()): Promise<number> {
  let n = 0;
  await transaction(db, async (db) => {
    for (const x of nuits) {
      await db.runAsync(
        `INSERT INTO polar_nuit (jour, debut, fin, minutes, leger_min, profond_min, paradoxal_min, eveil_min, etapes, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(jour) DO UPDATE SET debut = excluded.debut, fin = excluded.fin, minutes = excluded.minutes, leger_min = excluded.leger_min,
           profond_min = excluded.profond_min, paradoxal_min = excluded.paradoxal_min, eveil_min = excluded.eveil_min, etapes = excluded.etapes, maj_le = excluded.maj_le`,
        [x.jour, x.debut, x.fin, x.minutes, x.phases.leger, x.phases.profond, x.phases.paradoxal, x.phases.eveil, JSON.stringify(x.etapes.map((e) => [e.debut, e.fin, e.type])), maintenant],
      );
    }
    for (const r of recharges) {
      await db.runAsync("UPDATE polar_nuit SET fc_moy = ?, rmssd = ?, respiration = ?, maj_le = ? WHERE jour = ?", [r.fcMoy, r.rmssd, r.respiration, maintenant, r.jour]);
      const fin = nuits.find((x) => x.jour === r.jour)?.fin ?? (await db.getFirstAsync<{ fin: number }>("SELECT fin FROM polar_nuit WHERE jour = ?", [r.jour]))?.fin;
      const date = fin ?? septHeures(r.jour);
      for (const [type, v] of [["vfc", r.rmssd], ["fc", r.fcMoy]] as const) if (v != null) n += await poserMesure(db, type, v, date, maintenant);
    }
  });
  await enregistrerFc(db, nuits.flatMap((x) => x.fc));
  return n;
}

/** Pas et activité de chaque jour : un champ connu remplace l'ancien. */
export async function enregistrerJours(db: Executeur, jours: readonly JourConverti[], maintenant: number = Date.now()): Promise<void> {
  if (!jours.length) return;
  await transaction(db, async (db) => {
    for (const j of jours) {
      await db.runAsync(
        `INSERT INTO polar_jour (jour, pas, kcal, kcal_actives, distance_m, actif_min, maj_le) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(jour) DO UPDATE SET pas = COALESCE(excluded.pas, pas), kcal = COALESCE(excluded.kcal, kcal), kcal_actives = COALESCE(excluded.kcal_actives, kcal_actives),
           distance_m = COALESCE(excluded.distance_m, distance_m), actif_min = COALESCE(excluded.actif_min, actif_min), maj_le = excluded.maj_le`,
        [j.jour, j.pas, j.kcal, j.kcalActives, j.distanceM, j.actifMin, maintenant],
      );
    }
  });
}

/**
 * Déconnexion. `garder` : les données importées restent (séances, mesures, nuits, FC, pas), seuls l'état de la connexion
 * et les curseurs partent. Sinon tout ce qui vient de Polar part : séances créées pour lui, FC et tracé qu'il a écrits dans
 * une séance pepfit, mesures, tables polar_*. Les séances pepfit restent, et ce que Polar Flow a mis dans Santé Connect aussi.
 */
export async function purgerPolar(db: Executeur, garder = false): Promise<void> {
  if (!garder) {
    const creees = await db.getAllAsync<{ id: string }>("SELECT id FROM seances WHERE source_ref LIKE 'polar:%'", []);
    for (const s of creees) await supprimerSeance(db, s.id);
  }
  await transaction(db, async (db) => {
    if (!garder) {
      await db.runAsync("DELETE FROM seance_fc WHERE seance_id IN (SELECT seance_id FROM polar_seance WHERE fc_ecrite = 1 AND seance_id IS NOT NULL)", []);
      await db.runAsync("DELETE FROM suivi_point WHERE seance_id IN (SELECT seance_id FROM polar_seance WHERE trace_ecrite = 1 AND seance_id IS NOT NULL)", []);
      await db.runAsync("DELETE FROM polar_seance", []);
      await db.runAsync("DELETE FROM polar_fc", []);
      await db.runAsync("DELETE FROM polar_nuit", []);
      await db.runAsync("DELETE FROM polar_jour", []);
      await db.runAsync("DELETE FROM mesure_corps WHERE source = ?", [SOURCE_POLAR]);
    }
    await db.runAsync("DELETE FROM reglages WHERE cle LIKE 'polar_%'", []);
  });
}
