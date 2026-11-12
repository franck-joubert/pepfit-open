import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { TAILLE_MIN } from "../theme/typo";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { ATTRIBUTION_CARTE } from "./carte-style";

/** Le crédit reste lisible ce temps à l'ouverture de la carte, puis se replie sur le « i » (comme l'attribution de MapLibre). */
export const ATTRIBUTION_LISIBLE_MS = 5000;

/**
 * La mention du fond de carte (planche Circuits, « l'attribution discrète »). La fondation OpenStreetMap veut le crédit dans un coin de la carte,
 * lisible sans rien toucher, et accepte qu'il se replie ensuite, pourvu que la licence reste à un geste (un « i » dans le coin) : le texte
 * s'affiche à l'ouverture, puis au bout de cinq secondes ou au premier geste sur la carte (`touchee`), il se replie sur le « i », qui ouvre
 * « Crédits des données » (la page de l'appli, avec le lien openstreetmap.org/copyright et l'adresse de l'extraction ODbL). Zone de 44 dp.
 * `droite` : posée au bord droit, le « i » reste contre le bord et le texte s'ouvre vers la gauche.
 * `replie` : les petites cartes (publications, Accueil, lieu) n'affichent que le « i », jamais le texte : trop de bruit dans un fil.
 */
export function AttributionCarte({ touchee = false, droite = false, replie = false, style }: { touchee?: boolean; droite?: boolean; replie?: boolean; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const [lisible, setLisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLisible(false), ATTRIBUTION_LISIBLE_MS);
    return () => clearTimeout(id);
  }, []);
  const deplie = lisible && !touchee && !replie;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("circuit.credits.titre")}
      onPress={() => router.push("/settings/aide/credits")}
      style={[styles.zone, style]}
    >
      <View style={[styles.puce, droite && styles.puceDroite, { backgroundColor: couleurs.s1, borderColor: couleurs.line }]}>
        <Icone nom="info" couleur={couleurs.t2} taille={16} />
        {deplie ? (
          <Texte couleur="t2" style={styles.texte} numberOfLines={1}>
            {ATTRIBUTION_CARTE}
          </Texte>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // La puce fait 28 de haut ; la zone qui la porte, 44 : un toucher à côté ne rate pas.
  zone: { position: "absolute", minWidth: 44, height: 44, maxWidth: "92%", justifyContent: "center" },
  puce: { height: 28, minWidth: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1, alignSelf: "flex-start", marginLeft: 8 },
  puceDroite: { flexDirection: "row-reverse", alignSelf: "flex-end", marginLeft: 0, marginRight: 8 },
  texte: { fontSize: TAILLE_MIN, lineHeight: 14, flexShrink: 1, paddingRight: 4 },
});
