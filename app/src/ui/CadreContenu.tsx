import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Dimensions, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { LARGEUR_CONTENU, largeurContenu as borner, margeColonne, pleineLargeur } from "./largeur";

// Colonne de contenu bornée et centrée (D5, ui/largeur.ts) : posée par app/_layout (pages poussées) et app/(tabs)/_layout
// (onglets). Transparente : le fond de la page et l'aura restent pleine largeur (FondPlein).

/** Vrai sous une colonne bornée : un fond posé en absolu doit en déborder des deux côtés. */
const DansColonne = createContext(false);

/** Largeur de la colonne de contenu (dp), suivie quand l'écran change (Fold plié, déplié). */
export function useLargeurContenu(): number {
  return borner(useWindowDimensions().width);
}

/** Même valeur, lue au moment d'un geste. */
export function largeurContenu(): number {
  return borner(Dimensions.get("window").width);
}

/** Décalage de la colonne qui contient l'appelant par rapport au bord gauche de l'écran (0 hors colonne, ou sur le téléphone). */
export function useMargeColonne(): number {
  const dans = useContext(DansColonne);
  const { width } = useWindowDimensions();
  return dans ? margeColonne(width) : 0;
}

/**
 * Fond d'une page (couleur, aura) posé en absolu : couvre tout l'écran même dans la colonne centrée. En `absoluteFill`, il
 * s'arrêtait aux bords de la colonne et laissait voir le noir de la pile à gauche (vu sur le Fold déplié le 30/10 : Pas,
 * bienvenue). Son parent doit prendre toute la largeur de la colonne.
 */
export function FondPlein({ style, children }: { style?: ComponentProps<typeof Animated.View>["style"]; children?: ReactNode }) {
  const marge = useMargeColonne();
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, marge ? { left: -marge, right: -marge } : null, style]}>
      {children}
    </Animated.View>
  );
}

export function CadreContenu({ route, onglet = false, children }: { route: string; onglet?: boolean; children: ReactNode }) {
  if (pleineLargeur(route, onglet)) return <>{children}</>;
  return (
    <DansColonne.Provider value>
      <View style={styles.cadre}>{children}</View>
    </DansColonne.Provider>
  );
}

const styles = StyleSheet.create({
  cadre: { flex: 1, width: "100%", maxWidth: LARGEUR_CONTENU, alignSelf: "center" },
});
