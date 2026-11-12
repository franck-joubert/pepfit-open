import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { Texte } from "./Texte";

// Choix en ronds d'une feuille (pages Agenda) : un rond par ligne, coché pour le choix en cours.

/** Rond à droite comme sur la planche ; le libellé et, dessous, ce que le choix recouvre. */
export function Radio({
  libelle,
  sous,
  choisi,
  onPress,
  danger,
  premier,
  inactif,
  pastille,
}: {
  libelle: string;
  sous?: string;
  choisi: boolean;
  onPress: () => void;
  danger?: boolean;
  premier?: boolean;
  inactif?: boolean;
  /** Couleur d'un agenda : le rond passe à gauche (comme les cases au-dessus) et la pastille se pose à droite. */
  pastille?: string;
}) {
  const { couleurs } = useTheme();
  const rond = (
    <View style={[styles.rond, { borderColor: choisi ? couleurs.t1 : couleurs.t3 }]}>
      {choisi ? <View style={[styles.point, { backgroundColor: couleurs.t1 }]} /> : null}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisi, disabled: inactif }}
      disabled={inactif}
      onPress={onPress}
      style={({ pressed }) => [
        styles.radio,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      {pastille != null ? rond : null}
      <View style={{ flex: 1 }}>
        <Texte variante="saisie" style={{ fontSize: 15, color: danger ? couleurs.rate : couleurs.t1 }}>
          {libelle}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {pastille != null ? (pastille ? <View style={[styles.pastille, { backgroundColor: pastille }]} /> : null) : rond}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  radio: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  rond: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  point: { width: 10, height: 10, borderRadius: 5 },
  pastille: { width: 10, height: 10, borderRadius: 5 },
});
