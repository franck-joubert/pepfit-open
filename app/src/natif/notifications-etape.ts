// Autorisation des notifications, demandée en contexte (retours du 28/10) : jamais au lancement, seulement au premier moment
// où elle sert (fin du repos d'une séance, suivi GPS, rappel programmé), précédée d'une courte explication de l'appli.
// Pur : testé par tests/notifications.test.ts.

export type RaisonNotif = "repos" | "suivi" | "rappel" | "sieste";
/**
 * Raisons de la feuille d'explication : celles des notifications, la position avant le premier suivi GPS (n° 13), et
 * « Alarmes et rappels » (heure exacte du repos et de la sieste, Android 12+).
 */
export type RaisonExplication = RaisonNotif | "position" | "appareils" | "alarmes";

/**
 * Que faire quand une notification va servir : « accordee » (rien à demander), « expliquer » (feuille de l'appli, puis
 * demande d'Android), « non » (refusée pour de bon, ou « Plus tard » déjà répondu pour cette raison depuis l'ouverture de
 * l'appli : on ne redemande pas à chaque séance).
 */
export function etapeNotif(e: { permise: boolean; redemandable: boolean; plusTard: boolean }): "accordee" | "expliquer" | "non" {
  if (e.permise) return "accordee";
  if (!e.redemandable || e.plusTard) return "non";
  return "expliquer";
}

/**
 * L'heure exacte (« Alarmes et rappels ») au moment où une alarme va servir : « expliquer » (feuille, puis le réglage
 * d'Android, qu'aucune boîte de dialogue ne remplace), sauf si « Plus tard » a déjà été répondu depuis l'ouverture de l'appli.
 * Elle ne dépend pas des notifications : le service d'alarme sonne même sans elles.
 */
export function etapeHeureExacte(e: { exacte: boolean; plusTard: boolean }): "accordee" | "expliquer" | "non" {
  if (e.exacte) return "accordee";
  return e.plusTard ? "non" : "expliquer";
}
