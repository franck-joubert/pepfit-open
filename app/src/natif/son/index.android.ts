import { requireOptionalNativeModule } from "expo";
import type { SonTelephone, Sons } from "./types";

export type { SonTelephone, Sons } from "./types";

// Module local modules/pepfit-son (Kotlin) ; absent d'un APK plus ancien : repli sans choix de son.
interface Natif {
  choisir(actuel: string | null, titre: string): Promise<SonTelephone | null>;
  canal(id: string, nom: string, prefixe: string, uri: string | null, son: boolean, vibration: number[]): Promise<void>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitSon");

export const sons: Sons = {
  disponible: natif != null,
  choisir: async (actuel) => (natif ? natif.choisir(actuel, "Son de fin de repos") : null),
  canal: async (o) => {
    if (!natif) return false;
    await natif.canal(o.id, o.nom, o.prefixe, o.uri, o.son, o.vibration);
    return true;
  },
};
