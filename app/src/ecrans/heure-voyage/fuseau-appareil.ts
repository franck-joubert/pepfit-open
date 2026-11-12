// Arrivée vue au fuseau du téléphone (planche sommeil, D13) : à l'ouverture et à chaque retour au premier plan, pas de
// récepteur natif d'ACTION_TIMEZONE_CHANGED (docs/CODE-HEURE-VOYAGE.md, écarts). Le fuseau « auto » de l'appli suit, le
// voyage est créé ou retiré, le rappel de coucher est reposé à l'heure du lieu.
import type { Executeur } from "../../db/api";
import { definirActif, definirDetecte, lireDetecte, resoudre, type Preferences } from "../../i18n/index";
import { detecterAppareil } from "../../i18n/appareil";
import { rafraichirRappelCoucher } from "../../natif/rappel-coucher";
import { suivreFuseauAppareil } from "./donnees";

export async function surFuseauDuTelephone(db: Executeur, region: Preferences): Promise<void> {
  const d = detecterAppareil();
  if (d.fuseau !== lireDetecte().fuseau) {
    definirDetecte(d);
    definirActif(resoudre(region, d));
  }
  await suivreFuseauAppareil(db, d.fuseau);
  await rafraichirRappelCoucher(db);
}
