import { useSyncExternalStore } from "react";
import { abonnerLiens, versionLiens } from "../db/liens-catalogue";

/** Se réaffiche quand un exercice perso est relié au catalogue ou dissocié (le picto et la 3D changent). */
export function useLiens(): number {
  return useSyncExternalStore(abonnerLiens, versionLiens, versionLiens);
}
