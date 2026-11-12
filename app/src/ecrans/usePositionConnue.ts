// La dernière position connue du téléphone, sans rien demander (la page d'un lieu ne réclame pas la localisation) : de quoi
// écrire « 0,6 km » sous le nom. Rien ne part : la distance se calcule ici. Sans permission ou sans position récente : null.
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { distanceKm, distanceM, type Position } from "../salles/osm";

const FRAICHE_MS = 30 * 60 * 1000;

export function usePositionConnue(): Position | null {
  const [position, setPosition] = useState<Position | null>(null);
  useEffect(() => {
    let vivant = true;
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync({ maxAge: FRAICHE_MS }) : null))
      .then((l) => vivant && l && setPosition({ lat: l.coords.latitude, lon: l.coords.longitude }))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);
  return position;
}

/** « 0,6 km » (ou en miles) entre cette position et le lieu ; null sans position ni coordonnées du lieu. */
export function distanceDe(position: Position | null, lieu: { lat?: number | null; lon?: number | null }): string | null {
  if (!position || lieu.lat == null || lieu.lon == null || (!lieu.lat && !lieu.lon)) return null;
  return distanceKm(distanceM(position, { lat: lieu.lat, lon: lieu.lon }));
}
