import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { PixelRatio, StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewInstance, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Atlas, Canvas, makeImageFromView, Skia, useColorBuffer, useRSXformBuffer, type SkImage } from "@shopify/react-native-skia";
import { desintegration as D, fonduSuppression as F, retourElement as R } from "../theme/mouvement";
import { CHAMPS, fusionner, grains as decouper, hauteurOuverture, marquerSuppression, opaciteGrain, poserGrain, prendreMarque, retirerFantome, teintes, type Entree, type EtatEntree, type Grains } from "./suppression-animee";
import { courbes } from "./mouvement";
import { useDegrade } from "./ContextePartie";
import { useReduit } from "./reduit";

export { marquerSuppression };

/**
 * Liste dont les suppressions s'animent : l'élément retiré (marqué par `marquerSuppression` au geste) reste affiché en
 * fantôme le temps de sa sortie, puis quitte la liste ; un élément qui revient (Annuler) entre. La donnée n'attend pas.
 */
export function useFantomes<T>(liste: readonly T[], cleDe: (x: T) => string, nouveaux = false) {
  const r = useRef<{ entrees: Entree<T>[]; liste: readonly T[] | null; parties: Set<string> }>({ entrees: [], liste: null, parties: new Set() }).current;
  const [, rendre] = useReducer((n: number) => n + 1, 0);
  if (r.liste !== liste) {
    r.entrees = fusionner(r.entrees, liste, cleDe, prendreMarque, r.parties, nouveaux);
    r.liste = liste;
  }
  const fini = useCallback(
    (cle: string) => {
      r.entrees = retirerFantome(r.entrees, cle);
      rendre();
    },
    [r],
  );
  return { entrees: r.entrees, fini };
}

type Contexte = {
  etat: EtatEntree;
  /** L'élément ou l'un de ses parents sort : une ligne glissée dedans s'efface avec lui (dernière série d'un exercice). */
  sortant: boolean;
  /** Les grains sont dessinés et partent : la vue capturée (la ligne de GlisserSupprimer) peut se cacher, pas avant. */
  grains: boolean;
  /** Marque l'élément : sa disparition de la liste sera animée. */
  marquer: () => void;
  /** Vue à capturer à la place du contenu entier (la ligne glissée, sans le fond rouge de GlisserSupprimer). */
  cible: (ref: RefObject<ViewInstance | null> | null) => void;
};
const Ctx = createContext<Contexte | null>(null);
/** Pour un enfant qui gère lui-même sa sortie (GlisserSupprimer) ; null hors d'un Desintegrable. */
export const useDesintegrable = () => useContext(Ctx);

/** `x`, `y` : position de la vue capturée dans l'élément (la ligne de GlisserSupprimer a ses marges). */
type Image = { image: SkImage; g: Grains; teinte: number[]; w: number; h: number; densite: number; x: number; y: number };
type Poussiere = Image & { partir: () => void };

/** Chronos de la suppression, lus dans logcat (`adb logcat -s ReactNativeJS | grep transition`), depuis le geste. */
const chrono = (etape: string, depuis: number) => console.log(`[transition] suppression ${etape} ${Date.now() - depuis} ms`);

/** Entrée sans mesure ni fin d'animation (cas anormal) : l'élément s'affiche quand même, à sa place. */
/** Glissé (px) depuis la gauche d'un élément qui entre ou revient (Annuler). */
const GLISSE_ENTREE = 16;

const GARDE_ENTREE = R.ouvre + R.fonduA + R.fondu + 200;

/**
 * Enveloppe d'un élément de liste. « sort » : capture de l'élément, désintégration en grains (Skia) aux couleurs du
 * dégradé de la partie, sa place se replie en continu ; « Réduire les animations » ou capture impossible : fondu sobre.
 * « entre » : la place s'ouvre, puis fondu. Au repos, aucune hauteur imposée : l'élément suit son contenu.
 */
export function Desintegrable({
  cle,
  etat = "vu",
  delai = 0,
  onFini,
  style,
  onLayout,
  estimee = 0,
  onMesure,
  garderPlace = false,
  children,
}: {
  cle: string;
  etat?: EtatEntree;
  /** Sortie : attente avant la capture (ms), le temps qu'une feuille se ferme. */
  delai?: number;
  /** Fin de la sortie : le fantôme peut quitter la liste. */
  onFini?: (cle: string) => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** Hauteur d'un élément voisin de la liste : l'élément qui entre s'ouvre jusque-là quand sa propre mesure vaut 0. */
  estimee?: number;
  /** Hauteur mesurée de l'élément au repos (alimente `estimee` de ses voisins). */
  onMesure?: (h: number) => void;
  /** Sortie sans repli de la place (couche flottante ancrée en bas : le repli faisait glisser l'élément et ses grains). */
  garderPlace?: boolean;
  children: ReactNode;
}) {
  const reduit = useReduit();
  const degrade = useDegrade();
  const parent = useContext(Ctx);
  const contenu = useRef<ViewInstance>(null);
  const cible = useRef<RefObject<ViewInstance | null> | null>(null);
  const hauteur = useRef(0);
  // Entrée : l'élément naît « à mesurer » : hors du flux (position absolue, invisible), donc à sa hauteur naturelle (fermé à
  // hauteur 0, il était mesuré à 0 et ne s'ouvrait jamais) ; dès qu'il est mesuré, il entre dans le flux à hauteur 0 et
  // s'ouvre. Le style React retire sa mesure à la fin de l'ouverture.
  const [ferme, setFerme] = useState(etat === "entre");
  const ouverture = useRef<"attend" | "ouvre" | null>(etat === "entre" ? "attend" : null);
  const libre = useSharedValue(true);
  // Hors du flux, le temps d'être mesuré (entrée seulement).
  const horsFlux = useSharedValue(etat === "entre");
  const gl = useSharedValue(0);
  // Né à mesurer : son style animé dit « relative » une fois entré dans le flux (une clé qui disparaît ne défait pas « absolute »).
  const nee = useSharedValue(etat === "entre");
  const h = useSharedValue(0);
  const op = useSharedValue(etat === "entre" ? 0 : 1);
  const ech = useSharedValue(1);
  const u = useSharedValue(0);
  const [poussiere, setPoussiere] = useState<Poussiere | null>(null);
  const [grains, setGrains] = useState(false);
  const finir = useRef(onFini);
  finir.current = onFini;
  const fin = useCallback(() => finir.current?.(cle), [cle]);
  const liberer = useCallback(() => {
    ouverture.current = null;
    setFerme(false);
  }, []);

  // Capture prise dès le geste (revue finale, n° 14) : la ligne glissée ne bouge plus jusqu'à sa sortie, la même image sert
  // aux grains. Elle se prend pendant que la base écrit et que la liste se relit : la barre rouge ne reste plus figée le
  // temps de la capture. `t0` : le geste (chronos).
  const prise = useRef<{ t0: number; image: Promise<Image | null> } | null>(null);
  const capturer = useCallback(async (): Promise<Image | null> => {
    const vue = cible.current?.current;
    const [x, y] = await new Promise<[number, number]>((ok) => {
      if (vue && contenu.current) vue.measureLayout(contenu.current, (a, b) => ok([a, b]), () => ok([0, 0]));
      else ok([0, 0]);
    });
    // Le type attendu par Skia date des composants classe ; une instance de vue convient (findNodeHandle).
    const image = await makeImageFromView((cible.current ?? contenu) as never);
    if (!image || image.width() <= 0) return null;
    const densite = PixelRatio.get();
    const w = image.width() / densite;
    const hi = image.height() / densite;
    const g = decouper(w, hi);
    return { image, g, teinte: teintes(g, w, hi, degrade.arrets), w, h: hi, densite, x, y };
  }, [degrade.arrets]);
  const marquer = useCallback(() => {
    marquerSuppression(cle);
    if (reduit) return;
    const t0 = Date.now();
    const image = capturer().catch(() => null);
    prise.current = { t0, image };
    void image.then((i) => i && chrono("capture", t0));
  }, [cle, reduit, capturer]);

  const sortant = etat === "sort" || !!parent?.sortant;
  const ctx = useMemo<Contexte>(
    () => ({ etat, sortant, grains, marquer, cible: (ref) => void (cible.current = ref) }),
    [etat, sortant, grains, marquer],
  );

  // La place s'ouvre jusqu'à `vers` ; à la fin, la hauteur redevient libre (« auto ») et le style de fermeture part.
  const allerA = (vers: number, duree: number) => {
    h.value = withTiming(vers, { duration: duree, easing: courbes.deplacement }, (ok) => {
      if (!ok) return;
      libre.value = true;
      scheduleOnRN(liberer);
    });
  };
  const ouvrir = () => {
    ouverture.current = "ouvre";
    op.value = 0;
    if (reduit) {
      libre.value = true;
      horsFlux.value = false;
      op.value = withTiming(1, { duration: F.duree, easing: courbes.sortie });
      liberer();
      return;
    }
    if (ferme) h.value = 0;
    // Dans le même lot : entre dans le flux à hauteur 0 (aucune image à pleine hauteur), puis s'ouvre, fond et glisse depuis la gauche.
    horsFlux.value = false;
    libre.value = false;
    setFerme(false);
    allerA(hauteur.current, R.ouvre);
    op.value = withDelay(R.fonduA, withTiming(1, { duration: R.fondu, easing: courbes.sortie }));
    gl.value = -GLISSE_ENTREE;
    gl.value = withDelay(R.fonduA, withTiming(0, { duration: R.fondu, easing: courbes.sortie }));
  };

  useEffect(() => {
    // Revenu (suppression refusée, Annuler) : l'image prise au geste ne vaut plus.
    if (etat !== "sort") prise.current = null;
    if (etat === "entre") {
      // Retour pendant la sortie (Annuler tout de suite) : les grains s'arrêtent, la place se rouvre depuis où elle en est.
      setPoussiere(null);
      setGrains(false);
      ech.value = 1;
      if (ouverture.current !== "ouvre") {
        if (hauteur.current > 0) ouvrir();
        else ouverture.current = "attend";
      }
      const garde = setTimeout(() => {
        if (ouverture.current == null) return;
        libre.value = true;
        horsFlux.value = false;
        gl.value = 0;
        op.value = 1;
        liberer();
      }, GARDE_ENTREE);
      return () => clearTimeout(garde);
    }
    if (etat !== "sort") return;
    ouverture.current = null;
    const replier = (delai: number, duree: number) => {
      if (garderPlace) return;
      h.value = hauteur.current;
      libre.value = false;
      h.value = withDelay(delai, withTiming(0, { duration: duree, easing: courbes.deplacement }, (ok) => ok && scheduleOnRN(fin)));
    };
    const fondu = () => {
      op.value = withTiming(0, { duration: F.duree, easing: courbes.sortie }, (ok) => ok && garderPlace && scheduleOnRN(fin));
      ech.value = withTiming(F.echelle, { duration: F.duree, easing: courbes.sortie });
      replier(F.resserreA, F.resserre);
    };
    let annule = false;
    // L'image prise au geste, sinon une capture maintenant (suppression depuis un écran de détail, un menu).
    const deja = prise.current;
    prise.current = null;
    const t0 = deja?.t0 ?? Date.now();
    if (deja) chrono("sortie", t0);
    const partir = () => {
      if (reduit) return fondu();
      (deja?.image ?? capturer())
        .then((i) => {
          if (annule) return;
          if (!i) return fondu();
          const { g } = i;
          u.value = 0;
          // Les grains partent une fois leur toile montée (Poussiere) : partis à la capture, ils avaient presque fini quand la
          // toile apparaissait (bulle de séance, 28/10 : seuls les derniers grains se voyaient, à droite).
          const partirGrains = () => {
            if (annule) return;
            chrono("grains", t0);
            u.value = withTiming(g.fin, { duration: g.fin, easing: Easing.linear }, (ok) => ok && garderPlace && scheduleOnRN(fin));
            // Le contenu disparaît une fois les grains dessinés par-dessus (≈ 2 images) ; GlisserSupprimer cache sa ligne lui-même,
            // à ce signal (29/10 au soir : cachée 64 ms après la sortie, elle laissait un trou avant les grains, vu à l'émulateur).
            if (!cible.current) op.value = withDelay(64, withTiming(0, { duration: 0 }));
            else setGrains(true);
            replier(D.resserreA, D.resserre);
          };
          setPoussiere({ ...i, partir: partirGrains });
        })
        .catch(() => !annule && fondu());
    };
    const minuteur = delai > 0 ? setTimeout(partir, delai) : (partir(), undefined);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat]);

  const surMesure = (e: LayoutChangeEvent) => {
    if (etat === "sort") return;
    const avant = hauteur.current;
    const mesure = e.nativeEvent.layout.height;
    if (mesure > 0 && ouverture.current == null) onMesure?.(mesure);
    // Un élément qui naît fermé est parfois mesuré à 0 (écrasé par sa place fermée) : il prend la hauteur de ses voisins.
    hauteur.current = etat === "entre" ? hauteurOuverture(mesure, estimee) : mesure;
    if (hauteur.current <= 0) return;
    if (ouverture.current === "attend") ouvrir();
    // Le contenu change de taille pendant l'ouverture (données, polices) : la place suit, rien n'est coupé.
    else if (ouverture.current === "ouvre" && !reduit && Math.abs(hauteur.current - avant) > 0.5) allerA(hauteur.current, R.ouvre / 2);
  };

  const debord = etat === "sort";
  const cadre = useAnimatedStyle(() =>
    horsFlux.value
      ? { position: "absolute", left: 0, right: 0 }
      : libre.value
        ? { height: "auto", overflow: "visible", ...(nee.value ? { position: "relative" } : {}) }
        : { height: Math.max(0, h.value), overflow: debord ? "visible" : "hidden", ...(nee.value ? { position: "relative" } : {}) },
  );
  const vu = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: gl.value }, { scale: ech.value }] }));

  return (
    <Ctx.Provider value={ctx}>
      <Animated.View style={[style, cadre, ferme && styles.ferme]} onLayout={onLayout} pointerEvents={etat === "sort" || ferme ? "none" : "auto"}>
        <Animated.View ref={contenu} collapsable={false} onLayout={surMesure} style={[vu, ferme && styles.invisible]}>
          {children}
        </Animated.View>
        {poussiere ? <Poussiere p={poussiere} u={u} /> : null}
      </Animated.View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  ferme: { position: "absolute", left: 0, right: 0 },
  invisible: { opacity: 0 },
});

/** Les grains, dessinés en un seul Atlas ; à chaque image, seules les transformations et l'opacité changent (fil UI). */
function Poussiere({ p, u }: { p: Poussiere; u: SharedValue<number> }) {
  const { g, densite, partir } = p;
  const { donnees, n, pas } = g;
  // Toile montée : les grains partent à l'image suivante (au premier dessin, ils sont encore tous à leur place).
  useEffect(() => {
    let a = requestAnimationFrame(() => (a = requestAnimationFrame(partir)));
    return () => cancelAnimationFrame(a);
  }, [partir]);
  const haut = D.margeHaut;
  const sprites = useMemo(() => {
    const r = [];
    for (let i = 0; i < n; i++) r.push(Skia.XYWHRect(donnees[i * CHAMPS]! * densite, donnees[i * CHAMPS + 1]! * densite, pas * densite, pas * densite));
    return r;
  }, [donnees, n, pas, densite]);
  const transforms = useRSXformBuffer(n, (val, i) => {
    "worklet";
    poserGrain(donnees, i, u.value, densite, haut, val);
  });
  const { teinte } = p;
  // Teinte de la partie, masquée par la forme du grain (srcIn) : la forme et la durée restent celles de l'élément.
  const couleurs = useColorBuffer(n, (val, i) => {
    "worklet";
    val[0] = teinte[i * 3]!;
    val[1] = teinte[i * 3 + 1]!;
    val[2] = teinte[i * 3 + 2]!;
    val[3] = opaciteGrain(donnees, i, u.value);
  });
  return (
    <Canvas pointerEvents="none" style={{ position: "absolute", left: p.x, top: p.y - haut, width: p.w + D.margeDroite, height: p.h + haut }}>
      <Atlas image={p.image} sprites={sprites} transforms={transforms} colors={couleurs} colorBlendMode="srcIn" />
    </Canvas>
  );
}

/**
 * Une liste aux suppressions animées : chaque entrée de `useFantomes` dans son Desintegrable. Ce qui entoure la liste (titre,
 * groupe) passe par `autour`, et l'état vide par `vide` : la liste reste montée tant qu'un élément sort, la dernière ligne
 * supprimée se désintègre aussi (29/10 au soir : rendue sous condition `liste.length`, elle disparaissait sans grains).
 */
export function ListeDesintegrable<T>({
  liste,
  cleDe,
  rendu,
  nouveaux,
  style,
  enveloppe,
  garderPlace,
  autour,
  vide,
}: {
  liste: readonly T[];
  cleDe: (x: T) => string;
  /** Les éléments ajoutés entrent aussi (place qui s'ouvre, fondu). */
  nouveaux?: boolean;
  rendu: (item: T, etat: EtatEntree) => ReactNode;
  /** Style de l'enveloppe, sans marge : l'écart entre éléments se met dans `rendu`, pour se replier avec lui. */
  style?: StyleProp<ViewStyle>;
  /** Par élément : style (zIndex d'un élément tenu) et mesure de l'enveloppe, qui est l'enfant direct de la liste. */
  enveloppe?: (item: T, etat: EtatEntree) => { style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void };
  /** Les éléments qui sortent gardent leur place jusqu'à la fin (voir Desintegrable). */
  garderPlace?: boolean;
  /** Autour des éléments, tant qu'il en reste à l'écran (ceux qui sortent compris) : titre, groupe, cadre de la liste. */
  autour?: (elements: ReactNode) => ReactNode;
  /** À la place, quand il n'en reste aucun (le dernier a fini de sortir) : état vide, « Ajouter ». */
  vide?: ReactNode;
}) {
  const { entrees, fini } = useFantomes(liste, cleDe, nouveaux);
  const voisine = useRef(0);
  if (!entrees.length) return <>{vide ?? null}</>;
  const elements = (
    <>
      {entrees.map((e) => {
        const env = enveloppe?.(e.item, e.etat);
        return (
          <Desintegrable key={e.cle} cle={e.cle} etat={e.etat} delai={e.delai} onFini={fini} style={[style, env?.style]} onLayout={env?.onLayout} estimee={voisine.current} onMesure={(h) => void (voisine.current = h)} garderPlace={garderPlace}>
            {rendu(e.item, e.etat)}
          </Desintegrable>
        );
      })}
    </>
  );
  return <>{autour ? autour(elements) : elements}</>;
}
