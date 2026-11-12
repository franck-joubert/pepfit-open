import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Icone, type NomIcone } from "./Icone";

/** Avatar d'un lieu : le picto de son type dans un cadre de taille fixe, sur fond plein (jamais d'opacité réduite). */
export function ImageLieu({ picto, taillePicto = 22, style }: { picto: NomIcone; taillePicto?: number; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.cadre, { backgroundColor: couleurs.s2 }, style]} importantForAccessibility="no-hide-descendants">
      <Icone nom={picto} couleur={couleurs.t3} taille={taillePicto} />
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
