// Réglages de l'appareil lus par expo-localization (natif : ne pas importer depuis les tests).
import { getCalendars, getLocales } from "expo-localization";
import { detecter, type Detecte } from "./detection";

export function detecterAppareil(): Detecte {
  const l = getLocales()[0];
  const c = getCalendars()[0];
  return detecter({ codeLangue: l?.languageCode, region: l?.regionCode, systeme: l?.measurementSystem, fuseau: c?.timeZone });
}
