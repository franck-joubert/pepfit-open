import type { SQLiteDatabase } from "expo-sqlite";
import { lireSeance, lireSuiviLance, seanceEnCours } from "../db/api";
import { suivi } from "../natif/suivi";
import { resumerSeance, resumerSuivi, type DonneesBandeau } from "./bandeau-seance";

/** La séance en cours résumée pour la barre flottante, sinon le suivi GPS en cours (29/10), ou null. */
export async function lireBandeau(db: SQLiteDatabase): Promise<DonneesBandeau | null> {
  const en = await seanceEnCours(db);
  const d = en ? await lireSeance(db, en.id) : null;
  if (d) return resumerSeance(d);
  if (!suivi.disponible) return null;
  return resumerSuivi(await lireSuiviLance(db), await suivi.etat(), Date.now());
}
