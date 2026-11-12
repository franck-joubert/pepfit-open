// Bandeau après une saisie (planche precision, section 4 ; PRECISION.md § 5) : le bandeau habituel (BandeauAnnuler) dit
// « +4 % de précision » avec « Voir », quand la saisie a fait monter la précision ; rien sinon. Aucune notification.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { barre } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useApp } from "../contexte";
import { abonnerSaisies, gainApresSaisie } from "../../precision/service";

/** Durée d'affichage du bandeau. */
export const DUREE_BANDEAU_MS = 4000;

export function BandeauPrecision() {
  const { db, reglages } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [gain, setGain] = useState<number | null>(null);
  const p = reglages.parties;
  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const desabonner = abonnerSaisies(() => {
      gainApresSaisie(db, { nutrition: p.food !== false, sport: p.train !== false, sante: p.health !== false })
        .then((g) => {
          if (!g) return;
          clearTimeout(minuterie);
          setGain(g.gain);
          minuterie = setTimeout(() => setGain(null), DUREE_BANDEAU_MS);
        })
        .catch(console.error);
    });
    return () => {
      desabonner();
      clearTimeout(minuterie);
    };
  }, [db, p.food, p.train, p.health]);
  if (gain == null) return null;
  return (
    <Animated.View entering={barre.entree} exiting={barre.sortie} pointerEvents="box-none" style={[styles.pose, { bottom: bas + espace.l }]}>
      <View accessibilityLiveRegion="polite" style={[styles.bandeau, { backgroundColor: couleurs.s3 }]}>
        <Icone nom="etincelle" couleur={couleurs.partieAccueil} taille={20} />
        <Texte variante="saisie" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
          {t("precision.bandeau", { n: gain })}
        </Texte>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("precision.voir")}
          onPress={() => {
            setGain(null);
            router.push("/profil/precision");
          }}
          style={styles.voir}
        >
          <Texte variante="saisie" style={{ fontSize: 15, fontFamily: police.semibold, color: couleurs.partieAccueil }}>
            {t("precision.voir")}
          </Texte>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pose: { position: "absolute", left: espace.l, right: espace.l, zIndex: 50, elevation: 50 },
  bandeau: { minHeight: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", paddingLeft: espace.l, gap: 10 },
  voir: { minHeight: 52, minWidth: 64, paddingHorizontal: espace.l, alignItems: "center", justifyContent: "center" },
});
