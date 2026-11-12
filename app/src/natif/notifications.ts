import * as Notifications from "expo-notifications";
import { etapeNotif, type RaisonExplication, type RaisonNotif } from "./notifications-etape";

export type { RaisonExplication, RaisonNotif } from "./notifications-etape";

// Autorisation des notifications (logique : notifications-etape.ts). Les rappels et le minuteur ne font que vérifier
// (`notificationsPermises`) ; la demande passe par `demanderNotifications(raison)`, appelée au moment où elle sert : la
// feuille d'explication (ui/FeuilleNotifications, posée une fois à la racine) s'ouvre, puis, sur « Continuer », la demande
// d'Android.

export async function notificationsPermises(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync().catch(() => null))?.granted ?? false;
}

const plusTard = new Set<RaisonNotif>();
type Attente = { raison: RaisonExplication; repondre: (ok: boolean) => void };
let attente: Attente | null = null;
const abonnes = new Set<(a: Attente | null) => void>();
const publier = () => abonnes.forEach((f) => f(attente));

/** Feuille d'explication : l'écouter (ui/FeuilleNotifications). */
export function ecouterExplication(f: (a: Attente | null) => void): () => void {
  abonnes.add(f);
  f(attente);
  return () => void abonnes.delete(f);
}

/**
 * Ouvre la feuille d'explication et attend la réponse : vrai sur « Continuer ». Sert aussi avant une autre autorisation
 * d'Android (position du suivi GPS, n° 13 de l'audit) : même feuille, même place.
 */
export function expliquer(raison: RaisonExplication): Promise<boolean> {
  attente?.repondre(false);
  return new Promise((resoudre) => {
    const a: Attente = {
      raison,
      repondre: (ok) => {
        if (attente !== a) return;
        attente = null;
        publier();
        resoudre(ok);
      },
    };
    attente = a;
    publier();
  });
}

let enCours: Promise<boolean> | null = null;
/** Au moment où une notification va servir : explication de l'appli, puis demande d'Android. Vrai si permises. */
export function demanderNotifications(raison: RaisonNotif): Promise<boolean> {
  enCours ??= (async () => {
    const p = await Notifications.getPermissionsAsync().catch(() => null);
    const etape = etapeNotif({ permise: !!p?.granted, redemandable: p?.canAskAgain ?? false, plusTard: plusTard.has(raison) });
    if (etape !== "expliquer") return etape === "accordee";
    if (!(await expliquer(raison))) {
      plusTard.add(raison);
      return false;
    }
    const r = await Notifications.requestPermissionsAsync().catch(() => null);
    if (!r?.granted) plusTard.add(raison);
    return r?.granted ?? false;
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}
