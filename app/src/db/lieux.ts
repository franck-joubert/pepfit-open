// Types de lieu (planche Lieux, NOTES § 1) : un lieu est une ligne de la table `salle`, avec un type ouvert (texte libre en base,
// sans CHECK). Ajouter un type = une entrée ici, son dessin dans ui/Icone.tsx et son libellé `lieux.type.<id>` (fr et en).
// Les capacités décident des écrans : `equipements` (inventaire, filtre « exercices faisables »), `activites` (activités habituelles),
// `autour` (« Autour de moi », OpenStreetMap). `trace` viendra avec le tracé (lot B).
import { t, type CleSimple } from "../i18n/index";

export type Capacite = "equipements" | "activites" | "trace" | "autour";

export interface TypeLieu {
  id: string;
  /** Nom du dessin dans ui/Icone.tsx. */
  picto: string;
  capacites: readonly Capacite[];
}

/** Dans l'ordre de la feuille « Nouveau lieu ». */
export const TYPES_LIEU: readonly TypeLieu[] = [
  { id: "salle", picto: "dumbbell", capacites: ["equipements", "autour"] },
  { id: "exterieur", picto: "exterieur", capacites: ["activites", "trace"] },
  { id: "piscine", picto: "piscine", capacites: ["activites"] },
  { id: "terrain", picto: "terrain", capacites: ["activites"] },
  // D3 (hypothèse) : un domicile a des équipements.
  { id: "domicile", picto: "domicile", capacites: ["equipements"] },
];

/**
 * Les types qu'on ne choisit jamais : ils viennent de l'annuaire. « depart » : un point de départ de circuit (pb_hooks/lieux-depart.js,
 * docs/CODE-LIEUX-DEPARTS.md), jamais proposé dans « Nouveau lieu » ni dans « Autour de moi » pour une séance en salle.
 */
const TYPES_ANNUAIRE: readonly TypeLieu[] = [{ id: "depart", picto: "exterieur", capacites: ["activites", "trace"] }];

export const TYPE_DEFAUT = "salle";

/** Type inconnu (venu d'une version plus récente) : gardé tel quel en base, picto « place », aucune capacité. */
export function typeLieu(id: string | null | undefined): TypeLieu {
  return TYPES_LIEU.find((x) => x.id === id) ?? TYPES_ANNUAIRE.find((x) => x.id === id) ?? { id: id ?? TYPE_DEFAUT, picto: "place", capacites: [] };
}

export const aCapacite = (type: string | null | undefined, c: Capacite): boolean => typeLieu(type).capacites.includes(c);

/** « Départ de randonnée » quand les circuits du lieu ne sont que de la randonnée, « Départ de parcours » sinon (vélo, course). */
export const estDepartDeRandonnee = (activites: readonly string[] | null | undefined): boolean => !!activites && activites.length === 1 && activites[0] === "randonnee";

export function libelleTypeLieu(type: string | null | undefined, activites?: readonly string[] | null): string {
  if (type === "depart") return t(estDepartDeRandonnee(activites) ? "lieux.type.departRando" : "lieux.type.depart");
  return TYPES_LIEU.some((x) => x.id === type) ? t(`lieux.type.${type}` as CleSimple) : t("lieux.type.inconnu");
}
