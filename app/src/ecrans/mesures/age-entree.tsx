// Ouverture et retour de la page Âge pepfit (planches/age-coeur, validée le 29/10). Arrivée depuis l'âme de la
// page Santé (ui/3d/vol-ame.ts) : la signature part du rectangle de l'âme, monte et grandit jusqu'à sa place en 420 ms
// (courbe « déplacement »), en passant de l'âme à la signature ; le fond de la page couvre Santé, l'en-tête puis le rythme
// et les groupes arrivent, le chiffre quand la pupille est ouverte (age-entree-calc.ts). Retour (← ou retour Android) :
// chemin inverse en 300 ms, interruptible, puis l'âme est rendue au corps et la page part. Autre arrivée (Accueil) ou
// mouvement réduit : fondu de 200 ms, sans vol. La page est une modale transparente qui s'anime elle-même (_layout), comme
// la séance (ui/Montee.tsx) : la pile native d'Android ne sait pas faire voler un élément d'un écran à l'autre.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { StyleProp, ViewInstance, ViewStyle } from "react-native";
import { usePreventRemove } from "expo-router";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useReduit } from "../../ui/reduit";
import { useMargeColonne } from "../../ui/CadreContenu";
import { activerVol, cacherAme, departVol, finirVol, retourVol, type DepartVol } from "../../ui/3d/vol-ame";
import { bloc, finOuverture, finRetour, opaciteFond, vol, type ModeEntree } from "./age-entree-calc";
import { ame } from "../../theme/mouvement";

export interface EntreeAge {
  mode: ModeEntree;
  depart: DepartVol | null;
  t: SharedValue<number>;
  r: SharedValue<number>;
  /** Vol : la signature est mesurée et posée sur l'âme (avant, elle reste invisible). */
  pret: SharedValue<number>;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  s0: SharedValue<number>;
  /** Légèreté de la signature (1 = l'âme, 0 = la signature), pour son shader. */
  leger: SharedValue<number>;
  /** La signature (sa vue) donne sa place dans la fenêtre : le vol peut partir. */
  surPlace(v: ViewInstance | null, taille: number): void;
  /** L'ouverture est finie : le bas de la page (hors écran) peut se monter sans gêner le vol. */
  posee: boolean;
  /** Racine de la page (plein écran) : la signature s'y mesure. */
  racine: RefObject<ViewInstance | null>;
}

const Contexte = createContext<EntreeAge | null>(null);

export function useEntreeAge(): EntreeAge {
  const reduit = useReduit();
  const depart = useRef(departVol()).current;
  const mode: ModeEntree = reduit ? "reduit" : depart ? "vol" : "fondu";
  const t = useSharedValue(0);
  const r = useSharedValue(0);
  const pret = useSharedValue(mode === "vol" ? 0 : 1);
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const s0 = useSharedValue(1);
  const leger = useDerivedValue(() => vol(mode, t.value, r.value).leger);
  const parti = useRef(false);
  const vue = useRef<{ v: ViewInstance; taille: number } | null>(null);
  const racine = useRef<ViewInstance>(null);
  // Fold déplié : la racine est dans la colonne centrée, à `marge` du bord de l'écran où l'âme a été mesurée
  const marge = useMargeColonne();
  const [posee, setPosee] = useState(mode !== "vol");
  const poser = () => {
    activerVol(false); // tout est posé : le personnage de Santé, recouvert, peut s'arrêter
    setPosee(true);
    if (depart) console.log(`[transition] age posee ${Date.now() - depart.t0} ms`);
  };

  const ouvrir = () => {
    if (parti.current) return;
    parti.current = true;
    if (depart) console.log(`[transition] age vol ${Date.now() - depart.t0} ms`);
    // Santé est couverte en 150 ms : le personnage, dessous, s'arrête là (il ne prendrait plus que du GPU au vol)
    if (mode === "vol") setTimeout(() => activerVol(false), (ame.couvre + 50) * (depart?.lent ?? 1));
    t.value = withTiming(finOuverture(mode), { duration: finOuverture(mode) * (depart?.lent ?? 1), easing: Easing.linear }, (fini) => {
      if (fini) scheduleOnRN(poser);
    });
  };

  // Sans vol : le fondu part tout de suite. Avec : quand la signature est mesurée (surPlace).
  useEffect(() => {
    // temps du toucher à la page montée (logcat : `[transition] age …`)
    if (depart) console.log(`[transition] age montee ${Date.now() - depart.t0} ms`);
    if (mode !== "vol") ouvrir();
    // la page partie autrement (lien, pile vidée) : l'âme est rendue au corps
    return () => finirVol();
    // une fois, à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place de la signature : mesurée par rapport à la racine de la page (pleine hauteur, depuis l'origine de la fenêtre, plus
  // la marge de la colonne, comme la mesure de l'âme sur Santé). measureInWindow, lui, se trompait de 62 dp (la barre d'état) pendant l'ouverture de la
  // modale (vu à l'émulateur : 253 au lieu de 315) et le vol partait sous la poitrine. Deux mesures identiques à une image
  // d'écart (5 au plus) : la page a fini de se placer.
  const mesurerStable = (v: ViewInstance, puis: (x: number, y: number) => void, avant: { x: number; y: number } | null = null, n = 0) => {
    const suite = (x: number, y: number) => {
      if ((avant && Math.abs(avant.x - x) < 1 && Math.abs(avant.y - y) < 1) || n >= 5) puis(x, y);
      else requestAnimationFrame(() => mesurerStable(v, puis, { x, y }, n + 1));
    };
    if (racine.current) v.measureLayout(racine.current, (x, y) => suite(x + marge, y), () => v.measureInWindow(suite));
    else v.measureInWindow(suite);
  };
  const placer = (cible: DepartVol, v: ViewInstance, taille: number, puis: () => void) => {
    mesurerStable(v, (x, y) => {
      dx.value = cible.x - (x + taille / 2);
      dy.value = cible.y - (y + taille / 2);
      s0.value = cible.cote / taille;
      console.log(`[transition] age place ame=${Math.round(cible.x)},${Math.round(cible.y)} sig=${Math.round(x + taille / 2)},${Math.round(y + taille / 2)} s0=${(cible.cote / taille).toFixed(2)}`);
      puis();
    });
  };

  const surPlace = (v: ViewInstance | null, taille: number) => {
    if (!v || mode !== "vol" || !depart || parti.current) return;
    vue.current = { v, taille };
    racine.current?.measureInWindow((x, y) => console.log(`[transition] age racine ${Math.round(x)},${Math.round(y)}`));
    placer(depart, v, taille, () => {
      pret.value = 1;
      ouvrir();
      // la signature est sur l'âme : le personnage la cache deux images plus tard (le temps qu'elle soit dessinée ; les deux,
      // l'une sur l'autre, ne se voient pas), et il se dessine encore pendant le vol
      requestAnimationFrame(() => requestAnimationFrame(() => cacherAme(true)));
    });
  };

  // Retour (←, retour Android) : la page reste le temps du chemin inverse (comme ui/Montee.tsx).
  const [libre, setLibre] = useState(false);
  const reprendre = useRef<(() => void) | null>(null);
  usePreventRemove(!libre, ({ repeat }: { repeat: () => void }) => {
    if (reprendre.current) return;
    reprendre.current = repeat;
    const partir = () => {
      // l'âme revient au corps ; on lui laisse deux images pour se dessiner avant de retirer la page
      cacherAme(false);
      setTimeout(() => {
        finirVol();
        setLibre(true);
        reprendre.current?.();
      }, 60);
    };
    const lancerRetour = () => {
      cancelAnimation(t); // l'ouverture se fige là où elle en est : demi-tour sans saut
      r.value = withTiming(finRetour(mode), { duration: finRetour(mode) * (depart?.lent ?? 1), easing: Easing.linear }, (fini) => {
        if (fini) scheduleOnRN(partir);
      });
    };
    const cible = retourVol();
    if (mode === "vol" && cible) activerVol(true);
    // ouverture finie : la page a pu défiler, le chemin part d'où est la signature maintenant (en plein vol, elle n'a pas
    // bougé, et sa mesure compterait la translation en cours)
    if (mode === "vol" && cible && vue.current && t.value >= finOuverture(mode)) placer(cible, vue.current.v, vue.current.taille, lancerRetour);
    else lancerRetour();
  });

  return { mode, depart, t, r, pret, dx, dy, s0, leger, surPlace, posee, racine };
}

export function FournisseurEntree({ valeur, children }: { valeur: EntreeAge; children: ReactNode }) {
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Style du fond de la page (opacité). */
export function useStyleFond(e: EntreeAge | null) {
  return useAnimatedStyle(() => (e ? { opacity: opaciteFond(e.mode, e.t.value, e.r.value) } : {}));
}

/** Un bloc de la page qui arrive à son rang (-1 : le chiffre ; 0 : en-tête et « quand » ; 1 : rythme ; 2 et plus : la suite). */
export function useStyleBloc(e: EntreeAge | null, rang: number) {
  return useAnimatedStyle(() => {
    if (!e) return {};
    const b = bloc(e.mode, e.t.value, e.r.value, rang);
    return { opacity: b.opacite, transform: [{ translateY: b.y }, { scale: b.echelle }] };
  });
}

export function Apparait({ rang, style, children }: { rang: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const e = useContext(Contexte);
  const anime = useStyleBloc(e, rang);
  return <Animated.View style={[style, anime]}>{children}</Animated.View>;
}

export function useEntree(): EntreeAge | null {
  return useContext(Contexte);
}

/** Avant sa mesure, la signature est à 1/255 et non à 0 : Android ne dessine pas une vue transparente, et le canevas Skia
 * n'aurait sa surface qu'une fois visible ; à l'émulateur, ni l'âme ni la signature ne se voyaient pendant une à deux images
 * au départ du vol. */
const OPACITE_AVANT_MESURE = 1 / 255;

/** La signature qui vole : posée sur l'âme (translation, échelle) puis à sa place ; invisible tant qu'elle n'est pas mesurée. */
export function useStyleSignature(e: EntreeAge | null) {
  return useAnimatedStyle(() => {
    if (!e) return {};
    const v = vol(e.mode, e.t.value, e.r.value);
    const q = 1 - v.p;
    return {
      opacity: v.opacite * Math.max(e.pret.value, OPACITE_AVANT_MESURE),
      transform: [{ translateX: e.dx.value * q }, { translateY: e.dy.value * q }, { scale: e.s0.value + (1 - e.s0.value) * v.p }],
    };
  });
}
