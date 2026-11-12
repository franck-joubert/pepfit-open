// Le chargement de la page d'un circuit (planche Circuits, états « chargement » et « retiré ») : le circuit est sur le téléphone, ou il
// n'existe plus. Rien ne part au réseau.
import { lireCircuit } from "../db/depots/circuits";
import type { Executeur } from "../db/executeur";
import type { Circuit } from "./types";

export type Chargement =
  | { etat: "pret"; circuit: Circuit }
  /** Supprimé : la page dit qu'il n'existe plus. */
  | { etat: "retire" };

/** Le circuit gardé sur le téléphone ; null s'il n'y est pas. */
export async function chargerGarde(db: Executeur, id: string): Promise<Extract<Chargement, { etat: "pret" }> | null> {
  const mien = await lireCircuit(db, id);
  return mien ? { etat: "pret", circuit: mien } : null;
}
