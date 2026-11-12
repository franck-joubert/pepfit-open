// Les nuits de la Récupération sur l'appareil (recup-donnees.ts) : Santé Connect seulement si la lecture du sommeil est
// autorisée. À part pour que recup-donnees.ts reste testable sans le module natif.
import { sante } from "../natif/sante";
import type { Executeur } from "../db/executeur";
import { etatWhoop, synchroniserApiSeule } from "../whoop";
import { assurerImportsRecup } from "./recuperer-donnees";
import type { DepsReleve } from "./recuperer-releve";
import type { DepsNuits } from "./recup-donnees";
import type { DepsRecupSante } from "./recuperer-donnees";

export async function depsNuitsAppareil(): Promise<DepsNuits> {
  const autorisees = (await sante.autorisees().catch((): string[] => [])) as string[];
  return { nuitsSante: autorisees.includes("sommeil") ? (debut, fin) => sante.nuits(debut, fin) : null };
}

/** Les siestes et les activités de récupération de Santé Connect (recuperer-donnees.ts) : chaque lecture si elle est autorisée. */
export async function depsRecupAppareil(): Promise<DepsRecupSante> {
  const autorisees = (await sante.autorisees().catch((): string[] => [])) as string[];
  return {
    sessionsSommeil: autorisees.includes("sommeil") && sante.sessionsSommeil ? (debut, fin) => sante.sessionsSommeil!(debut, fin) : null,
    seancesSport: autorisees.includes("sport") ? (debut, fin) => sante.seancesSport(debut, fin) : null,
  };
}

/** Les lectures de la montre d'une sieste qui attend sa mesure (recuperer-releve.ts) : Whoop (API officielle) et Santé Connect
 * (siestes), chacun seulement s'il est relié. */
export function depsReleveAppareil(db: Executeur): DepsReleve {
  return {
    montre: async () => {
      const autorisees = (await sante.autorisees().catch((): string[] => [])) as string[];
      return autorisees.includes("sommeil") || (await etatWhoop(db)).connecte;
    },
    whoop: () => synchroniserApiSeule(db),
    sante: async () => assurerImportsRecup(db, await depsRecupAppareil(), Date.now(), true),
  };
}
