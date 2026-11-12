import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";
import { expliquer, notificationsPermises } from "../notifications";
import { etapeHeureExacte } from "../notifications-etape";
import {
  ACTION_DEMARRER_SIESTE, CANAL_RAPPEL_SIESTE, CATEGORIE_RAPPEL_SIESTE, canalSieste, ID_FIN_RECUP, ID_LIBRE_RECUP, ID_RAPPEL_SIESTE, PREFIXE_CANAL_SIESTE,
  siesteSonne, siesteVibre, VIBRATION_SIESTE, type AlerteSieste,
} from "../../ecrans/alerte-sieste";
import { lireActif, t } from "../../i18n/index";
import { sons } from "../son";
import type { AlarmeRecup, DiagAlarme } from "./types";

export type { AlarmeRecup, DiagAlarme } from "./types";

// Module local modules/pepfit-alarme (Kotlin) : une vraie alarme, comme une appli Horloge (setAlarmClock, service qui joue le
// son sur le flux ALARME et fait vibrer en USAGE_ALARM, notification plein écran). Absent d'un APK plus ancien : repli sur
// la notification d'expo-notifications (ci-dessous), qui ne vibre pas en mode silencieux et que « Ne pas déranger » peut taire.
interface Natif {
  programmer(fin: number, titre: string, corps: string, bouton: string, son: boolean, uri: string | null, vibration: number[]): Promise<boolean>;
  annuler(): Promise<void>;
  arreter(): Promise<void>;
  diagnostic(): Promise<Record<string, unknown>>;
  ouvrirPleinEcran(): Promise<void>;
  heureExacte?(): Promise<boolean>;
  ouvrirHeureExacte?(): Promise<void>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitAlarme");

/** Le diagnostic du module natif (clés en snake_case côté Kotlin) en objet de l'appli. */
export function lireDiagnostic(d: Record<string, unknown> | null | undefined): DiagAlarme | null {
  if (!d) return null;
  const nd = d.ne_pas_deranger;
  const so = d.sonnerie;
  return {
    neDeranger: nd === "total" || nd === "alarmes" || nd === "priorite" ? nd : "non",
    alarmesPermises: d.alarmes_permises !== false,
    sonnerie: so === "silencieux" || so === "vibreur" ? so : "normal",
    volumeAlarme: typeof d.volume_alarme === "number" ? d.volume_alarme : 1,
    pleinEcran: d.plein_ecran !== false,
    heureExacte: d.heure_exacte !== false,
    economie: d.economie === true,
  };
}

// L'alarme de fin de sieste (planche recuperer, § 3.2) : le même système que le minuteur de repos (natif/minuteur) : un canal
// par combinaison mode + son (canalSieste), son joué sur le flux ALARME (« Ne pas déranger » en « interruptions importantes »
// laisse passer les alarmes), et une notification programmée par AlarmManager (setAlarmClock, que les économies d'énergie de
// Samsung ne décalent pas). Appli au premier plan : natif/notifications-appli retient la notification système mais joue le
// son et vibre quand même (une alarme de sieste sonne toujours).
const prets = new Map<string, Promise<boolean>>();
function preparer(alerte: AlerteSieste, sonUri: string | null): Promise<boolean> {
  const id = canalSieste(alerte, sonUri);
  const cle = `${id}|${lireActif().langue}`;
  let pret = prets.get(cle);
  if (!pret) {
    pret = (async () => {
      const o = { id, nom: t("recuperer.notif.canalSieste"), prefixe: PREFIXE_CANAL_SIESTE, uri: sonUri, son: siesteSonne(alerte), vibration: siesteVibre(alerte) ? VIBRATION_SIESTE : [] };
      // Sans le module natif (APK plus ancien) : canal d'expo-notifications, son par défaut.
      if (!(await sons.canal(o).catch(() => false))) {
        for (const c of await Notifications.getNotificationChannelsAsync().catch(() => [])) {
          if (c.id.startsWith(PREFIXE_CANAL_SIESTE) && c.id !== id) await Notifications.deleteNotificationChannelAsync(c.id).catch(() => {});
        }
        await Notifications.setNotificationChannelAsync(id, {
          name: o.nom,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: o.vibration.length ? o.vibration : null,
          enableVibrate: o.vibration.length > 0,
          sound: o.son ? "default" : null,
          audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: false,
        });
      }
      return true;
    })().catch(() => false);
    prets.clear();
    prets.set(cle, pret);
  }
  return pret;
}

let rappelPret: Promise<void> | null = null;
function preparerRappel(): Promise<void> {
  rappelPret ??= (async () => {
    await Notifications.setNotificationChannelAsync(CANAL_RAPPEL_SIESTE, {
      name: t("recuperer.notif.canalRappel"),
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      vibrationPattern: null,
    });
    await Notifications.setNotificationCategoryAsync(CATEGORIE_RAPPEL_SIESTE, [
      { identifier: ACTION_DEMARRER_SIESTE, buttonTitle: t("recuperer.activite.demarrer"), options: { opensAppToForeground: true } },
    ]);
  })().catch(() => {
    rappelPret = null;
  });
  return rappelPret;
}

// « Plus tard » à la feuille de l'heure exacte : on ne la remontre pas avant la prochaine ouverture de l'appli.
let exactePlusTard = false;

export const alarmeRecup: AlarmeRecup = {
  natif: natif != null,
  arreter: async () => {
    await natif?.arreter().catch(() => {});
  },
  diagnostic: async () => (natif ? lireDiagnostic(await natif.diagnostic().catch(() => null)) : null),
  ouvrirPleinEcran: async () => {
    await natif?.ouvrirPleinEcran().catch(() => {});
  },
  async demanderHeureExacte() {
    // APK sans les fonctions (module plus ancien) : rien à demander, USE_EXACT_ALARM y était accordée d'office.
    if (!natif?.heureExacte || !natif.ouvrirHeureExacte) return;
    const exacte = await natif.heureExacte().catch(() => true);
    if (etapeHeureExacte({ exacte, plusTard: exactePlusTard }) !== "expliquer") return;
    if (await expliquer("alarmes")) await natif.ouvrirHeureExacte().catch(() => {});
    else exactePlusTard = true;
  },
  async programmer({ fin, sieste, nom, alerte, sonUri }) {
    await Notifications.cancelScheduledNotificationAsync(ID_FIN_RECUP).catch(() => {});
    if (natif) {
      if (!fin) {
        await natif.annuler().catch(() => {});
        return false;
      }
      if (fin <= Date.now()) return false;
      return natif
        .programmer(
          fin,
          t(sieste ? "recuperer.notif.siesteTitre" : "recuperer.notif.activiteTitre"),
          sieste ? t("recuperer.notif.siesteCorps") : t("recuperer.notif.activiteCorps", { nom }),
          t("recuperer.notif.reveille"),
          siesteSonne(alerte),
          sonUri,
          siesteVibre(alerte) ? VIBRATION_SIESTE : [],
        )
        .catch(() => false);
    }
    if (!fin || fin <= Date.now() || !(await preparer(alerte, sonUri)) || !(await notificationsPermises())) return false;
    await Notifications.scheduleNotificationAsync({
      identifier: ID_FIN_RECUP,
      content: {
        title: t(sieste ? "recuperer.notif.siesteTitre" : "recuperer.notif.activiteTitre"),
        body: sieste ? t("recuperer.notif.siesteCorps") : t("recuperer.notif.activiteCorps", { nom }),
        sound: siesteSonne(alerte) ? "default" : false,
        priority: "max",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fin, channelId: canalSieste(alerte, sonUri), delivery: "alarmClock" },
    });
    return true;
  },
  async fermetureLibre(fin) {
    await Notifications.cancelScheduledNotificationAsync(ID_LIBRE_RECUP).catch(() => {});
    if (!fin || fin <= Date.now() || !(await notificationsPermises())) return;
    await preparerRappel();
    await Notifications.scheduleNotificationAsync({
      identifier: ID_LIBRE_RECUP,
      content: { title: t("recuperer.notif.libreTitre"), body: t("recuperer.notif.libreCorps"), sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fin, channelId: CANAL_RAPPEL_SIESTE },
    });
  },
  async rappel(o) {
    await Notifications.cancelScheduledNotificationAsync(ID_RAPPEL_SIESTE).catch(() => {});
    if (!o || o.quand <= Date.now() || !(await notificationsPermises())) return;
    await preparerRappel();
    await Notifications.scheduleNotificationAsync({
      identifier: ID_RAPPEL_SIESTE,
      content: { title: t("recuperer.notif.rappelTitre"), body: t("recuperer.notif.rappelCorps", { dette: o.dette }), sound: false, categoryIdentifier: CATEGORIE_RAPPEL_SIESTE },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: o.quand, channelId: CANAL_RAPPEL_SIESTE },
    });
  },
};
