import { StyleSheet, useWindowDimensions, View } from "react-native";
import type { Circuit } from "../../circuits/types";
import type { VueCircuit } from "../../circuits/vue";
import { useTheme } from "../../theme";
import { primitifs } from "../../theme/jetons";
import { rayon } from "../../theme/typo";
import { useMargeColonne } from "../../ui/CadreContenu";
import { FondDegrade } from "../../ui/Degrade";
import { VoileHautPhoto } from "../BarreSurPhoto";
import { CarteCircuit } from "./CarteCircuit";

// La couverture d'un circuit (planche Circuits, D14) : l'image du tracé sur son fond de carte, calculée, jamais vide et rien à fabriquer,
// du bord haut de l'écran, derrière la barre. Cadre 2:1, 240 au plus sous la barre.

const NOIR = primitifs["gris-1000"];
const VOILE = [
  { offset: 0, couleur: NOIR, opacite: 0.1 },
  { offset: 1, couleur: NOIR, opacite: 0.5 },
];

export function CouvertureCircuit({ circuit, vue, haut }: { circuit: Circuit; vue: VueCircuit; haut: number }) {
  const { couleurs } = useTheme();
  const { width } = useWindowDimensions();
  const bordsLibres = useMargeColonne() > 0;
  const sous = Math.min(width / 2, 240);
  return (
    <View
      style={[styles.boite, { height: haut + sous, backgroundColor: couleurs.s1 }, bordsLibres && styles.arrondie]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={circuit.nom}
    >
      <CarteCircuit
        vue={vue}
        type={circuit.type}
        largeur={width}
        hauteur={haut + sous}
        marge={40}
        haut={haut + 16}
        trait={5}
        arrondi={0}
        entre={
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <FondDegrade arrets={VOILE} angle={180} />
          </View>
        }
      />
      <VoileHautPhoto haut={haut} />
    </View>
  );
}

const styles = StyleSheet.create({
  boite: { width: "100%", overflow: "hidden" },
  arrondie: { borderBottomLeftRadius: rayon.xl, borderBottomRightRadius: rayon.xl },
});
