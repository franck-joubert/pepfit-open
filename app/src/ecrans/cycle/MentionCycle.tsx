// La mention du cycle dans l'Effort (planche cycle, écran 8, D9) : en seconde moitié seulement, une ligne sous la cible. La
// cible ne change pas ; pas de chiffre, pas de conseil de baisser (McNulty 2020, Colenso-Semple 2023 : NOTES § 4.3).
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { isoLocal, mentionEffort } from "../../cycle/donnees";
import { useApp } from "../contexte";
import { useMesure } from "../mesures/gabarit";

export function MentionCycle({ jour }: { jour: number }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const m = useMesure();
  const [oui, setOui] = useState<{ jour: number; v: boolean } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      mentionEffort(db, isoLocal(jour))
        .then((v) => vivant && setOui({ jour, v }))
        .catch(() => {});
      return () => {
        vivant = false;
      };
    }, [db, jour]),
  );
  if (!oui?.v || oui.jour !== jour) return null;
  return (
    <View style={[styles.mention, { backgroundColor: m.voile }]} accessible accessibilityLabel={`${t("cycle.effort.titre")}. ${t("cycle.effort.texte")}`}>
      <Icone nom="cycle" couleur={couleurs.t2} taille={18} />
      <View style={{ flex: 1 }}>
        <Texte variante="corps" style={styles.titre}>
          {t("cycle.effort.titre")}
        </Texte>
        <Texte variante="corps" couleur="t2" style={styles.texte}>
          {t("cycle.effort.texte")}
        </Texte>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mention: { marginTop: 14, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, flexDirection: "row", gap: 10 },
  titre: { fontSize: 13, lineHeight: 18, fontFamily: police.semibold },
  texte: { fontSize: 13, lineHeight: 19, marginTop: 2 },
});
