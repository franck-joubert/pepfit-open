import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions } from "react-native";
import { useIsFocused, useNavigation } from "expo-router";
import {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { Canvas, Group, LinearGradient, RadialGradient, Rect, vec } from "@shopify/react-native-skia";
import { useTheme } from "../theme";
import type { Partie } from "../theme/effets";
import {
  AMPLITUDE_REPOS,
  ARRET_APRES_MS,
  cibleAura,
  CYCLE_HALO_MS,
  decalageAura,
  dureeGlisse,
  etatHalo,
  FONDU_AURA,
  HALOS_PAGES,
  HAUTEUR_AURA,
  INTERVALLE_REPOS_MS,
  melangerAura,
  nappesAura,
  opaciteAura,
  PAS_MAX_MS,
  REPOS_APRES_MS,
  type PageHalo,
  sortieQuart,
} from "./aura-calc";
import { FondPlein } from "./CadreContenu";
import { FOND_PARTIE } from "./partie";
import { usePartie } from "./ContextePartie";
import { activerPartieAura, brancherReveilAura, defilementAura, desaturationAura, haloPartage, partieAura, reveillerAura } from "./aura-etat";
import { useReduit } from "./reduit";

const POSITIONS_NAPPE = [0, 0.45, 1];
/**
 * Halo partagé : la teinte de départ tient ce temps avant de glisser, à l'entrée (après la mise en page, le temps que le
 * canevas Skia paraisse) comme au retour à l'onglet (le temps que l'écran poussé se retire) ; sans quoi le glissement, rapide
 * au début, est presque fini quand l'image paraît.
 */
const ATTENTE_HALO_MS = 300;
/** Sans fin de transition reçue (écran posé sans animation), l'entrée du halo part quand même après ce délai. */
const SECOURS_HALO_MS = 1500;

/** La pile racine, vue d'une page poussée : ses fins de transition. */
type Pile = { addListener: (type: "transitionEnd", f: (e: { data?: { closing?: boolean } }) => void) => () => void };
const MASQUE = ["rgba(0,0,0,1)", "rgba(0,0,0,1)", "rgba(0,0,0,0)"];

/**
 * Fond commun des quatre parties (27/10) : trois nappes floues aux teintes du dégradé de la partie, dans un seul canevas
 * Skia posé derrière les écrans, dans la cible du flou du menu. Dessin sur le thread UI. Sans geste, 15 i/s après 6 s puis
 * plus rien après 14 s ; arrêté aussi quand l'appli passe en arrière-plan ou qu'un écran recouvre les onglets. Mouvement réduit : nappes fixes, teinte en fondu.
 * `fixe` : un écran poussé de la partie (Blessures…) pose l'aura au repos derrière lui, sans horloge, sans toucher à celle des
 * onglets. `defilement` : celui de la page poussée (useDefilementAura, sur le thread UI) ; l'aura la suit comme celle des
 * onglets suit le leur (35 %, fixée après 220 dp). Sans lui, l'aura fixe ne bouge pas.
 */
export function AuraFond({ partie, fixe = false, defilement }: { partie: Partie; fixe?: boolean; defilement?: SharedValue<number> }) {
  const { mode, couleurs } = useTheme();
  // fond de page sous l'aura : quasi-blanc teinté de la partie le jour (noir la nuit), qui glisse avec la teinte
  const fond = couleurs[FOND_PARTIE[partie]];
  const reduit = useReduit();
  // Onglets recouverts (écran poussé, séance) : l'horloge s'arrête tout de suite au lieu de finir ses 14 s.
  const premierPlan = useIsFocused();

  const cible = cibleAura(partie, mode);
  const de = useSharedValue(cible);
  const vers = useSharedValue(cible);
  const p = useSharedValue(1);
  const premier = useRef(true);
  const duree = dureeGlisse(reduit);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    // L'état de départ est celui où en est le glissement : une teinte interrompue repart de là où elle était.
    scheduleOnUI(() => {
      "worklet";
      de.value = melangerAura(de.value, vers.value, sortieQuart(p.value));
      vers.value = cible;
      p.value = 0;
      p.value = withTiming(1, { duration: duree, easing: Easing.linear });
    });
    // `cible` ne change qu'avec (partie, mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partie, mode, duree]);
  useEffect(() => {
    if (!fixe) activerPartieAura(partie, !reduit);
  }, [partie, reduit, fixe]);
  // Retour d'une page partagée Sport-Santé : l'onglet repart de la teinte quittée et glisse vers la sienne (même glissement
  // que d'un onglet à l'autre), sans saut.
  useEffect(() => {
    if (fixe || !premierPlan) return;
    scheduleOnUI(() => {
      "worklet";
      const quitte = haloPartage.value;
      if (!quitte) return;
      haloPartage.value = null;
      de.value = quitte.etat;
      vers.value = cible;
      p.value = 0;
      p.value = withDelay(reduit ? 0 : ATTENTE_HALO_MS, withTiming(1, { duration: duree, easing: Easing.linear }));
    });
    // `cible` ne change qu'avec (partie, mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premierPlan, fixe]);

  // Horloge : n'avance que quand on dessine (pas de saut au réveil).
  const t = useSharedValue(0);
  const amplitude = useSharedValue(1);
  const cumul = useSharedValue(0);
  const intervalle = useSharedValue(0);
  const cadre = useFrameCallback((f) => {
    "worklet";
    cumul.value += f.timeSincePreviousFrame ?? 16;
    if (cumul.value < intervalle.value) return;
    t.value += Math.min(PAS_MAX_MS, cumul.value) / 1000;
    cumul.value = 0;
  }, false);

  // Cadence : réveillée par un geste, au repos après 6 s, arrêtée après 14 s ou en arrière-plan.
  const minuteurs = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const vider = () => {
      minuteurs.current.forEach(clearTimeout);
      minuteurs.current = [];
    };
    if (fixe) return;
    if (reduit || !premierPlan) {
      cadre.setActive(false);
      if (reduit) amplitude.value = 0;
      brancherReveilAura(null);
      return;
    }
    const reveiller = () => {
      vider();
      cadre.setActive(true);
      intervalle.value = 0;
      amplitude.value = withTiming(1, { duration: 400 });
      minuteurs.current = [
        setTimeout(() => {
          intervalle.value = INTERVALLE_REPOS_MS;
          amplitude.value = withTiming(AMPLITUDE_REPOS, { duration: 1000 });
        }, REPOS_APRES_MS),
        setTimeout(() => cadre.setActive(false), ARRET_APRES_MS),
      ];
    };
    reveiller();
    brancherReveilAura(reveiller);
    const etat = AppState.addEventListener("change", (s) => {
      if (s === "active") reveiller();
      else {
        vider();
        cadre.setActive(false);
      }
    });
    return () => {
      etat.remove();
      vider();
      cadre.setActive(false);
      brancherReveilAura(null);
    };
  }, [reduit, premierPlan, cadre, amplitude, intervalle, fixe]);
  // Changer de partie est un geste (le menu est hors du fond) : on réveille une fois le minuteur en place.
  useEffect(() => {
    if (!fixe) reveillerAura();
  }, [partie, mode, fixe]);

  const etat = useDerivedValue(() => melangerAura(de.value, vers.value, sortieQuart(p.value)));
  const styleFond = useAnimatedStyle(() => ({ backgroundColor: withTiming(fond, { duration: duree }) }), [fond, duree]);
  return <Nappes etat={etat} t={t} amplitude={amplitude} fixe={fixe} defilement={fixe ? (defilement ?? null) : defilementAura} styleFond={styleFond} />;
}

/**
 * Halo marié des pages partagées (Énergie, Pas, Effort ; 31/10) : les deux teintes de la page (pages-partagees.ts :
 * Énergie orange et turquoise, Pas orange et rose) toujours ensemble, des nappes qui se mêlent et respirent en 14 s
 * (aura-calc, etatMarie), sur le thread UI, sur le fond de la couleur principale de la visite. À l'ouverture, il part de la teinte d'où l'on vient
 * (l'onglet, ou la page partagée d'avant) et glisse vers le mélange comme d'un onglet à l'autre ; il s'arrête quand une
 * autre page le recouvre ou que l'appli passe en arrière-plan. Mouvement réduit : le mélange fixe.
 */
export function HaloPartage({ page, defilement }: { page: PageHalo; defilement?: SharedValue<number> }) {
  const [A, B] = HALOS_PAGES[page];
  const { mode, couleurs } = useTheme();
  const reduit = useReduit();
  const premierPlan = useIsFocused();
  const duree = dureeGlisse(reduit);
  const [depart] = useState(() => {
    const avant = haloPartage.value?.ouverte ? haloPartage.value.etat : null;
    const partie = partieAura();
    return {
      etat: avant ?? cibleAura(partie, mode),
      fond: avant ? null : couleurs[FOND_PARTIE[partie]],
    };
  });
  const a = cibleAura(A, mode);
  const b = cibleAura(B, mode);
  // fond de la couleur principale de la visite (celle des cartes et des boutons : ContextePartie)
  const fondPage = couleurs[FOND_PARTIE[usePartie()]];
  const phase = useSharedValue(0);
  const entree = useSharedValue(0);
  const actif = useSharedValue(false);
  // L'écran poussé paraît un moment après son montage (jusqu'à 2 s à l'émulateur) : l'entrée et le cycle partent à la fin
  // de la transition de pile (l'écran est alors montré, dans la teinte d'origine), au plus tard après SECOURS_HALO_MS ; la
  // teinte d'origine tient encore ATTENTE_HALO_MS, le temps que le canevas Skia se montre.
  const [pret, setPret] = useState(false);
  const navigation = useNavigation() as unknown as Pile;
  useEffect(() => {
    const secours = setTimeout(() => setPret(true), SECOURS_HALO_MS);
    const fin = navigation.addListener("transitionEnd", (e) => {
      if (e.data?.closing) return;
      clearTimeout(secours);
      setPret(true);
    });
    return () => {
      fin();
      clearTimeout(secours);
    };
  }, [navigation]);
  useEffect(() => {
    if (pret) entree.value = withDelay(reduit ? 0 : ATTENTE_HALO_MS, withTiming(1, { duration: duree, easing: Easing.linear }));
  }, [pret, entree, duree, reduit]);

  // Le cycle : la phase avance sans borne (le sinus boucle seul) ; à l'arrêt elle garde sa valeur, et repart de là.
  // Mouvement réduit : phase 0, le mélange fixe (les deux teintes à parts égales).
  useEffect(() => {
    const lancer = () => {
      actif.value = true;
      if (reduit) return;
      const tours = 1000;
      phase.value = withTiming(phase.value + tours, { duration: tours * CYCLE_HALO_MS, easing: Easing.linear });
    };
    const arreter = () => {
      actif.value = false;
      cancelAnimation(phase);
    };
    if (reduit) phase.value = 0;
    if (!premierPlan || !pret) {
      arreter();
      return;
    }
    lancer();
    const etat = AppState.addEventListener("change", (s) => (s === "active" ? lancer() : arreter()));
    return () => {
      etat.remove();
      arreter();
    };
  }, [premierPlan, pret, reduit, phase, actif]);
  // Page fermée : son état reste à l'onglet (qui le reprend en revenant au premier plan, avant ou après ceci), mais une
  // prochaine page partagée n'en repart plus. Sur le thread UI, après la dernière image publiée.
  useEffect(
    () => () =>
      scheduleOnUI(() => {
        "worklet";
        actif.value = false;
        const h = haloPartage.value;
        if (h) haloPartage.value = { etat: h.etat, ouverte: false };
      }),
    [actif],
  );

  const etat = useDerivedValue(() => etatHalo(depart.etat, a, b, phase.value, entree.value));
  // La page suivante, ou l'onglet retrouvé, repart d'ici.
  useAnimatedReaction(
    () => etat.value,
    (v) => {
      if (actif.value) haloPartage.value = { etat: v, ouverte: true };
    },
  );
  const t = useSharedValue(0);
  const amplitude = useSharedValue(1);
  const styleFond = useAnimatedStyle(() => {
    if (!depart.fond) return { backgroundColor: fondPage };
    return { backgroundColor: interpolateColor(sortieQuart(entree.value), [0, 1], [depart.fond, fondPage]) };
  });
  return <Nappes etat={etat} t={t} amplitude={amplitude} fixe defilement={defilement ?? null} styleFond={styleFond} />;
}

/**
 * Les trois nappes floues dans un canevas Skia, sur le fond de page (`styleFond`), masquées vers le bas. `defilement` : le
 * défilement (px) que l'aura suit, celui de l'onglet ou celui d'une page poussée ; null, elle ne bouge pas. Mouvement réduit :
 * jamais de décalage.
 */
function Nappes({
  etat,
  t,
  amplitude,
  fixe,
  defilement,
  styleFond,
}: {
  etat: SharedValue<number[]>;
  t: SharedValue<number>;
  amplitude: SharedValue<number>;
  fixe: boolean;
  defilement: SharedValue<number> | null;
  styleFond: ReturnType<typeof useAnimatedStyle>;
}) {
  const { width: largeur } = useWindowDimensions();
  // Désaturation (jour passé de Sport) : celle des onglets seulement, pas l'aura fixe d'un écran poussé.
  const nappes = useDerivedValue(() => nappesAura(etat.value, t.value, amplitude.value, largeur, fixe ? 0 : desaturationAura.value));
  const reduit = useReduit();
  const transform = useDerivedValue(() => [{ translateY: defilement && !reduit ? decalageAura(defilement.value) : 0 }]);
  const opacity = useDerivedValue(() => (defilement ? opaciteAura(defilement.value) : 1));
  const c0 = useDerivedValue(() => vec(nappes.value[0]!.x, nappes.value[0]!.y));
  const c1 = useDerivedValue(() => vec(nappes.value[1]!.x, nappes.value[1]!.y));
  const c2 = useDerivedValue(() => vec(nappes.value[2]!.x, nappes.value[2]!.y));
  const r0 = useDerivedValue(() => nappes.value[0]!.r);
  const r1 = useDerivedValue(() => nappes.value[1]!.r);
  const r2 = useDerivedValue(() => nappes.value[2]!.r);
  const k0 = useDerivedValue(() => [nappes.value[0]!.coeur, nappes.value[0]!.mi, nappes.value[0]!.bord]);
  const k1 = useDerivedValue(() => [nappes.value[1]!.coeur, nappes.value[1]!.mi, nappes.value[1]!.bord]);
  const k2 = useDerivedValue(() => [nappes.value[2]!.coeur, nappes.value[2]!.mi, nappes.value[2]!.bord]);

  const canevas = (
    <Canvas pointerEvents="none" style={[styles.canevas, { width: largeur, height: HAUTEUR_AURA }]}>
      {/* Le canevas est transparent : le masque (dstIn) se pose directement sur les nappes, sans calque hors écran ;
          l'opacité reste sur les seules nappes (le masque n'est pas atténué une seconde fois). */}
      <Group transform={transform}>
        <Group opacity={opacity}>
          <Rect x={0} y={0} width={largeur} height={HAUTEUR_AURA}>
            <RadialGradient c={c0} r={r0} colors={k0} positions={POSITIONS_NAPPE} />
          </Rect>
          <Rect x={0} y={0} width={largeur} height={HAUTEUR_AURA}>
            <RadialGradient c={c1} r={r1} colors={k1} positions={POSITIONS_NAPPE} />
          </Rect>
          <Rect x={0} y={0} width={largeur} height={HAUTEUR_AURA}>
            <RadialGradient c={c2} r={r2} colors={k2} positions={POSITIONS_NAPPE} />
          </Rect>
        </Group>
        <Rect x={0} y={0} width={largeur} height={HAUTEUR_AURA} blendMode="dstIn">
          <LinearGradient start={vec(0, 0)} end={vec(0, HAUTEUR_AURA)} colors={MASQUE} positions={[0, FONDU_AURA, 1]} />
        </Rect>
      </Group>
    </Canvas>
  );
  return (
    // Tout l'écran, même posée dans la colonne centrée d'une page poussée (Fold déplié) : pas de bande noire à gauche.
    <FondPlein style={styleFond}>{canevas}</FondPlein>
  );
}

const styles = StyleSheet.create({
  canevas: { position: "absolute", top: 0, left: 0 },
});
