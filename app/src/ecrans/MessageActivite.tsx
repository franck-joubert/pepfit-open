// Message d'une activité (planche Effort, D3 et notes 8 et 9) : deux lignes, puis « Voir plus » qui déplie sur place et « Voir moins »
// qui replie. En haut de la page d'activité (un seul composant par objet affiché).
// Le nombre de lignes du texte entier est mesuré par une copie invisible (Android ne rend pas les lignes coupées).
import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { t } from "../i18n/index";
import { espace, police } from "../theme/typo";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { MESSAGE_LIGNES_APERCU, messageTronque } from "./message-activite";

/** `complet` : le message entier, sans « Voir plus » (l'image envoyée à quelqu'un, qui ne peut pas déplier). */
export function MessageActivite({ texte, style, complet = false }: { texte: string; style?: StyleProp<ViewStyle>; complet?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [lignes, setLignes] = useState(0);
  const long = !complet && messageTronque(lignes);
  return (
    <View style={style}>
      <Texte variante="libelle" numberOfLines={complet || ouvert ? undefined : MESSAGE_LIGNES_APERCU} style={styles.texte}>
        {texte}
      </Texte>
      {/* Copie invisible, sans limite de lignes : seulement pour compter. */}
      {complet ? null : (
        <Texte
          variante="libelle"
          onTextLayout={(e) => setLignes(e.nativeEvent.lines.length)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.texte, styles.mesure]}
        >
          {texte}
        </Texte>
      )}
      {long ? (
        <Appui
          accessibilityRole="button"
          accessibilityState={{ expanded: ouvert }}
          onPress={() => setOuvert((o) => !o)}
          style={styles.plus}
        >
          <Texte variante="corps" couleur="t2" style={{ fontFamily: police.semibold }}>
            {t(ouvert ? "fil.message.voirMoins" : "fil.message.voirPlus")}
          </Texte>
        </Appui>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  texte: { lineHeight: 21 },
  mesure: { position: "absolute", left: 0, right: 0, top: 0, opacity: 0 },
  // Zone de clic de 44 de haut, plus large que le mot.
  plus: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingRight: espace.xl },
});
