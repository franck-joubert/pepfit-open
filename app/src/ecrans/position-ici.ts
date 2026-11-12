import * as Location from "expo-location";
import type { Position } from "../salles/osm";

// Position du téléphone au démarrage d'une séance (lieu proposé selon le GPS, retour du 29/10) : rien n'est
// demandé (la position sert déjà au suivi et à « Autour de moi ») ; la dernière connue de moins de 10 min, sinon une mesure
// de 2 s au plus, pour ne pas retenir le démarrage. Sans autorisation ni position : null (le lieu suit la règle sans GPS).

const RECENTE_MS = 10 * 60 * 1000;
const ATTENTE_MS = 2000;

export async function positionIci(): Promise<Position | null> {
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return null;
    const l =
      (await Location.getLastKnownPositionAsync({ maxAge: RECENTE_MS })) ??
      (await Promise.race([
        // pas de boîte « Précision de la localisation » de Google au démarrage d'une séance (vue sur l'émulateur le 29/10)
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }),
        new Promise<null>((ok) => setTimeout(() => ok(null), ATTENTE_MS)),
      ]));
    return l ? { lat: l.coords.latitude, lon: l.coords.longitude } : null;
  } catch {
    return null;
  }
}
