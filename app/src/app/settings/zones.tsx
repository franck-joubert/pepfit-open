import { PageZonesFc } from "../../ecrans/ZonesFc";
import { PartieImposee } from "../../ui/ContextePartie";

/** Zones de FC (Préférences › Séance, et la source sous chaque barre des zones) : en teinte Sport, comme la planche. */
export default function ZonesFc() {
  return (
    <PartieImposee partie="entrainement">
      <PageZonesFc />
    </PartieImposee>
  );
}
