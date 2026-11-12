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
import { commencerConnexion, finirConnexion, synchroniser } from "../whoop";
import { messageConnexion } from "../whoop/messages";

/** Retour du navigateur : `pepfitopen://whoop?code=…&state=…` (ou `error=…`), direct ou par la page relais. Termine la connexion puis revient à l'écran d'où elle est partie. */
export default function RetourWhoop() {
  useLangue();
  const { couleurs } = useTheme();
  const { db } = useApp();
  const p = useLocalSearchParams<{ code?: string; state?: string; error?: string; erreur?: string }>();
  const [, rafraichir] = useState(0);
  const fait = useRef(false);
  const [message, setMessage] = useState<MessageFeuille | null>(null);

  // refus dans Whoop (access_denied) ≠ panne de notre côté, qui propose de recommencer (messages.ts) ; un nouvel essai
  // raté (navigateur, serveur) le redit dans la même feuille
  const echec = (e: unknown) => {
    const m = messageConnexion(e);
    setMessage({
      titre: t("reglages.whoop"),
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
        // première synchro tout de suite, sans attendre un toucher sur la ligne Whoop (retours du 29/10) ; son erreur
        // éventuelle s'écrit dans la ligne Whoop de Connexions
        synchroniser(db).catch(console.error);
        setMessage({ titre: t("reglages.whoop"), texte: t("whoop.connecte"), succes: true });
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
        {t("reglages.whoopFinConnexion")}
      </Texte>
      {/* Retour à l'écran qui a lancé la connexion (Connexions, ou « Connecte tes objets » du parcours) ; sinon Connexions. */}
      <FeuilleMessage message={message} onFermer={() => (router.canGoBack() ? router.back() : router.replace("/settings/connexions"))} />
    </View>
  );
}
