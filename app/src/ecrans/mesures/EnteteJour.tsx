// En tête des pages de mesure (retour du 29/10, 10h50) : le semainier commun de l'appli (ui/BandeSemaine : sept
// jours, balayé = semaine voisine, toucher = ce jour), la date du jour choisi, puis ce qui décrit CE jour (chiffre fort,
// bloc propre). Le « quand » des pages ne répète pas la date : il dit d'où vient le chiffre et de quand. Glisser ce bloc à gauche ou à droite passe au jour voisin, comme partout ; jamais au futur (le doigt
// rencontre une résistance, le jour ne change pas). Mouvement réduit : fondu seul.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanResponder, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { horizontal } from "../../ui/arbitrage-gestes";
import { BandeSemaine, TitreDate } from "../../ui/BandeSemaine";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { lundiDe } from "../planification";
import { instantDe, jourDe } from "../planif-donnees";
import { GESTE_PISTE } from "./colonne";
import { useMesure } from "./gabarit";
import { decaler, minuit } from "./periodes";

/** Jour choisi (minuit local), aujourd'hui au départ ; `choisir` refuse le futur. */
export function useJour(maintenant: number, depart?: number | null) {
  const auj = minuit(maintenant);
  const [jour, setJour] = useState(() => Math.min(auj, minuit(depart ?? auj)));
  return { jour, aujourdhui: jour === auj, choisir: (j: number) => setJour(Math.min(auj, minuit(j))) };
}

/**
 * Semainier + date + bloc du jour glissable. `avecDonnee(jour)` : une pastille sous les jours qui ont une valeur. Le
 * semainier prend la couleur de la page (rose Santé ; orange pour Effort, accent « sport »).
 */
export function EnteteJour({
  jour,
  maintenant,
  onJour,
  avecDonnee,
  valeur,
  bandeau,
  children,
}: {
  jour: number;
  maintenant: number;
  onJour: (jour: number) => void;
  avecDonnee?: (jour: number) => boolean;
  /** Valeur de chaque jour sous sa date (page Effort, D10) : à la place des pastilles. */
  valeur?: (jour: number) => string | null;
  /** Sous la date, au-dessus du bloc du jour, hors du glissement (Sommeil : changement d'heure, voyage). */
  bandeau?: ReactNode;
  children: ReactNode;
}) {
  const m = useMesure();
  const reduit = useReduit();
  const auj = minuit(maintenant);
  const j = jourDe(jour);
  const a = jourDe(auj);
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const largeur = useRef(400);
  const arrivee = useRef<1 | -1 | null>(null);
  const vivant = useRef({ jour, auj, onJour, reduit });
  vivant.current = { jour, auj, onJour, reduit };

  // le jour voisin arrive du côté du geste, une fois rendu
  useLayoutEffect(() => {
    const s = arrivee.current;
    if (s == null) return;
    arrivee.current = null;
    tx.value = reduit ? 0 : -s * largeur.current * GESTE_PISTE.recul;
    op.value = 0;
    tx.value = withTiming(0, { duration: reduit ? 160 : GESTE_PISTE.arriveeMs, easing: courbes.feuille });
    op.value = withTiming(1, { duration: reduit ? 160 : GESTE_PISTE.arriveeMs, easing: courbes.feuille });
  }, [jour, reduit, tx, op]);

  // sens > 0 : vers le passé (le doigt va à droite)
  const peut = (sens: 1 | -1) => sens > 0 || vivant.current.jour < vivant.current.auj;
  const aller = (sens: 1 | -1) => {
    arrivee.current = sens;
    vivant.current.onJour(decaler(vivant.current.jour, -sens));
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => horizontal(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        tx.value = peut(g.dx > 0 ? 1 : -1) ? g.dx : g.dx * GESTE_PISTE.resistance;
      },
      onPanResponderRelease: (_, g) => {
        const sens: 1 | -1 = g.dx > 0 ? 1 : -1;
        const r = vivant.current.reduit;
        if (Math.abs(g.dx) > GESTE_PISTE.seuilGlisse && peut(sens)) {
          op.value = withTiming(0, { duration: r ? 120 : GESTE_PISTE.sortieMs, easing: courbes.sortie });
          tx.value = withTiming(r ? 0 : sens * largeur.current, { duration: r ? 120 : GESTE_PISTE.sortieMs, easing: courbes.sortie }, (ok) => {
            if (ok) scheduleOnRN(aller, sens);
          });
        } else tx.value = withTiming(0, { duration: GESTE_PISTE.retourMs, easing: courbes.sortie });
      },
      onPanResponderTerminate: () => {
        tx.value = withTiming(0, { duration: GESTE_PISTE.retourMs, easing: courbes.sortie });
      },
    }),
  ).current;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], opacity: op.value }));
  const choisir = (s: string) => {
    const t = minuit(instantDe(s, "12:00"));
    if (t <= auj) onJour(t);
  };
  return (
    <>
      <BandeSemaine
        lundi={lundiDe(j)}
        sel={j}
        aujourdhui={a}
        couleur={m.fort}
        onSel={choisir}
        sansFutur
        onSemaine={(s) => onJour(Math.min(auj, decaler(jour, 7 * s)))}
        onAujourdhui={() => onJour(auj)}
        marque={avecDonnee ? (s) => (avecDonnee(minuit(instantDe(s, "12:00"))) ? "prevue" : null) : undefined}
        valeur={valeur ? (s) => valeur(minuit(instantDe(s, "12:00"))) : undefined}
        titre={<TitreDate j={j} aujourdhui={a} />}
      />
      {bandeau}
      <View onLayout={(e) => (largeur.current = e.nativeEvent.layout.width)} style={{ overflow: "hidden" }} {...pan.panHandlers}>
        <Animated.View style={style}>{children}</Animated.View>
      </View>
    </>
  );
}
