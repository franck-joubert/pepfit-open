// « Revenir à aujourd'hui » (29/10) : le même glissé que le changement de jour au doigt, dans le bon sens (depuis le
// passé, aujourd'hui arrive par la droite ; depuis le futur, par la gauche), en un seul glissé même de loin : la page d'arrivée
// est posée à côté du jour affiché (ui/GlisserJour, PagesJours `saut`). Le semainier se recadre en même temps, même courbe,
// même durée (l'appelant lui passe la semaine d'arrivée dès le départ). « Réduire les animations » : simple fondu.
// À la fin, la position et le décalage sont posés ensemble sur le fil de l'interface, puis le jour change : rien ne saute.

import { useRef, useState } from "react";
import { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { GLISSER_JOUR, indexJour } from "./glisser-jour";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

/** Durée du glissé (celle de l'arrivée d'une page au doigt) ; le semainier se recadre dans le même temps. */
export const SAUT_MS = GLISSER_JOUR.arriveeMs;
/** Fondu en mouvement réduit. */
export const FONDU_SAUT_MS = 200;

/** Sens du glissé : +1 si l'on va vers un jour plus tard (il arrive par la droite), −1 vers un jour plus tôt, 0 sur place. */
export function sensSaut(de: string, vers: string): 1 | -1 | 0 {
  return vers > de ? 1 : vers < de ? -1 : 0;
}

/** Décalage (jours) qui pose la page `vers` juste à côté de `de`, du côté du sens. */
export function decalageSaut(de: string, vers: string): number {
  return indexJour(de) + sensSaut(de, vers) - indexJour(vers);
}

/**
 * `sauter(vers)` : glisse du jour affiché `jour` vers `vers`, puis `onJour(vers)`. À passer à PagesJours : `saut`, `decalage` ;
 * au conteneur des pages : `style` (fondu en mouvement réduit). `cible` : le jour d'arrivée pendant le glissé (semainier).
 */
export function useSautJour({ jour, position, onJour }: { jour: string; position: SharedValue<number>; onJour: (j: string) => void }) {
  const reduit = useReduit();
  const decalage = useSharedValue(0);
  const opacite = useSharedValue(1);
  const [saut, setSaut] = useState<{ vers: string; sens: 1 | -1 } | null>(null);
  const opts = useRef({ onJour });
  opts.current = { onJour };

  const finir = (vers: string) => {
    opts.current.onJour(vers);
    setSaut(null);
  };

  const sauter = (vers: string) => {
    const sens = sensSaut(jour, vers);
    if (sens === 0 || saut) return;
    if (reduit) {
      opacite.value = 0;
      onJour(vers);
      opacite.value = withTiming(1, { duration: FONDU_SAUT_MS, easing: courbes.sortie });
      return;
    }
    // Premier rendu : la page d'arrivée existe, loin hors de l'écran ; puis elle est posée à côté du jour affiché.
    setSaut({ vers, sens });
    const d = decalageSaut(jour, vers);
    const depart = indexJour(jour);
    const fin = indexJour(vers);
    requestAnimationFrame(() => {
      decalage.value = d;
      position.value = withTiming(depart + sens, { duration: SAUT_MS, easing: courbes.sortie }, (fini) => {
        if (!fini) return;
        // Échange invisible : la page d'arrivée est déjà au centre ; on la pose à sa vraie place, la position avec.
        decalage.value = 0;
        position.value = fin;
        scheduleOnRN(finir, vers);
      });
    });
  };

  const style = useAnimatedStyle(() => ({ opacity: opacite.value }));
  return { saut, decalage, sauter, style, cible: saut?.vers ?? null };
}
