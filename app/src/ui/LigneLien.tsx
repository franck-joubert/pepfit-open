import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { Icone, type NomIcone } from "./Icone";
import { Texte } from "./Texte";

export function LigneLien({ icone, libelle, valeur, onPress, premier }: { icone: NomIcone; libelle: string; valeur: string; onPress: () => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.lien,
        { borderBottomColor: couleurs.line },
        premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line },
        pressed && { backgroundColor: couleurs.s1 },
      ]}
    >
      <Icone nom={icone} couleur={couleurs.t2} taille={22} />
      <Texte variante="saisie" style={{ flex: 1, fontFamily: "Inter-Regular" }}>
        {libelle}
      </Texte>
      <Texte variante="saisie" couleur="t2" numberOfLines={1} style={{ fontFamily: "Inter-Regular", flexShrink: 1, maxWidth: "55%" }}>
        {valeur}
      </Texte>
      <Icone nom="right" couleur={couleurs.t2} taille={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lien: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.l, borderBottomWidth: StyleSheet.hairlineWidth },
});
