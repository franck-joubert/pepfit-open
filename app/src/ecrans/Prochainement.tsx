import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { TeteOnglet } from "../ui/Cadre";
import { Icone, type NomIcone } from "../ui/Icone";
import { useMargeMenu } from "../ui/MenuFlottant";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

/** Onglet pas encore ouvert : son titre, son icône et « Prochainement », rien d'autre. */
export function Prochainement({ titre, icone }: { titre: string; icone: NomIcone }) {
  useLangue();
  const { couleurs } = useTheme();
  const marge = useMargeMenu();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      <TeteOnglet titre={titre} />
      <View style={[styles.centre, { paddingBottom: marge }]}>
        <Icone nom={icone} couleur={couleurs.t3} taille={32} />
        <Texte variante="corps" couleur="t3" style={{ fontSize: 15 }}>
          {t("ui.bientot")}
        </Texte>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: espace.m },
});
