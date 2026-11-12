import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";
import { notificationsPermises } from "../notifications";
import { alerteSonne, alerteVibre, canalRepos, PREFIXE_CANAL, VIBRATION_REPOS, type AlerteRepos } from "../../ecrans/alerte-repos";
import { abonner, lireActif, t } from "../../i18n/index";
import { sons } from "../son";
import { MinuteurJs } from "./minuteur-js";
import { FileMinuteur, natifMinuteur, reglageMinuteur, type Creneau } from "./alarme-minuteur";

export type { EtatMinuteur, MinuteurRepos } from "./types";

const ID = "fin-repos";
const ID_CIBLE = "fin-cible";

// L'alarme native (modules/pepfit-alarme, comme la fin de sieste) ; absente d'un APK plus ancien : notification programmée
// d'expo-notifications, qui ne vibre pas en mode silencieux et que « Ne pas déranger » peut taire.
const natif = natifMinuteur(requireOptionalNativeModule("PepfitAlarme"));
const file = natif ? new FileMinuteur(natif) : null;

// Appli au premier plan : la notification est retenue (natif/notifications-appli) ; son et vibration viennent de l'appli.

// Un canal Android est figé une fois créé : un canal par combinaison mode + son (canalRepos), les autres supprimés.
// Son joué sur le flux ALARME (comme un minuteur) : « Ne pas déranger » en mode « interruptions importantes »
// laisse passer les alarmes, avec la vibration.
const prets = new Map<string, Promise<boolean>>();
function preparer(alerte: AlerteRepos, sonUri: string | null): Promise<boolean> {
  const id = canalRepos(alerte, sonUri);
  if (!id) return Promise.resolve(false);
  // La langue fait partie de la clé : le nom du canal (figé côté Android) est reposé quand elle change.
  const cle = `${id}|${lireActif().langue}`;
  let pret = prets.get(cle);
  if (!pret) {
    pret = (async () => {
      const o = { id, nom: t("seance.notif.canal"), prefixe: PREFIXE_CANAL, uri: sonUri, son: alerteSonne(alerte), vibration: alerteVibre(alerte) ? VIBRATION_REPOS : [] };
      // Sans le module natif (APK plus ancien) : canal d'expo-notifications, son par défaut.
      if (!(await sons.canal(o).catch(() => false))) {
        for (const c of await Notifications.getNotificationChannelsAsync().catch(() => [])) {
          if (c.id.startsWith(PREFIXE_CANAL) && c.id !== id) await Notifications.deleteNotificationChannelAsync(c.id).catch(() => {});
        }
        await Notifications.setNotificationChannelAsync(id, {
          name: o.nom,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: o.vibration.length ? o.vibration : null,
          enableVibrate: o.vibration.length > 0,
          sound: o.son ? "default" : null,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.ALARM,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: false,
        });
      }
      // Canal prêt ; l'autorisation est vérifiée à chaque fois, demandée au démarrage d'une séance (natif/notifications).
      return true;
    })().catch(() => false);
    prets.clear();
    prets.set(cle, pret);
  }
  return pret;
}

// Le décompte affiché reste en JS ; la fin du repos est une alarme programmée par AlarmManager (setAlarmClock, que les
// économies d'énergie de Samsung ne décalent pas) : elle sonne et vibre écran verrouillé, appli en arrière-plan ou tuée.
// Alarme native (son sur le flux ALARME, vibration USAGE_ALARM, mode silencieux compris), sinon notification d'expo.
class MinuteurAndroid extends MinuteurJs {
  constructor() {
    super();
    // Langue changée : le canal reprend son nom et la notification déjà programmée son texte.
    abonner(() => {
      preparer(this.alerte, this.sonUri);
      this.programmer();
    });
  }

  regler(alerte: AlerteRepos, sonUri: string | null) {
    const change = alerte !== this.alerte || sonUri !== this.sonUri;
    super.regler(alerte, sonUri);
    preparer(alerte, sonUri);
    if (change) this.programmer();
  }

  /** L'alarme native du créneau : programmée, remplacée ou annulée ; vrai si elle sonnera. */
  private poserNatif(f: FileMinuteur, creneau: Creneau, fin: number | null): Promise<boolean> {
    // Une notification d'expo laissée par une version d'avant ne sonne pas en double.
    Notifications.cancelScheduledNotificationAsync(creneau === "repos" ? ID : ID_CIBLE).catch(() => {});
    const repos = creneau === "repos";
    const r = reglageMinuteur({
      creneau,
      fin,
      alerte: this.alerte,
      sonUri: this.sonUri,
      titre: t(repos ? "seance.notif.titre" : "seance.notif.cibleTitre"),
      corps: t(repos ? "seance.notif.corps" : "seance.notif.cibleCorps"),
      canal: t("seance.notif.canal"),
    });
    return f.poser(creneau, r);
  }

  private programmer() {
    const fin = this.echeance();
    const { alerte, sonUri } = this;
    const channelId = canalRepos(alerte, sonUri);
    this.notifiee = false;
    if (file) {
      this.poserNatif(file, "repos", fin)
        .then((ok) => {
          if (ok && fin === this.echeance()) this.notifiee = true;
        })
        .catch(() => {});
      return;
    }
    Notifications.cancelScheduledNotificationAsync(ID)
      .catch(() => {})
      .then(async () => {
        if (!fin || !channelId || !(await preparer(alerte, sonUri)) || !(await notificationsPermises())) return;
        await Notifications.scheduleNotificationAsync({
          identifier: ID,
          content: { title: t("seance.notif.titre"), body: t("seance.notif.corps"), sound: alerteSonne(alerte) ? "default" : false, priority: "max" },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fin, channelId, delivery: "alarmClock" },
        });
        if (fin === this.echeance()) this.notifiee = true;
      })
      .catch(() => {});
  }

  // Même canal que la fin du repos : le son et la vibration suivent le réglage ; l'appli vibre de toute façon au premier plan.
  alerteCible(finMs: number | null) {
    const { alerte, sonUri } = this;
    const channelId = canalRepos(alerte, sonUri);
    if (file) {
      this.poserNatif(file, "cible", finMs).catch(() => {});
      return;
    }
    Notifications.cancelScheduledNotificationAsync(ID_CIBLE)
      .catch(() => {})
      .then(async () => {
        if (!finMs || finMs <= Date.now() || !channelId || !(await preparer(alerte, sonUri)) || !(await notificationsPermises())) return;
        await Notifications.scheduleNotificationAsync({
          identifier: ID_CIBLE,
          content: { title: t("seance.notif.cibleTitre"), body: t("seance.notif.cibleCorps"), sound: alerteSonne(alerte) ? "default" : false, priority: "max" },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: finMs, channelId, delivery: "alarmClock" },
        });
      })
      .catch(() => {});
  }

  demarrer(dureeS: number) {
    super.demarrer(dureeS);
    this.programmer();
  }
  reprendre(finMs: number, totalS: number) {
    super.reprendre(finMs, totalS);
    this.programmer();
  }
  ajuster(deltaS: number) {
    super.ajuster(deltaS);
    this.programmer();
  }
  passer() {
    super.passer();
    this.programmer();
  }
}

export const minuteur = new MinuteurAndroid();
