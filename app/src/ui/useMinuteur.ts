import { useEffect, useState } from "react";
import { minuteur, type EtatMinuteur } from "../natif/minuteur";

export function useMinuteur(): EtatMinuteur {
  const [etat, setEtat] = useState<EtatMinuteur>(() => minuteur.etat());
  useEffect(() => minuteur.ecouter(setEtat), []);
  return etat;
}
