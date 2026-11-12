import { PageAgenda } from "../../../ecrans/agenda/PageAgenda";
import { PartieImposee } from "../../../ui/ContextePartie";

/** Agenda du téléphone (Sport › Réglages › Agenda, planche agenda-ics). */
export default function Agenda() {
  return (
    <PartieImposee partie="entrainement">
      <PageAgenda />
    </PartieImposee>
  );
}
