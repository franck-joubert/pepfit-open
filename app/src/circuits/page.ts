// Ce que la page d'un circuit décide avant de dessiner (planche Circuits, page) : l'activité du Segmenté, la ligne de source, la plage du
// profil et la cible du « Départ ». Pur (sans React) ; les écrans posent ce que ce module calcule.
import type { Executeur } from "../db/executeur";
import type { ActiviteCircuit, Circuit } from "./types";

/**
 * « Suivre ce circuit » et « Mon temps » (planche, lot F) : le suivi d'un circuit existe. Un seul drapeau, pour qui voudrait le couper : la page
 * ne montre alors ni le bouton du bas, ni « Mon temps », ni la marge qui leur est due.
 */
export const SUIVRE_DISPONIBLE = true;

/**
 * L'activité dont la page montre la durée : celle que la personne a touchée dans le Segmenté si le circuit la porte, sinon la première
 * du circuit (randonnée avant course, comme `ACTIVITES_CIRCUIT`). Un circuit n'a jamais zéro activité : « randonnee » par défaut.
 */
export function activiteAffichee(activites: readonly ActiviteCircuit[], choisie: ActiviteCircuit | null): ActiviteCircuit {
  return choisie && activites.includes(choisie) ? choisie : (activites[0] ?? "randonnee");
}

export type CleSource = "circuit.source.osm" | "circuit.source.pdipr" | "circuit.source.gpx" | "circuit.source.mien";

/**
 * La ligne de source au pied de la page : d'où vient le tracé, et les altitudes de l'IGN quand elles en viennent. Une sortie est
 * toujours à soi : « Tracé de ta sortie ». Aucun © ici : les crédits sont derrière la ligne.
 */
export function cleSource(c: Pick<Circuit, "source" | "altSource">): { cle: CleSource; avecIgn: boolean } {
  const cle: CleSource = c.source === "gpx" ? "circuit.source.gpx" : c.source === "sortie" ? "circuit.source.mien" : c.source === "pdipr" ? "circuit.source.pdipr" : "circuit.source.osm";
  return { cle, avecIgn: c.altSource === "ign" };
}

/** « 76 à 178 m » : les altitudes extrêmes du profil, ou null quand le circuit n'en a pas. */
export function plageProfil(c: Pick<Circuit, "altMinM" | "altMaxM" | "profil">): { bas: number; haut: number } | null {
  return c.profil && c.altMinM != null && c.altMaxM != null ? { bas: c.altMinM, haut: c.altMaxM } : null;
}

/** Où mène la ligne « Départ » : l'identifiant de la salle déjà sur le téléphone ; null si le lieu n'y est pas. */
export async function cibleDuDepart(db: Executeur, cle: string | null): Promise<string | null> {
  if (!cle) return null;
  const salle = await db.getFirstAsync<{ id: string }>("SELECT id FROM salle WHERE source_id = ?", [cle]);
  return salle?.id ?? null;
}

/** La durée en morceaux pour les gros chiffres : « 3 h 30 » (3 + h, 30), « 45 min » (45 + min), « 3 h » pile ; `u` est la clé de l'unité. */
export function segmentsDuree(minutes: number): { v: string; u: "h" | "min" | null }[] {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const reste = m % 60;
  if (h === 0) return [{ v: String(reste), u: "min" }];
  return reste === 0 ? [{ v: String(h), u: "h" }] : [{ v: String(h), u: "h" }, { v: String(reste).padStart(2, "0"), u: null }];
}
