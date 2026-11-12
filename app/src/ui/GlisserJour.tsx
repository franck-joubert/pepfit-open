import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { largeurContenu } from "./CadreContenu";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { ressort } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { departGeste } from "./arbitrage-gestes";
import { accrocheJour, dureeAccroche, indexJour, joursRendus, prendGlisse, suivreDoigt } from "./glisser-jour";
import { useReduit } from "./reduit";

// Glissé entre les jours (logique : glisser-jour.ts), en trois pièces qui partagent une position continue en jours :
//   usePositionJour(jour)   la position (SharedValue) ; un jour changé autrement qu'au doigt (case, « Aujourd'hui », semaine)
//                           y est posé d'un coup.
//   <GlisserJour>           la zone du geste (toute la page) : le doigt déplace la position, le lâcher l'accroche au jour voisin
//                           (distance ou vitesse) ou la ramène en ressort ; `onJour(sens)` une fois l'accroche finie.
//   <PagesJours>            la veille, le jour et le lendemain côte à côte, placés d'après la position : le jour voisin est
//                           déjà là et suit le doigt avant le lâcher. Les voisins sont des aperçus (ni toucher, ni lecteur
//                           d'écran) ; chaque page garde sa clé (le jour) : à l'accroche, l'aperçu devient la page vive sans
//                           être recréé ni déplacé.
// La bande de la semaine reste fixe : seul le fond de la pastille du jour suit la position (BandeSemaine `position`).
// Le geste passe par PanResponder (pas de react-native-gesture-handler dans l'appli) : il n'écrit que la position, sans
// re-rendu React ; le placement des pages et de la pastille est calculé sur le fil de l'interface.
// Pris en bulle : les lignes supprimables (parti d'elles, le glissé est à elles : arbitrage-gestes.ts) et les glisser-déposer,
// plus profonds, gardent leur geste ; le semainier, lui, glisse le jour comme le reste de la page ; le volet du profil ne prend le bord gauche que sur l'Accueil (ui/Volet.tsx). « Réduire les animations » : la page suit le doigt,
// le jour change sans glissé.

export function usePositionJour(jour: string): SharedValue<number> {
  const pos = useSharedValue(indexJour(jour));
  useLayoutEffect(() => {
    const i = indexJour(jour);
    // Après une accroche, la position y est déjà : rien à faire.
    if (Math.abs(pos.value - i) < 1e-3) return;
    cancelAnimation(pos);
    pos.value = i;
  }, [jour, pos]);
  return pos;
}

export function GlisserJour({
  jour,
  position,
  onJour,
  children,
  style,
}: {
  jour: string;
  position: SharedValue<number>;
  onJour: (sens: 1 | -1) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduit = useReduit();
  const largeur = useRef(largeurContenu());
  const opts = useRef({ onJour, reduit, jour });
  opts.current = { onJour, reduit, jour };
  const geste = useRef({ depart: 0, dx0: 0 });

  const pan = useMemo(() => {
    const retour = (base: number, vitesse = 0) => {
      position.value = withSpring(base, { ...ressort.retour, velocity: vitesse });
    };
    return PanResponder.create({
      // Départ du doigt (capture, avant les lignes) : une ligne supprimable touchée posera sa marque juste après.
      onStartShouldSetPanResponderCapture: () => {
        departGeste.toucher();
        return false;
      },
      // Parti d'une ligne supprimable : le glissé est à elle, pas de changement de jour (option A).
      onMoveShouldSetPanResponder: (_, g) => !departGeste.surLigne() && prendGlisse(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => {
        // Repris en cours d'accroche : on part de là où la page en est. Le seuil de prise ne fait pas sauter la page.
        cancelAnimation(position);
        geste.current = { depart: position.value, dx0: g.dx };
      },
      onPanResponderMove: (_, g) => {
        const base = indexJour(opts.current.jour);
        position.value = suivreDoigt(geste.current.depart, g.dx - geste.current.dx0, largeur.current, base);
      },
      onPanResponderRelease: (_, g) => {
        const base = indexJour(opts.current.jour);
        const l = largeur.current;
        const repos = Math.abs(geste.current.depart - base) < 1e-3;
        const cible = accrocheJour(base, position.value, g.vx, l, repos ? g.dx : undefined);
        if (cible === base) return retour(base, (-g.vx * 1000) / l);
        const sens = (cible - base) as 1 | -1;
        if (opts.current.reduit) {
          position.value = cible;
          opts.current.onJour(sens);
          return;
        }
        const changer = (s: 1 | -1) => opts.current.onJour(s);
        position.value = withTiming(cible, { duration: dureeAccroche(cible - position.value), easing: courbes.sortie }, (fini) => {
          if (fini) scheduleOnRN(changer, sens);
        });
      },
      onPanResponderTerminate: () => retour(indexJour(opts.current.jour)),
    });
  }, [position]);

  return (
    <View {...pan.panHandlers} onLayout={(e) => (largeur.current = e.nativeEvent.layout.width)} style={[{ flex: 1 }, style]}>
      {children}
    </View>
  );
}

/**
 * La veille, le jour et le lendemain ; `rendu(j, vif)` dessine une page (vif : le jour courant, interactif).
 * `saut` (facultatif, ui/saut-jour.ts, 29/10) : « Revenir à aujourd'hui » de loin, en un seul glissé. La page `vers` est rendue
 * en plus, décalée de `decalage` jours (posé sur le fil de l'interface) pour arriver à côté du jour affiché, du côté `sens` ;
 * le voisin ordinaire de ce côté est caché le temps du glissé.
 */
export function PagesJours({
  jour,
  position,
  rendu,
  saut,
  decalage,
}: {
  jour: string;
  position: SharedValue<number>;
  rendu: (j: string, vif: boolean) => ReactNode;
  saut?: { vers: string; sens: 1 | -1 } | null;
  decalage?: SharedValue<number>;
}) {
  const largeur = useSharedValue(largeurContenu());
  const jours = joursRendus(jour);
  const vers = saut && !jours.includes(saut.vers) ? saut.vers : null;
  const cache = saut ? jours[saut.sens === 1 ? 2 : 0] : null;
  return (
    <View onLayout={(e) => (largeur.value = e.nativeEvent.layout.width)}>
      {(vers ? [...jours, vers] : jours).map((j) => (
        <Page key={j} i={indexJour(j)} vif={j === jour} position={position} largeur={largeur} decalage={j === vers ? decalage : undefined} cache={j === cache && vers != null}>
          {rendu(j, j === jour)}
        </Page>
      ))}
    </View>
  );
}

function Page({
  i, vif, position, largeur, decalage, cache = false, children,
}: { i: number; vif: boolean; position: SharedValue<number>; largeur: SharedValue<number>; decalage?: SharedValue<number>; cache?: boolean; children: ReactNode }) {
  const anime = useAnimatedStyle(() => ({ transform: [{ translateX: (i + (decalage ? decalage.value : 0) - position.value) * largeur.value }] }));
  return (
    <Animated.View
      pointerEvents={vif ? "auto" : "none"}
      accessibilityElementsHidden={!vif}
      importantForAccessibility={vif ? "auto" : "no-hide-descendants"}
      style={[!vif && styles.voisin, cache && { opacity: 0 }, anime]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  voisin: { position: "absolute", top: 0, left: 0, right: 0 },
});
