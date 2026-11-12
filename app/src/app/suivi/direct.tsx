// Course en direct (planche suivi-gps) : pepfitopen://suivi/direct, ouvert par Démarrer, ou à la reprise de l'appli pendant un suivi.
// « Batterie non restreinte » (FeuilleBatterie), une fois par moment : première séance avec GPS ou FC en direct, premier
// capteur de FC connecté.
import { useEffect, useState } from "react";
import { BatterieAuMoment } from "../../ecrans/FeuilleBatterie";
import { SuiviDirect } from "../../ecrans/SuiviDirect";
import { suivi } from "../../natif/suivi";

export default function Direct() {
  const [lance, setLance] = useState(false);
  const [capteur, setCapteur] = useState(false);
  useEffect(
    () =>
      suivi.ecouter((e) => {
        if (e.statut !== "arrete") setLance(true);
        if (e.fc.etat === "connecte") setCapteur(true);
      }),
    [],
  );
  return (
    <>
      <SuiviDirect />
      <BatterieAuMoment moment="seance" actif={lance} />
      <BatterieAuMoment moment="objet" actif={capteur} />
    </>
  );
}
