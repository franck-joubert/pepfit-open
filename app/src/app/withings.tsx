import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../theme";
import { useApp } from "../ecrans/contexte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { Attente } from "../ui/Attente";
import { Texte } from "../ui/Texte";
import { FeuilleMessage, type MessageFeuille } from "../ui/FeuilleMessage";
import { commencerConnexion, finirConnexion, synchroniser } from "../withings";
import { messageConnexion } from "../withings/messages";

/** Retour du navigateur : `pepfitopen://withings?code=…&state=…` (ou `error=…`), direct ou par la page relais. Termine la connexion, comme pour Whoop
 *  (whoop.tsx), puis revient à l'écran d'où elle est partie. */
export default function RetourWithings() {
  useLangue();
  const { couleurs } = useTheme();
  const { db } = useApp();
  const p = useLocalSearchParams<{ code?: string; state?: string; error?: string; erreur?: string }>();
  const [, rafraichir] = useState(0);
  const fait = useRef(false);
  const [message, setMessage] = useState<MessageFeuille | null>(null);

  const echec = (e: unknown) => {
    const m = messageConnexion(e);
    setMessage({
      titre: t("reglages.withings"),
      texte: t(m.cle),
      action: m.reessayer ? { libelle: t("whoop.reessayer"), onPress: () => void commencerConnexion().catch(echec) } : undefined,
    });
  };

  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    (async () => {
      try {
        await finirConnexion(db, { code: p.code, state: p.state, erreur: p.error ?? p.erreur });
        // première lecture tout de suite (tout l'historique de la balance) ; son erreur éventuelle va dans la ligne Withings
        synchroniser(db).catch(console.error);
        setMessage({ titre: t("reglages.withings"), texte: t("withings.connecte"), succes: true });
      } catch (e) {
        echec(e);
      }
      rafraichir((n) => n + 1);
    })();
  }, [db, p.code, p.state, p.error, p.erreur]);

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Attente />
      <Texte variante="corps" couleur="t2">
        {t("reglages.withingsFinConnexion")}
      </Texte>
      <FeuilleMessage message={message} onFermer={() => (router.canGoBack() ? router.back() : router.replace("/settings/connexions"))} />
    </View>
  );
}
