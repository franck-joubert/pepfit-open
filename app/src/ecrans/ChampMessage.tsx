// Champ « Ajouter un message » (planche Effort, D2 et D3) : à la fin d'une séance, d'une activité GPS, et sur la page de
// modification. Un seul composant : 280 signes au plus (la saisie est coupée), compteur gris « 240 / 280 » à partir de 240,
// rien quand le champ est vide ou court.
import { TextInput, View, StyleSheet } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Texte } from "../ui/Texte";
import { compteurMessage, limiterMessage } from "./message-activite";

/** `fond` : le fond du champ ; s1 sur une page, celui des groupes (feuilleGroupe) sur une feuille, où s1 est celui de la feuille. */
export function ChampMessage({ value, onChangeText, onFocus, onBlur, fond }: { value: string; onChangeText: (v: string) => void; onFocus?: () => void; onBlur?: () => void; fond?: string }) {
  const { couleurs } = useTheme();
  const c = compteurMessage(value);
  return (
    <View>
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        value={value}
        onChangeText={(v) => onChangeText(limiterMessage(v))}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={t("seance.fin.message")}
        placeholderTextColor={couleurs.t3}
        cursorColor={couleurs.action}
        multiline
        accessibilityLabel={t("seance.fin.messageActivite")}
        style={[typo.saisie, styles.champ, { fontFamily: police.regular, color: couleurs.t1, backgroundColor: fond ?? couleurs.s1 }]}
      />
      {c.visible ? (
        <Texte variante="meta" couleur="t3" accessibilityLiveRegion="polite" style={styles.compteur}>
          {c.texte}
        </Texte>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  champ: { minHeight: 84, borderRadius: rayon.l, paddingHorizontal: espace.l, paddingVertical: espace.l, marginTop: espace.m, textAlignVertical: "top" },
  compteur: { alignSelf: "flex-end", marginTop: espace.s, marginRight: espace.s },
});
