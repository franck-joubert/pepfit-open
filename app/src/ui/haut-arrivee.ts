import { useEffect, useRef, type RefObject } from "react";
import { abonnerArrivee, abonnerQuitte } from "./onglet-quitte";
import { abonnerRetouche } from "./onglet-retouche";

// Onglets (29/10) : arrivé d'un autre onglet par le menu, une page repart toujours d'en haut (défilement remis à 0 d'un
// coup, sans animation visible) ; l'onglet déjà ouvert, touché à nouveau, remonte en haut en défilant (usage standard), et revient
// à aujourd'hui (29/10 au soir : chaque page s'en charge, useOngletRetouche). Le semainier compact redevient normal de
// lui-même (il suit le défilement). Le retour d'un
// écran poussé par-dessus (séance, fiche, mois) garde la position.
// Deux temps (vu à l'émulateur le 29/10 : remise à 0 seulement à l'arrivée, la page revenait défilée) : la page est remise en
// haut quand on la quitte pour un autre onglet, une fois qu'elle n'est plus à l'écran (ui/onglet-quitte, 350 ms) ; à l'arrivée,
// on le refait, puis encore après la transition d'onglet, au cas où l'écran caché n'aurait pas pris l'ordre.
//
//   const defilement = useRef<ScrollView>(null);
//   useHautALArrivee("/train", defilement);

type Defilable = { scrollTo: (o: { y: number; animated: boolean }) => void };

/** Relances de la remise en haut après l'arrivée (ms) : pendant puis juste après la transition d'onglet. */
const RELANCES_MS = [0, 120, 320] as const;

export function useHautALArrivee(chemin: string, ref: RefObject<Defilable | null>): void {
  const r = useRef(ref);
  r.current = ref;
  useEffect(() => {
    const haut = (animated: boolean) => r.current.current?.scrollTo({ y: 0, animated });
    const minuteries: ReturnType<typeof setTimeout>[] = [];
    const a = abonnerArrivee(chemin, () => {
      haut(false);
      for (const ms of RELANCES_MS) minuteries.push(setTimeout(() => haut(false), ms));
    });
    const q = abonnerQuitte(chemin, () => haut(false));
    const b = abonnerRetouche(chemin, () => haut(true));
    return () => {
      a();
      q();
      b();
      minuteries.forEach(clearTimeout);
    };
  }, [chemin]);
}
