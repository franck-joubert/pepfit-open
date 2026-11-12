import { requireOptionalNativeModule } from "expo";
import { fabriquerSuiviIos, type NatifIos } from "./fabrique-ios";
import type { Suivi } from "./types";

export type * from "./types";

// iPhone : module Swift modules/pepfit-suivi/ios (CoreLocation, CoreBluetooth, CoreMotion), même API que l'Android.
// Absent d'un build plus ancien : `disponible` est faux, comme le repli d'index.ts.
export const suivi: Suivi = fabriquerSuiviIos(requireOptionalNativeModule<NatifIos>("PepfitSuivi"));
