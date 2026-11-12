// Tuto « Activer la FC en direct » (lot 6 de la course guidée, demande d'Alex du 29/10) : les étapes de chaque cas, sans
// React Native (testées dans tests/tuto-fc.test.ts). Chemin de l'appli Whoop vérifié le 29/10 : Plus › Paramètres ›
// Paramètres de l'appareil › onglet STATUT › tout en bas « DIFFUSER LA FRÉQUENCE CARDIAQUE » (en : Heart Rate Broadcast).
import type { CleSimple } from "../i18n/index";

export const PAQUET_WHOOP = "com.whoop.android";
/** Repli de « Ouvrir Whoop » quand l'appli n'est pas installée : le site de Whoop, pas un magasin d'applis (édition
 *  libre, F-Droid : ni Play Store ni App Store). */
export const SITE_WHOOP = "https://www.whoop.com/";

/** Whoop et ceinture : le même tuto, un segmenté pour passer de l'un à l'autre ; « Appareils à proximité » : le sien. */
export type CasTuto = "whoop" | "ceinture" | "appareils";
export type EtapeTuto = { titre: CleSimple; sous?: CleSimple };

export const ETAPES_TUTO: Record<CasTuto, readonly EtapeTuto[]> = {
  whoop: [
    { titre: "gps.fc.tuto.w1", sous: "gps.fc.tuto.w1s" },
    { titre: "gps.fc.tuto.w2" },
    { titre: "gps.fc.tuto.w3" },
    { titre: "gps.fc.tuto.w4" },
    { titre: "gps.fc.tuto.w5", sous: "gps.fc.tuto.w5s" },
  ],
  ceinture: [
    { titre: "gps.fc.tuto.c1", sous: "gps.fc.tuto.c1s" },
    { titre: "gps.fc.tuto.c2", sous: "gps.fc.tuto.c2s" },
    { titre: "gps.fc.tuto.c3", sous: "gps.fc.tuto.c3s" },
  ],
  appareils: [
    { titre: "gps.fc.tuto.a1", sous: "gps.fc.tuto.a1s" },
    { titre: "gps.fc.tuto.a2" },
    { titre: "gps.fc.tuto.a3" },
  ],
};

/** Étape suivie du dessin simplifié : l'interrupteur de la Whoop, la ceinture et ses électrodes, le choix « Autoriser ». */
export const DESSIN_SOUS: Record<CasTuto, number> = { whoop: 4, ceinture: 0, appareils: 2 };
