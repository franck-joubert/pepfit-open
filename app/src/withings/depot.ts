// Écritures Withings dans la base locale : pesées (table pesee) et mesures du corps (mesure_corps, source « withings »).
// Pas de doublon avec Santé Connect ni avec Whoop :
//   - une pesée Withings n'est pas ajoutée si une pesée de n'importe quelle source a le même poids (±0,05 kg) à moins de 12 h
//     (même règle que l'import de Santé Connect, db/depots/pesees.ts, qui à son tour écarte celle-ci) ; une pesée Withings
//     déjà là à la même date suit la valeur corrigée dans Withings ;
//   - une mesure du corps est rangée sous la source « withings » ; à la lecture, Whoop prime sur Withings, et Withings sur
//     Santé Connect, à moins de 12 h pour un même type (db/depots/mesures.ts).
import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import { recalculerPoidsDuCorps } from "../db/depots/recalcul";
import { ORIGINE_WITHINGS, SOURCE_WITHINGS } from "./constantes";
import type { MesureConvertie } from "./types";

const DOUBLON_PESEE_MS = 12 * 3_600_000;

export interface BilanEcriture {
  pesees: number;
  mesures: number;
}

/** Range des mesures converties ; renvoie ce qui a été ajouté ou corrigé. Rejouable sans doublon. */
export async function enregistrerMesures(db: Executeur, l: readonly MesureConvertie[], maintenant: number = Date.now()): Promise<BilanEcriture> {
  const bilan: BilanEcriture = { pesees: 0, mesures: 0 };
  await transaction(db, async (db) => {
    for (const m of l) {
      if (m.genre === "pesee") {
        const meme = await db.getFirstAsync<{ id: string; kg: number }>("SELECT id, kg FROM pesee WHERE date = ? AND origine = ?", [m.date, ORIGINE_WITHINGS]);
        if (meme) {
          if (Math.abs(meme.kg - m.kg) > 0.0005) {
            await db.runAsync("UPDATE pesee SET kg = ? WHERE id = ?", [m.kg, meme.id]);
            bilan.pesees++;
          }
          continue;
        }
        const proche = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pesee WHERE ABS(date - ?) < ? AND ABS(kg - ?) <= 0.05", [m.date, DOUBLON_PESEE_MS, m.kg]);
        if ((proche?.n ?? 0) > 0) continue;
        // « sante_connect » : la table n'admet que « manuel » ou une pesée importée (comme celles de Whoop) ; l'origine dit Withings
        await db.runAsync("INSERT INTO pesee (id, date, kg, source, origine) VALUES (?,?,?,?,?)", [nouvelId(), m.date, m.kg, "sante_connect", ORIGINE_WITHINGS]);
        bilan.pesees++;
        continue;
      }
      const r = (await db.runAsync(
        `INSERT INTO mesure_corps (id, type, date, valeur, source, origine, cree_le) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(type, date, source) DO UPDATE SET valeur = excluded.valeur WHERE ABS(valeur - excluded.valeur) > 0.0005`,
        [nouvelId(), m.type, m.date, m.valeur, SOURCE_WITHINGS, ORIGINE_WITHINGS, maintenant],
      )) as { changes?: number } | undefined;
      bilan.mesures += Number(r?.changes ?? 0);
    }
  });
  // hors de la transaction : le recalcul ouvre la sienne
  if (bilan.pesees) await recalculerPoidsDuCorps(db);
  return bilan;
}

/** Purge à la déconnexion : tout ce qui vient de Withings directement (pesées, mesures, réglages). Ce qui est passé par Santé
 * Connect (origine com.withings.wiscale2) reste : c'est Santé Connect qui l'a apporté. */
export async function purgerWithings(db: Executeur): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM mesure_corps WHERE source = ?", [SOURCE_WITHINGS]);
    await db.runAsync("DELETE FROM pesee WHERE source = 'sante_connect' AND origine = ?", [ORIGINE_WITHINGS]);
    await db.runAsync("DELETE FROM reglages WHERE cle LIKE 'withings_%'", []);
    await db.runAsync("DELETE FROM withings_jour", []);
  });
  await recalculerPoidsDuCorps(db);
}
