import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ecouterRappels, noterEcran, retirerArrivee, type Rappel } from "../natif/notifications-appli";
import { reponseRegles } from "../cycle/rappel-regles";
import { cibleEcran, cibleNotif, ROUTE_CIBLE, routeAuToucher } from "../natif/notifications-regles";
import { rafraichirRappelRegles, repondreRappelRegles } from "../natif/rappel-regles";
import { abonnerSaisies } from "../precision/service";
import { useApp } from "../ecrans/contexte";
import { espace } from "../theme/typo";
import { BandeauAnnuler } from "./BandeauAnnuler";
import { t } from "../i18n/index";

/** Durée d'affichage du bandeau d'un rappel. */
const DUREE_BANDEAU_MS = 5000;

/**
 * Notifications et appli ouverte (docs/NOTIFICATIONS.md), posé une fois à la racine : note l'écran affiché, retire les
 * notifications de l'endroit où l'on arrive (changement d'écran ou retour au premier plan) et montre, à la place d'une
 * notification retenue, le bandeau habituel (BandeauAnnuler) avec « Voir ».
 */
export function NotificationsAppli() {
  const { db } = useApp();
  const chemin = usePathname();
  const bas = useSafeAreaInsets().bottom;
  const [rappel, setRappel] = useState<Rappel | null>(null);
  useEffect(() => noterEcran(cibleEcran(chemin)), [chemin]);
  useEffect(() => {
    // Rappel « Tes règles sont-elles arrivées ? » : reposé au lancement, au premier plan et à chaque saisie du cycle
    void rafraichirRappelRegles(db);
    const finSaisies = abonnerSaisies(() => void rafraichirRappelRegles(db));
    const s = AppState.addEventListener("change", (e) => {
      if (e !== "active") return;
      retirerArrivee();
      void rafraichirRappelRegles(db);
    });
    return () => {
      finSaisies();
      s.remove();
    };
  }, [db]);
  useEffect(() => {
    let vue = "";
    const ouvrir = (r: Notifications.NotificationResponse | null) => {
      // Les boutons Oui et Non du rappel des règles : une seule réponse, lancement à froid compris
      if (r && cibleNotif(r.notification.request.identifier) === "cycle" && reponseRegles(r.actionIdentifier)) {
        const cle = `${r.notification.request.identifier}:${r.notification.date}:${r.actionIdentifier}`;
        if (cle === vue) return;
        vue = cle;
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
        void repondreRappelRegles(db, r.actionIdentifier).catch(console.error);
        return;
      }
      const id = r ? r.notification.request.identifier : "";
      const route = r ? routeAuToucher(id) : null;
      const cle = r ? `${r.notification.request.identifier}:${r.notification.date}` : "";
      // Lancement à froid : la réponse peut arriver par les deux chemins ; une seule ouverture.
      if (!route || cle === vue) return;
      vue = cle;
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
      router.navigate(route);
    };
    Notifications.getLastNotificationResponseAsync()
      .then(ouvrir)
      .catch(() => {});
    const s = Notifications.addNotificationResponseReceivedListener(ouvrir);
    return () => s.remove();
  }, [db]);
  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const fin = ecouterRappels((r) => {
      clearTimeout(minuterie);
      setRappel(r);
      minuterie = setTimeout(() => setRappel(null), DUREE_BANDEAU_MS);
    });
    return () => {
      fin();
      clearTimeout(minuterie);
    };
  }, []);
  return (
    <View pointerEvents="box-none" style={[styles.pose, { bottom: bas + espace.l }]}>
      {rappel ? (
        <BandeauAnnuler
          texte={rappel.titre}
          action={t("ui.voir")}
          onAnnuler={() => {
            setRappel(null);
            router.push(ROUTE_CIBLE[rappel.cible]);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pose: { position: "absolute", left: espace.l, right: espace.l, zIndex: 50, elevation: 50 },
});
