import type { Endormir } from "./types";

// Couche iPhone d'« Aider à s'endormir », sans import d'Expo (tests/ios-divers.test.ts) : le module Swift
// modules/pepfit-endormir/ios porte les mêmes noms que le Kotlin (luminosité de l'écran, note douce générée par AVAudioEngine).
export interface NatifEndormir {
  luminosite(valeur: number): Promise<void>;
  tonalite(hz: number, ms: number, volume: number): Promise<void>;
  silence(): Promise<void>;
}

export const fabriquerEndormir = (natif: NatifEndormir | null): Endormir => ({
  disponible: natif != null,
  // null : rendue au réglage d'avant (-1, comme sur Android)
  luminosite: async (v) => natif?.luminosite(v ?? -1).catch(() => {}),
  tonalite: async (hz, ms, volume) => natif?.tonalite(hz, ms, volume).catch(() => {}),
  silence: async () => natif?.silence().catch(() => {}),
});
