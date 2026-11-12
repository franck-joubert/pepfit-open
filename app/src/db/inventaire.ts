// Inventaire d'une salle : types d'équipement, unités propres à chaque équipement et règles de détection, sans base.
import { LIBELLE_EQUIPEMENT, estEquipement, type Equipement } from "./natures";
import { LBS_PAR_KG, versUnite, type Unite } from "../ecrans/format";
import { MACHINES, MACHINE_DE_EXERCICE } from "./machines";
import { t, type CleSimple } from "../i18n/index";

export type UniteEquipement = Unite;

/** Valeur arrondie au dixième dans l'unité (70 lbs enregistrés en kg ressortent « 70 »). */
export const dansUnite = (kg: number, u: UniteEquipement): number => Math.round(versUnite(kg, u) * 10) / 10;
export const autreUnite = (u: UniteEquipement): UniteEquipement => (u === "kg" ? "lbs" : "kg");

/** Écart toléré entre une charge saisie et un plafond (arrondis des conversions kg ↔ lbs). */
export const TOLERANCE_KG = 0.01;

export type PoidsLibre = "halteres" | "kettlebell" | "barre";
export const POIDS_LIBRES: readonly PoidsLibre[] = ["halteres", "kettlebell", "barre"];

/** Type d'équipement d'une salle : `machine:<id>`, `halteres`, `kettlebell`, `barre` ou `poste:<équipement>`. */
export type TypeEquipementSalle = string;

export const estPoidsLibre = (t: string): t is PoidsLibre => (POIDS_LIBRES as readonly string[]).includes(t);
export const machineDe = (t: string): string | null => (t.startsWith("machine:") ? t.slice(8) : null);
export const posteDe = (t: string): Equipement | null => {
  const e = t.startsWith("poste:") ? t.slice(6) : null;
  return e && estEquipement(e) ? e : null;
};

/** Équipements cochés de la salle (`salle.equipements`) qui correspondent à un type d'inventaire. */
export function categorieDe(type: TypeEquipementSalle): Equipement | null {
  if (estPoidsLibre(type)) return type === "barre" ? "barre" : type === "halteres" ? "halteres" : "kettlebell";
  const m = machineDe(type);
  if (m) {
    const f = MACHINES.find((x) => x.id === m)?.famille;
    return f ?? "machine";
  }
  return posteDe(type);
}

/**
 * Équipement d'inventaire qu'un exercice demande : sa machine (catalogue des machines), les poids libres, ou un poste.
 * Null : rien à inventorier (poids du corps, cardio, « autre », machine inconnue).
 */
export function typeEquipementDe(e: { slug: string | null; equipement: Equipement }): TypeEquipementSalle | null {
  switch (e.equipement) {
    case "machine": case "poulie": case "smith": {
      const m = e.slug ? MACHINE_DE_EXERCICE[e.slug] : undefined;
      return m ? `machine:${m}` : null;
    }
    case "halteres": return "halteres";
    case "kettlebell": return "kettlebell";
    case "barre": case "disque": return "barre";
    case "barre_fixe": case "elastique": return `poste:${e.equipement}`;
    default: return null;
  }
}

/** Nom d'une machine du catalogue dans la langue active (le catalogue garde les noms français). */
export function libelleMachine(id: string): string {
  const m = MACHINES.find((x) => x.id === id);
  return m ? t(`salles.m.${id}` as CleSimple) : id;
}

/** Nom d'une machine rangée dans une salle : le nom français du catalogue (enregistré à l'ajout) est traduit, un nom saisi à la main reste tel quel. */
export function nomMachineAffiche(machineId: string | null, nom: string): string {
  return machineId && MACHINES.find((x) => x.id === machineId)?.nom === nom ? libelleMachine(machineId) : nom;
}

export const libelleLibre = (type: PoidsLibre): string => t(`salles.libre.${type}`);

export function libelleEquipementSalle(type: TypeEquipementSalle): string {
  if (estPoidsLibre(type)) return libelleLibre(type);
  const m = machineDe(type);
  if (m) return libelleMachine(m);
  const p = posteDe(type);
  return p ? LIBELLE_EQUIPEMENT[p] : type;
}

/** Palier proposé pour une machine du catalogue, dans l'unité voulue (en lbs : le multiple de 5 le plus proche du palier en kg). */
export function palierParDefaut(machineId: string, unite: UniteEquipement): number {
  const kg = MACHINES.find((x) => x.id === machineId)?.palierDefaut ?? 5;
  return unite === "kg" ? kg : Math.max(5, Math.round((kg * LBS_PAR_KG) / 5) * 5);
}

/** Réglage par défaut d'un poids libre créé à partir d'une charge vue en séance. */
export function reglageParDefaut(type: PoidsLibre, unite: UniteEquipement): { min: number; pas: number } {
  if (type === "barre") return { min: unite === "kg" ? 20 : 45, pas: unite === "kg" ? 2.5 : 5 };
  return { min: unite === "kg" ? 2 : 5, pas: unite === "kg" ? 2 : 5 };
}

/** Vrai si `charge` (kg) dépasse `plafond` (kg) au-delà de l'arrondi des conversions. */
export const depasse = (chargeKg: number, plafondKg: number): boolean => chargeKg > plafondKg + TOLERANCE_KG;

export interface ExoCourt {
  slug: string | null;
  nom: string;
}

/** Exercices du catalogue regroupés par équipement d'inventaire (pour les vignettes de la salle). */
export function exercicesParType(exercices: readonly { slug: string | null; nom: string; equipement: Equipement }[]): Map<TypeEquipementSalle, ExoCourt[]> {
  const out = new Map<TypeEquipementSalle, ExoCourt[]>();
  for (const e of exercices) {
    const t = typeEquipementDe(e);
    if (!t) continue;
    const l = out.get(t) ?? [];
    l.push({ slug: e.slug, nom: e.nom });
    out.set(t, l);
  }
  return out;
}
