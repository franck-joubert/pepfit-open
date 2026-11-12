// La FC minute par minute de chaque séance, pour ses kcal (kcal-seance.ts) : gardée sur le téléphone (réglage local
// « cache_fc_min:<séance> », ni synchronisé, ni sauvegardé, ni exporté) par le calcul de l'Effort (effort-charges.ts), qui lit
// déjà toute la FC de la séance (capteur, Whoop en FC, Santé Connect). La page Énergie la lit dans la requête des séances
// (energie-lot.ts) : aucune lecture d'échantillons sur le chemin d'affichage. Les données brutes restent en base (seance_fc,
// whoop_seance_detail) ; ceci n'est qu'un résumé, refait au besoin (une restauration l'efface, le recalcul de fond le refait).
import type { Executeur } from "../db/executeur";
import { PREFIXE_CACHE } from "../db/depots/reglages";
import type { Sante } from "../natif/sante/types";
import { fcParMinute } from "./kcal-seance";

export const PREFIXE_FC_MINUTES = `${PREFIXE_CACHE}fc_min:`;
/** Forme gardée : un changement la fait refaire. */
const VERSION = 1;

/** La FC minute par minute gardée (0 : minute sans FC) ; null : rien de gardé, illisible ou séance sans FC. */
export function lireFcMinutes(valeur: string | null | undefined): number[] | null {
  if (!valeur) return null;
  try {
    const v = JSON.parse(valeur) as { v: number; fc: number[] | null };
    return v.v === VERSION && Array.isArray(v.fc) ? v.fc : null;
  } catch {
    return null;
  }
}

/** Garde la FC d'une séance minute par minute (null : sans FC, gardé aussi pour ne pas la chercher à chaque passage). */
export async function garderFcMinutes(
  db: Executeur,
  seanceId: string,
  fc: { points: readonly { t: number; bpm: number }[]; debut: number; fin: number } | null,
): Promise<void> {
  const minutes = fc ? fcParMinute(fc.points, fc.debut, fc.fin) : null;
  const valeur = JSON.stringify({ v: VERSION, fc: minutes && minutes.some((x) => x > 0) ? minutes : null });
  await db
    .runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", [`${PREFIXE_FC_MINUTES}${seanceId}`, valeur])
    .catch((e: unknown) => console.warn("[kcal] fc", e));
}

/** Séances qui n'ont pas encore leur FC gardée (recalcul de fond : une requête). */
export async function seancesSansFcGardee(db: Executeur): Promise<Set<string>> {
  const l = await db
    .getAllAsync<{ id: string }>(
      `SELECT s.id FROM seances s WHERE s.fin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reglages g WHERE g.cle = '${PREFIXE_FC_MINUTES}' || s.id)`,
      [],
    )
    .catch(() => []);
  return new Set(l.map((x) => x.id));
}

// ---- Séances des autres applis (Santé Connect, C11) ------------------------------------------------------------------------
// Une séance enregistrée dans l'appli de la montre (Garmin, Polar, Samsung…) n'a pas de FC chez nous : sans Whoop qui la
// recouvre, ses kcal partaient aux MET. Sa FC est lue une fois sur sa plage, en fond, et gardée comme celle d'une séance
// pepfit ; l'Énergie la lit avec le lot (energie-lot.ts), sans lecture d'échantillons à l'affichage.

/** Clé de la FC gardée d'une séance Santé Connect (même clé que l'activité détectée : son appli et son début). */
export const cleFcSante = (s: { origine: string | null; debut: number }) => `sante:${s.origine ?? "?"}:${s.debut}`;
/** Bornes de clé de toutes les FC gardées des séances Santé Connect (lecture par l'index de reglages). */
export const BORNES_FC_SANTE = [`${PREFIXE_FC_MINUTES}sante:`, `${PREFIXE_FC_MINUTES}sante;`] as const;
/** Marche (79) : déjà dans les pas, pas de kcal de séance. */
const TYPE_MARCHE = 79;
/** Une séance finie depuis moins de 36 h peut encore recevoir sa FC (envoi différé) : relue tant qu'elle n'en a pas. */
const TARDIVE_MS = 36 * 3_600_000;

/**
 * Garde la FC minute par minute des séances des autres applis des `jours` derniers jours (recalcul de fond) : une lecture
 * de FC par séance, une seule fois (une séance récente sans FC est relue). Rend le nombre de séances gardées avec une FC.
 */
export async function garderFcSeancesSante(db: Executeur, sante: Pick<Sante, "seancesSport" | "fcEntre">, maintenant: number = Date.now(), jours = 30): Promise<number> {
  const l = await sante.seancesSport(maintenant - jours * 86_400_000, maintenant).catch(() => null);
  if (!l?.length) return 0;
  const deja = new Map(
    (await db.getAllAsync<{ cle: string; valeur: string }>("SELECT cle, valeur FROM reglages WHERE cle >= ? AND cle < ?", [...BORNES_FC_SANTE])).map((x) => [x.cle, x.valeur]),
  );
  let n = 0;
  for (const s of l) {
    if (s.type === TYPE_MARCHE || s.fin > maintenant) continue;
    const cle = `${PREFIXE_FC_MINUTES}${cleFcSante(s)}`;
    if (deja.has(cle) && (lireFcMinutes(deja.get(cle)) || maintenant - s.fin > TARDIVE_MS)) continue;
    const fc = await sante.fcEntre(s.debut, s.fin).catch(() => null);
    if (fc == null) return n; // FC non autorisée
    await garderFcMinutes(db, cleFcSante(s), fc.length >= 2 ? { points: fc, debut: s.debut, fin: s.fin } : null);
    if (fc.length >= 2) n++;
  }
  return n;
}
