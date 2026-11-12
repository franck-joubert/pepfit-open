import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { Circuit } from "../../circuits/types";
import { traceVignette } from "../../circuits/vignette";
import { nuit } from "../../theme/jetons";
import { useTheme } from "../../theme";
import { COUV_VIDE } from "../../theme/couverture-vide";
import { gabarit, VIGNETTE } from "./LigneBase";

// La vignette d'un circuit (planche Circuits, D14) : le même carré de 56 que la ligne d'un lieu, le fond neutre de pepfit, le tracé en couleurs
// d'altitude et un rond blanc au départ. Le tracé a toujours la rampe de la nuit, même de jour : il repose sur ce fond sombre, jamais sur le fond
// de l'écran. Une vignette est une image décorative : la ligne dit le reste.

const DESSIN = 44;
const MARGE = 5;
const TRAIT = 2.6;

export function VignetteCircuit({ circuit }: { circuit: Pick<Circuit, "trace" | "profil"> }) {
  const { mode } = useTheme();
  const trace = useMemo(() => traceVignette(circuit, DESSIN, MARGE, nuit.altBas, nuit.altHaut, nuit.t1), [circuit]);
  return (
    <View style={[gabarit.vignette, gabarit.centre, { backgroundColor: COUV_VIDE[mode] }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {trace ? (
        <Svg width={DESSIN} height={DESSIN} viewBox={`0 0 ${DESSIN} ${DESSIN}`}>
          {trace.morceaux.map((m, i) => (
            <Path key={i} d={m.d} fill="none" stroke={m.couleur} strokeWidth={TRAIT} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <Circle cx={trace.depart.x} cy={trace.depart.y} r={3} fill="#ffffff" stroke="rgba(0,0,0,0.55)" strokeWidth={1.6} />
        </Svg>
      ) : null}
    </View>
  );
}

export { VIGNETTE };
