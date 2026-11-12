import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { ombreVolet, voile } from "../theme/effets";
import { duree } from "../theme/mouvement";
import { rayon } from "../theme/typo";
import { ContenuProfil } from "../ecrans/Profil";
import { ContexteVolet, type Volet } from "./contexte-volet";
import { estOnglet } from "./menu-flottant";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { bordOuvreVolet, dureeLacher, largeurVolet, prendBord, prendFermeture, progresFermeture, progresOuverture, resteOuvert } from "./volet";
import { t } from "../i18n/index";

// Volet du profil (27/10) : glisse depuis la gauche et recouvre la page, menu compris ; le voile fonce avec lui.
// S'ouvre par l'avatar ou en glissant depuis le bord gauche (40 dp, sur Moi seulement : ailleurs
// le glissé change de jour ou d'onglet, retours du 28/10, b). Se ferme en glissant vers la
// gauche, en touchant le voile, par ✕ ou par le retour d'Android. Entrée 280 ms (courbe feuille), sortie 220 ms.
// Lâché après un glissé, il finit à la vitesse du doigt (entre 120 ms et ces durées), courbe sortie.
// Un écran ouvert depuis le volet le referme ; revenir à l'onglet le rouvre tel quel.
// « Réduire les animations » : pas de glissé, le volet et le voile paraissent et s'effacent en fondu court (150 ms).

export function FournisseurVolet({ children }: { children: ReactNode }) {
  const ici = usePathname();
  const { width } = useWindowDimensions();
  const largeur = largeurVolet(width);
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  // Fondu du mouvement réduit (1 sinon) : le volet est posé ouvert ou fermé, seule son opacité passe.
  const f = useSharedValue(1);
  const [ouvert, setOuvert] = useState(false);
  const [monte, setMonte] = useState(false);
  const [visite, setVisite] = useState(0);
  const etat = useRef({ ouvert: false, onglet: estOnglet(ici), bord: bordOuvreVolet(ici), largeur, rouvrir: null as string | null, ici, dansRangee: false, x0: Infinity });
  etat.current.onglet = estOnglet(ici);
  etat.current.bord = bordOuvreVolet(ici);
  etat.current.largeur = largeur;
  etat.current.ici = ici;

  // Toucher (avatar, voile, ✕) : 280 / 220 ms. Lâcher après un glissé (`vx` donné) : le reste du trajet garde l'élan du
  // doigt, courbe sortie (constat 2 de l'audit du mouvement).
  const animer = useCallback(
    (vers: 0 | 1, vx?: number) => {
      if (reduit) {
        const fondu = { duration: duree.sortie, easing: courbes.sortie };
        // Lâché ouvert après un glissé : il suit déjà le doigt, il se pose.
        if (vers && typeof vx === "number") p.value = 1;
        else if (vers) {
          p.value = 1;
          f.value = 0;
          f.value = withTiming(1, fondu);
        } else
          f.value = withTiming(0, fondu, (fini) => {
            if (!fini) return;
            p.value = 0;
            f.value = 1;
          });
      } else if (typeof vx === "number")
        p.value = withTiming(vers, { duration: dureeLacher(p.value, vers, etat.current.largeur, vx, vers ? duree.feuille : duree.feuilleSortie), easing: courbes.sortie });
      else p.value = withTiming(vers, vers ? { duration: duree.feuille, easing: courbes.feuille } : { duration: duree.feuilleSortie, easing: courbes.sortie });
    },
    [p, f, reduit],
  );

  const ouvrir = useCallback(
    (vx?: number) => {
      etat.current.ouvert = true;
      setMonte(true);
      setOuvert(true);
      setVisite((n) => n + 1);
      animer(1, vx);
    },
    [animer],
  );

  const fermer = useCallback(
    (vx?: number) => {
      etat.current.ouvert = false;
      setOuvert(false);
      animer(0, vx);
    },
    [animer],
  );

  const aller = useCallback(
    (href: Href) => {
      etat.current.rouvrir = etat.current.onglet ? etat.current.ici : null;
      fermer();
      router.push(href);
    },
    [fermer],
  );

  // Retour sur l'onglet quitté par le volet : il est de nouveau là, ouvert, sans animation.
  useEffect(() => {
    const e = etat.current;
    if (!e.rouvrir || !estOnglet(ici)) return;
    if (ici === e.rouvrir) {
      e.ouvert = true;
      setOuvert(true);
      setVisite((n) => n + 1);
      p.value = 1;
      f.value = 1;
    }
    e.rouvrir = null;
  }, [ici, p, f]);

  useEffect(() => {
    if (!ouvert) return;
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      fermer();
      return true;
    });
    return () => s.remove();
  }, [ouvert, fermer]);

  // Bord gauche : pris en phase de capture, seulement quand le doigt part de la bande et file vers la droite ; un appui
  // dans la bande reste à la page. Le départ du doigt est noté au toucher (onTouchStartCapture) : le `x0` du PanResponder
  // vaut 0 tant qu'il n'a pas pris le geste, et tout glissé vers la droite ouvrait le volet, d'où qu'il parte (27/10).
  const bord = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => !etat.current.ouvert && etat.current.bord && prendBord(etat.current.x0, g.dx, g.dy),
        onPanResponderGrant: () => setMonte(true),
        onPanResponderMove: (_, g) => {
          p.value = progresOuverture(g.dx, etat.current.largeur);
        },
        onPanResponderRelease: (_, g) => (resteOuvert(progresOuverture(g.dx, etat.current.largeur), g.vx) ? ouvrir(g.vx) : fermer(g.vx)),
        onPanResponderTerminate: () => fermer(),
      }),
    [p, ouvrir, fermer],
  );

  // Fermeture : glissé vers la gauche n'importe où dans le volet, sauf sur la rangée des records (elle défile).
  const glisse = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => !etat.current.dansRangee && prendFermeture(g.dx, g.dy),
        onPanResponderMove: (_, g) => {
          p.value = progresFermeture(g.dx, etat.current.largeur);
        },
        onPanResponderRelease: (_, g) => (resteOuvert(progresFermeture(g.dx, etat.current.largeur), g.vx) ? ouvrir(g.vx) : fermer(g.vx)),
        onPanResponderTerminate: () => ouvrir(),
      }),
    [p, ouvrir, fermer],
  );

  const styleVoile = useAnimatedStyle(() => ({ opacity: p.value * f.value }));
  // Fermé, le volet reste monté hors de l'écran : il s'efface, sinon son ombre du jour déborde sur le bord gauche des pages.
  const styleVolet = useAnimatedStyle(() => ({ opacity: p.value > 0 ? f.value : 0, transform: [{ translateX: (p.value - 1) * largeur }] }));
  const ombre = ombreVolet[mode];
  const fondVolet = mode === "nuit" ? couleurs.feuilleFond : couleurs.s1;
  const contexte = useMemo<Volet>(() => ({ ouvrir: () => ouvrir(), fermer: () => fermer(), aller }), [ouvrir, fermer, aller]);

  return (
    <ContexteVolet.Provider value={contexte}>
      <View style={{ flex: 1 }} onTouchStartCapture={(e) => (etat.current.x0 = e.nativeEvent.pageX)} {...bord.panHandlers}>
        {children}
        {monte ? (
          <View style={StyleSheet.absoluteFill} pointerEvents={ouvert ? "box-none" : "none"}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: voile[mode] }, styleVoile]}>
              <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t("ui.fermer")} onPress={() => fermer()} />
            </Animated.View>
            <Animated.View
              accessibilityViewIsModal
              accessibilityLabel={t("profil.titre")}
              onTouchStartCapture={() => (etat.current.dansRangee = false)}
              {...glisse.panHandlers}
              style={[
                styles.volet,
                { width: largeur, backgroundColor: fondVolet },
                ombre && { borderRightWidth: StyleSheet.hairlineWidth, borderColor: couleurs.line, boxShadow: ombre },
                styleVolet,
              ]}
            >
              <ContenuProfil largeur={largeur} visite={visite} onDansRangee={() => (etat.current.dansRangee = true)} />
              {/* Sous la barre d'état, le contenu qui défile passe sous une bande du fond du volet : il ne chevauche plus l'heure. */}
              <View pointerEvents="none" style={[styles.encoche, { height: insets.top, backgroundColor: fondVolet }]} />
            </Animated.View>
          </View>
        ) : null}
      </View>
    </ContexteVolet.Provider>
  );
}

const styles = StyleSheet.create({
  volet: { position: "absolute", top: 0, bottom: 0, left: 0, borderTopRightRadius: rayon.l, borderBottomRightRadius: rayon.l },
  encoche: { position: "absolute", top: 0, left: 0, right: 0, borderTopRightRadius: rayon.l },
});
