import { requireNativeModule } from "expo";
import { Accuracy, type LocationObject, type LocationOptions, type LocationPermissionResponse, type LocationSubscription } from "./types";

export { Accuracy } from "./types";
export type * from "./types";

// Android : module local modules/pepfit-position (LocationManager), à la place d'expo-location qui tire play-services-location
// (édition F-Droid). Mêmes noms et mêmes formes que le sous-ensemble d'expo-location qu'utilise l'appli (index.ts : iPhone).
interface Natif {
  autorisation(): Promise<LocationPermissionResponse>;
  demanderAutorisation(): Promise<LocationPermissionResponse>;
  derniere(ageMaxMs: number | null): LocationObject | null;
  mesurer(precision: number): Promise<LocationObject>;
  suivre(id: number, precision: number, intervalleMs: number, distanceM: number): void;
  arreter(id: number): void;
  addListener(evenement: "position", f: (e: LocationObject & { id: number }) => void): { remove(): void };
}
const natif = requireNativeModule<Natif>("PepfitPosition");

export const getForegroundPermissionsAsync = () => natif.autorisation();
export const requestForegroundPermissionsAsync = () => natif.demanderAutorisation();
export const getLastKnownPositionAsync = async (o?: { maxAge?: number }) => natif.derniere(o?.maxAge ?? null);
export const getCurrentPositionAsync = (o?: LocationOptions) => natif.mesurer(o?.accuracy ?? Accuracy.Balanced);

let suivant = 1;
export async function watchPositionAsync(o: LocationOptions, f: (l: LocationObject) => void): Promise<LocationSubscription> {
  const id = suivant++;
  const abonnement = natif.addListener("position", (e) => e.id === id && f(e));
  try {
    natif.suivre(id, o.accuracy ?? Accuracy.Balanced, o.timeInterval ?? 1000, o.distanceInterval ?? 0);
  } catch (e) {
    abonnement.remove();
    throw e;
  }
  return {
    remove() {
      abonnement.remove();
      natif.arreter(id);
    },
  };
}
