import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Appui } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";

// Éléments de la page Agenda, partagés par l'agenda du téléphone (PageAgenda) et le lien d'agenda (LienAgenda).

/** Bloc de la page (1b, 3e) : titre 17, texte t2, geste dessous ; avec une icône, le refus (ambre, D18). */
export function Bloc({ titre, texte, icone, children }: { titre: string; texte: string; icone?: NomIcone; children?: ReactNode }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.bloc, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]}>
      <View style={styles.blocTitre}>
        {/* Ambre de la planche : le jeton « echauffement » (#facc15 la nuit, #835200 le jour). */}
        {icone ? <Icone nom={icone} couleur={couleurs.echauffement} taille={18} /> : null}
        <Texte variante="exercice" accessibilityRole="header" style={{ fontSize: 17, flexShrink: 1 }}>
          {titre}
        </Texte>
      </View>
      <Texte variante="corps" couleur="t2" style={styles.blocTexte}>
        {texte}
      </Texte>
      {children ? <View style={{ marginTop: espace.l }}>{children}</View> : null}
    </View>
  );
}

/** « Déconnecter l'agenda » (3d), « Supprimer le lien » (2c) : texte rouge à gauche, comme sur la planche (pas centré comme `danger`), seul dans son groupe. */
export function LigneDanger({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.danger, pressed && { backgroundColor: couleurs.s3 }]}>
      <Texte variante="saisie" style={{ fontSize: 15, fontFamily: "Inter-Medium", color: couleurs.rate }}>
        {libelle}
      </Texte>
    </Appui>
  );
}

const styles = StyleSheet.create({
  bloc: { marginHorizontal: espace.l, marginTop: espace.s, borderRadius: rayon.xl, borderWidth: StyleSheet.hairlineWidth, paddingTop: 18, paddingHorizontal: espace.l, paddingBottom: espace.l },
  blocTitre: { flexDirection: "row", alignItems: "center", gap: espace.s },
  blocTexte: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  danger: { minHeight: 56, justifyContent: "center", paddingHorizontal: espace.l },
});
