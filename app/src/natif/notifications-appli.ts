import { AppState, Platform, Vibration } from "react-native";
import * as Notifications from "expo-notifications";
import { aRetirer, cibleNotif, retourNotif, type Cible } from "./notifications-regles";
import { jouerSonAlarme } from "./son-alarme";
import { minuteur } from "./minuteur";
import { haptique } from "../ui/haptique";
import { VIBRATION_SIESTE } from "../ecrans/alerte-sieste";
import { alerteSiesteCourante } from "../ecrans/recuperer-session";

// Branchement des règles de notifications-regles.ts (docs/NOTIFICATIONS.md). Le gestionnaire d'expo-notifications n'est
// appelé que si l'appli est au premier plan (activité « resumed ») : il retient la notification système, joue le son du
// canal (shouldPlaySound sans alerte : un Ringtone, aucune notification), vibre pour la fin du repos et lève le bandeau
// hors de l'écran concerné. L'écran affiché est noté par ui/NotificationsAppli, qui retire en arrivant.
// iPhone : le son d'une alarme (donnée « son » : fin du repos, fin de sieste) est joué par le module PepfitAlarme, que le
// mode silencieux ne coupe pas appli ouverte (natif/son-alarme) ; sans lui, celui de la notification.

let ecran: Cible | null = null;

export interface Rappel {
  titre: string;
  cible: Cible;
}
const abonnes = new Set<(r: Rappel) => void>();

/** Bandeau dans l'appli à la place d'une notification (ui/NotificationsAppli). */
export function ecouterRappels(f: (r: Rappel) => void): () => void {
  abonnes.add(f);
  return () => void abonnes.delete(f);
}

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const { content } = n.request;
    const identifier = n.request.identifier;
    const r = retourNotif({
      premierPlan: AppState.currentState === "active",
      identifiant: identifier,
      ecran,
      sonne: !!content.sound,
      vibre: minuteur.alerteVibre(),
      vibreSieste: alerteSiesteCourante().vibre,
    });
    if (r.vibration && r.reveil) Vibration.vibrate(VIBRATION_SIESTE);
    else if (r.vibration) haptique.succes();
    const cible = cibleNotif(identifier);
    if (r.bandeau && cible) {
      const titre = [content.title, content.body].filter(Boolean).join(", ");
      abonnes.forEach((f) => f({ titre, cible }));
    }
    const son = content.data?.son;
    const joue = r.son && !r.systeme && Platform.OS === "ios" && typeof son === "string" && (await jouerSonAlarme(son));
    return {
      shouldShowBanner: r.systeme,
      shouldShowList: r.systeme,
      shouldPlaySound: r.son && !joue,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    };
  },
});

/** Écran affiché : retient la cible et retire les notifications de cet endroit (comme un message lu). */
export function noterEcran(c: Cible | null) {
  ecran = c;
  retirerArrivee();
}

/** Retire les notifications affichées de l'écran courant (arrivée sur l'écran, retour de l'appli au premier plan). */
export function retirerArrivee() {
  const c = ecran;
  if (!c) return;
  Notifications.getPresentedNotificationsAsync()
    .then((affichees) =>
      Promise.all(
        affichees
          .filter((x) => aRetirer([x.request.identifier], c).length > 0)
          .map((x) => Notifications.dismissNotificationAsync(x.request.identifier)),
      ),
    )
    .catch(() => {});
}
