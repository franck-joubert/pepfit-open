// La carte « Ce soir » de la page Sommeil (planche sommeil, B1, D10) : 2 h avant le coucher conseillé et jusqu'à lui, s'il y a
// à rattraper. Le coucher conseillé en grand, le réveil habituel à droite, la raison, et « Aider à s'endormir ».
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { t, tp } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { Groupe } from "../mesures/gabarit";
import type { Nuit } from "../mesures/sommeil-donnees";
import { hm } from "../mesures/sommeil-stats";
import { arrondiDette, RECUP } from "../recup-pepfit";
import { heureMin, leverHabituel, type DetteSoir } from "./endormir";
import { leversDe } from "./endormir-donnees";

export function CarteCeSoir({ s, carte, nuits }: { s: DetteSoir; carte: { dans: number; coucher: number }; nuits: ReadonlyMap<number, Nuit> | undefined }) {
  const { couleurs } = useTheme();
  const lever = nuits ? leverHabituel(leversDe(nuits)) : null;
  const a = arrondiDette(s.dette.aRattraper);
  return (
    <Groupe bloc style={styles.carte}>
      <View style={styles.h}>
        <View style={{ flex: 1 }}>
          <Texte variante="meta" couleur="t2">
            {t("endormir.ceSoir")}
          </Texte>
          <Texte style={[styles.grand, { color: couleurs.t1 }]}>{heureMin(carte.coucher)}</Texte>
          <Texte variante="meta" couleur="t2">
            {carte.dans > 0 ? t("endormir.coucherDans", { d: hm(carte.dans) }) : t("endormir.coucherMaintenant")}
          </Texte>
        </View>
        {lever != null ? (
          <View style={{ alignItems: "flex-end" }}>
            <Texte variante="meta" couleur="t2">
              {t("endormir.reveil")}
            </Texte>
            <Texte style={[styles.petit, { color: couleurs.t1 }]}>{heureMin(lever)}</Texte>
            <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
              {t("endormir.reveilHabituel")}
            </Texte>
          </View>
        ) : null}
      </View>
      {a > 0 ? (
        <View style={styles.raison}>
          <Icone nom="info" taille={16} couleur={couleurs.t3} />
          <Texte variante="corps" couleur="t2" style={{ flex: 1, lineHeight: 19 }}>
            <Texte variante="corps" style={{ color: couleurs.t1, fontFamily: police.semibold }}>
              {t("endormir.raison", { d: hm(a) })}
            </Texte>
            {t("endormir.raisonSuite", { avance: RECUP.dette.avance, soirs: tp("mesuresSommeil.soirs", s.dette.soirs) })}
          </Texte>
        </View>
      ) : null}
      <BoutonPrincipal libelle={t("endormir.bouton")} icone="lune" onPress={() => router.push("/sante/endormir")} style={{ marginTop: 14 }} />
    </Groupe>
  );
}

/** Toujours là : l'entrée d'« Aider à s'endormir » quand la carte « Ce soir » n'est pas affichée (03/11 : y accéder à toute heure). */
export function LigneEndormir() {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("endormir.bouton")} onPress={() => router.push("/sante/endormir")} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
      <Groupe style={styles.ligne}>
        <Icone nom="lune" taille={20} couleur={couleurs.t2} />
        <Texte variante="corps" style={{ flex: 1, color: couleurs.t1, fontFamily: police.medium }}>
          {t("endormir.bouton")}
        </Texte>
        <Icone nom="right" taille={18} couleur={couleurs.t3} />
      </Groupe>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, borderRadius: 16, marginTop: 12 },
  carte: { marginTop: 12, borderRadius: 16, padding: 16 },
  h: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  grand: { fontFamily: police.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, marginTop: 2, fontVariant: ["tabular-nums"] },
  petit: { fontFamily: police.medium, fontSize: 15, lineHeight: 20, marginTop: 4, fontVariant: ["tabular-nums"] },
  raison: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
});
