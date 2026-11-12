import { PageAgendas } from "../../../ecrans/agenda/PageAgendas";
import { PartieImposee } from "../../../ui/ContextePartie";

/** Choix des agendas lus et de l'agenda écrit (planche agenda-ics, 3c). */
export default function Agendas() {
  return (
    <PartieImposee partie="entrainement">
      <PageAgendas />
    </PartieImposee>
  );
}
