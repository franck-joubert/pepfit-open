// Bouton « Programmes » de Sport (31/10) : il choisit sa page avant de partir, pour une seule transition. Sans
// aucun programme (ni en cours, ni passé) ni « Reçu de ton coach » connu, la page Programmes n'existe pas : on entre
// directement dans Explorer les programmes. Les reçus : le dernier nombre lu par useRecusCoach, gardé sur le téléphone
// (aucun appel réseau à l'ouverture de Sport).
import { listerPlans } from "../db/depots/plans";
import { ecrireReglage, lireReglage, PREFIXE_CACHE } from "../db/depots/reglages";
import type { Executeur } from "../db/executeur";

export const CLE_RECUS_COACH = `${PREFIXE_CACHE}recus_coach`;

export type CibleProgrammes = "/programmes" | "/boutique";

/** Où mène « Programmes » : la boutique (rayon Programmes) quand la page serait vide. */
export function cibleProgrammes(nbPlans: number, nbRecus: number): CibleProgrammes {
  return nbPlans === 0 && nbRecus === 0 ? "/boutique" : "/programmes";
}

/** Nombre de reçus du coach à la dernière lecture ; jamais lu : aucun. */
export async function recusCoachConnus(db: Executeur): Promise<number> {
  return Number(await lireReglage(db, CLE_RECUS_COACH)) || 0;
}

export async function memoriserRecusCoach(db: Executeur, n: number): Promise<void> {
  await ecrireReglage(db, CLE_RECUS_COACH, String(n));
}

export async function lireCibleProgrammes(db: Executeur): Promise<CibleProgrammes> {
  return cibleProgrammes((await listerPlans(db)).length, await recusCoachConnus(db));
}
