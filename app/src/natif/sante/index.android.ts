import { requireOptionalNativeModule } from "expo";
import { AppState } from "react-native";
import type { Executeur } from "../../db/executeur";
import { avecPolar, lecteurPolar } from "../../polar/source";
import { fabriquerSante, type NatifSante } from "./logique";
import type { Sante } from "./types";

export type * from "./types";

// Module local modules/pepfit-sante (Kotlin, Health Connect) ; absent d'un APK plus ancien : « non-branche ».
/** Santé Connect seul : ses propres autorisations, pour l'écran Connexions, le profil et l'accueil. */
export const santeConnect: Sante = fabriquerSante(requireOptionalNativeModule<NatifSante>("PepfitSante"));

// La Santé des calculs : Santé Connect et ce que Polar a donné en direct (polar/source.ts). La base est prise au premier
// appel (require paresseux : natif/sante ne tire pas db/index au chargement, aucun cycle d'initialisation).
export const sante: Sante = avecPolar(
  santeConnect,
  lecteurPolar(() => (require("../../db") as { base: () => Promise<Executeur> }).base()),
);

// Autorisations gardées 30 s (M1) : relues au retour au premier plan (elles ont pu changer dans Santé Connect).
AppState.addEventListener("change", (a) => {
  if (a === "active") sante.oublierAutorisations();
});
