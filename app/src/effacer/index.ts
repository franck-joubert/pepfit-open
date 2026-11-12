import { reloadAppAsync } from "expo";
import { Directory, File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import * as SecureStore from "../coffre";
import { defaultDatabaseDirectory, type SQLiteDatabase } from "expo-sqlite";
import { alarmeRecup } from "../natif/alarme-recup";
import { cookies } from "../natif/cookies";
import { stockage } from "../natif/stockage";
import { suivi } from "../natif/suivi";
import { revoquerAcces } from "../whoop";
import { revoquerAcces as revoquerPolar } from "../polar";
import { effacerTout, TEMOIN, type DepsEffacement } from "./logique";

export { ErreurEffacement } from "./logique";

// Effacement des données de ce téléphone : les gestes réels (logique et inventaire : ./logique.ts). Après le redémarrage, la
// base se recrée vide et l'appli s'ouvre sur la bienvenue, comme une première installation.

/** La base fermée par un effacement : elle ne se rouvre qu'au redémarrage (une seconde fermeture lèverait une erreur). */
let fermee: SQLiteDatabase | null = null;

const supprimer = (e: File | Directory) => {
  if (e.exists) e.delete();
};
const temoin = () => new File(Paths.document, TEMOIN);

function deps(db: SQLiteDatabase | null, whoopNonRevoque: () => Promise<void> = async () => {}): DepsEffacement {
  return {
    // Whoop et Polar ensemble, dans le même délai : faux si l'un d'eux n'a pas répondu (Withings : jetons oubliés avec le coffre)
    revoquerWhoop: async () =>
      (await Promise.all([revoquerAcces().catch(() => false), revoquerPolar().catch(() => false)])).every(Boolean),
    whoopNonRevoque,
    poserTemoin: async () => {
      if (!temoin().exists) temoin().create();
    },
    retirerTemoin: async () => supprimer(temoin()),
    arreterSeance: () => suivi.oublier(),
    annulerNotifications: async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.dismissAllNotificationsAsync();
      // l'alarme de sieste est celle du module natif (AlarmManager, préférences pepfit_alarme) : retirée à part
      await alarmeRecup.programmer({ fin: null, sieste: true, nom: "", alerte: "les-deux", sonUri: null }).catch(() => false);
      await alarmeRecup.arreter().catch(() => {});
    },
    fermerBase: async () => {
      if (!db || fermee === db) return;
      await db.closeAsync();
      fermee = db;
    },
    supprimerFichierBase: async (nom) => supprimer(new File(`file://${defaultDatabaseDirectory}`, nom)),
    effacerCle: (cle) => SecureStore.deleteItemAsync(cle),
    effacerCookies: () => cookies.effacer(),
    rendreAccesDossiers: () => stockage.rendreAcces(),
    supprimerDossier: async (nom) => supprimer(new Directory(Paths.document, nom)),
    viderDocumentsEtCache: async (garder) => {
      for (const e of Paths.document.list()) if (e.name !== garder) supprimer(e);
      for (const e of Paths.cache.list()) supprimer(e);
    },
    redemarrer: () => reloadAppAsync("effacement des données"),
  };
}

/**
 * « Effacer les données de ce téléphone » : accès Whoop révoqué (5 s au plus ; sinon `whoopNonRevoque`, que l'écran affiche),
 * puis tout, puis redémarrage sur la bienvenue. Lève ErreurEffacement ; rejouable.
 */
export const effacerCeTelephone = (db: SQLiteDatabase, whoopNonRevoque: () => Promise<void>) => {
  return effacerTout(deps(db, whoopNonRevoque), { redemarrer: true, distant: true });
};

/** Au lancement, avant d'ouvrir la base : finit un effacement interrompu (appli tuée, ou étape ratée puis abandonnée). */
export async function reprendreEffacement(): Promise<void> {
  if (temoin().exists) await effacerTout(deps(null), { redemarrer: false });
}
