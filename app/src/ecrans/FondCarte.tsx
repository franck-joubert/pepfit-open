import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Camera, Map, type MapProps } from "@maplibre/maplibre-react-native";
import { useTheme } from "../theme";
import { AttributionCarte } from "./AttributionCarte";
import { PALETTES_CARTE, recolorer, type StyleCarte } from "./carte-style";
import { lireStyle } from "./CarteDirect";

// Fond de carte du tracé d'une séance, en fin de séance et sur une séance passée (lot 6, D2 ; 30/10 : « j'ai la
// carte pendant, mais pas après »). Le même style qu'en course (Positron d'OpenFreeMap recoloré aux jetons), mais une carte
// de consultation : aucun geste, vue fixe calée sur la projection du tracé (vueProjection), qui reste dessiné par-dessus
// (animation, zones ou altitude, départ, arrivée, tours). Sans réseau, rien : le fond uni d'avant.

/** `onIndisponible` : le style de la carte n'a pas pu être lu (hors ligne) ; la page d'un circuit le dit sous le tracé. */
export function FondCarte({ vue, onIndisponible }: { vue: { centre: [number, number]; zoom: number }; onIndisponible?: () => void }) {
  const { mode } = useTheme();
  const [brut, setBrut] = useState<StyleCarte | null>(null);
  useEffect(() => {
    let actif = true;
    lireStyle()
      .then((s) => actif && setBrut(s))
      .catch(() => actif && onIndisponible?.());
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useMemo(() => (brut ? recolorer(brut, PALETTES_CARTE[mode]) : null), [brut, mode]);
  if (!style) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={style as MapProps["mapStyle"]}
        androidView="texture"
        attribution={false}
        logo={false}
        compass={false}
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
      >
        <Camera center={vue.centre} zoom={vue.zoom} duration={0} />
      </Map>
      </View>
      <AttributionCarte replie style={{ left: 0, bottom: 0 }} />
    </View>
  );
}

