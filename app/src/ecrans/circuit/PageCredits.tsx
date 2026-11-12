import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { LIEN_COPYRIGHT_OSM } from "../../circuits/credits";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { espace, police } from "../../theme/typo";
import { AuraFond } from "../../ui/AuraFond";
import { useDefilementAura } from "../../ui/aura-etat";
import { BarreHaut } from "../../ui/Cadre";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Texte } from "../../ui/Texte";
import { GroupeReglages } from "../Reglage";

// « Crédits des données » (planche Circuits, k1 ; Réglages, Aide) : une ligne par source, avec ce que sa licence demande (le nom et la
// licence). Aucun © ailleurs que sur cette page et sur l'attribution de la carte.

export function PageCredits() {
  useLangue();
  const { defilement, surDefilement } = useDefilementAura();
  const ouvrir = (url: string) => Linking.openURL(url).catch(console.error);

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <AuraFond partie="fil" fixe defilement={defilement} />
      <BarreHaut titre={t("circuit.credits.titre")} />
      <Animated.ScrollView onScroll={surDefilement} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        <Texte variante="libelle" couleur="t2" style={styles.intro}>
          {t("circuit.credits.intro")}
        </Texte>
        <GroupeReglages>
          <LigneCredit titre={t("circuit.credits.osm")} texte={t("circuit.credits.osmTexte")}>
            <LienCredit libelle={t("circuit.credits.osmLien")} onPress={() => ouvrir(LIEN_COPYRIGHT_OSM)} />
          </LigneCredit>
          <LigneCredit titre={t("circuit.credits.carte")} texte={t("circuit.credits.carteTexte")} />
        </GroupeReglages>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/** Une source : son nom, ce qu'elle donne et sa licence, et ses liens. `premier` : posé par le groupe. */
function LigneCredit({ titre, texte, premier, children }: { titre: string; texte: string; premier?: boolean; children?: ReactNode }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.ligne, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }]}>
      <Texte accessibilityRole="header" style={styles.titre}>
        {titre}
      </Texte>
      <Texte variante="corps" couleur="t2" style={styles.texte}>
        {texte}
      </Texte>
      {children}
    </View>
  );
}

/** Lien de la page : l'accent de la partie, 44 de haut, calé sur le texte de la ligne. */
function LienCredit({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const accent = useCouleurPartie();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.lien}>
      <Texte variante="libelle" style={{ color: accent, fontFamily: police.medium }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  intro: { paddingHorizontal: espace.l, marginTop: 6, marginBottom: espace.m, lineHeight: 21 },
  ligne: { minHeight: 64, paddingVertical: espace.m, paddingLeft: espace.l, paddingRight: espace.m },
  titre: { fontFamily: police.semibold, fontSize: 15, lineHeight: 20 },
  texte: { marginTop: 2, lineHeight: 19 },
  lien: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
});
