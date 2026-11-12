import { Image, Pressable, StyleSheet, View } from "react-native";
import { PICTO_TYPE, TUILES, vocabulaire, type TypeProgramme } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";

// « Nouveau programme » (planche idee-programmes, 28/10, D4) : le type d'abord, en tuiles à image comme la grille des sports
// (nom du type, puis le mot du modèle : Programme, WOD, Séance, Enchaînement). Le type d'où l'on vient est présélectionné
// (cadre orange) ; toucher une tuile crée le programme et ouvre l'éditeur. « Autre sport » : un programme sans type précis.

export function FeuilleNouveauProgramme({
  visible,
  preselection,
  onFermer,
  onChoisir,
}: {
  visible: boolean;
  preselection: TypeProgramme;
  onFermer: () => void;
  onChoisir: (type: TypeProgramme) => void;
}) {
  useLangue();
  const { couleurs, mode } = useTheme();
  // Jour : tuiles blanches sur la feuille blanche (planche), seule la tuile choisie a son cadre ; nuit : en s2.
  const fond = mode === "nuit" ? couleurs.feuilleGroupe : couleurs.feuilleFond;
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("programmes.nouveau")}>
      <View style={styles.tuiles}>
        {TUILES.map((type) => {
          const v = vocabulaire(type);
          const src = fichierPicto(PICTO_TYPE[type], null, 52);
          const choisi = type === preselection;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected: choisi }}
              accessibilityLabel={`${t(v.type)}, ${t(v.modele)}`}
              onPress={() => onChoisir(type)}
              style={({ pressed }) => [
                styles.tuile,
                { backgroundColor: pressed ? couleurs.s3 : fond },
                choisi && { borderWidth: 2, borderColor: couleurs.action },
              ]}
            >
              {src != null ? (
                <Image source={src} style={styles.image} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
              ) : (
                <Icone nom="dumbbell" couleur={couleurs.t3} taille={28} />
              )}
              <Texte numberOfLines={1} style={[styles.nom, { color: couleurs.t1 }]}>
                {t(v.type)}
              </Texte>
              <Texte variante="meta" couleur="t3" numberOfLines={1} style={styles.modele}>
                {t(v.modele)}
              </Texte>
            </Pressable>
          );
        })}
      </View>
      <Groupe>
        <Option premier icone="search" libelle={t("programmes.autreSport")} chevron onPress={() => onChoisir("autre")} />
      </Groupe>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  tuiles: { flexDirection: "row", flexWrap: "wrap", gap: espace.s },
  // Trois par rangée : (largeur − 2 écarts) / 3, comme la grille des sports.
  tuile: { width: "31.8%", flexGrow: 1, height: 112, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", gap: 2, paddingTop: 2 },
  image: { width: 52, height: 52 },
  nom: { fontFamily: police.medium, fontSize: 13, maxWidth: "100%", paddingHorizontal: espace.s },
  modele: { fontSize: 11 },
});
