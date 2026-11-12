// Tuto « Activer la FC en direct » (lot 6 de la course guidée, demande d'Alex du 29/10) : les étapes de chaque cas, sans
// React Native (testées dans tests/tuto-fc.test.ts). Chemin de l'appli Whoop vérifié le 29/10 : Plus › Paramètres ›
// Paramètres de l'appareil › onglet STATUT › tout en bas « DIFFUSER LA FRÉQUENCE CARDIAQUE » (en : Heart Rate Broadcast).
import type { CleSimple } from "../i18n/index";

export const PAQUET_WHOOP = "com.whoop.android";
/** Repli de « Ouvrir Whoop » quand l'appli n'est pas installée : le Play Store, sinon sa page web. */
export const STORE_WHOOP = [`market://details?id=${PAQUET_WHOOP}`, `https://play.google.com/store/apps/details?id=${PAQUET_WHOOP}`] as const;
/** iPhone : page App Store de « WHOOP » (Whoop Incorporated, id 933944389, vérifiée le 04/11/2026 par l'API iTunes
 *  lookup, docs/CODE-IOS-SUIVI.md) ; le lien ouvre l'App Store. */
export const APPSTORE_WHOOP = ["https://apps.apple.com/fr/app/whoop/id933944389"] as const;

/** Les liens à essayer dans l'ordre, selon la plateforme (Platform.OS). */
export function magasinsWhoop(os: string): readonly string[] {
  return os === "ios" ? APPSTORE_WHOOP : STORE_WHOOP;
}

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
