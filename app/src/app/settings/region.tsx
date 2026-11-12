import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GroupeReglages } from "../../ecrans/Reglage";
import { useRegion } from "../../ecrans/SectionRegion";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";

/**
 * Langue et région (Réglages › Préférences, planche menu) : langue, fuseau, poids et distance. L'ancienne adresse
 * pepfitopen://settings/region, qui renvoyait à Préférences, mène de nouveau à ces réglages.
 */
export default function LangueRegion() {
  useLangue();
  const { couleurs } = useTheme();
  const region = useRegion();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("menu.langueRegion")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 2 }}>
        <GroupeReglages>{region.lignes}</GroupeReglages>
      </ScrollView>
      {region.feuilles}
    </SafeAreaView>
  );
}
