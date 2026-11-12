import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";
import { useReduit } from "../ui/reduit";
import { quandPageArrivee, type Abonner } from "./arrivee";

/**
 * Vrai une fois la page poussée arrivée, à la fin de son entrée native (revue finale n° 64 ; voir ./arrivee). Pour les
 * mouvements joués à l'ouverture d'une page de la boutique (pile de vignettes, barres de la fiche), qui passaient sous
 * l'entrée. Mouvement réduit : vrai d'emblée. `nom` : chrono logcat `[transition] <nom> arrivee …`.
 */
export function usePageArrivee(nom: string): boolean {
  const reduit = useReduit();
  // Pages Programmes, Routines et fiche : écrans de la pile, qui reçoivent eux-mêmes `transitionStart` et `transitionEnd`.
  const navigation = useNavigation<{ addListener: Abonner }>();
  const [arrivee, setArrivee] = useState(false);
  useEffect(() => {
    if (reduit) return;
    const montage = Date.now();
    return quandPageArrivee(
      (type, f) => navigation.addListener(type, f),
      (par) => {
        // temps du montage à l'arrivée de la page (logcat : `[transition] <nom> …`)
        console.log(`[transition] ${nom} arrivee ${par} ${Date.now() - montage} ms`);
        setArrivee(true);
      },
    );
    // une seule fois, au montage de la page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return arrivee || reduit;
}
