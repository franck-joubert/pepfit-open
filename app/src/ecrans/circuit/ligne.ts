// Ce que la ligne d'un circuit écrit (planche Circuits, « Ce que donne un circuit à découvrir ») : le même texte dans la liste de Découvrir, la carte
// de prévisualisation, « Mes circuits » et la feuille du départ (une seule ligne : LigneCircuit.tsx). Pur (sans React), comme ligneDecouvrir.
import type { Circuit } from "../../circuits/types";
import { nombre } from "../format";
import { lireActif, t, tp } from "../../i18n/index";
import { distanceKm } from "../../salles/osm";
import { resumeCircuit } from "./texte";

export interface LigneCircuitTexte {
  id: string;
  nom: string;
  /** Le cadenas à côté du nom : le circuit est à toi seul (un GPX importé, une sortie pas publiée). */
  prive: boolean;
  /** « Linéaire, 5,7 km, +149 m » : le type, la distance du tracé, le dénivelé positif ; sans altitudes, « Linéaire, 5,7 km ». */
  sous: string;
  /** « Départ Gare du Plateau » ; null quand le circuit n'a pas de lieu de départ nommé. */
  depart: string | null;
  /** « 0,2 km » (ou en miles) à vol d'oiseau depuis la position ; null sans position (« Mes circuits » n'en montre pas). */
  distance: string | null;
  /** Lu par TalkBack : « Ouvrir le circuit Traversée du plateau, Linéaire, 5,8 km, +126 m, Départ Gare du Plateau, 0,2 km ». */
  accessibilite: string;
}

/** `m` : la distance du départ à la position de la personne, en mètres ; null quand la ligne n'en montre pas. */
export function ligneCircuit(c: Pick<Circuit, "id" | "nom" | "type" | "distanceM" | "denivelePlusM" | "departNom" | "visibilite">, m: number | null): LigneCircuitTexte {
  const sous = resumeCircuit(c);
  const nom = c.departNom?.trim();
  const depart = nom ? t("circuit.ligne.depart", { nom }) : null;
  const distance = m == null ? null : distanceKm(m);
  const prive = c.visibilite === "prive";
  return {
    id: c.id,
    nom: c.nom,
    prive,
    sous,
    depart,
    distance,
    accessibilite: [t("circuit.ligne.ouvrir", { nom: c.nom }), prive ? t("circuit.ligne.prive") : null, sous, depart, distance].filter(Boolean).join(", "),
  };
}

/** La distance d'un circuit au lieu dont on lit la page : « Au départ » sous 50 m, sinon en mètres, à 10 m près (« 240 m », en miles : « 0.1 mi »). */
export function distanceAuLieu(m: number): string {
  if (m < 50) return t("circuit.lieu.auDepart");
  return lireActif().distance === "mi" ? distanceKm(m) : `${nombre(Math.round(m / 10) * 10, 0)} m`;
}

/**
 * La ligne d'un circuit dans l'onglet « Circuits » d'un lieu (planche onglet-circuits) : la même ligne qu'ailleurs. `departDuLieu` : le lieu est le départ
 * même (lieu de départ), la ligne « Départ … » ferait doublon avec le haut de page et s'efface ; sur une salle proche d'un départ, elle dit lequel.
 */
export function ligneCircuitDuLieu(c: Parameters<typeof ligneCircuit>[0], m: number, departDuLieu: boolean): LigneCircuitTexte {
  const base = ligneCircuit(c, m);
  const distance = distanceAuLieu(m);
  const depart = departDuLieu ? null : base.depart;
  return { ...base, depart, distance, accessibilite: [t("circuit.ligne.ouvrir", { nom: c.nom }), base.prive ? t("circuit.ligne.prive") : null, base.sous, depart, distance].filter(Boolean).join(", ") };
}

/** La ligne « Mes circuits » : « 3 circuits, dont 2 privés », « 1 circuit » quand aucun n'est privé, « Aucun circuit à toi » quand il n'y en a pas. */
export function sousMesCircuits(circuits: readonly Pick<Circuit, "visibilite">[]): string {
  const n = circuits.length;
  if (!n) return t("circuit.mes.aucun");
  const prives = circuits.filter((c) => c.visibilite === "prive").length;
  const compte = tp("circuit.mes.compte", n);
  return prives ? t("circuit.mes.sousPrives", { compte, prives: tp("circuit.mes.prives", prives) }) : compte;
}
