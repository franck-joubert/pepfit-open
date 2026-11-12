// Page Corps et Profil (29/10) : rafraîchit les sources du corps avant lecture. Santé Connect (pesées, taille, balance), le
// profil Whoop (body_measurement : poids, taille, FC max) et la balance Withings (pesées et composition, si reliée). Séparé de sante-donnees.ts : le module Whoop tire le stockage
// sécurisé du téléphone, absent des tests sous Node. La lecture elle-même : lireProfilCorps (db/depots/profil.ts).
import type { Executeur } from "../db/executeur";
import { actualiserCorpsWhoop } from "../whoop/index";
import { synchroniserSiBesoin as synchroniserWithingsSiBesoin } from "../withings/index";
import { importerSante } from "./sante-donnees";

/** Importe ce que Santé Connect, Whoop et Withings savent du corps ; un échec (hors ligne, pas d'autorisation) n'empêche rien. */
export async function actualiserCorps(db: Executeur): Promise<void> {
  await Promise.all([importerSante(db).catch(() => {}), actualiserCorpsWhoop(db).catch(() => false), synchroniserWithingsSiBesoin(db).catch(() => {})]);
}
