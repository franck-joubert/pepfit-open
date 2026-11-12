import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { cible, espace, rayon } from "../theme/typo";
import { Icone, type NomIcone } from "./Icone";
import { Appui } from "./mouvement";
import { Texte } from "./Texte";

// Bouton tonal, un seul pour toute l'appli (revue finale du 30/10, n° 7 : trois copies, Accueil, Nutrition et profil public,
// avaient chacune leur fond, leur hauteur et leur texte). Fond tonal de la partie (s2), s3 enfoncé, rayon 12, icône et
// libellé semi-gras 15. 52 de haut en pied de page, 44 en compact (cartes, lignes) ; plus bas, la zone de toucher garde 44.

type Props = {
  libelle: string;
  icone?: NomIcone;
  /** Picto après le libellé (« Suivi ▾ » : le geste ouvre un choix). */
  apres?: NomIcone;
  onPress?: () => void;
  /** 52 en pied de page (défaut), 44 en compact. */
  hauteur?: number;
  /** Lu par TalkBack à la place du libellé (« Démarrer Legs »). */
  accessibilityLabel?: string;
  desactive?: boolean;
  /** Geste qui détruit (« Révoquer ») : libellé rouge, même fond. */
  danger?: boolean;
  /** Posé sur une image (la couverture de Modifier la page) : libellé et picto de cette couleur. */
  couleur?: string;
  style?: StyleProp<ViewStyle>;
};

export function BoutonTonal({ libelle, icone, apres, onPress, hauteur = 52, accessibilityLabel, desactive = false, danger = false, couleur, style }: Props) {
  const { couleurs } = useTheme();
  const texte = couleur ?? couleurs.btnTonalTexte;
  const deborde = Math.max(0, (cible.min - hauteur) / 2);
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? libelle}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive || !onPress}
      onPress={onPress}
      hitSlop={deborde ? { top: deborde, bottom: deborde } : undefined}
      style={({ pressed }) => [styles.bouton, { minHeight: hauteur, backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }, desactive && styles.desactive, style]}
    >
      {icone ? <Icone nom={icone} couleur={texte} taille={18} /> : null}
      <Texte variante="exercice" numberOfLines={1} style={{ color: danger ? couleurs.rate : texte }}>
        {libelle}
      </Texte>
      {apres ? <Icone nom={apres} couleur={texte} taille={18} /> : null}
    </Appui>
  );
}

const styles = StyleSheet.create({
  bouton: { borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s, paddingHorizontal: espace.l },
  desactive: { opacity: 0.38 },
});
