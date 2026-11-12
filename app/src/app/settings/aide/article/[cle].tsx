import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { articleAide } from "../../../../aide/articles";
import { THEME } from "../../../../aide/ecrans";
import { BoutonEcran } from "../../../../ecrans/aide/Briques";
import { lireActif, t } from "../../../../i18n/index";
import { useLangue } from "../../../../i18n/useLangue";
import { useTheme } from "../../../../theme";
import { espace, police } from "../../../../theme/typo";
import { BarreHaut } from "../../../../ui/Cadre";
import { Texte } from "../../../../ui/Texte";

/**
 * Une réponse de l'aide (planche aide-retours, e7) : titre, thème, intro, étapes numérotées, bouton vers le bon écran.
 */
export default function ArticleAide() {
  useLangue();
  const { couleurs } = useTheme();
  const { cle } = useLocalSearchParams<{ cle: string }>();
  const langue = lireActif().langue;
  const a = articleAide(langue, String(cle));

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        {!a ? (
          <Texte variante="corps" couleur="t3" style={styles.bloc}>
            {t("aide.introuvable")}
          </Texte>
        ) : (
          <View style={styles.bloc}>
            <Texte variante="titre" accessibilityRole="header" style={styles.titre}>
              {a.titre}
            </Texte>
            <Texte variante="libelle" couleur="t3" style={{ marginTop: espace.xs }}>
              {t(THEME[a.theme].titre)}
            </Texte>
            {a.intro ? (
              <Texte variante="note" style={{ marginTop: espace.l }}>
                {a.intro}
              </Texte>
            ) : null}
            {a.etapes.map((e, i) => (
              <View key={i} style={styles.etape}>
                <View style={[styles.rond, { backgroundColor: couleurs.s2 }]}>
                  <Texte variante="meta" style={{ fontFamily: police.semibold }}>
                    {String(i + 1)}
                  </Texte>
                </View>
                <Texte variante="note" style={{ flex: 1 }}>
                  {e}
                </Texte>
              </View>
            ))}
            {a.ecran ? <BoutonEcran ecran={a.ecran} style={{ marginTop: espace.xl }} /> : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bloc: { paddingHorizontal: espace.xl, paddingTop: espace.m },
  titre: { fontSize: 22, lineHeight: 28 },
  etape: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginTop: espace.m },
  rond: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: -3 },
});
