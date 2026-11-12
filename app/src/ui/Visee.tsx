import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Cadre de visée, en points depuis le coin haut gauche de l'écran. */
export interface CadreVisee {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Encre posée sur la caméra (scanner de la Nutrition, viseur du QR) : la même de jour comme de nuit. */
export const ENCRE_CAMERA = "#f5f2ee";

// Visée d'un scanner (Nutrition, planche 17 à 19 ; « Ouvrir sur un ordinateur », planches/qr-ordinateur) : hors du
// cadre, la caméra s'assombrit ; quatre coins arrondis. `children` : ce qui se pose dans la visée (le trait de la Nutrition).
export function Visee({ cadre, couleurCoins = ENCRE_CAMERA, children }: { cadre: CadreVisee; couleurCoins?: string; children?: ReactNode }) {
  const { top, left, width, height } = cadre;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.voile, { top: 0, left: 0, right: 0, height: top }]} />
      <View style={[styles.voile, { top: top + height, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.voile, { top, left: 0, width: left, height }]} />
      <View style={[styles.voile, { top, right: 0, width: left, height }]} />
      {(["hg", "hd", "bg", "bd"] as const).map((c) => (
        <View
          key={c}
          style={[
            styles.coin,
            { borderColor: couleurCoins },
            c[0] === "h" ? { top: top - 2, borderTopWidth: 3 } : { top: top + height - 38, borderBottomWidth: 3 },
            c[1] === "g" ? { left: left - 2, borderLeftWidth: 3 } : { left: left + width - 38, borderRightWidth: 3 },
            { borderTopLeftRadius: c === "hg" ? 14 : 0, borderTopRightRadius: c === "hd" ? 14 : 0, borderBottomLeftRadius: c === "bg" ? 14 : 0, borderBottomRightRadius: c === "bd" ? 14 : 0 },
          ]}
        />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  voile: { position: "absolute", backgroundColor: "rgba(0,0,0,0.45)" },
  coin: { position: "absolute", width: 40, height: 40 },
});
