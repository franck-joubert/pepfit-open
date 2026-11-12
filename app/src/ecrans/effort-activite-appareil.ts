// Les sources de l'activité de la journée sur ce téléphone (docs/EFFORT-ACTIVITE.md) : Santé Connect pour les pas et la FC,
// s'il est autorisé à les lire.
import { sante } from "../natif/sante";
import type { DepsActivite } from "./effort-activite-donnees";
import { PERMISSION_PAS } from "./journee-donnees";
import { PERMISSION_FC } from "./seance-sources";

export async function depsActiviteAppareil(): Promise<DepsActivite> {
  const autorisees = (await sante.autorisees().catch((): string[] => [])) as string[];
  return {
    pasSante: autorisees.includes(PERMISSION_PAS) ? (b) => sante.pasIntervalles(b) : null,
    fcSante: autorisees.includes(PERMISSION_FC) ? (d, f) => sante.fcEntre(d, f) : null,
  };
}
