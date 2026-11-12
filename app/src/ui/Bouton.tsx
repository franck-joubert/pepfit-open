import { StyleSheet } from "react-native";
import { useTheme } from "../theme";
import { cible, rayon } from "../theme/typo";
import { BoutonPrincipal } from "./Degrade";
import { Appui } from "./mouvement";
import { Texte } from "./Texte";

interface Props {
  libelle: string;
  onPress: () => void;
  variante?: "primaire" | "tonal";
  large?: boolean;
  desactive?: boolean;
}

export function Bouton({ libelle, onPress, variante = "tonal", large = false, desactive = false }: Props) {
  const { couleurs } = useTheme();
  const primaire = variante === "primaire";
  if (primaire) return <BoutonPrincipal libelle={libelle} onPress={onPress} desactive={desactive} compact={!large} />;
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        {
          backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond,
          opacity: desactive ? 0.38 : 1,
        },
      ]}
    >
      <Texte
        variante="exercice"
        style={{ color: couleurs.btnTonalTexte }}
      >
        {libelle}
      </Texte>
    </Appui>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: cible.min + 4,
    minWidth: cible.min,
    paddingHorizontal: 16,
    borderRadius: rayon.l,
    alignItems: "center",
    justifyContent: "center",
  },
  large: { alignSelf: "stretch" },
});
