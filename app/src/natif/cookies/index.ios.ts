import { requireOptionalNativeModule } from "expo";
import { fabriquerCookies, type NatifCookies } from "./ios";

// iPhone : module local modules/pepfit-cookies (Swift), mêmes fonctions qu'Android (docs/CODE-IOS-DIVERS.md).
export const cookies = fabriquerCookies(requireOptionalNativeModule<NatifCookies>("PepfitCookies"));
