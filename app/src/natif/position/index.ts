import * as Location from "expo-location";
import type { LocationObject, LocationOptions, LocationPermissionResponse, LocationSubscription } from "./types";

export { Accuracy } from "./types";
export type * from "./types";

// iPhone (et web) : expo-location. Android : index.android.ts (modules/pepfit-position, LocationManager sans Play Services).
export const getForegroundPermissionsAsync = (): Promise<LocationPermissionResponse> => Location.getForegroundPermissionsAsync();
export const requestForegroundPermissionsAsync = (): Promise<LocationPermissionResponse> => Location.requestForegroundPermissionsAsync();
export const getLastKnownPositionAsync = (o?: { maxAge?: number }): Promise<LocationObject | null> => Location.getLastKnownPositionAsync(o);
export const getCurrentPositionAsync = (o?: LocationOptions): Promise<LocationObject> => Location.getCurrentPositionAsync(o);
export const watchPositionAsync = (o: LocationOptions, f: (l: LocationObject) => void): Promise<LocationSubscription> =>
  Location.watchPositionAsync(o, f);
