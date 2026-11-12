import * as Notifications from "expo-notifications";
import { notificationsPermises } from "../notifications";
import { SON_REPOS, sonIos } from "../notifs-ios";
import { alerteSonne, alerteVibre, type AlerteRepos } from "../../ecrans/alerte-repos";
import { abonner, t } from "../../i18n/index";
import { MinuteurJs } from "./minuteur-js";

export type { EtatMinuteur, MinuteurRepos } from "./types";

const ID = "fin-repos";
const ID_CIBLE = "fin-cible";

// iPhone (docs/CODE-IOS-RAPPELS.md) : pas d'alarme pour une appli tierce. Le décompte reste en JS (MinuteurJs) ; la fin du
// repos est une notification locale programmée à l'heure (DATE), « urgente » (timeSensitive : passe une Concentration si
// l'utilisateur a laissé « Notifications urgentes » allumé), avec le son de l'appli (assets/sons, au plus 30 s) ou un son
// muet pour vibrer seulement. Le mode silencieux coupe ce son appli fermée ; appli ouverte, natif/notifications-appli le
// joue par le module PepfitAlarme, que le mode silencieux ne coupe pas. « Rien » : pas de notification.

/** Une notification par identifiant à la fois : la dernière demande gagne (ajuster vite plusieurs fois de suite). */
const files = new Map<string, Promise<void>>();
function poser(id: string, f: () => Promise<void>): Promise<void> {
  const p = (files.get(id) ?? Promise.resolve()).then(f).catch(() => {});
  files.set(id, p);
  return p;
}

function contenu(alerte: AlerteRepos, titre: string, corps: string): Notifications.NotificationContentInput | null {
  const sound = sonIos({ sonne: alerteSonne(alerte), vibre: alerteVibre(alerte), son: SON_REPOS });
  if (sound === false) return null;
  return { title: titre, body: corps, sound, interruptionLevel: "timeSensitive", data: { son: sound } };
}

class MinuteurIos extends MinuteurJs {
  constructor() {
    super();
    // Langue changée : la notification déjà programmée reprend son texte.
    abonner(() => this.programmer());
  }

  regler(alerte: AlerteRepos, sonUri: string | null) {
    const change = alerte !== this.alerte || sonUri !== this.sonUri;
    super.regler(alerte, sonUri);
    if (change) this.programmer();
  }

  private programmer() {
    const fin = this.echeance();
    const alerte = this.alerte;
    this.notifiee = false;
    void poser(ID, async () => {
      await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
      const c = contenu(alerte, t("seance.notif.titre"), t("seance.notif.corps"));
      if (!fin || fin <= Date.now() || !c || fin !== this.echeance() || !(await notificationsPermises())) return;
      await Notifications.scheduleNotificationAsync({ identifier: ID, content: c, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fin } });
      if (fin === this.echeance()) this.notifiee = true;
    });
  }

  // Fin du compte à rebours d'une série en durée : même notification que la fin du repos.
  alerteCible(finMs: number | null) {
    const alerte = this.alerte;
    void poser(ID_CIBLE, async () => {
      await Notifications.cancelScheduledNotificationAsync(ID_CIBLE).catch(() => {});
      const c = contenu(alerte, t("seance.notif.cibleTitre"), t("seance.notif.cibleCorps"));
      if (!finMs || finMs <= Date.now() || !c || !(await notificationsPermises())) return;
      await Notifications.scheduleNotificationAsync({ identifier: ID_CIBLE, content: c, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: finMs } });
    });
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

export const minuteur = new MinuteurIos();
