// Composition par zone du corps (Body Scan de Withings) : les mesures « gras_zone_torse », « muscle_zone_bras_g »… de
// mesure_corps, regroupées par pesée. Pur, sans base ni réseau : le serveur MCP (lire_composition_zones) l'importe tel quel
// (serveur/mcp/appli.liste) ; un écran Corps par zone lira le même calcul.
import { ZONES, type Zone } from "./convertir";

/** Ce qu'une zone porte : masse grasse, musculaire et non grasse (kg), et sa part de gras (%). */
export interface MesuresZone {
  gras: number | null;
  muscle: number | null;
  maigre: number | null;
  /** gras ÷ (gras + non grasse), en % au dixième ; null s'il manque l'une des deux. */
  grasPct: number | null;
}

/** Une pesée Body Scan : sa date (ms) et ses cinq zones (une zone sans mesure a ses quatre valeurs à null). */
export interface ScanZones {
  date: number;
  zones: Record<Zone, MesuresZone>;
}

/** « gras_zone_bras_g » -> { grandeur: "gras", zone: "bras_g" } ; null pour un type qui n'est pas d'une zone (préfixes de
 * convertir.ts, TYPES_ZONES). */
export function typeZone(type: string): { grandeur: "gras" | "muscle" | "maigre"; zone: Zone } | null {
  const m = /^(gras|muscle|maigre)_zone_(.+)$/.exec(type);
  if (!m || !(ZONES as readonly string[]).includes(m[2]!)) return null;
  return { grandeur: m[1] as "gras" | "muscle" | "maigre", zone: m[2] as Zone };
}

const vide = (): MesuresZone => ({ gras: null, muscle: null, maigre: null, grasPct: null });

/**
 * Les pesées Body Scan, la plus récente d'abord : les mesures par zone d'une même pesée partagent sa date (convertir.ts).
 * Les autres types sont ignorés ; une ligne illisible (date ou valeur qui n'est pas un nombre) aussi.
 */
export function scansParZone(lignes: readonly { type?: unknown; date?: unknown; valeur?: unknown }[]): ScanZones[] {
  const parDate = new Map<number, ScanZones>();
  for (const l of lignes) {
    const t = typeof l.type === "string" ? typeZone(l.type) : null;
    if (!t || typeof l.date !== "number" || typeof l.valeur !== "number" || !Number.isFinite(l.valeur)) continue;
    let s = parDate.get(l.date);
    if (!s) {
      s = { date: l.date, zones: Object.fromEntries(ZONES.map((z) => [z, vide()])) as Record<Zone, MesuresZone> };
      parDate.set(l.date, s);
    }
    s.zones[t.zone][t.grandeur] = l.valeur;
  }
  const scans = [...parDate.values()].sort((a, b) => b.date - a.date);
  for (const s of scans)
    for (const z of ZONES) {
      const { gras, maigre } = s.zones[z];
      s.zones[z].grasPct = gras != null && maigre != null && gras + maigre > 0 ? Math.round((gras / (gras + maigre)) * 1000) / 10 : null;
    }
  return scans;
}
