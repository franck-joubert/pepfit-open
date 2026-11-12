import { requireOptionalNativeModule } from "expo";
import { fabriquerNavigateur, type NatifNavigateur } from "./ios";

// iPhone : module local modules/pepfit-navigateur (Swift) : pages du site par-dessus l'appli, connexions OAuth
// (docs/CODE-IOS-DIVERS.md).
export const navigateur = fabriquerNavigateur(requireOptionalNativeModule<NatifNavigateur>("PepfitNavigateur"));
