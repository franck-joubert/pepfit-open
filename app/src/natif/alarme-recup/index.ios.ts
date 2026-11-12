import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";
import { notificationsPermises } from "../notifications";
import {
  ACTION_ARRETER, ACTION_REPORTER, CATEGORIE_ALARME, estRelance, lireDiagIos, relances, REPORT_MS, SON_REVEIL, sonIos,
} from "../notifs-ios";
import { arreterSonAlarme } from "../son-alarme";
import {
  ACTION_DEMARRER_SIESTE, CATEGORIE_RAPPEL_SIESTE, ID_FIN_RECUP, ID_LIBRE_RECUP, ID_RAPPEL_SIESTE, siesteSonne, siesteVibre, type AlerteSieste,
} from "../../ecrans/alerte-sieste";
import { lireActif, t } from "../../i18n/index";
import type { AlarmeRecup, DiagAlarme } from "./types";

export type { AlarmeRecup, DiagAlarme } from "./types";

// iPhone (docs/CODE-IOS-RAPPELS.md) : pas de vraie alarme pour une appli tierce (AlarmKit, iOS 26, n'est pas encore
// branché). La fin d'une sieste ou d'une activité est une notification locale programmée à l'heure, « urgente »
// (timeSensitive), avec le son de réveil de l'appli (28 s : iOS joue au plus 30 s) ; pour une sieste, trois relances toutes
// les 30 s prolongent la sonnerie (relances, natif/notifs-ios). Sur la notification : « Arrêter » (fait taire et annule les
// relances) et « Reporter » (5 min). Limites : le mode silencieux coupe le son appli fermée (elle vibre), une Concentration
// la tait si « Notifications urgentes » est éteint, pas d'écran plein. Appli ouverte, natif/notifications-appli joue le son
// par le module PepfitAlarme (le mode silencieux ne le coupe pas) et l'écran de la sieste vibre.
interface Natif {
  diagnostic(): Promise<Record<string, unknown>>;
  ouvrirReglages(): Promise<void>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitAlarme");

/** Ce que la dernière alarme programmée disait : « Reporter » la repose à l'identique. */
let derniere: { titre: string; corps: string; sound: string | false; relancer: boolean } | null = null;
/** L'heure de la fin programmée (0 : aucune) : passée, les relances à venir n'ont plus lieu d'être quand on l'arrête. */
let finPosee = 0;

// Les titres des boutons sont figés à l'inscription de la catégorie : reposés quand la langue change.
let categoriesPretes: Promise<void> | null = null;
let langueCategories = "";
function preparer(): Promise<void> {
  if (lireActif().langue !== langueCategories) categoriesPretes = null;
  langueCategories = lireActif().langue;
  categoriesPretes ??= (async () => {
    await Notifications.setNotificationCategoryAsync(CATEGORIE_ALARME, [
      { identifier: ACTION_ARRETER, buttonTitle: t("recuperer.notif.arreter"), options: { opensAppToForeground: false, isDestructive: true } },
      { identifier: ACTION_REPORTER, buttonTitle: t("recuperer.notif.reporter"), options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORIE_RAPPEL_SIESTE, [
      { identifier: ACTION_DEMARRER_SIESTE, buttonTitle: t("recuperer.activite.demarrer"), options: { opensAppToForeground: true } },
    ]);
  })().catch(() => {
    categoriesPretes = null;
  });
  return categoriesPretes;
}

async function annulerRelances() {
  for (const n of await Notifications.getAllScheduledNotificationsAsync().catch(() => [])) {
    if (estRelance(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
}

/** Retire de l'écran la fin de sieste et ses relances déjà arrivées. */
async function retirerAffichees() {
  for (const n of await Notifications.getPresentedNotificationsAsync().catch(() => [])) {
    const id = n.request.identifier;
    if (id === ID_FIN_RECUP || estRelance(id)) await Notifications.dismissNotificationAsync(id).catch(() => {});
  }
}

/** La notification de fin et ses relances, à `fin`. */
async function poserFin(fin: number, d: NonNullable<typeof derniere>) {
  finPosee = fin;
  const contenu = (relance: boolean): Notifications.NotificationContentInput => ({
    title: d.titre,
    body: d.corps,
    sound: d.sound,
    interruptionLevel: "timeSensitive",
    categoryIdentifier: CATEGORIE_ALARME,
    // une relance ne remplace pas la notification précédente dans le centre de notifications : même fil
    threadIdentifier: ID_FIN_RECUP,
    data: { son: d.sound || null, relance, relancer: d.relancer },
  });
  await Notifications.scheduleNotificationAsync({ identifier: ID_FIN_RECUP, content: contenu(false), trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fin } });
  if (!d.relancer) return;
  for (const r of relances(fin)) {
    await Notifications.scheduleNotificationAsync({ identifier: r.id, content: contenu(true), trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.quand } });
  }
}

/** Fait taire : le son joué par l'appli, les relances si la fin a sonné (sinon la sieste continue), les notifications affichées. */
async function arreter(sonnee = false) {
  await arreterSonAlarme();
  if (sonnee || (finPosee && Date.now() >= finPosee)) {
    await annulerRelances();
    finPosee = 0;
  }
  await retirerAffichees();
}

// Réponses à la notification (boutons : l'appli est réveillée en arrière-plan, sans s'ouvrir) : « Arrêter » ou le toucher
// simple font taire (le toucher ouvre aussi l'appli sur la sieste, RepriseRecup) ; « Reporter » repose la même alarme 5 min
// plus tard. Écouteur posé au chargement du module (importé au lancement : natif/notifications-appli, ecrans/recuperer-session).
Notifications.addNotificationResponseReceivedListener((r) => {
  const id = r.notification.request.identifier;
  if (id !== ID_FIN_RECUP && !estRelance(id)) return;
  if (r.actionIdentifier === ACTION_REPORTER) {
    // appli tuée entre-temps : la mémoire du module est vide, la notification dit tout
    const c = r.notification.request.content;
    const son = c.data?.son;
    const d = derniere ?? { titre: c.title ?? "", corps: c.body ?? "", sound: typeof son === "string" ? son : false, relancer: c.data?.relancer === true };
    void (async () => {
      await arreter(true);
      derniere = d;
      await poserFin(Date.now() + REPORT_MS, d);
    })().catch(() => {});
  } else void arreter(true);
});

export const alarmeRecup: AlarmeRecup = {
  // Pas une alarme native : l'écran de la sieste vibre lui-même, appli ouverte, sans notification permise.
  natif: false,
  arreter,
  // « Alarmes et rappels » est un réglage d'Android : rien à demander sur iPhone.
  async demanderHeureExacte() {},
  async diagnostic(): Promise<DiagAlarme | null> {
    const ios = natif ? lireDiagIos(await natif.diagnostic().catch(() => null)) : null;
    if (!ios) return null;
    // Champs d'Android neutres : seul `ios` compte (avertissementAlarme).
    return { ios, neDeranger: "non", alarmesPermises: true, sonnerie: "normal", volumeAlarme: 1, pleinEcran: true, heureExacte: true, economie: false };
  },
  // Pas d'écran plein sur iPhone : les réglages de notifications de l'appli (« Notifications urgentes », sons).
  ouvrirPleinEcran: async () => {
    await natif?.ouvrirReglages().catch(() => {});
  },
  async programmer({ fin, sieste, nom, alerte }: { fin: number | null; sieste: boolean; nom: string; alerte: AlerteSieste; sonUri: string | null }) {
    await Notifications.cancelScheduledNotificationAsync(ID_FIN_RECUP).catch(() => {});
    await annulerRelances();
    derniere = null;
    finPosee = 0;
    if (!fin || fin <= Date.now() || !(await notificationsPermises())) return false;
    await preparer();
    derniere = {
      titre: t(sieste ? "recuperer.notif.siesteTitre" : "recuperer.notif.activiteTitre"),
      corps: sieste ? t("recuperer.notif.siesteCorps") : t("recuperer.notif.activiteCorps", { nom }),
      sound: sonIos({ sonne: siesteSonne(alerte), vibre: siesteVibre(alerte), son: SON_REVEIL }),
      relancer: sieste,
    };
    await poserFin(fin, derniere);
    return true;
  },
  async fermetureLibre(fin) {
    await Notifications.cancelScheduledNotificationAsync(ID_LIBRE_RECUP).catch(() => {});
    if (!fin || fin <= Date.now() || !(await notificationsPermises())) return;
    await Notifications.scheduleNotificationAsync({
      identifier: ID_LIBRE_RECUP,
      content: { title: t("recuperer.notif.libreTitre"), body: t("recuperer.notif.libreCorps"), sound: false, interruptionLevel: "passive" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fin },
    });
  },
  async rappel(o) {
    await Notifications.cancelScheduledNotificationAsync(ID_RAPPEL_SIESTE).catch(() => {});
    if (!o || o.quand <= Date.now() || !(await notificationsPermises())) return;
    await preparer();
    await Notifications.scheduleNotificationAsync({
      identifier: ID_RAPPEL_SIESTE,
      content: { title: t("recuperer.notif.rappelTitre"), body: t("recuperer.notif.rappelCorps", { dette: o.dette }), sound: false, categoryIdentifier: CATEGORIE_RAPPEL_SIESTE },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: o.quand },
    });
  },
};
