import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { espace, police } from "../../theme/typo";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";

// Les deux petites briques que « Nouveau circuit » et « Importer un GPX » partagent (planche Circuits, c2 et i2) : l'étiquette d'un réglage
// (« Nom », « Visible par », « Activités ») et la phrase à icône qui dit ce qui se passe (« Toi seul le vois. », « Pas d'altitudes dans ce fichier. »).

export function Etiquette({ texte }: { texte: string }) {
  return (
    <Texte variante="libelle" couleur="t2" accessibilityRole="header" style={styles.etiquette}>
      {texte}
    </Texte>
  );
}

/** Une phrase à icône ; `fort` est son début en gras (« Ce tracé passe près de ton domicile. »). */
export function Phrase({ icone, fort, texte, alerte = false, centre = false }: { icone: NomIcone; fort?: string; texte: string; alerte?: boolean; centre?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.phrase, centre && styles.centre]} accessibilityLiveRegion="polite">
      <Icone nom={icone} couleur={alerte ? couleurs.rate : couleurs.t2} taille={16} />
      <Texte variante="corps" couleur="t2" style={[styles.texte, centre && styles.texteCentre]}>
        {fort ? <Texte variante="corps" style={styles.fort}>{`${fort} `}</Texte> : null}
        {texte}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  etiquette: { marginTop: espace.l, marginBottom: espace.s, marginLeft: espace.xs },
  phrase: { flexDirection: "row", alignItems: "flex-start", gap: espace.s + 2, paddingHorizontal: espace.xs, marginTop: espace.m },
  centre: { justifyContent: "center", alignItems: "center", marginTop: 0, marginBottom: espace.s },
  texte: { flexShrink: 1, lineHeight: 20 },
  texteCentre: { textAlign: "center" },
  fort: { fontFamily: police.semibold },
});
