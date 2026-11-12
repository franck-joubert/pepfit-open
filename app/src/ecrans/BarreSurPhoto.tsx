import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { BarreHaut, BoutonIcone } from "../ui/Cadre";
import { FondDegrade } from "../ui/Degrade";
import { revenir } from "../ui/revenir";
import { Texte } from "../ui/Texte";

// En-tête posé sur la photo de tête d'une séance (même motif que la fiche d'un plat) : la photo monte jusqu'au bord haut de l'écran,
// la barre est transparente par-dessus (← titre ⋯ en blanc), sans fond ni ombre à elle. Le voile sombre qui garde lisibles les
// icônes et l'heure de la barre d'état est dans la photo (VoileHautPhoto, comme celui d'une couverture de cercle) : il suit la
// photo quand elle défile, il ne reste pas suspendu sur la page. Défilée, la barre reprend le fond du thème (plat, sans ombre).

export const HAUTEUR_BARRE = 56;
const BLANC = "rgba(255,255,255,0.96)";
const VOILE = [
  { offset: 0, couleur: "#000000", opacite: 0.7 },
  { offset: 0.55, couleur: "#000000", opacite: 0.42 },
  { offset: 1, couleur: "#000000", opacite: 0 },
];

/** Place prise par la barre d'état et l'en-tête : la photo de tête les couvre, puis son cadre normal commence. */
export function useHautEntete(): number {
  return useSafeAreaInsets().top + HAUTEUR_BARRE;
}

/**
 * Vrai quand la photo a quitté la barre : son bord bas est passé sous le haut de la page, `haut` = barre d'état + barre. Avant, la
 * barre est encore sur la photo (icônes blanches) : après, elle serait blanche sur le fond de la page, la barre reprend son fond.
 * `y` = décalage du défilement, `hauteur` = hauteur de la photo (en-tête compris).
 */
export function barreReplie(y: number, hauteur: number, haut: number = HAUTEUR_BARRE): boolean {
  "worklet";
  return y > hauteur - haut;
}

/**
 * Le voile sombre du haut de la photo, bord à bord, de la barre d'état au-dessous de la barre : à poser dans la photo (en absolu,
 * `haut` = barre d'état + barre, useHautEntete). Il défile avec elle.
 */
export function VoileHautPhoto({ haut }: { haut: number }) {
  return (
    <View pointerEvents="none" style={[styles.voile, { height: haut + 28 }]}>
      <FondDegrade angle={180} arrets={VOILE} />
    </View>
  );
}

/**
 * `children(blanc)` : les actions à droite ; `blanc` vrai sur la photo (icônes blanches), faux une fois la barre défilée.
 * `titreSurPhoto` faux : le titre n'apparaît qu'une fois la barre défilée (le titre est alors dans la page).
 * `sousBandeau` : un bandeau (hors ligne) tient déjà la barre d'état au-dessus ; la barre ne la compte plus et la page règle la sienne.
 */
export function BarreSurPhoto({ replie, titre, titreSurPhoto = true, sousBandeau = false, children }: { replie: boolean; titre: string; titreSurPhoto?: boolean; sousBandeau?: boolean; children: (blanc: boolean) => ReactNode }) {
  const { couleurs, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const haut = sousBandeau ? 0 : insets.top;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.barre, { paddingTop: haut }, replie && { backgroundColor: couleurs.bg }]}
    >
      {sousBandeau ? null : replie && mode !== "nuit" ? <StatusBar style="dark" /> : <StatusBar style="light" />}
      {replie ? (
        <BarreHaut titre={titre}>{children(false)}</BarreHaut>
      ) : (
        <View style={styles.ligne}>
          <BoutonIcone nom="back" couleur={BLANC} libelle={t("ui.retour")} onPress={revenir} />
          <View style={styles.titre}>
            {titreSurPhoto ? (
              <Texte variante="exercice" numberOfLines={1} accessibilityRole="header" style={styles.texte}>
                {titre}
              </Texte>
            ) : null}
          </View>
          {children(true)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, elevation: 20 },
  // Le voile déborde de 28 sous la barre : il s'efface sur la photo, sans arête (photo claire : icônes et heure restent lisibles).
  voile: { position: "absolute", top: 0, left: 0, right: 0 },
  ligne: { height: HAUTEUR_BARRE, flexDirection: "row", alignItems: "center", paddingHorizontal: espace.s },
  titre: { flex: 1, marginLeft: espace.xs, justifyContent: "center", height: HAUTEUR_BARRE },
  texte: { color: BLANC, textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
