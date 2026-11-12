import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Texte } from "../ui/Texte";
import { tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

/** « n nouveaux équipements » : étiquette tonale à l'arrondi 4, dans une zone de toucher de 44 px. */
export function EtiquetteEquipements({ n, onPress }: { n: number; onPress: () => void }) {
  const { couleurs } = useTheme();
  useLangue();
  const texte = tp("salles.etiquetteNouveaux", n);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={texte} onPress={onPress} style={styles.zone}>
      {({ pressed }) => (
        <View style={[styles.etiquette, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}>
          <Texte variante="meta" style={{ color: couleurs.btnTonalTexte, fontSize: 12 }}>
            {texte}
          </Texte>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
  etiquette: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
});
