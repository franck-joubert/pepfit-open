import { PageCredits } from "../../../ecrans/circuit/PageCredits";
import { PartieImposee } from "../../../ui/ContextePartie";

/** Crédits des données (Réglages › Aide) : sous la teinte du Fil, comme la page d'un circuit et la planche (k1). */
export default function Credits() {
  return (
    <PartieImposee partie="fil">
      <PageCredits />
    </PartieImposee>
  );
}
