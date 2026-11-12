// Conversion des mesures Withings (getmeas) vers pepfit. Pur, sans base ni réseau.
// Types de mesure : table « meastype » de developer.withings.com (Measure - Getmeas), recoupée avec aiowithings (MeasurementType).
import type { DiagnosticWithings, Ecartes, GroupeWithings, MesureBrute, MesureConvertie } from "./types";

/** Type Withings -> type de « mesure_corps » de pepfit, avec le facteur vers l'unité de pepfit. 1 (poids) va dans « pesee ». */
export const TYPES_CORPS: Readonly<Record<number, { type: string; facteur?: number }>> = {
  4: { type: "taille", facteur: 100 }, // taille (m) -> cm
  5: { type: "maigre" }, // masse non grasse (kg)
  6: { type: "gras" }, // masse grasse (%)
  8: { type: "gras_kg" }, // masse grasse (kg)
  11: { type: "fc_debout" }, // pouls mesuré par la balance, debout (bpm)
  71: { type: "temp_corps" }, // température du corps (°C)
  73: { type: "temp_peau" }, // température de la peau (°C), montres et thermomètres
  76: { type: "muscle" }, // masse musculaire (kg)
  77: { type: "eau" }, // masse hydrique (kg)
  88: { type: "os" }, // masse osseuse (kg)
  91: { type: "vop" }, // vitesse de l'onde de pouls (m/s)
  155: { type: "age_vasculaire" }, // âge vasculaire (ans)
  167: { type: "score_nerveux" }, // score de santé nerveuse, deux électrodes, pieds
  168: { type: "eau_extra" }, // eau extracellulaire (kg)
  169: { type: "eau_intra" }, // eau intracellulaire (kg)
  170: { type: "visceral" }, // graisse viscérale (indice, sans unité)
  226: { type: "bmr" }, // métabolisme de base (kcal/j)
  227: { type: "age_metabolique" }, // âge métabolique (ans)
};

/** Types segmentaires du Body Scan (une mesure par zone du corps) -> préfixe du type de « mesure_corps » : 173 masse non grasse
 * (kg, par zone), 174 masse grasse (kg), 175 masse musculaire (kg). Noms de la table meastype (aiowithings : FAT_FREE_MASS_FOR_SEGMENTS,
 * FAT_MASS_FOR_SEGMENTS, MUSCLE_MASS_FOR_SEGMENTS) ; une note du 29/08 donnait le 173 en pourcentages : pas confirmé, l'unité
 * est celle du nom officiel. */
export const TYPES_ZONES: Readonly<Record<number, string>> = { 173: "maigre_zone", 174: "gras_zone", 175: "muscle_zone" };

/** Zones du corps rangées par pepfit (suffixe des types « gras_zone_torse », « muscle_zone_bras_g »…). */
export const ZONES = ["torse", "bras_g", "bras_d", "jambe_g", "jambe_d"] as const;
export type Zone = (typeof ZONES)[number];

/** `position` d'une mesure segmentaire -> zone (table des positions de Getmeas : 2 bras droit, 3 bras gauche, 10 jambe gauche,
 * 11 jambe droite, 12 torse). */
const ZONE_DE_POSITION: Readonly<Record<number, Zone>> = { 12: "torse", 3: "bras_g", 2: "bras_d", 10: "jambe_g", 11: "jambe_d" };
/** Sans `position`, cinq mesures d'un même type segmentaire dans un groupe arrivent dans cet ordre (constat du 29/08 :
 * torse, jambe gauche, bras gauche, jambe droite, bras droit) ; non recoupé avec une réponse réelle. */
const ORDRE_ZONES: readonly Zone[] = ["torse", "jambe_g", "bras_g", "jambe_d", "bras_d"];
/** Positions qui disent « tout le corps » : 6 entre les jambes, 7 corps entier. Le Body Scan les met sur la composition ;
 * aiowithings les ramène à « sans position ». */
const POSITIONS_CORPS_ENTIER = new Set([6, 7]);

export const TYPE_POIDS = 1;

/** value × 10^unit, sans bruit de virgule flottante (72345 × 10^-3 = 72.345, pas 72.34500000000001). */
export function valeurReelle(m: Pick<MesureBrute, "value" | "unit">): number {
  return m.unit < 0 ? m.value / 10 ** -m.unit : m.value * 10 ** m.unit;
}

/** Arrondi d'affichage gardé en base : 3 décimales au plus (Withings donne le gramme). */
const arrondi = (x: number) => Math.round(x * 1000) / 1000;

/** Groupe que pepfit garde : une mesure réelle (pas un objectif), attribuée à l'utilisateur (pas « ambiguë »). */
export const groupeRetenu = (g: GroupeWithings) => g.category === 1 && g.attrib !== 1;

/** Mesures d'un groupe, converties, avec ce qui a été écarté (sans aucune valeur : de quoi expliquer, pas de quoi relire). */
export interface TriGroupe {
  mesures: MesureConvertie[];
  /** Numéros de type (meastype) livrés dans le groupe, même ceux qui sont écartés. */
  types: number[];
  ecartes: Ecartes;
}

export const sansEcart = (): Ecartes => ({ objectifs: 0, ambigus: 0, positions: [], inconnus: [], nuls: 0 });

/**
 * Mesures d'un groupe, converties. Les mesures sans position ou « corps entier » (6, 7) vont dans leur type ; les segmentaires
 * (173, 174, 175) vont dans leur zone ; une autre position, un type inconnu, une valeur nulle, négative ou illisible sont
 * laissés, et comptés.
 */
export function trierGroupe(g: GroupeWithings): TriGroupe {
  const ecartes = sansEcart();
  const types = [...new Set((g.measures ?? []).map((m) => m.type))];
  if (g.category !== 1) ecartes.objectifs++;
  else if (g.attrib === 1) ecartes.ambigus++;
  if (!groupeRetenu(g)) return { mesures: [], types, ecartes };
  const date = g.date * 1000;
  const l: MesureConvertie[] = [];
  const parType = new Map<number, number>();
  for (const m of g.measures ?? []) parType.set(m.type, (parType.get(m.type) ?? 0) + 1);
  const rang = new Map<number, number>();
  for (const m of g.measures ?? []) {
    if (!Number.isFinite(m.value) || !Number.isFinite(m.unit)) {
      ecartes.nuls++;
      continue;
    }
    const v = valeurReelle(m);
    const prefixe = TYPES_ZONES[m.type];
    if (prefixe) {
      const n = rang.get(m.type) ?? 0;
      rang.set(m.type, n + 1);
      const zone = m.position != null ? ZONE_DE_POSITION[m.position] : parType.get(m.type) === ORDRE_ZONES.length ? ORDRE_ZONES[n] : undefined;
      if (!zone) ecartes.positions.push(`${m.type}@${m.position ?? "-"}`);
      else if (!(v > 0)) ecartes.nuls++;
      else l.push({ genre: "corps", type: `${prefixe}_${zone}`, valeur: arrondi(v), date });
      continue;
    }
    if (m.position != null && !POSITIONS_CORPS_ENTIER.has(m.position)) {
      ecartes.positions.push(`${m.type}@${m.position}`);
      continue;
    }
    if (!(v > 0)) {
      ecartes.nuls++;
      continue;
    }
    if (m.type === TYPE_POIDS) {
      if (v <= 500) l.push({ genre: "pesee", kg: arrondi(v), date });
      else ecartes.nuls++;
      continue;
    }
    const c = TYPES_CORPS[m.type];
    if (c) l.push({ genre: "corps", type: c.type, valeur: arrondi(v * (c.facteur ?? 1)), date });
    else ecartes.inconnus.push(m.type);
  }
  return { mesures: l, types, ecartes };
}

/** Mesures d'un groupe, converties (voir trierGroupe). */
export const convertirGroupe = (g: GroupeWithings): MesureConvertie[] => trierGroupe(g).mesures;

/** Ce que l'API a livré à une synchro : groupes, types, dates, et tout ce qui a été écarté ; aucune valeur de santé. */
export function diagnostiquer(groupes: readonly GroupeWithings[]): { mesures: MesureConvertie[]; diagnostic: DiagnosticWithings } {
  const mesures: MesureConvertie[] = [];
  const types = new Set<number>();
  const e = sansEcart();
  const positions = new Set<string>();
  const inconnus = new Set<number>();
  let dernier: number | null = null;
  for (const g of groupes) {
    const t = trierGroupe(g);
    mesures.push(...t.mesures);
    for (const x of t.types) types.add(x);
    e.objectifs += t.ecartes.objectifs;
    e.ambigus += t.ecartes.ambigus;
    e.nuls += t.ecartes.nuls;
    for (const p of t.ecartes.positions) positions.add(p);
    for (const i of t.ecartes.inconnus) inconnus.add(i);
    if (Number.isFinite(g.date) && (dernier == null || g.date > dernier)) dernier = g.date;
  }
  e.positions = [...positions].sort();
  e.inconnus = [...inconnus].sort((a, b) => a - b);
  return { mesures, diagnostic: { groupes: groupes.length, types: [...types].sort((a, b) => a - b), ecartes: e, dernier } };
}
