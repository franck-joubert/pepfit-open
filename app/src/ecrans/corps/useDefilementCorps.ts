import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { defilementAura } from "../../ui/aura-etat";

// Le défilement d'une page qui porte le contenu du Corps (Santé), sur le thread UI (docs/AUDIT-PERF.md,
// M15) : la page l'écrit, le bloc Corps le lit. Le JS n'est prévenu qu'au passage d'un seuil : le corps ou la poitrine sortis de
// l'écran, ou entrés dedans.

export type DefilementCorps = {
  /** Décalage de la liste (dp), 0 en haut. */
  y: SharedValue<number>;
  /** Doigt posé ou élan en cours : la boucle du corps attend la fin. */
  enCours: SharedValue<boolean>;
  /** Hauteur visible de la liste (dp), 0 tant qu'elle n'est pas mesurée : sans elle, le corps n'attend pas d'être entré à l'écran. */
  hauteur: SharedValue<number>;
};

/**
 * Santé : le gestionnaire de défilement d'un `Animated.ScrollView` (`onScroll`, `scrollEventThrottle={16}`). `enFocus` : l'aura de
 * l'onglet affiché suit le défilement (remis en haut une fois quitté, par useHautALArrivee, l'aura de l'onglet affiché ne bouge pas).
 */
export function useDefilementCorps(enFocus: SharedValue<boolean>) {
  const y = useSharedValue(0);
  const enCours = useSharedValue(false);
  const hauteur = useSharedValue(0);
  const surDefilement = useAnimatedScrollHandler({
    onBeginDrag: () => {
      enCours.value = true;
    },
    onMomentumBegin: () => {
      enCours.value = true;
    },
    onEndDrag: () => {
      enCours.value = false;
    },
    onMomentumEnd: () => {
      enCours.value = false;
    },
    onScroll: (ev) => {
      y.value = Math.max(0, ev.contentOffset.y);
      if (enFocus.value) defilementAura.value = y.value;
    },
  });
  const defilement = useMemo<DefilementCorps>(() => ({ y, enCours, hauteur }), [y, enCours, hauteur]);
  return { defilement, surDefilement };
}

/** Seuils du défilement (dp, dans le contenu) : le corps entier sort par le haut, la poitrine sort par le haut, la zone entre par le bas. */
export type SeuilsCorps = { corps: number; ame: number; entree: number };

/**
 * Ce que le défilement dit au corps : `corpsVisible` (la zone est à l'écran, ou sur le point d'y entrer : `entree`), `ameVue`
 * (la poitrine n'est pas sortie par le haut), `defileCorps` (défilement en cours : la boucle du corps attend la fin ; un passage vers
 * le JS au début, un à la fin). Sans `defilement` : tout est visible.
 */
export function useVisibiliteCorps(defilement: DefilementCorps | undefined, seuils: SeuilsCorps) {
  const [corpsVisible, setCorpsVisible] = useState(true);
  const [ameVue, setAmeVue] = useState(true);
  const s = useSharedValue(seuils);
  useEffect(() => {
    s.value = { corps: seuils.corps, ame: seuils.ame, entree: seuils.entree };
  }, [seuils.corps, seuils.ame, seuils.entree, s]);
  // un code par état (1 : corps à l'écran, 2 : poitrine pas sortie) : le JS n'est appelé qu'au changement
  useAnimatedReaction(
    () => {
      if (!defilement) return 3;
      const y = defilement.y.value;
      const h = defilement.hauteur.value;
      return (y < s.value.corps && (h <= 0 || y + h > s.value.entree) ? 1 : 0) + (y < s.value.ame ? 2 : 0);
    },
    (code, avant) => {
      const d = avant ?? 3;
      if ((code & 1) !== (d & 1)) scheduleOnRN(setCorpsVisible, (code & 1) !== 0);
      if ((code & 2) !== (d & 2)) scheduleOnRN(setAmeVue, (code & 2) !== 0);
    },
  );
  const [defileCorps, setDefileCorps] = useState(false);
  const finDefile = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const marquerDefile = useCallback((en: boolean) => {
    clearTimeout(finDefile.current);
    // le doigt levé, un élan peut suivre : on attend un peu avant de rendre la main au corps
    if (en) setDefileCorps(true);
    else finDefile.current = setTimeout(() => setDefileCorps(false), 150);
  }, []);
  useEffect(() => () => clearTimeout(finDefile.current), []);
  useAnimatedReaction(
    () => (defilement ? defilement.enCours.value : false),
    (en, avant) => {
      if (avant !== null && en !== avant) scheduleOnRN(marquerDefile, en);
    },
  );
  return { corpsVisible, ameVue, defileCorps };
}
