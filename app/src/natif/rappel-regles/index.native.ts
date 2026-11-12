import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { demanderNotifications, notificationsPermises } from "../notifications";
import type { Executeur } from "../../db";
import { isoLocal, lireJoursCycle, lireReglagesCycle, noterRegles } from "../../cycle/donnees";
import { ACTION_REGLES_NON, ACTION_REGLES_OUI, CATEGORIE_REGLES, estRappelRegles, rappelsRegles, reponseRegles } from "../../cycle/rappel-regles";
import { signalerSaisie } from "../../precision/service";
import { lireActif, t } from "../../i18n/index";

// Rappel « Tes règles sont-elles arrivées ? » (backlog 14 et 31) : trois notifications locales à 9 h (le jour de la date
// estimée, puis deux jours de suite), reposées à chaque ouverture de l'appli, à chaque saisie du cycle et à chaque changement
// de réglage. Même système que les rappels de séance (natif/rappels) et de coucher : expo-notifications, un canal discret ;
// les boutons Oui et Non sont une catégorie de notification (comme « Arrêter » et « Reporter » de l'alarme de sieste), du
// JavaScript seul. Rien n'est envoyé au serveur : ni le texte, ni la date. Sur iPhone, 3 notifications au plus (PLAFOND_IOS).
const CANAL = "rappel-regles";

let pret: Promise<boolean> | null = null;
let langueCanal = "";
function preparer(): Promise<boolean> {
  const langue = lireActif().langue;
  if (!pret || langue !== langueCanal) {
    langueCanal = langue;
    pret = (async () => {
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: t("cycle.rappel.canal"),
        importance: Notifications.AndroidImportance.DEFAULT,
        // le texte parle du cycle : rien sur l'écran verrouillé
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
        sound: null,
        enableVibrate: false,
        vibrationPattern: null,
      });
      await Notifications.setNotificationCategoryAsync(CATEGORIE_REGLES, [
        { identifier: ACTION_REGLES_OUI, buttonTitle: t("cycle.rappel.oui"), options: { opensAppToForeground: true } },
        { identifier: ACTION_REGLES_NON, buttonTitle: t("cycle.rappel.non"), options: { opensAppToForeground: false } },
      ]);
      return true;
    })().catch(() => false);
  }
  return pret;
}

let enCours: Promise<void> = Promise.resolve();
let poses: string | null = null;
/** `demander` : juste après avoir allumé le rappel (l'autorisation est demandée, avec son explication). */
export function rafraichirRappelRegles(db: Executeur, o: { demander?: boolean } = {}): Promise<void> {
  enCours = enCours.then(() => reposer(db, !!o.demander)).catch(() => {});
  return enCours;
}

async function annulerTous() {
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (estRappelRegles(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
}

async function reposer(db: Executeur, demander: boolean) {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  const maintenant = Date.now();
  const prevus = rappelsRegles(await lireJoursCycle(db), await lireReglagesCycle(db), maintenant);
  const signature = JSON.stringify(prevus);
  if (!demander && signature === poses) return;
  poses = null;
  await annulerTous();
  if (!prevus.length) {
    poses = signature;
    return;
  }
  if (!(await preparer()) || !(await (demander ? demanderNotifications("rappel") : notificationsPermises()))) return;
  for (const n of prevus) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: t("cycle.rappel.titre"), body: t("cycle.rappel.corps"), sound: false, categoryIdentifier: CATEGORIE_REGLES, data: { cible: "cycle" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.quand, channelId: CANAL },
    });
  }
  poses = signature;
}

/**
 * Le toucher d'un bouton. « Oui » : le début des règles est noté à la date du jour, comme la saisie « Noter tes règles » (même
 * fonction, « Pas encore » pour la fin), les rappels restants tombent, la prévision se recalcule. « Non » : la notification
 * s'efface, le rappel suivant est déjà programmé.
 */
export async function repondreRappelRegles(db: Executeur, action: string): Promise<void> {
  const r = reponseRegles(action);
  if (!r) return;
  if (r === "oui") {
    const maintenant = Date.now();
    if ((await lireReglagesCycle(db)).suivi) {
      await noterRegles(db, { debut: isoLocal(maintenant), fin: null, flux: 0 }, maintenant);
      signalerSaisie();
    }
    await annulerTous();
    poses = null;
    await rafraichirRappelRegles(db);
  }
  for (const n of await Notifications.getPresentedNotificationsAsync().catch(() => [])) {
    if (estRappelRegles(n.request.identifier)) await Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
  }
}
