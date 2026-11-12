import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { demanderNotifications, notificationsPermises } from "../notifications";
import { PLAFOND_IOS, plafonner } from "../notifs-ios";
import { listerTraitements, type Executeur } from "../../db";
import { jourDe } from "../../ecrans/planif-donnees";
import { arrete, lireFrequence } from "../../ecrans/suivi-calc";
import { lireActif, t } from "../../i18n/index";

// Rappels des compléments (D11) : éteints par défaut ; allumé, une notification locale chaque jour à l'heure choisie, sans
// relance ni vibration. Pas de rappel pour « si besoin ». Reposés au lancement (accueil) et à chaque écriture de la fiche.
// Tout est annulé puis reposé d'après listerTraitements : le rappel d'une ligne effacée (migration 48) disparaît ici.
// L'identifiant du canal (« traitements ») et le préfixe restent : en changer laisserait l'ancien canal dans les réglages.
// Android et iPhone (sur iPhone, 10 rappels au plus, les premiers de la journée : PLAFOND_IOS, natif/notifs-ios).
const PREFIXE = "traitement-";

let canalPret: Promise<boolean> | null = null;
let langueCanal = "";
function preparer(): Promise<boolean> {
  const langue = lireActif().langue;
  if (!canalPret || langue !== langueCanal) {
    langueCanal = langue;
    canalPret = (async () => {
      await Notifications.setNotificationChannelAsync("traitements", {
        name: t("suivi.rappelCanal"),
        importance: Notifications.AndroidImportance.DEFAULT,
        enableVibrate: false,
        vibrationPattern: null,
      });
      // Canal prêt ; l'autorisation est vérifiée à chaque fois (jamais demandée au lancement : natif/notifications).
      return true;
    })().catch(() => false);
  }
  return canalPret;
}

let enCours: Promise<void> = Promise.resolve();
/** `demander` : appelé juste après un geste qui pose un rappel (l'autorisation est demandée, avec son explication). */
export function rafraichirRappelsTraitements(db: Executeur, o: { demander?: boolean } = {}): Promise<void> {
  enCours = enCours.then(() => reposer(db, !!o.demander)).catch(() => {});
  return enCours;
}

const minutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

async function reposer(db: Executeur, demander: boolean) {
  const auj = jourDe(Date.now());
  const tous = (await listerTraitements(db)).filter((x) => x.rappel && !arrete(x, auj) && lireFrequence(x.frequence).genre !== "besoin");
  const prevus = Platform.OS === "ios" ? plafonner(tous, PLAFOND_IOS.traitements, (x) => minutes(x.rappel!)) : tous;
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (n.identifier.startsWith(PREFIXE)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
  if (!prevus.length || !(await preparer()) || !(await (demander ? demanderNotifications("rappel") : notificationsPermises()))) return;
  for (const x of prevus) {
    const [hour, minute] = x.rappel!.split(":").map(Number) as [number, number];
    await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIXE}${x.id}`,
      content: { title: t("suivi.rappelNotif", { nom: x.nom }), body: x.dose ? t("suivi.rappelCorps", { dose: x.dose }) : undefined, sound: "default" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "traitements" },
    });
  }
}
