import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { jourDe } from "./planif-donnees";
import { msAvantMinuit } from "./jour-courant";

/**
 * Aujourd'hui (AAAA-MM-JJ), tenu à jour : une page ouverte avant minuit passe au jour suivant à minuit, et au retour au
 * premier plan (le minuteur dort quand l'appli est en arrière-plan). Sans cela, « aujourd'hui » reste celui d'hier : un jour
 * passé est lu comme aujourd'hui, ou aujourd'hui comme un jour à venir.
 */
export function useJourCourant(): string {
  const [jour, setJour] = useState(() => jourDe(Date.now()));
  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const poser = () => {
      setJour(jourDe(Date.now()));
      clearTimeout(minuterie);
      minuterie = setTimeout(poser, msAvantMinuit(Date.now()) + 250);
    };
    poser();
    const ecoute = AppState.addEventListener("change", (a) => a === "active" && poser());
    return () => {
      clearTimeout(minuterie);
      ecoute.remove();
    };
  }, []);
  return jour;
}
