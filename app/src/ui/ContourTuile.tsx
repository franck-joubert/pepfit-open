// Contour d'une tuile carrée arrondie qui se dessine (retouches Effort du 08/11) : une piste, puis un arc de la couleur donnée,
// de 0 à 1 du tour, qui part du milieu du bord haut et tourne dans le sens des aiguilles (comme les anneaux). Le même pour
// le Sommeil (arc rose, longueur = part du besoin dormie) et la séance faite (tour complet vert) : un seul composant par objet.
// Le trait est posé à l'intérieur de la boîte (rien ne dépasse, Android coupe un Svg à ses bords), sur un nombre entier de pixels.
// Remplissage à l'arrivée et quand la valeur change : 700 ms, comme les anneaux ; « Réduire les animations » : posé d'un coup.
import { useEffect } from "react";
import { PixelRatio, View } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { rayon } from "../theme/typo";
import { epaisseurAuPixel, traceContour } from "./contour-tuile";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

const ArcAnime = Animated.createAnimatedComponent(Path);

export function ContourTuile({
  part,
  couleur,
  piste,
  taille = 44,
  epaisseur: epaisseurDemandee = 2,
  rayonCoin = rayon.l,
  anime = true,
}: {
  /** Part du tour dessinée, de 0 à 1 (hors bornes : ramenée) ; 0 : l'arc n'est pas dessiné. */
  part: number;
  couleur: string;
  /** Couleur de la piste (le tour entier sous l'arc) ; absente : pas de piste. */
  piste?: string;
  taille?: number;
  epaisseur?: number;
  rayonCoin?: number;
  anime?: boolean;
}) {
  const reduit = useReduit();
  // trait sur un nombre entier de pixels : même netteté sur les quatre côtés et dans les coins, le rayon extérieur reste `rayonCoin`
  const epaisseur = epaisseurAuPixel(epaisseurDemandee, PixelRatio.get());
  const { d, longueur } = traceContour(taille, epaisseur, rayonCoin);
  const t = Number.isFinite(part) ? Math.max(0, Math.min(1, part)) : 0;
  const p = useSharedValue(anime && !reduit ? 0 : t);
  useEffect(() => {
    p.value = anime && !reduit ? withDelay(80, withTiming(t, { duration: 700, easing: courbes.sortie })) : t;
  }, [t, anime, reduit, p]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: longueur * (1 - p.value) }));
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: 0, left: 0, width: taille, height: taille }}>
      <Svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
        {piste ? <Path d={d} fill="none" stroke={piste} strokeWidth={epaisseur} /> : null}
        {t > 0 ? (
          <ArcAnime d={d} fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" strokeDasharray={`${longueur} ${longueur}`} animatedProps={arc} />
        ) : null}
      </Svg>
    </View>
  );
}
