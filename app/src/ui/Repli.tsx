import { useEffect, useRef, useState, type ReactNode } from "react";
import { type LayoutChangeEvent } from "react-native";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { duree } from "../theme/mouvement";
import { Icone } from "./Icone";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";

// Section repliable (revue finale du 30/10, n° 55 ; Programmes, Routines) : replier ou déplier ne fait plus tout sauter. Le
// contenu fond (entrée 200 ms, sortie 150 ms, courbe sortie) et sa place s'ouvre ou se referme en 220 ms (courbe
// déplacement) : ce qui suit glisse. Ouverte et posée, la hauteur redevient libre (« auto ») : une ligne qui se désintègre
// ou s'ajoute n'est jamais coupée. Réduit, ou `immediat` (une section tenue pour être glissée) : rien ne bouge.

/**
 * Contenu d'une section : monté tant qu'il est ouvert ou qu'il se referme. Au premier rendu, posé tel quel (pas d'animation
 * à l'arrivée sur la page).
 */
export function Repli({ ouvert, immediat = false, children }: { ouvert: boolean; immediat?: boolean; children: ReactNode }) {
  const reduit = useReduit();
  const sec = reduit || immediat;
  const [monte, setMonte] = useState(ouvert);
  const monteRef = useRef(ouvert);
  monteRef.current = monte;
  const hauteur = useRef(0);
  // En attente de la mesure du contenu tout juste monté, pour ouvrir sa place jusqu'à sa hauteur. Il naît hors du flux
  // (position absolue, invisible), donc à sa hauteur naturelle : né dans sa place fermée, il y était mesuré à 0 et ne
  // s'ouvrait jamais (vu à l'émulateur, comme Desintegrable).
  const attend = useRef(false);
  const horsFlux = useSharedValue(false);
  const libre = useSharedValue(true);
  const h = useSharedValue(0);
  const op = useSharedValue(ouvert ? 1 : 0);
  const premier = useRef(true);

  const ouvrir = () => {
    attend.current = false;
    horsFlux.value = false;
    op.value = withTiming(1, { duration: duree.entree, easing: courbes.sortie });
    h.value = withTiming(hauteur.current, { duration: duree.deplacement, easing: courbes.deplacement }, (ok) => {
      if (ok) libre.value = true;
    });
  };

  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    cancelAnimation(h);
    cancelAnimation(op);
    if (sec) {
      attend.current = false;
      horsFlux.value = false;
      libre.value = true;
      op.value = ouvert ? 1 : 0;
      setMonte(ouvert);
      return;
    }
    if (ouvert) {
      if (monteRef.current && hauteur.current > 0) {
        // Rouverte pendant qu'elle se refermait : repart d'où elle en est.
        libre.value = false;
        ouvrir();
        return;
      }
      h.value = 0;
      op.value = 0;
      libre.value = false;
      horsFlux.value = true;
      attend.current = true;
      setMonte(true);
      return;
    }
    attend.current = false;
    if (libre.value) h.value = hauteur.current;
    libre.value = false;
    op.value = withTiming(0, { duration: duree.sortie, easing: courbes.sortie });
    h.value = withTiming(0, { duration: duree.deplacement, easing: courbes.deplacement }, (ok) => {
      if (ok) scheduleOnRN(setMonte, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, sec]);

  const surMesure = (e: LayoutChangeEvent) => {
    hauteur.current = e.nativeEvent.layout.height;
    if (attend.current && hauteur.current > 0) ouvrir();
  };
  // « relative » dit à chaque fois : une clé qui disparaît du style animé ne défait pas « absolute ».
  const cadre = useAnimatedStyle(() =>
    horsFlux.value
      ? { position: "absolute", left: 0, right: 0 }
      : libre.value
        ? { position: "relative", height: "auto", overflow: "visible" }
        : { position: "relative", height: Math.max(0, h.value), overflow: "hidden" },
  );
  const vu = useAnimatedStyle(() => ({ opacity: op.value }));
  if (!monte) return null;
  return (
    <Reanimated.View style={cadre}>
      <Reanimated.View onLayout={surMesure} style={vu}>
        {children}
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** Chevron d'une section : vers le bas ouverte, vers la droite repliée ; il tourne en 200 ms (courbe sortie). */
export function ChevronRepli({ ouvert, couleur, taille = 16 }: { ouvert: boolean; couleur: string; taille?: number }) {
  const reduit = useReduit();
  const angle = useSharedValue(ouvert ? 0 : -90);
  useEffect(() => {
    angle.value = reduit ? (ouvert ? 0 : -90) : withTiming(ouvert ? 0 : -90, { duration: duree.entree, easing: courbes.sortie });
  }, [ouvert, reduit, angle]);
  const tourne = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return (
    <Reanimated.View style={tourne}>
      <Icone nom="down" couleur={couleur} taille={taille} />
    </Reanimated.View>
  );
}
