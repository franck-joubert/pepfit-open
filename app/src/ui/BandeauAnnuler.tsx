import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { Icone } from "./Icone";
import { barre } from "./mouvement";
import { Texte } from "./Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

/**
 * « X supprimée · Annuler » posé en bas de son conteneur (même allure que le bandeau de retrait d'équipement). Monte du
 * bas en fondu et y redescend, comme la barre de repos (jetons `barre`) ; sauté sous « réduire les animations ». Sans `bas`,
 * à sa place dans le flux (photo de la séance : le bandeau tient la place de la photo partie). Sans `onAnnuler`, le texte
 * seul : un geste définitif (révocation d'une IA). `action` : un autre geste que « Annuler » (« Voir » le plat enregistré).
 * `lignes` : texte sur plusieurs lignes (agenda : « Agenda déconnecté : 3 séances retirées de Perso »). `coche` : une coche
 * verte devant le texte, pour un geste réussi (« Exercice modifié · partout », planche exercices-perso seance-3).
 */
export function BandeauAnnuler({
  texte,
  bas,
  onAnnuler,
  action,
  lignes = 1,
  coche,
}: {
  texte: string;
  bas?: number;
  onAnnuler?: () => void;
  action?: string;
  lignes?: number;
  coche?: boolean;
}) {
  useLangue();
  const { couleurs } = useTheme();
  return (
    <Animated.View entering={barre.entree} exiting={barre.sortie} pointerEvents="box-none" style={bas == null ? null : [styles.pose, { bottom: bas }]}>
      <View accessibilityLiveRegion="polite" style={[styles.bandeau, { backgroundColor: couleurs.s3 }, !onAnnuler && { paddingRight: espace.l }]}>
        {coche ? <Icone nom="check" couleur={couleurs.valide} taille={20} /> : null}
        <Texte variante="saisie" numberOfLines={lignes} style={[{ flex: 1, fontSize: 15 }, lignes > 1 && styles.lignes]}>
          {texte}
        </Texte>
        {onAnnuler ? (
          <Pressable accessibilityRole="button" accessibilityLabel={action ?? t("ui.defaire")} onPress={onAnnuler} style={styles.annuler}>
            <Texte variante="saisie" style={{ fontSize: 15 }}>
              {action ?? t("ui.defaire")}
            </Texte>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pose: { position: "absolute", left: espace.l, right: espace.l },
  bandeau: { minHeight: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", paddingLeft: espace.l, gap: espace.s },
  lignes: { paddingVertical: espace.m, lineHeight: 20 },
  annuler: { minHeight: 52, minWidth: 64, paddingHorizontal: espace.l, alignItems: "center", justifyContent: "center" },
});
