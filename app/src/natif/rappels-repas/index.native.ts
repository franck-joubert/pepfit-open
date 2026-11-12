import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { demanderNotifications, notificationsPermises } from "../notifications";
import { PLAFOND_IOS, plafonner } from "../notifs-ios";
import type { Executeur } from "../../db";
import { listerRepas, lireReglage } from "../../db";
import { cleJour, decalerJour } from "../../nutrition/calculs";
import { lireActif, t } from "../../i18n/index";

// Rappels des repas (planche « Repas et horaires ») : une notification locale à l'heure du repas + le délai choisi, sur les
// 7 jours à venir, reposée à chaque lecture du journal et à chaque réglage. « Seulement si le repas est vide » : un repas
// déjà rempli aujourd'hui n'a pas de rappel. Sans vibration (réservée aux records et aux erreurs). Android et iPhone (sur
// iPhone, les 21 plus proches : PLAFOND_IOS, natif/notifs-ios).
const PREFIXE = "repas-";
const JOURS = 7;

let canalPret: Promise<boolean> | null = null;
let langueCanal = "";
function preparer(): Promise<boolean> {
  const langue = lireActif().langue;
  if (!canalPret || langue !== langueCanal) {
    langueCanal = langue;
    canalPret = (async () => {
      await Notifications.setNotificationChannelAsync("repas", {
        name: t("nutrition.notifCanal"),
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
export function rafraichirRappelsRepas(db: Executeur, o: { demander?: boolean } = {}): Promise<void> {
  enCours = enCours.then(() => reposer(db, !!o.demander)).catch(() => {});
  return enCours;
}

async function reposer(db: Executeur, demander: boolean) {
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (n.identifier.startsWith(PREFIXE)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
  if ((await lireReglage(db, "nutri_rappel")) !== "1") return;
  const delai = Number(await lireReglage(db, "nutri_rappel_delai")) || 30;
  const siVide = (await lireReglage(db, "nutri_rappel_vide")) !== "0";
  const maintenant = Date.now();
  const auj = cleJour(new Date(maintenant));
  const remplis = new Set(
    (await db.getAllAsync<{ repas_id: string }>("SELECT DISTINCT repas_id FROM consommations WHERE date = ?", [auj])).map((x) => x.repas_id),
  );
  let prevus: { id: string; quand: number; nom: string }[] = [];
  for (const r of await listerRepas(db)) {
    for (let i = 0; i < JOURS; i++) {
      const j = decalerJour(auj, i);
      if (i === 0 && siVide && remplis.has(r.id)) continue;
      const [a, m, d] = j.split("-").map(Number) as [number, number, number];
      const quand = new Date(a, m - 1, d, 0, r.heure_min + delai).getTime();
      if (quand > maintenant) prevus.push({ id: `${PREFIXE}${r.id}-${j}`, quand, nom: r.nom ?? t(`nutrition.repas.${r.cle as "petit_dej"}`) });
    }
  }
  if (Platform.OS === "ios") prevus = plafonner(prevus, PLAFOND_IOS.repas, (n) => n.quand);
  if (!prevus.length || !(await preparer()) || !(await (demander ? demanderNotifications("rappel") : notificationsPermises()))) return;
  for (const n of prevus) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.nom, body: t("nutrition.notifCorps"), sound: "default" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.quand, channelId: "repas" },
    });
  }
}
