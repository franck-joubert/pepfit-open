import { requireOptionalNativeModule } from "expo";
import type { Endormir } from "./types";

export type { Endormir } from "./types";

// Module local modules/pepfit-endormir (Kotlin) ; absent d'un APK plus ancien : l'écran reste noir, sans baisse ni son.
interface Natif {
  luminosite(valeur: number): Promise<void>;
  tonalite(hz: number, ms: number, volume: number): Promise<void>;
  silence(): Promise<void>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitEndormir");

export const endormir: Endormir = {
  disponible: natif != null,
  luminosite: async (v) => natif?.luminosite(v ?? -1).catch(() => {}),
  tonalite: async (hz, ms, volume) => natif?.tonalite(hz, ms, volume).catch(() => {}),
  silence: async () => natif?.silence().catch(() => {}),
};
