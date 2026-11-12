import { useEffect, useMemo } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { revenir } from "../ui/revenir";
import { Texte } from "../ui/Texte";
import { CarteTracePleine } from "./circuit/CarteTracePleine";
import { chronoTexte } from "./suivi-direct-vue";
import { distanceSeance } from "./format";
import { lienGoogleMaps } from "./lien-maps";
import { couleursTrace, tracePosee, traceGeoJsonSeance, vueDeLaTrace } from "./trace-pleine";

// La carte d'une séance terminée en plein écran (08/11) : le tracé de la page, que le bloc d'effort vient de poser (trace-pleine.ts),
// dans la même carte que celle d'un circuit (CarteTracePleine : mêmes gestes, mêmes boutons, même crédit du fond). La carte du bas rappelle la
// séance et garde l'ancien geste de la carte (30/10) : « Ouvrir dans Google Maps » sur le départ.

export function CartePleineSeance() {
  const { couleurs } = useTheme();
  const posee = tracePosee();
  const forme = useMemo(() => (posee ? vueDeLaTrace(posee.trace) : null), [posee]);
  // L'appli relancée sur cet écran, ou une trace vide : rien à montrer, on revient à la page.
  useEffect(() => {
    if (!forme) revenir();
  }, [forme]);
  const geojson = useMemo(
    () => (posee ? traceGeoJsonSeance(posee.trace, couleursTrace(posee.trace, posee.mode, couleurs, posee.altitude)) : null),
    [posee, couleurs],
  );
  if (!posee || !forme || !geojson) return <View style={[styles.page, { backgroundColor: couleurs.bg }]} />;
  const lien = lienGoogleMaps(posee.trace[0]);
  return (
    <CarteTracePleine
      trace={geojson}
      vue={forme.vue}
      bbox={forme.bbox}
      arrivee
      libelles={{ pleine: t("effort.carte.pleine"), tout: t("effort.carte.tout"), loin: t("effort.carte.loin") }}
      bas={
        <>
          <Texte variante="exercice" numberOfLines={1} accessibilityRole="header">
            {t("effort.trace")}
          </Texte>
          <Texte variante="libelle" couleur="t2" numberOfLines={1} style={styles.resume}>
            {t("effort.carte.resume", { distance: distanceSeance(posee.distanceM), duree: chronoTexte(posee.dureeS * 1000) })}
          </Texte>
          {lien ? (
            <View style={styles.maps}>
              <Bouton libelle={t("ui.ouvrirMaps")} large onPress={() => void Linking.openURL(lien).catch(console.error)} />
            </View>
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  resume: { marginTop: 2 },
  maps: { marginTop: espace.m },
});
