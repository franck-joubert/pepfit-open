import { ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { articlesIntegres } from "../../../../aide/articles";
import { estTheme, THEME } from "../../../../aide/ecrans";
import { GroupeReglages, LigneReglage } from "../../../../ecrans/Reglage";
import { lireActif, t } from "../../../../i18n/index";
import { useLangue } from "../../../../i18n/useLangue";
import { useTheme } from "../../../../theme";
import { espace } from "../../../../theme/typo";
import { BarreHaut } from "../../../../ui/Cadre";
import { Texte } from "../../../../ui/Texte";

/** Un thème des questions fréquentes (e5 › thème) : ses réponses (D13). */
export default function ThemeAide() {
  useLangue();
  const { couleurs } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const langue = lireActif().langue;
  const articles = articlesIntegres(langue).filter((a) => a.theme === id);
  const theme = estTheme(id) ? THEME[id] : null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={theme ? t(theme.titre) : t("aide.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        {!articles.length ? (
          <Texte variante="corps" couleur="t3" style={{ paddingHorizontal: espace.xl, paddingTop: espace.l }}>
            {t("aide.themeVide")}
          </Texte>
        ) : (
          <GroupeReglages style={{ marginTop: espace.m }}>
            {articles.map((a) => (
              <LigneReglage key={a.cle} libelle={a.titre} onPress={() => router.push(`/settings/aide/article/${a.cle}`)} />
            ))}
          </GroupeReglages>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
