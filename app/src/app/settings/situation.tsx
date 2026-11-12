import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ecrireGardeFous, lireGardeFous, sexeDeclare } from "../../db";
import { useApp } from "../../ecrans/contexte";
import { ChoixGardeFous, cochesValides } from "../../ecrans/garde-fous-ui";
import { rafraichirModeAffichage } from "../../ecrans/nutrition/mode-affichage";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { peutContinuerGardeFous, type ChoixGardeFou } from "../../nutrition/objectifs-calc";
import type { SexeRegle } from "../../nutrition/regle";
import { useTheme } from "../../theme";
import { BarreHaut } from "../../ui/Cadre";
import { PartieImposee } from "../../ui/ContextePartie";
import { BoutonPrincipal } from "../../ui/Degrade";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Texte } from "../../ui/Texte";

/**
 * « Mettre à jour ma situation » (Objectifs, Corps) : les cases de l'étape des garde-fous du parcours (D19), gardées sur le
 * téléphone (D21). Non dessinée : la version la plus simple, l'étape du parcours dans une page (à valider).
 */
export default function Situation() {
  return (
    <PartieImposee partie="nutrition">
      <Page />
    </PartieImposee>
  );
}

function Page() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [sexe, setSexe] = useState<SexeRegle | null>(null);
  const [coches, setCoches] = useState<ChoixGardeFou[]>([]);
  useEffect(() => {
    (async () => {
      const s = await sexeDeclare(db);
      setSexe(s);
      setCoches(cochesValides((await lireGardeFous(db)).coches, s));
    })().catch(console.error);
  }, [db]);
  const enregistrer = async () => {
    await ecrireGardeFous(db, coches);
    await rafraichirModeAffichage(db);
    if (router.canGoBack()) router.back();
  };
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("macros.situation.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <Texte variante="corps" couleur="t2" style={{ fontSize: 15, lineHeight: 21, paddingHorizontal: 32, paddingTop: 8 }}>
          {t("macros.garde.titre")} {t("macros.garde.sousTitre")}
        </Texte>
        <ChoixGardeFous sexe={sexe} coches={coches} onChange={setCoches} couleur={couleurs.partieNutrition} />
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bas + 16 }}>
        <BoutonPrincipal libelle={t("macros.situation.enregistrer")} onPress={() => void enregistrer().catch(signalerErreur())} desactive={!peutContinuerGardeFous(coches)} />
      </View>
    </SafeAreaView>
  );
}
