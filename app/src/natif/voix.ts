import { Vibration } from "react-native";
import * as Speech from "expo-speech";
import { locale } from "../i18n/index";

// Annonce d'un changement d'étape en course guidée (planche seance-duree, D4) : deux vibrations, puis la synthèse vocale
// d'Android dans la langue de l'appli si le réglage « Annonces vocales » est allumé. Le module natif garde le service en
// avant-plan : l'annonce part aussi écran éteint, téléphone en poche.

/** Deux vibrations nettes, distinctes de celle de la fin du repos (une seule, plus longue). */
export const VIBRATION_ETAPE = [0, 220, 160, 220];

export function annoncer(texte: string, voix: boolean): void {
  Vibration.vibrate(VIBRATION_ETAPE);
  if (!voix) return;
  // Une annonce chasse la précédente : deux étapes très proches ne se lisent pas l'une sur l'autre.
  Speech.stop()
    .then(() => Speech.speak(texte, { language: locale() }))
    .catch(() => {});
}

export const taire = () => {
  Speech.stop().catch(() => {});
};
