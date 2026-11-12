import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { axeDegrade, degrades, type Arret } from "../theme/effets";
import { courbe as courbes, duree, echelle, reflet as tempsReflet } from "../theme/mouvement";
import { useTheme } from "../theme";
import { espace, rayon, typo } from "../theme/typo";
import { useDegrade } from "./ContextePartie";
import { Icone, type NomIcone } from "./Icone";
import { Appui } from "./mouvement";
import { Texte } from "./Texte";
import { useReduit } from "./reduit";

// Geste principal en dégradé (refonte du 26/10) : clair → foncé à 135°, dans la couleur de la partie de l'écran (27/10 :
// bleu Accueil, orange Entraînements, vert Nutrition, rose Santé), texte et icônes blancs, ombre teintée douce, un
// reflet qui passe une fois à l'apparition et à chaque appui. Un seul par écran.

const courbe = (c: readonly [number, number, number, number]) => Easing.bezier(c[0], c[1], c[2], c[3]);
const sortieCourbe = courbes.sortie;

/** Identifiant de dégradé SVG propre (useId rend « :r0: », que url(#…) n'aime pas). */
export function useIdSvg(prefixe: string) {
  return prefixe + useId().replace(/[^a-zA-Z0-9]/g, "");
}

function useTaille() {
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTaille((t) => (t.l === width && t.h === height ? t : { l: width, h: height }));
  }, []);
  return { ...taille, onLayout };
}

export function arretsSvg(arrets: readonly Arret[]) {
  return arrets.map((a) => <Stop key={a.offset} offset={a.offset} stopColor={a.couleur} stopOpacity={a.opacite ?? 1} />);
}

/** Fond en dégradé linéaire (angle CSS), qui remplit son parent ; par défaut, le dégradé de la partie de l'écran. */
export function FondDegrade({ arrets, angle = 135 }: { arrets?: readonly Arret[]; angle?: number }) {
  const partie = useDegrade();
  arrets ??= partie.arrets;
  const id = useIdSvg("deg");
  const { l, h, onLayout } = useTaille();
  const a = l && h ? axeDegrade(angle, l, h) : null;
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {a ? (
        <Svg width={l} height={h}>
          <Defs>
            <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.x1 * l} y1={a.y1 * h} x2={a.x2 * l} y2={a.y2 * h}>
              {arretsSvg(arrets)}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={l} height={h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Fond en dégradé qui fond d'un dégradé à l'autre quand la partie change (parcours de première utilisation : bleu, rose,
 * orange d'une étape à l'autre) : l'ancien s'efface par-dessus en 220 ms, courbe sortie ; mouvement réduit compris (fondu).
 */
export function FonduDegrade({ arrets, angle = 135 }: { arrets: readonly Arret[]; angle?: number }) {
  const [avant, setAvant] = useState<{ arrets: readonly Arret[]; n: number } | null>(null);
  const [courant, setCourant] = useState(arrets);
  const o = useSharedValue(0);
  if (arrets !== courant) {
    setAvant({ arrets: courant, n: (avant?.n ?? 0) + 1 });
    setCourant(arrets);
  }
  useEffect(() => {
    if (!avant) return;
    o.value = 1;
    o.value = withTiming(0, { duration: duree.onglet, easing: courbe(sortieCourbe) });
  }, [avant, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <>
      <FondDegrade arrets={courant} angle={angle} />
      {avant ? (
        <Animated.View key={avant.n} pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
          <FondDegrade arrets={avant.arrets} angle={angle} />
        </Animated.View>
      ) : null}
    </>
  );
}

/**
 * Reflet qui traverse : `p` va de 0 (hors champ à gauche) à 1 (hors champ à droite). `passer(ms, delai)` le relance ;
 * rien sous « réduire les animations ».
 */
export function useReflet() {
  const reduit = useReduit();
  const p = useSharedValue(0);
  const passer = useCallback(
    (ms: number, c: readonly [number, number, number, number], delai = 0) => {
      if (reduit) return;
      p.value = 0;
      p.value = withDelay(delai, withTiming(1, { duration: ms, easing: courbe(c) }));
    },
    [reduit, p],
  );
  return { p, passer, reduit };
}

/** Bande de reflet (105°), à poser dans un parent qui coupe ce qui déborde. */
export function Reflet({ p, arrets = degrades.accueil.reflet }: { p: { value: number }; arrets?: readonly Arret[] }) {
  const id = useIdSvg("ref");
  const { l, h, onLayout } = useTaille();
  const largeur = useSharedValue(0);
  useEffect(() => {
    largeur.value = l;
  }, [l, largeur]);
  const k = tempsReflet.course;
  const anime = useAnimatedStyle(() => ({ transform: [{ translateX: (-k + 2 * k * p.value) * largeur.value }] }));
  const a = l && h ? axeDegrade(105, l, h) : null;
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {a ? (
        <Animated.View style={[StyleSheet.absoluteFill, anime]}>
          <Svg width={l} height={h}>
            <Defs>
              <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.x1 * l} y1={a.y1 * h} x2={a.x2 * l} y2={a.y2 * h}>
                {arretsSvg(arrets)}
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={l} height={h} fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Bouton du geste principal : pleine largeur en dégradé, même arrondi que les autres boutons (rayon.l), texte et icône blancs.
 * Désactivé (audit du 28/10, constat 38) : fond s2, libellé et icône t3, sans dégradé ni ombre, jour comme nuit (t3 sur s2 :
 * 5,8:1 la nuit, 5,1:1 le jour ; le dégradé à 38 % tombait à 1,1:1 le jour). Le libellé remplace alors `children`, écrit
 * pour le blanc du dégradé.
 */
export function BoutonPrincipal({
  libelle,
  onPress,
  icone,
  desactive = false,
  accessibilityLabel,
  compact = false,
  iconeSeule = false,
  style,
  children,
}: {
  libelle: string;
  onPress: () => void;
  icone?: NomIcone;
  desactive?: boolean;
  accessibilityLabel?: string;
  /** Dans une barre du haut : 44 de haut, à la largeur du libellé. */
  compact?: boolean;
  /** Carré de 44 avec l'icône seule (le « + » d'un repas) : le libellé n'est plus que celui lu par l'accessibilité. */
  iconeSeule?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Contenu à la place du libellé (le libellé reste celui lu par l'accessibilité). */
  children?: ReactNode;
}) {
  const d = useDegrade();
  const { couleurs } = useTheme();
  const { p, passer } = useReflet();
  useEffect(() => {
    if (!desactive) passer(tempsReflet.apparition, tempsReflet.courbeApparition, tempsReflet.apparitionDelai);
  }, [desactive, passer]);
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? libelle}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={onPress}
      onPressIn={() => passer(tempsReflet.appui, tempsReflet.courbeAppui)}
      echelle={echelle.appuiPrincipal}
      style={[styles.principal, (compact || iconeSeule) && styles.compact, !desactive && { boxShadow: d.ombre }, style]}
    >
      <View style={[styles.coupe, { backgroundColor: desactive ? couleurs.s2 : d.arrets[d.arrets.length - 1]?.couleur }]}>
        {desactive ? null : (
          <>
            <FonduDegrade arrets={d.arrets} />
            <Reflet p={p} arrets={d.reflet} />
          </>
        )}
        <View style={[styles.contenu, compact && styles.contenuCompact, iconeSeule && styles.contenuCarre]}>
          {icone ? <Icone nom={icone} couleur={desactive ? couleurs.t3 : d.sur} taille={18} /> : null}
          {iconeSeule ? null : (desactive ? null : children) ?? (
            <Texte variante="exercice" numberOfLines={1} style={[styles.libelle, { color: desactive ? couleurs.t3 : d.sur }]}>
              {libelle}
            </Texte>
          )}
        </View>
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  principal: { alignSelf: "stretch", height: 52, borderRadius: rayon.l },
  // Barre du haut : 8 de plus que son retrait, le bord droit s'aligne sur la marge du contenu (16) et l'ombre respire.
  compact: { alignSelf: "center", height: 44, borderRadius: rayon.l, marginRight: espace.s },
  coupe: { flex: 1, borderRadius: rayon.l, overflow: "hidden" },
  contenuCompact: { paddingHorizontal: espace.l },
  // Icône de 18 entre deux marges de 13 : le carré de 44, à la largeur de son contenu comme le bouton de la barre du haut.
  contenuCarre: { paddingHorizontal: 13 },
  contenu: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s, paddingHorizontal: espace.xl },
  libelle: typo.exercice,
});
