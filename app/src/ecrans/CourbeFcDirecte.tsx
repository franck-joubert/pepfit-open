// Courbe des 5 dernières minutes, dépliée au-dessus de la bande de séance (31/10) : « voir que ça marche bien, sans
// coupure ». Mêmes briques que la courbe de BlocFcMuscu (ligneDe, dégradé des zones d'arretsZones) ; chaque silence de plus
// de 5 s est un trou dans la ligne, sur une bande à peine plus claire ; un point au minimum et au maximum, leur valeur à
// droite ; un point à la mesure en cours. Elle relit seule le tampon de la bande chaque seconde : ni la bande ni la liste
// des séries ne se redessinent pour elle. Démontée quand la bande est repliée : rien ne tourne.
import { memo, useEffect, useMemo, useState, type RefObject } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Canvas, Circle, LinearGradient, Path, Rect, Skia, vec } from "@shopify/react-native-skia";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { police, POLICE_MAX } from "../theme/typo";
import { Texte } from "../ui/Texte";
import { arretsZones } from "./BlocEffort";
import { courbeDirecte } from "./fc-courbe-direct";
import { morceauxCourbe } from "./fc-trous";
import { TROU_S, type Echantillon } from "./fc-muscu-vue";
import { zoneDans, type Bornes } from "./zones-fc";

/** Hauteur du dessin ; 30 à droite pour le maximum et le minimum. */
const C = { hauteur: 58, haut: 5, bas: 5, droite: 30 } as const;

export const CourbeFcDirecte = memo(function CourbeFcDirecte({ fc, bornes }: { fc: RefObject<Echantillon[]>; bornes: Bornes }) {
  const { couleurs } = useTheme();
  const [maintenant, setMaintenant] = useState(Date.now);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const c = useMemo(() => courbeDirecte(fc.current ?? [], maintenant), [fc, maintenant]);
  const onLayout = (e: LayoutChangeEvent) => {
    const l = Math.round(e.nativeEvent.layout.width);
    setLargeur((x) => (x === l ? x : l));
  };

  const lo = c.min ? Math.min(c.min.bpm - 6, (c.min.bpm + c.max!.bpm) / 2 - 15) : 60;
  const hi = c.max ? Math.max(c.max.bpm + 6, (c.min!.bpm + c.max.bpm) / 2 + 15) : 180;
  const pw = Math.max(1, largeur - C.droite);
  const yBas = C.hauteur - C.bas;
  const X = (s: number) => (s / c.finS) * pw;
  const Y = (v: number) => yBas - ((v - lo) / (hi - lo)) * (yBas - C.haut);
  const chemin = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    for (const m of morceauxCourbe(c.serie)) m.points.forEach((f, i) => (i ? p.lineTo(X(f.s), Y(f.bpm)) : p.moveTo(X(f.s), Y(f.bpm))));
    return p.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, pw, lo, hi]);
  const { cs, ps } = arretsZones(Y, Y(hi), Y(lo), bornes, couleurs);
  const dernier = c.serie.at(-1);
  const enDirect = dernier != null && c.finS - dernier.s <= TROU_S;
  // Valeurs à droite, à la hauteur de leur point, jamais l'une sur l'autre.
  const yMax = c.max ? Y(c.max.bpm) : 0;
  const yMin = c.min ? Math.max(Y(c.min.bpm), yMax + 12) : 0;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={c.min ? t("seance.fc.courbeDirect", { min: c.min.bpm, max: c.max!.bpm, n: c.trous.length }) : t("seance.fc.aucuneMesure")}
      style={styles.cadre}
    >
      <Texte variante="meta" couleur="t3" style={styles.titre}>
        {t("seance.fc.cinqMin")}
      </Texte>
      {largeur > 0 && c.min ? (
        <View style={{ height: C.hauteur }}>
          <Canvas style={{ width: largeur, height: C.hauteur }}>
            {c.trous.map((tr, i) => (
              <Rect key={i} x={X(tr.a)} y={0} width={Math.max(1, X(tr.b) - X(tr.a))} height={C.hauteur} color={couleurs.s2} />
            ))}
            <Path path={chemin} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round">
              <LinearGradient start={vec(0, Y(hi))} end={vec(0, Y(lo))} colors={cs} positions={ps} />
            </Path>
            <Circle cx={X(c.max!.s)} cy={Y(c.max!.bpm)} r={2.5} color={couleurs.t2} />
            <Circle cx={X(c.min.s)} cy={Y(c.min.bpm)} r={2.5} color={couleurs.t2} />
            {enDirect ? <Circle cx={X(dernier.s)} cy={Y(dernier.bpm)} r={3.5} color={couleurZone(couleurs, zoneDans(dernier.bpm, bornes))} /> : null}
          </Canvas>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.valeur, { top: yMax - 7, color: couleurs.t3 }]}>
            {c.max!.bpm}
          </Text>
          {c.min.bpm !== c.max!.bpm ? (
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.valeur, { top: yMin - 7, color: couleurs.t3 }]}>
              {c.min.bpm}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.vide, { height: C.hauteur }]}>
          <Texte variante="meta" couleur="t2">
            {t("seance.fc.aucuneMesure")}
          </Texte>
        </View>
      )}
    </View>
  );
});

const couleurZone = (couleurs: Jetons, z: number) => (z ? couleurs[`zone${z}` as keyof Jetons] : couleurs.t3);

const styles = StyleSheet.create({
  cadre: { flex: 1 },
  // Posé dans le haut de la courbe, pas au-dessus (31/10 : gagner de la hauteur ; la courbe peut passer dessus).
  titre: { position: "absolute", top: 0, left: 0, zIndex: 1, fontSize: 11, lineHeight: 14 },
  valeur: { position: "absolute", right: 0, width: C.droite - 4, textAlign: "right", fontFamily: police.regular, fontSize: 11, lineHeight: 14, fontVariant: ["tabular-nums"] },
  vide: { justifyContent: "center" },
});
