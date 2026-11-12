import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Reflet } from "./Degrade";
import { useCouleurPartie } from "./ContextePartie";

// L'indicateur de « tirer pour actualiser » (choix d'Alex, 08/11, planche A/B/C : le filet à reflet). Un filet fin à la couleur
// de la partie : il se remplit depuis son centre pendant le tirage, est plein au seuil, puis le reflet du bouton principal le
// traverse en boucle tant que ça actualise. Rien ne tourne : ce n'est pas un spinner.

export type PropsIndicateur = {
  /** Course du tirage, 0 à 1 (1 au seuil). */
  progression: SharedValue<number>;
  /** Passage du reflet, 0 à 1 en boucle tant que ça actualise ; 0 sinon (le reflet reste hors champ). */
  passage: SharedValue<number>;
  /** Couleur d'une pastille pleine derrière le filet (page à photo, en mouvement réduit) ; sans, le filet est posé à nu. */
  pastille?: string;
};

/** Zone de l'indicateur (dp) : le filet y est centré. */
export const TAILLE_INDICATEUR = 30;
export const LARGEUR_INDICATEUR = 100;
const LONGUEUR = 76;
const EPAISSEUR = 5;
/** Distance du haut de la zone au haut du filet : de quoi poser le filet sur une marge précise. */
export const HAUT_FILET = (TAILLE_INDICATEUR - EPAISSEUR) / 2;
const AIR_PASTILLE = 4;
/** Le reflet est celui du bouton principal, en plus étroit : une bande blanche au milieu de sa course. */
const REFLET_FILET = [
  { offset: 0.3, couleur: "#ffffff", opacite: 0 },
  { offset: 0.5, couleur: "#ffffff", opacite: 0.85 },
  { offset: 0.7, couleur: "#ffffff", opacite: 0 },
] as const;

export function IndicateurActualiser({ progression, passage, pastille }: PropsIndicateur) {
  const couleur = useCouleurPartie();
  const remplissage = useAnimatedStyle(() => ({ transform: [{ scaleX: progression.value }] }));
  return (
    <>
      {pastille ? <View style={[styles.pastille, { backgroundColor: pastille }]} /> : null}
      <View style={styles.filet}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: couleur, opacity: 0.22 }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: couleur }, remplissage]} />
        <Reflet p={passage} arrets={REFLET_FILET} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  filet: {
    position: "absolute",
    width: LONGUEUR,
    height: EPAISSEUR,
    left: (LARGEUR_INDICATEUR - LONGUEUR) / 2,
    top: HAUT_FILET,
    borderRadius: EPAISSEUR / 2,
    overflow: "hidden",
  },
  pastille: {
    position: "absolute",
    width: LONGUEUR + 4 * AIR_PASTILLE,
    height: EPAISSEUR + 2 * AIR_PASTILLE,
    left: (LARGEUR_INDICATEUR - LONGUEUR) / 2 - 2 * AIR_PASTILLE,
    top: HAUT_FILET - AIR_PASTILLE,
    borderRadius: (EPAISSEUR + 2 * AIR_PASTILLE) / 2,
  },
});
