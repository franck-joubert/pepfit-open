import { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Canvas, LinearGradient, Path, vec } from "@shopify/react-native-skia";
import { courbeProfil, type VueCircuit } from "../../circuits/vue";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { largeurContenu } from "../../ui/CadreContenu";
import { Texte } from "../../ui/Texte";
import { ligneDe } from "../BlocEffort";
import { nombre } from "../format";
import { altitudeEnUnite, distanceEnUnite, libelleAltitude, libelleDistance } from "../unites";

// Le profil d'altitude d'un circuit (planche Circuits, page) : la forme de l'effort, la distance parcourue en abscisse, la courbe et son
// aire au dégradé de la rampe d'altitude (comme la séance passée), « 0 », la mi-distance et la distance totale dessous. Un aller-retour
// donne un profil en miroir, sans rien de plus à faire. Sans altitudes : une ligne qui le dit, jamais une courbe inventée.

const HAUTEUR = 96;
const CADRE = { haut: 6, bas: 2 };

export function ProfilCircuit({ vue, plage }: { vue: VueCircuit; plage: { bas: number; haut: number } | null }) {
  const { couleurs } = useTheme();
  const [mesuree, setMesuree] = useState(() => Math.max(0, Math.round(largeurContenu()) - 2 * espace.l));
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setMesuree((x) => (x === w ? x : w));
  };
  const courbe = useMemo(() => courbeProfil(vue, { l: mesuree, h: HAUTEUR, ...CADRE }), [vue, mesuree]);
  const dessin = useMemo(() => {
    if (!courbe) return null;
    const ys = courbe.xy.map((p) => p.y);
    return {
      ligne: ligneDe(courbe.xy),
      aire: ligneDe(courbe.xy, 0, courbe.xy.length - 1, { bas: HAUTEUR }),
      yHaut: Math.min(...ys),
      yBas: Math.max(...ys),
    };
  }, [courbe]);
  const unite = libelleAltitude();
  const km = libelleDistance();
  const total = distanceEnUnite(vue.longueurM);
  const titre = plage ? t("circuit.profil.plage", { bas: altitudeEnUnite(plage.bas), haut: altitudeEnUnite(plage.haut), unite }) : null;

  return (
    <View onLayout={onLayout}>
      <View style={styles.entete}>
        <Texte variante="corps" couleur="t2" accessibilityRole="header" style={styles.titre}>
          {t("circuit.profil")}
        </Texte>
        {titre ? (
          <Texte variante="meta" couleur="t2" style={styles.plage}>
            {titre}
          </Texte>
        ) : null}
      </View>
      {courbe && dessin && plage ? (
        <View accessible accessibilityRole="image" accessibilityLabel={t("circuit.profil.libelle", { bas: altitudeEnUnite(plage.bas), haut: altitudeEnUnite(plage.haut), unite })}>
          <Canvas style={{ width: mesuree, height: HAUTEUR }}>
            <Path path={dessin.aire} opacity={0.28}>
              <LinearGradient start={vec(0, dessin.yHaut)} end={vec(0, dessin.yBas)} colors={[couleurs.altHaut, couleurs.altBas]} />
            </Path>
            <Path path={dessin.ligne} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round">
              <LinearGradient start={vec(0, dessin.yHaut)} end={vec(0, dessin.yBas)} colors={[couleurs.altHaut, couleurs.altBas]} />
            </Path>
          </Canvas>
          <View style={styles.graduations}>
            <Texte variante="meta" couleur="t3">
              0
            </Texte>
            <Texte variante="meta" couleur="t3">{`${nombre(total / 2, 1)} ${km}`}</Texte>
            <Texte variante="meta" couleur="t3">{`${nombre(total, 1)} ${km}`}</Texte>
          </View>
        </View>
      ) : (
        <View style={[styles.indispo, { backgroundColor: couleurs.s1 }]}>
          <Texte variante="corps" couleur="t2">
            {t("circuit.profil.indispo")}
          </Texte>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: espace.s },
  titre: { fontFamily: police.semibold },
  plage: { fontFamily: police.semibold },
  graduations: { flexDirection: "row", justifyContent: "space-between", marginTop: espace.xs },
  indispo: { borderRadius: rayon.l, padding: espace.l },
});
