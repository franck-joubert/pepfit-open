import { requireOptionalNativeModule } from "expo";
import { AppState } from "react-native";
import { natifDepuisHealthKit, type NatifHealthKit } from "./healthkit";
import { fabriquerSante } from "./logique";
import type { Sante } from "./types";

export type * from "./types";

// Module local modules/pepfit-sante (Swift, HealthKit), traduit en accès Santé Connect (healthkit.ts) : même logique, mêmes
// valeurs que sur Android. Absent d'une version plus ancienne : « non-branche ».
const natif = requireOptionalNativeModule<NatifHealthKit>("PepfitSante");
export const sante: Sante = fabriquerSante(natif ? natifDepuisHealthKit(natif) : null);

// Autorisations gardées 30 s (M1) : relues au retour au premier plan (elles ont pu changer dans Réglages › Santé).
AppState.addEventListener("change", (a) => {
  if (a === "active") sante.oublierAutorisations();
});
