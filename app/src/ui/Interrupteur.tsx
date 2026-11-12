import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

/** Course de la pastille : piste de 40, marge de 3, pastille de 18. */
const COURSE = 40 - 2 * 3 - 18;
/** Liseré de l'interrupteur éteint (D8) : posé dans la marge de 3, la pastille garde ses 18 et sa course. */
const LISERE = 1.5;

// 40 × 24, plein : allumé piste t1, éteint piste « inter » ; pastille bg / t3 la nuit, blanche le jour. Jamais orange (DESIGN.md §2).
// Éteint, le jour : liseré `interrupteur-lisere-eteint` (noir 45 %, 3,3:1 sur blanc ; D8 de la planche profil-public).
// Basculé, la pastille glisse et les couleurs (liseré compris) fondent en 160 ms, courbe sortie (opportunité O1 de l'audit
// du mouvement) ; « réduire les animations » : la pastille saute, le fondu reste.
export function Interrupteur({
  valeur,
  onChange,
  libelle,
  desactive = false,
  pale = true,
}: {
  valeur: boolean;
  onChange: (v: boolean) => void;
  libelle: string;
  desactive?: boolean;
  /** Désactivé : estompé (par défaut) ; faux pour un réglage fixe qui doit rester lisible (« Heure des séances » du profil public). */
  pale?: boolean;
}) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const p = useSharedValue(valeur ? 1 : 0);
  const x = useSharedValue(valeur ? COURSE : 0);
  useEffect(() => {
    const anim = { duration: duree.bascule, easing: courbes.sortie };
    p.value = withTiming(valeur ? 1 : 0, anim);
    x.value = reduit ? (valeur ? COURSE : 0) : withTiming(valeur ? COURSE : 0, anim);
  }, [valeur, reduit, p, x]);
  const {
    interrupteurPiste: piste,
    interrupteurPisteEteint: pisteEteint,
    interrupteurBouton: bouton,
    interrupteurBoutonEteint: boutonEteint,
    interrupteurLisereEteint: lisereEteint,
  } = couleurs;
  const stylePiste = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [pisteEteint, piste]),
    borderColor: interpolateColor(p.value, [0, 1], [lisereEteint, "rgba(0,0,0,0)"]),
  }));
  const stylePastille = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [boutonEteint, bouton]),
    transform: [{ translateX: x.value }],
  }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={libelle}
      accessibilityState={{ checked: valeur, disabled: desactive }}
      disabled={desactive}
      onPress={() => onChange(!valeur)}
      hitSlop={10}
      style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center", opacity: desactive && pale ? 0.38 : 1 }}
    >
      <Animated.View style={[{ width: 40, height: 24, borderRadius: 12, padding: 3 - LISERE, borderWidth: LISERE }, stylePiste]}>
        <Animated.View style={[{ width: 18, height: 18, borderRadius: 9 }, stylePastille]} />
      </Animated.View>
    </Pressable>
  );
}
