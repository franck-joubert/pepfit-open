// Circuits (planche Circuits, docs/CODE-CIRCUITS.md) : les types du socle. Un circuit PUBLIC vit en clair sur le serveur
// (pwa_circuits) ; un circuit à soi (un GPX importé, une sortie pas publiée, un des siens publié) vit ici, dans la table
// `circuit`, chiffré de bout en bout avec le reste de la personne (migration 187).
import type { Point } from "./coupe";

export type { Point };

/** Clés du catalogue d'activités (annuaire-activites.json) qu'un circuit peut porter (D8 : le trail est de la course, le gravel du vélo). */
export const ACTIVITES_CIRCUIT = ["randonnee", "course", "bicycling", "vtt"] as const;
export type ActiviteCircuit = (typeof ACTIVITES_CIRCUIT)[number];

export const TYPES_CIRCUIT = ["boucle", "aller-retour", "lineaire"] as const;
export type TypeCircuit = (typeof TYPES_CIRCUIT)[number];

/** `gpx` n'existe que sur le téléphone (D4) : le fichier reste à la personne. */
export type SourceCircuit = "osm" | "pdipr" | "sortie" | "gpx";
export type LicenceCircuit = "odbl" | "lo2" | "propre";
/** D'où viennent les altitudes : l'IGN (lues par le serveur) ou le tracé lui-même (un GPX, une sortie) ; null : indisponibles. */
export type SourceAltitude = "ign" | "trace" | null;
/** « Toi seul » ou « Tout le monde » (D3 : toi seul au départ). */
export type VisibiliteCircuit = "prive" | "public";

/** Un point du tracé avec son altitude (m), null quand le fichier n'en donne pas. */
export interface PointAlt extends Point {
  alt: number | null;
}

/** Un circuit à soi, tel que la table `circuit` le garde. */
export interface Circuit {
  /** 15 caractères [a-z0-9] : le même sur le téléphone et sur le serveur quand le circuit est publié. */
  id: string;
  nom: string;
  type: TypeCircuit;
  activites: ActiviteCircuit[];
  /** Clé du lieu de départ (fiche pepfit ou point OpenStreetMap) ; jamais un lieu perso ni un domicile (D13). */
  departLieu: string | null;
  departNom: string | null;
  commune: string | null;
  /** Zone d'un degré du départ (« 48_2 »). */
  zone: string;
  /** Polyline de Google, 5 décimales, 400 points au plus. */
  trace: string;
  /** Altitudes en mètres entiers, un point par point du tracé, codées en écarts ; null sans altitudes. */
  profil: string | null;
  /** Sud, ouest, nord, est. */
  bbox: [number, number, number, number];
  distanceM: number;
  denivelePlusM: number | null;
  deniveleMoinsM: number | null;
  altMinM: number | null;
  altMaxM: number | null;
  altSource: SourceAltitude;
  source: SourceCircuit;
  /** `relation/123456` pour OpenStreetMap ; null pour un circuit à soi. */
  sourceRef: string | null;
  licence: LicenceCircuit;
  /** Date de la donnée de la source (« AAAA-MM-JJ »). */
  sourceMaj: string | null;
  visibilite: VisibiliteCircuit;
  /** Quand il a été publié (ms) ; null tant qu'il est privé. */
  publieLe: number | null;
  creeLe: number;
  majLe: number;
}

/**
 * Le circuit qu'un suivi en cours porte (planche Circuits, lot F) : ce que le direct dessine sans lire la base ni le réseau, gardé avec le
 * suivi lancé (réglage `suivi_en_cours`) pour qu'une appli relancée en pleine sortie le retrouve. Le tracé est déjà celui du circuit
 * (400 points au plus) : rien de plus ne part ni ne se garde.
 */
export interface CircuitSuivi {
  id: string;
  nom: string;
  trace: string;
  profil: string | null;
  distanceM: number;
  denivelePlusM: number | null;
}
