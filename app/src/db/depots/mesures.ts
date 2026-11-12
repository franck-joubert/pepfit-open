import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { ZONES } from "../../withings/convertir";
import { scansParZone, type ScanZones } from "../../withings/zones";

// Mesures du corps importées de Santé Connect (migration 29, planche sante-energie D8) : la balance (gras, maigre, os,
// eau, métabolisme de base), la VFC et la FC au repos. Le poids reste dans « pesee », les tours dans « mensurations ».

// Taille (cm, 29/10) : Santé Connect (HeightRecord) et Whoop ; la saisie, elle, reste dans « mensurations ». FC max (bpm) :
// Whoop seulement (body_measurement), d'où son absence de la liste importée de Santé Connect.
export const TYPES_MESURE_CORPS = ["gras", "maigre", "os", "eau", "bmr", "vfc", "fc", "taille"] as const;
/** Par zone du corps (Body Scan, types segmentaires 173, 174, 175) : masse grasse, musculaire et non grasse de chaque zone, en kg. */
export type TypeMesureZone = `${"gras" | "muscle" | "maigre"}_zone_${"torse" | "bras_g" | "bras_d" | "jambe_g" | "jambe_d"}`;
/** Lus chez Withings seulement (balance, withings/convertir.ts) : masse grasse et musculaire (kg), eau extra- et
 * intracellulaire (kg), graisse viscérale (indice), pouls debout (bpm), vitesse de l'onde de pouls (m/s), âges vasculaire et
 * métabolique (ans), score de santé nerveuse. */
export type TypeMesureWithings = TypeMesureZone | "gras_kg" | "muscle" | "eau_extra" | "eau_intra" | "visceral" | "fc_debout" | "temp_corps" | "temp_peau" | "vop" | "age_vasculaire" | "age_metabolique" | "score_nerveux";
/** « vma_test », « vma_course » : test VMA et VMA estimée d'une course (origine = la séance ; db/depots/vma.ts). */
export type TypeMesureCorps = (typeof TYPES_MESURE_CORPS)[number] | TypeMesureWithings | "fc_max" | "vma_test" | "vma_course";

export interface MesureCorps {
  id: string;
  type: TypeMesureCorps;
  date: number;
  valeur: number;
  source: string;
  origine: string | null;
}

const COLONNES = "id, type, date, valeur, source, origine";

/** Whoop prime sur Santé Connect (VFC, FC au repos…) : une mesure d'une autre source à moins de 12 h d'une mesure Whoop du même type
 * est écartée (la même nuit ne compte pas deux fois). Withings (balance lue directement) prime de même sur Santé Connect, où
 * l'appli Withings dépose les mêmes pesées : la même mesure ne compte pas deux fois. Polar (VFC et FC de nuit lues directement,
 * polar/depot.ts) prime de même sur Santé Connect. Sans mesure Whoop, Withings ni Polar, rien ne change.
 * La FC au repos que pepfit déduit de la FC de nuit (fc-repos-nuit.ts, source « pepfit ») cède à toute mesure de la même nuit. */
// Bornes de date plutôt que ABS(w.date - date) < 12 h : l'index (type, date, source) sert à la recherche du doublon, au lieu
// d'un parcours de tout le type pour chaque mesure (audit de performance, M10 : 341 ms pour 1 600 lignes sur PC).
const SANS_DOUBLON_WHOOP =
  `AND NOT (source <> 'whoop' AND EXISTS (SELECT 1 FROM mesure_corps w WHERE w.type = mesure_corps.type AND w.date > mesure_corps.date - 43200000 AND w.date < mesure_corps.date + 43200000 AND w.source = 'whoop'))` +
  ` AND NOT (source = 'sante_connect' AND EXISTS (SELECT 1 FROM mesure_corps w WHERE w.type = mesure_corps.type AND w.date > mesure_corps.date - 43200000 AND w.date < mesure_corps.date + 43200000 AND w.source IN ('withings', 'polar')))` +
  ` AND NOT (source = 'pepfit' AND type = 'fc' AND EXISTS (SELECT 1 FROM mesure_corps w WHERE w.type = 'fc' AND w.date > mesure_corps.date - 43200000 AND w.date < mesure_corps.date + 43200000 AND w.source <> 'pepfit'))`;

/** Dernière mesure d'un type à la date `t` (la plus proche avant), ou null. */
export function derniereMesure(db: Executeur, type: TypeMesureCorps, t: number = Date.now()): Promise<MesureCorps | null> {
  return db.getFirstAsync<MesureCorps>(`SELECT ${COLONNES} FROM mesure_corps WHERE type = ? AND date <= ? ${SANS_DOUBLON_WHOOP} ORDER BY date DESC LIMIT 1`, [type, t]);
}

/** Toutes les mesures d'un type jusqu'à `t` (comprise), de la plus récente à la plus ancienne : `derniereMesure` de plusieurs
 * dates en une lecture (le premier élément de date ≤ t). */
export function mesuresJusqua(db: Executeur, type: TypeMesureCorps, t: number): Promise<MesureCorps[]> {
  return db.getAllAsync<MesureCorps>(`SELECT ${COLONNES} FROM mesure_corps WHERE type = ? AND date <= ? ${SANS_DOUBLON_WHOOP} ORDER BY date DESC`, [type, t]);
}

/** Dernier Body Scan lisible (withings/zones.ts) : la pesée la plus récente qui donne le gras ou le muscle d'une zone au moins.
 * Quinze mesures par pesée (trois grandeurs, cinq zones) : les soixante dernières lignes couvrent quatre pesées. */
export async function dernierScanZones(db: Executeur): Promise<ScanZones | null> {
  const lignes = await db.getAllAsync<MesureCorps>(`SELECT ${COLONNES} FROM mesure_corps WHERE type GLOB '*_zone_*' ORDER BY date DESC LIMIT 60`, []);
  return scansParZone(lignes).find((x) => ZONES.some((z) => x.zones[z].grasPct != null || x.zones[z].muscle != null)) ?? null;
}

/** Historique d'un type depuis `depuis` (ms), du plus récent au plus ancien. */
export function historiqueMesure(db: Executeur, type: TypeMesureCorps, depuis = 0): Promise<MesureCorps[]> {
  return db.getAllAsync<MesureCorps>(`SELECT ${COLONNES} FROM mesure_corps WHERE type = ? AND date >= ? ${SANS_DOUBLON_WHOOP} ORDER BY date DESC`, [type, depuis]);
}

/** Ajoute des mesures ; celles déjà là (même type, date et source) sont ignorées. Renvoie le nombre ajouté. */
export async function ajouterMesures(
  db: Executeur,
  type: TypeMesureCorps,
  l: readonly { valeur: number; date: number; origine?: string | null }[],
  source = "sante_connect",
  maintenant: number = Date.now(),
): Promise<number> {
  let n = 0;
  for (const m of l) {
    if (!(m.valeur > 0) || !Number.isFinite(m.valeur)) continue;
    const r = (await db.runAsync("INSERT OR IGNORE INTO mesure_corps (id, type, date, valeur, source, origine, cree_le) VALUES (?,?,?,?,?,?,?)", [
      nouvelId(), type, m.date, m.valeur, source, m.origine ?? null, maintenant,
    ])) as { changes?: number } | undefined;
    n += Number(r?.changes ?? 0);
  }
  return n;
}

export interface SourceMesures {
  mesures(type: (typeof TYPES_MESURE_CORPS)[number], jours: number): Promise<{ valeur: number; date: number; origine: string | null }[] | null>;
}

/** Importe les 30 derniers jours de chaque type autorisé (Santé Connect ne donne pas plus avant l'autorisation). Les types sont
 * lus en même temps (un aller-retour natif au lieu de huit à la suite), puis écrits l'un après l'autre. */
export async function importerMesures(db: Executeur, sante: SourceMesures, jours = 30): Promise<number> {
  const lus = await Promise.all(TYPES_MESURE_CORPS.map((type) => sante.mesures(type, jours).catch(() => null)));
  let n = 0;
  for (const [i, type] of TYPES_MESURE_CORPS.entries()) {
    const l = lus[i];
    if (l?.length) n += await ajouterMesures(db, type, l);
  }
  return n;
}
