import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { demanderNotifications, notificationsPermises } from "../notifications";
import { PLAFOND_IOS, plafonner } from "../notifs-ios";
import type { Executeur } from "../../db";
import { prochainChangement } from "../../ecrans/heure-voyage/changement-heure";
import { lireReglagesHeure, lireRythme } from "../../ecrans/heure-voyage/donnees";
import { instantDans, jourDans } from "../../ecrans/heure-voyage/horloge";
import { corpsRappel, PREFIXE_COUCHER, soirsRappel, titreRappel } from "../../ecrans/heure-voyage/rappel-coucher";
import { lireActif, t } from "../../i18n/index";

// Rappel de coucher (planche sommeil, D15) : une notification silencieuse par soir, « avant » minutes avant le coucher
// conseillé, posée pour les 7 soirs à venir et reposée à chaque ouverture de l'appli et à chaque changement de réglage.
// Même système que les rappels de séance (natif/rappels) ; canal silencieux comme le rappel de sieste. Android et iPhone (sur
// iPhone, 7 soirs au plus : PLAFOND_IOS, natif/notifs-ios).
const CANAL = "rappel-coucher";

let canalPret: Promise<boolean> | null = null;
let langueCanal = "";
function preparer(): Promise<boolean> {
  const langue = lireActif().langue;
  if (!canalPret || langue !== langueCanal) {
    langueCanal = langue;
    canalPret = (async () => {
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: t("heureVoyage.notifCanal"),
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        vibrationPattern: null,
      });
      return true;
    })().catch(() => false);
  }
  return canalPret;
}

let enCours: Promise<void> = Promise.resolve();
let poses: string | null = null;
/** `demander` : juste après avoir allumé le rappel (l'autorisation est demandée, avec son explication). */
export function rafraichirRappelCoucher(db: Executeur, o: { demander?: boolean } = {}): Promise<void> {
  enCours = enCours.then(() => reposer(db, !!o.demander)).catch(() => {});
  return enCours;
}

async function reposer(db: Executeur, demander: boolean) {
  const maintenant = Date.now();
  const r = await lireReglagesHeure(db);
  const fuseau = lireActif().fuseau;
  let prevus: { id: string; quand: number; titre: string; corps: string }[] = [];
  if (r.rappel) {
    const changement = prochainChangement(instantDans(jourDans(maintenant, fuseau), 0, fuseau), fuseau, 11);
    const soirs = soirsRappel({ maintenant, fuseau, rythme: await lireRythme(db, maintenant), changement, voyage: r.voyage, avant: r.avant, suivrePlan: r.suivrePlan });
    prevus = (Platform.OS === "ios" ? plafonner(soirs, PLAFOND_IOS.coucher, (s) => s.instant) : soirs).map((s) => ({ id: s.id, quand: s.instant, titre: titreRappel(r.avant), corps: corpsRappel(s) }));
  }
  const signature = JSON.stringify(prevus);
  if (!demander && signature === poses) return;
  poses = null;
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (n.identifier.startsWith(PREFIXE_COUCHER)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
  if (!prevus.length) {
    poses = signature;
    return;
  }
  if (!(await preparer()) || !(await (demander ? demanderNotifications("rappel") : notificationsPermises()))) return;
  for (const n of prevus) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.titre, body: n.corps, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.quand, channelId: CANAL },
    });
  }
  poses = signature;
}
