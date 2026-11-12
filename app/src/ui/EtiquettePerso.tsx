import { StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { Texte } from "./Texte";

/** Marque un exercice perso : petit texte, bordure discrète, arrondi 4. Venu d'un coach : « De <prénom> » à la place de « Perso ». */
export function EtiquettePerso({ coach }: { coach?: string | null }) {
  useLangue();
  const { couleurs } = useTheme();
  return (
    <View style={[styles.boite, { borderColor: couleurs.line2 }]}>
      <Texte variante="meta" couleur="t2" style={{ fontSize: 11 }}>
        {coach ? t("exercices.deCoach", { coach }) : t("exercices.perso")}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  boite: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, alignSelf: "center" },
});
