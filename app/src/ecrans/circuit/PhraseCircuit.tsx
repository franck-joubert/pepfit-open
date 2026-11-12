import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import Svg, { Defs, LinearGradient as DegradeSvg, Rect as RectSvg, Stop } from "react-native-svg";
import { estArrive, type EtatCircuit } from "../../circuits/suivre";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { liste } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";
import { distanceTexte, ecartTexte } from "./texte";

// La phrase d'état du circuit suivi (planche Circuits, écrans s2 et s3), en haut à gauche de la carte du direct, sous un voile qui fond le
// tracé dans le fond : « Sur le circuit » et « Il reste 7,6 km » à moins de 40 m du tracé, « À 180 m du circuit » et « Reviens vers le tracé »
// au-delà. Elle ne parle pas, ne vibre pas et ne guide pas (pas de navigation) : elle dit où l'on est. Un fondu quand l'état change ; les
// chiffres, eux, se mettent à jour sur place. La carte et le mini-tracé sans fond de carte la posent pareil.

/** Hauteur du voile (dp) : la phrase et un peu d'air dessous. */
const VOILE = 104;
const ARRETS = [
  { offset: 0, opacite: 0.94 },
  { offset: 0.5, opacite: 0.6 },
  { offset: 1, opacite: 0 },
];

export function PhraseCircuit({ etat }: { etat: EtatCircuit }) {
  const { couleurs } = useTheme();
  // Dessiné sur des nombres de dp (comme DegradeFond) ; le parent coupe ce qui dépasse la carte.
  const largeur = useWindowDimensions().width;
  const arrive = estArrive(etat);
  const cle = etat.surCircuit ? (arrive ? "end" : "in") : "out";
  const titre = cle === "end" ? t("circuit.suivre.arrive") : cle === "in" ? t("circuit.suivre.sur") : t("circuit.suivre.ecart", { distance: ecartTexte(etat.ecartM) });
  const sous = cle === "end" ? null : cle === "in" ? t("circuit.suivre.reste", { distance: distanceTexte(etat.resteM) }) : t("circuit.suivre.retour");
  return (
    <View style={styles.cadre} pointerEvents="none">
      <Svg width={largeur} height={VOILE} viewBox={`0 0 ${largeur} ${VOILE}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <DegradeSvg id="voile-circuit" x1="0" y1="0" x2="0" y2="1">
            {ARRETS.map((a) => (
              <Stop key={a.offset} offset={a.offset} stopColor={couleurs.s1} stopOpacity={a.opacite} />
            ))}
          </DegradeSvg>
        </Defs>
        <RectSvg x={0} y={0} width={largeur} height={VOILE} fill="url(#voile-circuit)" />
      </Svg>
      <Animated.View key={cle} entering={liste.entree} style={styles.texte} accessible accessibilityLabel={sous ? `${titre}. ${sous}` : titre}>
        <View style={styles.ligne}>
          {etat.surCircuit ? null : <Icone nom="alerte" taille={20} couleur={couleurs.t1} />}
          <Texte numberOfLines={1} style={styles.titre}>
            {titre}
          </Texte>
        </View>
        {sous ? (
          <Texte couleur="t2" numberOfLines={1} style={styles.sous}>
            {sous}
          </Texte>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { position: "absolute", left: 0, top: 0, right: 0, height: VOILE },
  texte: { position: "absolute", left: 14, top: 12, right: 72 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 6 },
  titre: { flexShrink: 1, fontFamily: police.regular, fontSize: 22, lineHeight: 28 },
  sous: { fontSize: 12, marginTop: 2 },
});
