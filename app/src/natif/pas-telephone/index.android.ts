import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";
import type { PasTelephone } from "./types";

export type * from "./types";

const PERMISSION = "android.permission.ACTIVITY_RECOGNITION" as const;

// Module local modules/pepfit-sante (Kotlin) : `compteurPas` est absent d'un APK plus ancien, donc « indisponible » (PREBUILD).
const natif = requireOptionalNativeModule<{ compteurPas?: () => Promise<number | null> }>("PepfitSante");

// La permission n'existe qu'à partir d'Android 10 ; avant, le capteur se lit sans.
const sansPermission = () => typeof Platform.Version === "number" && Platform.Version < 29;

export const pasTelephone: PasTelephone = {
  disponible: async () => !!natif?.compteurPas,
  autorise: async () => (sansPermission() ? true : PermissionsAndroid.check(PERMISSION).catch(() => false)),
  demander: async () => (sansPermission() ? true : (await PermissionsAndroid.request(PERMISSION).catch(() => "denied")) === PermissionsAndroid.RESULTS.GRANTED),
  compteur: async () => (natif?.compteurPas ? natif.compteurPas().catch(() => null) : null),
};
