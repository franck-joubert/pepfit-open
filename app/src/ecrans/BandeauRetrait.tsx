import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { annulerRetraitEquipement } from "../db";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useApp } from "./contexte";
import { poserRetraitRecent, useRetraitRecent } from "./retrait-recent";

const DUREE_MS = 8000;

/** « X retiré de <salle> · Annuler » : en bas de l'écran, huit secondes, l'annulation remet l'équipement dans la salle. */
export function BandeauRetrait({ onAnnule }: { onAnnule?: () => void }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const r = useRetraitRecent();
  useEffect(() => {
    if (!r) return;
    const minuterie = setTimeout(() => poserRetraitRecent(null), DUREE_MS);
    return () => clearTimeout(minuterie);
  }, [r]);
  if (!r) return null;
  return (
    <View pointerEvents="box-none" style={[styles.pose, { bottom: bas + espace.l }]}>
      <View accessibilityLiveRegion="polite" style={[styles.bandeau, { backgroundColor: couleurs.s3 }]}>
        <Texte variante="saisie" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
          {t("seance.retrait.retire", { libelle: r.libelle, salle: r.salleNom })}
        </Texte>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("seance.retrait.annuler")}
          onPress={() => {
            poserRetraitRecent(null);
            annulerRetraitEquipement(db, r.retraitId).then(() => onAnnule?.()).catch((e) => console.error(e));
          }}
          style={styles.annuler}
        >
          <Texte variante="saisie" style={{ fontSize: 15 }}>
            {t("ui.defaire")}
          </Texte>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pose: { position: "absolute", left: espace.l, right: espace.l },
  bandeau: { minHeight: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", paddingLeft: espace.l, gap: espace.s },
  annuler: { minHeight: 52, minWidth: 64, paddingHorizontal: espace.l, alignItems: "center", justifyContent: "center" },
});
