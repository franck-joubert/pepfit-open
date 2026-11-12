import { fabriquerSante } from "./logique";
import type { Sante } from "./types";

export type * from "./types";

// Web (et tests) : pas de Santé. iOS : index.ios.ts (HealthKit), Android : index.android.ts (Santé Connect).
export const sante: Sante = fabriquerSante(null);
/** Santé Connect seul (sur Android, sans Polar : index.android.ts) ; ici, la même. */
export const santeConnect: Sante = sante;
