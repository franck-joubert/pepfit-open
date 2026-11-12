// Défilement de la page Activité et métamorphose de ses jauges (planche activite-jauges, 09/11). Tout se lit sur le fil UI : le
// défilement (useAnimatedScrollHandler) alimente l'avancement p (0 grandes, 1 fixées), qui pilote les transform et opacités des
// jauges (JaugesActivite) et le bord coupé de la zone (ZoneSemainier) ; aucun re-rendu à chaque pixel. Seul `docke` (p > 0) est
// un état React : il ne change qu'aux deux bouts de la course et n'aiguille que les touches et le lecteur d'écran.
// Deux copies des jauges se relaient quand p quitte 0 : celle de la page (elle défile et glisse avec les jours) et la fixée sous
// le semainier ; elles sont identiques à p = 0. Au lâcher, une rangée à mi-course finit sa course dans le sens du geste (200 ms,
// courbe de sortie) par un défilement piloté image par image ; un doigt posé l'interrompt. « Réduire les animations » : pas de
// métamorphose ; la grande rangée défile avec la page et la ligne fixée la remplace en fondu de 150 ms quand elle est sortie.
import { useCallback, useEffect, useState } from "react";
import type { ScrollViewInstance } from "react-native";
import {
  cancelAnimation,
  ReduceMotion,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { duree } from "../theme/mouvement";
import { courbes } from "../ui/mouvement";
import { compactDe } from "../ui/semainier";
import {
  avancement,
  cibleDeFin,
  COURSE,
  defilementDeCible,
  defilementDeDock,
  DUREE_FIN_COURSE,
  hauteurMinimale,
  lacherImmediat,
  mesures,
  remplaceeReduit,
  sensDe,
} from "./metamorphose-jauges";

type Entrees = {
  /** « Réduire les animations ». */
  reduit: boolean;
  /** Colonne large (Fold déplié) : la rangée est plus haute. */
  large: boolean;
  /** Le jour affiché a ses jauges (pas un jour à venir). */
  jaugesActives: boolean;
  /** Resserrement du semainier (ui/ZoneSemainier), écrit ici sur le fil UI. */
  compact: SharedValue<number>;
  /** Le même défilement pour le tirage (ui/Actualiser). */
  haut: SharedValue<number>;
};

export function useDefilementJauges({ reduit, large, jaugesActives, compact, haut }: Entrees) {
  const m = mesures(large);
  const ref = useAnimatedRef<ScrollViewInstance>();
  const y = useSharedValue(0);
  const yDock = useSharedValue(0);
  const actives = useSharedValue(jaugesActives ? 1 : 0);
  const sens = useSharedValue(1);
  const doigt = useSharedValue(false);
  /** Avancement des copies posées dans la page : toujours 0 (elles ne se métamorphosent pas, la copie fixée prend le relais). */
  const repos = useSharedValue(0);
  const [docke, setDocke] = useState(false);
  const [hautVisible, setHautVisible] = useState(0);
  const [hautPages, setHautPages] = useState(0);
  // Les jours à venir n'ont pas de jauges : rien à métamorphoser.
  useEffect(() => {
    actives.value = jaugesActives ? 1 : 0;
  }, [actives, jaugesActives]);

  // Avancement : dérivé du défilement, du seuil et du jour affiché, toujours à jour sans calcul manuel.
  const p = useDerivedValue(() => {
    if (!actives.value) return 0;
    return reduit ? remplaceeReduit(y.value, yDock.value, m.perte) : avancement(y.value, yDock.value);
  }, [reduit, m.perte]);

  // Les deux copies se relaient quand p quitte 0 (nul n'est jamais vu deux fois) ; en mouvement réduit la fixée paraît en fondu.
  const fixeVisible = useSharedValue(0);
  const pageVisible = useSharedValue(1);
  useAnimatedReaction(
    () => (p.value > 0 ? 1 : 0),
    (v, avant) => {
      if (v === avant) return;
      if (reduit) {
        pageVisible.value = 1;
        fixeVisible.value = withTiming(v, { duration: duree.sortie, easing: courbes.sortie, reduceMotion: ReduceMotion.Never });
      } else {
        pageVisible.value = 1 - v;
        fixeVisible.value = v;
      }
      scheduleOnRN(setDocke, v === 1);
    },
    [reduit],
  );

  // Fin de course : le défilement va de `depart` à `arrivee` pendant que `fin` passe de 0 à 1.
  const fin = useSharedValue(0);
  const depart = useSharedValue(0);
  const arrivee = useSharedValue(0);
  const enFin = useSharedValue(false);
  useDerivedValue(() => {
    if (!enFin.value) return;
    scrollTo(ref, 0, depart.value + (arrivee.value - depart.value) * fin.value, false);
  });
  const finir = useCallback(() => {
    "worklet";
    if (!actives.value) return;
    const cible = cibleDeFin(p.value, sens.value);
    if (cible == null) return;
    depart.value = y.value;
    arrivee.value = defilementDeCible(cible, yDock.value);
    fin.value = 0;
    enFin.value = true;
    fin.value = withTiming(1, { duration: DUREE_FIN_COURSE, easing: courbes.sortie }, (fini) => {
      if (fini) enFin.value = false;
    });
  }, [actives, p, sens, depart, y, arrivee, yDock, fin, enFin]);

  const defilement = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        const yy = e.contentOffset.y;
        sens.value = sensDe(sens.value, yy - y.value);
        y.value = yy;
        haut.value = Math.max(0, yy);
        const c = compactDe(yy, reduit);
        if (c !== compact.value) compact.value = c;
      },
      onBeginDrag: () => {
        doigt.value = true;
        cancelAnimation(fin);
        enFin.value = false;
      },
      // Lâcher lent : la course se finit tout de suite ; lâcher vif : l'élan joue, la course se finit à son arrêt.
      onEndDrag: (e) => {
        doigt.value = false;
        if (lacherImmediat(e.velocity?.y ?? 0)) finir();
      },
      onMomentumEnd: () => {
        if (!doigt.value) finir();
      },
    },
    [reduit, finir],
  );

  /** Bas de la date dans la page (mesuré) : la rangée touche le semainier resserré quand le défilement l'atteint. */
  const mesurerHautPages = useCallback(
    (h: number) => {
      setHautPages(h);
      yDock.value = defilementDeDock(h);
    },
    [yDock],
  );

  return {
    /** À poser sur l'Animated.ScrollView : `ref` et `onScroll`. */
    ref,
    defilement,
    p,
    repos,
    pageVisible,
    fixeVisible,
    docke,
    mesurerHautPages,
    setHautVisible,
    /** Hauteur minimale du contenu (page courte), à poser en `minHeight` : 0 quand rien à métamorphoser. */
    hauteurMin: jaugesActives && hautVisible > 0 && hautPages > 0 ? hauteurMinimale(hautVisible, defilementDeDock(hautPages), reduit ? m.perte : COURSE) : 0,
    mesures: m,
  };
}
