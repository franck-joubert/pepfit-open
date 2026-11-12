// « Récupérer » à la racine de l'appli (planche recuperer, § 3.2 et 3.8), posé une fois : au lancement et au retour de l'appli,
// une sieste en cours se rouvre (elle survit à l'appli tuée), une sieste oubliée s'enregistre seule ; le rappel du jour est
// programmé ou retiré ; le bouton « Démarrer » du rappel lance la sieste conseillée.
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { ACTION_DEMARRER_SIESTE, ID_RAPPEL_SIESTE } from "../alerte-sieste";
import { useApp } from "../contexte";
import { depsReleveAppareil } from "../recup-appareil";
import { heureDecimale, recommandation } from "../recuperer";
import { prochaineReleve, relireMontre } from "../recuperer-releve";
import { oublierMemoire } from "../sante-charge";
import { memoireStats } from "../stats-jour";
import { demarrerRecup, lireEnCoursRecup, lireReglagesRecup, planifierRappel, reprendreRecup } from "../recuperer-session";

const ECART_MS = 60_000;
/** L'appli ouverte vérifie l'échéance d'une relecture de la montre au plus tard à cet écart (le minuteur est borné). */
const VEILLE_MAX_MS = 60_000;

export function RepriseRecup() {
  const { db } = useApp();
  const derniere = useRef(0);
  useEffect(() => {
    lireReglagesRecup(db).catch(() => null);
    reprendreRecup(db)
      .then((r) => {
        if (r.enCours) router.push(r.enCours.type === "respiration" ? "/recuperer/respiration" : "/recuperer/en-cours");
      })
      .catch((e) => console.error(e));
    const passer = () => {
      if (Date.now() - derniere.current < ECART_MS) return;
      derniere.current = Date.now();
      reprendreRecup(db)
        .then(() => planifierRappel(db))
        .catch((e) => console.error(e));
    };
    // la mesure de la montre d'une sieste finie : relue quand l'échéance est là, appli ouverte (minuteur) ou à son retour ;
    // une mesure arrivée change la dette et la Récupération : les pages Santé et Sport oublient leur mémoire
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    let vivant = true;
    const releve = () => {
      if (minuteur) clearTimeout(minuteur);
      minuteur = null;
      relireMontre(db, depsReleveAppareil(db))
        .then((n) => {
          if (n > 0) {
            oublierMemoire();
            memoireStats.oublier();
          }
          return prochaineReleve(db);
        })
        .then((d) => {
          if (vivant && d != null) minuteur = setTimeout(releve, Math.min(Math.max(d, 1000), VEILLE_MAX_MS));
        })
        .catch((e) => console.error(e));
    };
    passer();
    releve();
    const abo = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      passer();
      releve();
    });
    // le rappel touché : « Démarrer » lance la sieste conseillée ; la notification elle-même ouvre la page Récupération
    const repondre = async (r: Notifications.NotificationResponse | null) => {
      if (!r || r.notification.request.identifier !== ID_RAPPEL_SIESTE) return;
      if (r.actionIdentifier === ACTION_DEMARRER_SIESTE) {
        if (!(await lireEnCoursRecup(db))) await demarrerRecup(db, { type: "sieste", choisi: recommandation(heureDecimale(Date.now())).min });
        router.push("/recuperer/en-cours");
      } else router.push("/sante/recuperation");
      await Notifications.dismissNotificationAsync(ID_RAPPEL_SIESTE).catch(() => {});
    };
    Notifications.getLastNotificationResponseAsync()
      .then((r) => repondre(r))
      .catch(() => {});
    const reponse = Notifications.addNotificationResponseReceivedListener((r) => void repondre(r).catch(console.error));
    return () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
      abo.remove();
      reponse.remove();
    };
  }, [db]);
  return null;
}
