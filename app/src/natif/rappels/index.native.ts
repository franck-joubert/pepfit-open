import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { demanderNotifications, notificationsPermises } from "../notifications";
import { PLAFOND_IOS, plafonner } from "../notifs-ios";
import type { Executeur } from "../../db";
import { lirePlanning, instantDe, jourDe } from "../../ecrans/planif-donnees";
import { ajouterJ, faite } from "../../ecrans/planification";
import { lireActif, t } from "../../i18n/index";
import { lireReglagesHeure } from "../../ecrans/heure-voyage/donnees";
import { instantDans } from "../../ecrans/heure-voyage/horloge";
import { fuseauDesSeances } from "../../ecrans/heure-voyage/voyage";

// Rappels des séances programmées (planche planification v7) : une notification locale à « heure − rappel », sur les
// 14 jours à venir, reposée à chaque lecture d'Entraînements, de l'accueil ou des réglages. Sans vibration (réservée aux
// records et aux erreurs). Android et iPhone (sur iPhone, les 14 plus proches : PLAFOND_IOS, natif/notifs-ios).
const PREFIXE = "planif-";
const JOURS = 14;

let canalPret: Promise<boolean> | null = null;
let langueCanal = "";
function preparer(): Promise<boolean> {
  const langue = lireActif().langue;
  if (!canalPret || langue !== langueCanal) {
    langueCanal = langue;
    canalPret = (async () => {
      await Notifications.setNotificationChannelAsync("planif", {
        name: t("planif.notifCanal"),
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
/** Rappels posés au dernier passage (leur liste en JSON) : inchangés, on ne les retire ni ne les repose (audit de performance,
 * M13 : toutes les notifications reprogrammées à chaque arrivée sur Sport, Routines ou l'Accueil). */
let poses: string | null = null;
/** `demander` : appelé juste après un geste qui pose un rappel (l'autorisation est demandée, avec son explication). */
export function rafraichirRappels(db: Executeur, o: { demander?: boolean } = {}): Promise<void> {
  enCours = enCours.then(() => reposer(db, !!o.demander)).catch(() => {});
  return enCours;
}

async function reposer(db: Executeur, demander: boolean) {
  const maintenant = Date.now();
  const auj = jourDe(maintenant);
  const p = await lirePlanning(db, auj, ajouterJ(auj, JOURS), maintenant);
  // En voyage, « Heure de Paris » (planche sommeil, D14) : la séance sonne à son heure de chez soi ; sinon à l'heure du lieu.
  const actif = lireActif().fuseau;
  const h = await lireReglagesHeure(db).catch(() => null);
  const z = h ? fuseauDesSeances(h.seances, h.voyage, h.maison, actif, maintenant) : actif;
  const instant = (date: string, heure: string) => {
    if (z === actif) return instantDe(date, heure);
    const [hh = 0, mm = 0] = heure.split(":").map(Number);
    return instantDans(date, hh * 60 + mm, z);
  };
  const tous = p.occ.flatMap((o) => {
    const prog = p.progs.find((x) => x.id === o.programmationId);
    const min = prog?.rappelMin ?? p.rappelDefautMin;
    if (!prog || min <= 0 || faite(o, p.jours, p.occ)) return [];
    const quand = instant(o.date, o.heure) - min * 60_000;
    return quand > maintenant ? [{ id: `${PREFIXE}${o.programmationId}-${o.date}`, quand, nom: p.routines.get(o.routineId)?.nom ?? "", heure: o.heure }] : [];
  });
  const prevus = Platform.OS === "ios" ? plafonner(tous, PLAFOND_IOS.planif, (n) => n.quand) : tous;
  const signature = JSON.stringify(prevus);
  if (!demander && signature === poses) return;
  poses = null;
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (n.identifier.startsWith(PREFIXE)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
  if (!prevus.length) {
    poses = signature;
    return;
  }
  // sans autorisation, rien n'est retenu : le prochain passage réessaie
  if (!(await preparer()) || !(await (demander ? demanderNotifications("rappel") : notificationsPermises()))) return;
  for (const n of prevus) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.nom, body: t("planif.notifCorps", { heure: n.heure }), sound: "default" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.quand, channelId: "planif" },
    });
  }
  poses = signature;
}
