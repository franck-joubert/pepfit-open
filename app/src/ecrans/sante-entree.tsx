// Arrivée sur Santé (30/10) : le corps paraît en fondu (ui/3d/CorpsSante), puis chaque trait se trace du corps vers
// sa vignette et la vignette se pose au bout, en léger décalé, de haut en bas ; moins de 400 ms en tout (jetons
// `santeEntree`), sur le fil UI : une seule horloge partagée (Reanimated), chaque trait et chaque vignette y lisent leur
// fenêtre. Jouée au premier affichage, puis seulement quand les valeurs montrées changent : pas à chaque retour d'onglet.
// Mouvement réduit : tout est posé d'un coup.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { Circle, Line } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { courbe, santeEntree as E } from "../theme/mouvement";
import { decisionEntree, FIN_ENTREE } from "./sante-entree-calc";

const LigneAnimee = Animated.createAnimatedComponent(Line);
const PointAnime = Animated.createAnimatedComponent(Circle);

/** Avancement (0 → 1, courbe de sortie) d'un élément qui part à `debut` ms et dure `duree` ms, à l'instant `t` de l'horloge. */
export function avancement(t: number, debut: number, duree: number): number {
  "worklet";
  const x = Math.min(1, Math.max(0, (t - debut) / duree));
  return Easing.bezierFn(courbe.sortie[0], courbe.sortie[1], courbe.sortie[2], courbe.sortie[3])(x);
}

let montre: string | null = null;

/**
 * L'horloge de l'entrée (ms, de 0 à FIN_ENTREE), jouée selon `decisionEntree`, et les vignettes à dessiner : quand l'entrée se
 * rejoue (valeurs changées), les anciennes restent le temps que le fil UI ait caché les vignettes (sinon les nouvelles se
 * montraient une ou deux images avant de disparaître pour entrer).
 */
export function useEntreeSante<T>({ pret, charge, signature, reduit, cases }: { pret: boolean; charge: boolean; signature: string; reduit: boolean; cases: T }): { t: SharedValue<number>; cases: T } {
  const t = useSharedValue(montre == null ? 0 : FIN_ENTREE);
  const [tenues, setTenues] = useState<{ cases: T } | null>(null);
  const precedentes = useRef(cases);
  const [attendu, setAttendu] = useState(montre != null);
  const debut = useRef(0);
  // Premier affichage : passé l'attente, l'entrée part d'elle-même, sur le fil UI (le fil JS peut être pris par la première
  // image du corps : un minuteur JS laissait les vignettes cachées jusqu'à elle) ; corps et données prêts avant, elle part
  // tout de suite et remplace celle-ci. Le minuteur JS ne fait que tenir le compte (decisionEntree).
  useEffect(() => {
    if (attendu || debut.current) return;
    debut.current = performance.now();
    t.value = withDelay(E.attente, withTiming(FIN_ENTREE, { duration: FIN_ENTREE, easing: Easing.linear }));
    const m = setTimeout(() => setAttendu(true), E.attente);
    return () => clearTimeout(m);
  }, [attendu, t]);
  // avant l'affichage : de nouvelles valeurs ne se montrent pas une image avant que l'entrée ne reparte
  useLayoutEffect(() => {
    const ecoule = attendu || (debut.current > 0 && performance.now() - debut.current >= E.attente);
    const rejeu = montre != null;
    const d = decisionEntree(montre, { pret, charge, attendu: ecoule, signature });
    montre = d.montre;
    const anciennes = precedentes.current;
    precedentes.current = cases;
    if (!d.jouer) return;
    const entrer = () => {
      setTenues(null);
      t.value = withTiming(FIN_ENTREE, { duration: FIN_ENTREE, easing: Easing.linear });
    };
    if (reduit) {
      setTenues(null);
      t.value = FIN_ENTREE;
    } else if (rejeu) {
      // les anciennes valeurs (rendu suivant, avant l'affichage), cachées par le fil UI, puis les nouvelles entrent
      setTenues({ cases: anciennes });
      t.value = withTiming(0, { duration: 0 }, (fini) => {
        if (fini) scheduleOnRN(entrer);
      });
    } else {
      t.value = 0;
      entrer();
    }
  }, [pret, charge, attendu, signature, reduit, t, cases]);
  return { t, cases: tenues ? tenues.cases : cases };
}

/** Trait d'une vignette, tracé depuis son point d'ancrage sur le corps (x1, y1) vers la vignette (x2, y2). */
export function TraitEntree({ t, rang, x1, y1, x2, y2, couleur }: { t: SharedValue<number>; rang: number; x1: number; y1: number; x2: number; y2: number; couleur: string }) {
  const longueur = Math.hypot(x2 - x1, y2 - y1);
  const trait = useAnimatedProps(() => ({ strokeDashoffset: longueur * (1 - avancement(t.value, E.debutTraits + rang * E.ecart, E.trait)) }));
  const point = useAnimatedProps(() => ({ opacity: avancement(t.value, E.debutTraits + rang * E.ecart, E.trait / 3) }));
  return (
    <>
      <LigneAnimee x1={x1} y1={y1} x2={x2} y2={y2} stroke={couleur} strokeWidth={1} strokeDasharray={[longueur, longueur]} animatedProps={trait} />
      <PointAnime cx={x1} cy={y1} r={2.5} fill={couleur} animatedProps={point} />
    </>
  );
}

/** Vignette qui se pose au bout de son trait : fondu et quelques dp depuis le côté du corps. */
export function CaseEntree({ t, rang, cote, style, children }: { t: SharedValue<number>; rang: number; cote: "g" | "d"; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const anime = useAnimatedStyle(() => {
    const p = avancement(t.value, E.debutCases + rang * E.ecart, E.case);
    return { opacity: p, transform: [{ translateX: (1 - p) * E.glisse * (cote === "g" ? 1 : -1) }] };
  });
  return <Animated.View style={[style, anime]}>{children}</Animated.View>;
}
