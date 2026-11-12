import { requireOptionalNativeModule } from "expo";
import { fabriquerEndormir, type NatifEndormir } from "./ios";

// iPhone : module local modules/pepfit-endormir (Swift), mêmes fonctions qu'Android (docs/CODE-IOS-DIVERS.md).
export type { Endormir } from "./types";

export const endormir = fabriquerEndormir(requireOptionalNativeModule<NatifEndormir>("PepfitEndormir"));
