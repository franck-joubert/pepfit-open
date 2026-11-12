import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { t, type CleSimple } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { ecouterExplication, type RaisonExplication } from "../natif/notifications";
import { espace } from "../theme/typo";
import { Bouton } from "./Bouton";
import { FournisseurPartie } from "./ContextePartie";
import { Feuille } from "./Feuille";
import { Texte } from "./Texte";

// Explication avant la demande d'autorisation des notifications (natif/notifications.ts) : une phrase sur ce qu'elles
// apportent ici, « Continuer » (la demande d'Android suit) ou « Plus tard ». Posée une fois, à la racine de l'appli. Sert aussi
// avant la position du premier suivi GPS (n° 13). Repos, suivi et position sont des gestes d'Entraînements : la feuille en
// prend la couleur, d'où qu'elle s'ouvre (n° 7 : « Continuer » était bleu sur une page orange). Un rappel (séance, repas,
// complément) garde celle de l'écran qui le programme. iPhone (`corpsIos`) : « L'iPhone va te demander… », et ce que le mode
// silencieux change (docs/CODE-IOS-RAPPELS.md).

const TEXTES: Record<RaisonExplication, { titre: CleSimple; corps: CleSimple; corpsIos?: CleSimple }> = {
  repos: { titre: "notifs.repos.titre", corps: "notifs.repos.corps", corpsIos: "notifs.repos.corpsIos" },
  suivi: { titre: "notifs.suivi.titre", corps: "notifs.suivi.corps" },
  rappel: { titre: "notifs.rappel.titre", corps: "notifs.rappel.corps", corpsIos: "notifs.rappel.corpsIos" },
  sieste: { titre: "notifs.sieste.titre", corps: "notifs.sieste.corps", corpsIos: "notifs.sieste.corpsIos" },
  position: { titre: "notifs.position.titre", corps: "notifs.position.corps" },
  appareils: { titre: "notifs.appareils.titre", corps: "notifs.appareils.corps" },
  alarmes: { titre: "notifs.alarmes.titre", corps: "notifs.alarmes.corps" },
};

export function FeuilleNotifications() {
  useLangue();
  const [a, setA] = useState<{ raison: RaisonExplication; repondre: (ok: boolean) => void } | null>(null);
  // Garde le texte pendant la descente de la feuille.
  const [raison, setRaison] = useState<RaisonExplication>("repos");
  useEffect(() => ecouterExplication(setA), []);
  useEffect(() => {
    if (a) setRaison(a.raison);
  }, [a]);
  const r = a?.raison ?? raison;
  const x = TEXTES[r];
  const feuille = (
    <Feuille
      visible={a != null}
      onFermer={() => a?.repondre(false)}
      titre={t(x.titre)}
      pied={
        <View style={styles.pied}>
          <Bouton libelle={t("notifs.continuer")} variante="primaire" large onPress={() => a?.repondre(true)} />
          <Bouton libelle={t("notifs.plusTard")} large onPress={() => a?.repondre(false)} />
        </View>
      }
    >
      <Texte variante="corps" couleur="t2" style={styles.corps}>
        {t(Platform.OS === "ios" && x.corpsIos ? x.corpsIos : x.corps)}
      </Texte>
    </Feuille>
  );
  return r === "rappel" || r === "sieste" || r === "alarmes" ? feuille : <FournisseurPartie route="train">{feuille}</FournisseurPartie>;
}

const styles = StyleSheet.create({
  corps: { fontSize: 15, lineHeight: 22, paddingBottom: espace.m },
  pied: { gap: espace.s },
});
