import { requireOptionalNativeModule } from "expo";
import { fabriquerDeverrouillage, type NatifDeverrouillage } from "./ios";

// iPhone : module local modules/pepfit-deverrouillage (Swift), mêmes fonctions qu'Android (docs/CODE-IOS-DIVERS.md).
export type { Issue } from "./types";

const d = fabriquerDeverrouillage(requireOptionalNativeModule<NatifDeverrouillage>("PepfitDeverrouillage"));

export const deverrouiller = d.deverrouiller;
export const deverrouillageEnCours = d.deverrouillageEnCours;
export const estProtege = d.estProtege;
export const masquerApercu = d.masquerApercu;
