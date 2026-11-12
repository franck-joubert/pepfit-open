import { useEffect, useState } from "react";
import { Vibration } from "react-native";
import { affichageChrono, chronoDe, cibleAtteinte, ecouterChronos, type AffichageChrono } from "../ecrans/chrono-serie";

/** Vibration à 0 du compte à rebours (D5 : toujours, quel que soit le réglage de fin du repos ; le son suit le réglage). */
export const VIBRATION_CIBLE = [0, 300, 150, 300];

/**
 * Affichage du chrono d'une série (ligne, grand chiffre du plein écran) : suit les lancements, pauses et arrêts venus de
 * l'un ou de l'autre, se redessine toutes les 250 ms en marche, et vibre une seule fois quand la cible est atteinte.
 */
export function useChronoSerie(serieId: string | undefined): AffichageChrono | null {
  const [, redessiner] = useState(0);
  useEffect(() => ecouterChronos(() => redessiner((n) => n + 1)), []);
  const aff = serieId ? affichageChrono(serieId) : null;
  const marche = !!aff?.marche;
  useEffect(() => {
    if (!marche || !serieId) return;
    const minuterie = setInterval(() => {
      if (cibleAtteinte(serieId, chronoDe(serieId)?.cibleS ?? null)) Vibration.vibrate(VIBRATION_CIBLE);
      redessiner((n) => n + 1);
    }, 250);
    return () => clearInterval(minuterie);
  }, [serieId, marche]);
  return aff;
}
