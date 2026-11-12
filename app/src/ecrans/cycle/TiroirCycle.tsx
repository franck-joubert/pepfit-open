// Le tiroir « Comprendre le suivi du cycle » (planche cycle, écran 10) : la frise, puis cinq lignes. Un suivi pour le sport
// et le bien-être ; trois temps en mots simples, estimés d'après tes dates ; les prochaines règles, une estimation, pas une
// méthode (D12) ; ce que ça change (la cible d'Effort ne bouge pas) ; tes données. Même gabarit que le tiroir de la Récupération.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Pressable } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { CYCLE, type EtatCycle } from "../../cycle/modele";
import { nombre } from "../format";
import { Frise } from "./Frise";

export function TiroirCycle({ visible, onFermer, etat }: { visible: boolean; onFermer: () => void; etat: EtatCycle | null }) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const lignes: [string, string][] = [
    [t("cycle.tiroir.1fort"), t("cycle.tiroir.1")],
    [t("cycle.tiroir.2fort"), t("cycle.tiroir.2", { n: CYCLE.secondeMoitie })],
    [t("cycle.tiroir.3fort"), t("cycle.tiroir.3", { n: CYCLE.cycles })],
    [t("cycle.tiroir.4fort"), t("cycle.tiroir.4")],
    [t("cycle.tiroir.5fort"), t("cycle.tiroir.5")],
  ];
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("cycle.comprendre")}>
      {etat?.phase ? (
        <View onLayout={(e) => setLargeur(Math.floor(e.nativeEvent.layout.width))} style={styles.frise}>
          {largeur > 0 ? <Frise etat={etat} largeur={largeur} fond={couleurs.feuilleFond} /> : <View style={{ height: 80 }} />}
        </View>
      ) : null}
      <View style={styles.liste}>
        {lignes.map(([fort, suite], i) => (
          <View key={i} style={styles.item}>
            <View style={[styles.num, { backgroundColor: couleurs.btnTonalFond }]}>
              <Texte style={[styles.numTexte, { color: couleurs.t1 }]}>{nombre(i + 1, 0)}</Texte>
            </View>
            <View style={{ flex: 1 }}>
              <Texte variante="corps" style={[styles.itemTexte, { color: couleurs.t2 }]}>
                <Texte variante="corps" style={[styles.itemTexte, { color: couleurs.t1, fontFamily: police.semibold }]}>
                  {fort}
                </Texte>
                {suite}
              </Texte>
            </View>
          </View>
        ))}
      </View>
    </Feuille>
  );
}

/** « Comprendre le suivi du cycle › » : une ligne de 44 dp qui ouvre le tiroir. */
export function LienComprendreCycle({ onPress }: { onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.lien}>
      <Texte style={[styles.lienTexte, { color: couleurs.t1 }]}>{t("cycle.comprendre")}</Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frise: { marginTop: 10, marginBottom: 14 },
  liste: { gap: 14, paddingBottom: 8 },
  item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numTexte: { fontFamily: police.semibold, fontSize: 12 },
  itemTexte: { fontSize: 14, lineHeight: 21 },
  lien: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, alignSelf: "flex-start", marginTop: 8, marginHorizontal: 16 },
  lienTexte: { fontFamily: police.medium, fontSize: 14 },
});
