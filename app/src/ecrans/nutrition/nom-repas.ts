// Nom d'un repas, sans rien de l'écran (lu aussi par les données de l'énergie, testées sous Node).
import type { Repas } from "../../db/depots/nutrition";
import { t } from "../../i18n/index";

/** « Petit-déjeuner », ou le nom donné au repas. */
export function nomRepas(r: Pick<Repas, "cle" | "nom">): string {
  return r.nom ?? t(`nutrition.repas.${r.cle as "petit_dej"}`);
}
