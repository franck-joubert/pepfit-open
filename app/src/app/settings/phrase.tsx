import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { phraseLocale } from "../../sync/local";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";

/**
 * La phrase de secours des sauvegardes chiffrées : juste après sa création (passée en paramètre), ou relue depuis ce
 * téléphone. Sans elle, une sauvegarde chiffrée ne s'ouvre pas.
 */
export default function Phrase() {
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const p = useLocalSearchParams<{ phrase?: string }>();
  const [phrase, setPhrase] = useState(p.phrase ?? null);
  useEffect(() => {
    if (!p.phrase)
      phraseLocale()
        .then(setPhrase)
        .catch(() => setPhrase(null));
  }, [p.phrase]);
  const mots = phrase?.split(" ") ?? [];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("compte.phrase")} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Texte variante="note" couleur="t2" style={{ marginBottom: espace.l }}>
          {t("compte.phraseAQuoiSert")}
        </Texte>
        <View style={styles.grille}>
          {mots.map((m, i) => (
            <View key={i} style={[styles.mot, { backgroundColor: couleurs.s2 }]}>
              <Texte variante="meta" couleur="t2" style={{ width: 18 }}>
                {i + 1}
              </Texte>
              <Texte variante="saisie" selectable>
                {m}
              </Texte>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.dock, { paddingBottom: Math.max(bas, espace.s) + espace.l }]}>
        <BoutonPrincipal libelle={t("compte.jenaiNote")} onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenu: { paddingHorizontal: espace.l, paddingTop: espace.s, paddingBottom: espace.l },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: espace.s, justifyContent: "space-between" },
  mot: { width: "48.5%", minHeight: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l },
  dock: { paddingHorizontal: espace.l, paddingTop: espace.m },
});
