import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Reanimated, {
  Easing as ReEasing, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { tp } from "../i18n/index";
import { primitifs } from "../theme/jetons";
import { duree } from "../theme/mouvement";
import { police } from "../theme/typo";
import { Icone } from "./Icone";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { Texte } from "./Texte";
import { useCouleurPartie } from "./ContextePartie";

// Série hebdomadaire (flamme + nombre), posée à droite sous la bande de la semaine. Touchée, « semaines d'affilée » se
// déplie vers la gauche pendant que la flamme se balance sur sa base en scintillant vers le jaune, puis se replie au bout
// de 2,5 s (D10 de la revue finale, 30/10 : balancement gardé, dépli en 220 ms). Aucune largeur animée : la boîte du suffixe
// prend sa largeur d'un coup (mesurée une fois sur une copie invisible) ; la série glisse à sa nouvelle place par une
// transition de mise en page native (Reanimated), et le suffixe se révèle en scaleX depuis la gauche, son opacité 60 ms
// plus tard. Au repli, le suffixe s'efface d'abord, puis la boîte se ferme. Avec « réduire les animations », le suffixe
// apparaît et disparaît sans mouvement.
//
//   <Serie n={40} couleur={accent} />

/** Dépli (planche planification) : 220 ms, courbe sortie (part vite, se pose) ; opacité décalée de 60 ms. */
const DEPLI_MS = duree.deplacement;
const OPACITE_DECALAGE_MS = 60;
const OUVERT_MS = 2500;
const GLISSE = LinearTransition.duration(DEPLI_MS).easing(courbes.sortie);
/** Balancement amorti de la flamme (degrés, ms), pivot à sa base. */
const BALANCE: [number, number][] = [[-12, 140], [10, 180], [-7, 180], [5, 180], [-3, 180], [0, 200]];
/** Scintillement vers le jaune (opacité du calque jaune, ms), calé sur le balancement. */
const ECLATS: [number, number][] = [[0.9, 120], [0.35, 110], [1, 130], [0.5, 120], [0.85, 140], [0, 440]];

export function Serie({ n, couleur }: { n: number; /** Flamme : couleur de la partie (défaut : celle de l'écran). */ couleur?: string }) {
  const accent = useCouleurPartie();
  const reduit = useReduit();
  const angle = useSharedValue(0);
  const eclat = useSharedValue(0);
  const echelle = useSharedValue(0);
  const opacite = useSharedValue(0);
  const [mesure, setMesure] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (minuterie.current && clearTimeout(minuterie.current)), []);
  const balance = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  const scintille = useAnimatedStyle(() => ({ opacity: eclat.value }));
  const revele = useAnimatedStyle(() => ({ opacity: opacite.value, transform: [{ scaleX: Math.max(0.001, echelle.value) }] }));
  if (n <= 0) return null;
  // Le suffixe seul, accordé au nombre et à la langue : « semaines d'affilée », « weeks in a row ».
  const suffixe = tp("planif.serie", n, { n: "" }).trim();

  const deplier = (ouvrir: boolean) => {
    if (reduit) {
      echelle.value = ouvrir ? 1 : 0;
      opacite.value = ouvrir ? 1 : 0;
      setOuvert(ouvrir);
      return;
    }
    if (ouvrir) {
      setOuvert(true);
      echelle.value = withTiming(1, { duration: DEPLI_MS, easing: courbes.sortie });
      opacite.value = withDelay(OPACITE_DECALAGE_MS, withTiming(1, { duration: DEPLI_MS - OPACITE_DECALAGE_MS, easing: courbes.sortie }));
      return;
    }
    // Le texte s'efface d'abord, puis la boîte se ferme et la série glisse à sa place.
    opacite.value = withTiming(0, { duration: DEPLI_MS - OPACITE_DECALAGE_MS, easing: courbes.sortie }, (fini) => {
      if (!fini) return;
      echelle.value = 0;
      scheduleOnRN(setOuvert, false);
    });
  };
  const toucher = () => {
    if (!reduit) {
      angle.value = withSequence(...BALANCE.map(([a, d]) => withTiming(a, { duration: d, easing: ReEasing.inOut(ReEasing.sin) })));
      eclat.value = withSequence(...ECLATS.map(([o, d]) => withTiming(o, { duration: d, easing: courbes.sortie })));
    }
    deplier(true);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => deplier(false), OUVERT_MS);
  };
  const c = couleur ?? accent;
  return (
    <Reanimated.View layout={reduit ? undefined : GLISSE}>
      <Pressable accessibilityRole="button" accessibilityLabel={tp("planif.serie", n)} onPress={toucher} hitSlop={8} style={styles.serie}>
        <Reanimated.View style={[styles.flamme, balance]}>
          <Icone nom="flamme" couleur={c} taille={16} />
          <Reanimated.View style={[StyleSheet.absoluteFill, scintille]}>
            <Icone nom="flamme" couleur={primitifs["jaune-400"]} taille={16} />
          </Reanimated.View>
        </Reanimated.View>
        <Texte variante="corps" couleur="t2" style={styles.texte}>
          {n}
        </Texte>
        <View style={[styles.boite, { width: ouvert ? mesure : 0 }]}>
          <Reanimated.View style={[styles.suffixe, { width: mesure }, revele]}>
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={[styles.texte, styles.suffixeTexte]}>
              {suffixe}
            </Texte>
          </Reanimated.View>
        </View>
        {/* Copie invisible, hors du flux : donne la largeur dépliée. */}
        <View pointerEvents="none" style={styles.mesure}>
          <Texte variante="corps" numberOfLines={1} style={[styles.texte, styles.suffixeTexte]} onLayout={(e) => setMesure(Math.ceil(e.nativeEvent.layout.width))}>
            {suffixe}
          </Texte>
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  serie: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 4 },
  flamme: { transformOrigin: "50% 100%", marginRight: 4 },
  texte: { fontFamily: police.semibold },
  boite: { overflow: "hidden", height: 24, justifyContent: "center" },
  suffixe: { position: "absolute", left: 0, flexDirection: "row", transformOrigin: "0% 50%" },
  suffixeTexte: { paddingLeft: 4 },
  // Large et hors du flux : le texte y prend sa largeur naturelle, sans être coupé par la ligne.
  mesure: { position: "absolute", left: 0, top: 0, width: 1000, opacity: 0, flexDirection: "row", alignItems: "flex-start" },
});
