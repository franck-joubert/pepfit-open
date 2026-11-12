import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewInstance,
  type ViewProps,
} from "react-native";
import Animated, { makeMutable, useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import { bornerTenu, deplacer, disposer, hauteurGrille, rangVise, type Bloc, type Rect } from "../ecrans/accueil-blocs";
import { vitesseDefilement } from "../ecrans/glisser";
import { APPUI_LONG_MS, TOLERANCE_PX } from "../ecrans/ordre-sections";
import { reduitMouvement } from "./reduit";
import { signalerDefilement } from "./aura-etat";
import { courbes } from "./mouvement";
import { duree } from "../theme/mouvement";

// Glisser-déposer de l'accueil en mode Modifier, dans la grille à deux colonnes : appui long (350 ms, 8 px de
// tolérance), le bloc suit le doigt décalé de 16 px à droite et soulevé, les voisins glissent vers leur future place
// (grille dense recalculée à chaque rang visé), la liste défile près des bords. Pas de vibration.
// Chaque bloc est posé en absolu à la place calculée par `disposer` (hauteurs naturelles mesurées) : une seule
// position par bloc, celle du doigt pendant le glisser, sa place ensuite ; pas de translation à remettre à zéro.

const courbe = courbes.sortie;
/** Le bloc tenu glisse un peu à droite et se soulève (planche : translate(16, −8)), en 160 ms. */
const decalageTenu = { x: 16, y: -8 };
const LEVEE_MS = 160;

export type PositionBloc = { x: SharedValue<number>; y: SharedValue<number>; s: SharedValue<number> };

type Hauteurs = Partial<Record<string, number>>;

/**
 * Comment la grille se dispose : celle de l'accueil (grille dense, hauteurs mesurées) par défaut ; le lanceur de sports
 * (page Entraînements) passe la sienne (grille adaptative, tuiles de hauteur fixe).
 */
export type Disposition<B extends { id: string }> = {
  disposer: (blocs: B[], hauteurs: Hauteurs, largeur: number, ecart: number) => Map<string, Rect>;
  deplacer: (blocs: B[], id: string, vers: number) => B[];
  rangVise: (blocs: B[], id: string, cx: number, cy: number, hauteurs: Hauteurs, largeur: number, ecart: number) => number;
};

const ACCUEIL = { disposer, deplacer, rangVise } as unknown as Disposition<Bloc>;

export function useGlisserAccueil<B extends { id: string } = Bloc>({
  blocs,
  largeur,
  ecart,
  marge,
  margeBas,
  onDeposer,
  disposition = ACCUEIL as unknown as Disposition<B>,
}: {
  /** Les blocs visibles, dans l'ordre affiché. */
  blocs: B[];
  /** Largeur de la grille. */
  largeur: number;
  ecart: number;
  /** Débord permis au bloc tenu de chaque côté de la grille (sa marge à l'écran). */
  marge: number;
  /** Bas de la zone couvert par un élément fixe : le défilement s'y déclenche au-dessus. */
  margeBas: number;
  onDeposer: (blocs: B[]) => void;
  disposition?: Disposition<B>;
}) {
  const { disposer, deplacer, rangVise } = disposition;
  const [tenu, setTenu] = useState<string | null>(null);
  const [vers, setVers] = useState(0);
  const [hauteurs, setHauteurs] = useState<Hauteurs>({});
  // Pendant le glisser, la grille est celle du dépôt prévu : les voisins sont déjà à leur future place.
  const places = disposer(tenu ? deplacer(blocs, tenu, vers) : blocs, hauteurs, largeur, ecart);
  const hauteur = hauteurGrille(places as Map<never, Rect>);
  const opts = useRef({ blocs, largeur, ecart, marge, margeBas, onDeposer, hauteurs, hauteur, disposer, deplacer, rangVise });
  opts.current = { blocs, largeur, ecart, marge, margeBas, onDeposer, hauteurs, hauteur, disposer, deplacer, rangVise };
  const scrollRef = useRef<ScrollViewInstance>(null);
  const zoneRef = useRef<ViewInstance>(null);

  const interne = useMemo(() => {
    const registre = new Map<string, PositionBloc>();
    const zone = { top: 0, h: 0 };
    const defil = { y: 0, contenu: 0, dernierAuto: 0, y0: 0 };
    const lp = { timer: null as ReturnType<typeof setTimeout> | null, x: 0, y: 0, arme: false };
    const etat = {
      id: "",
      blocs: [] as B[],
      r0: { x: 0, y: 0, l: 0, h: 0 } as Rect,
      a: 0,
      vers: 0,
      x: 0,
      y: 0,
      t0: 0,
      fin: 0,
      raf: 0,
    };

    const position = (id: string) => {
      let p = registre.get(id);
      if (!p) {
        p = { x: makeMutable(0), y: makeMutable(0), s: makeMutable(1) };
        registre.set(id, p);
      }
      return p;
    };

    const suivre = () => {
      const o = opts.current;
      const k = reduitMouvement() ? 1 : 1 - (1 - Math.min(1, (Date.now() - etat.t0) / LEVEE_MS)) ** 3;
      const dx = etat.x - lp.x + k * decalageTenu.x;
      const dy = etat.y - lp.y + defil.y - defil.y0 + k * decalageTenu.y;
      const q = bornerTenu(etat.r0, dx, dy, o.largeur, o.hauteur, o.marge);
      const p = position(etat.id);
      p.x.value = q.x;
      p.y.value = q.y;
      const v = o.rangVise(etat.blocs, etat.id, q.x + etat.r0.l / 2, q.y + etat.r0.h / 2, o.hauteurs, o.largeur, o.ecart);
      if (v === etat.vers) return;
      etat.vers = v;
      setVers(v);
    };

    const boucle = () => {
      if (!lp.arme) return;
      const v = vitesseDefilement(etat.y - zone.top, zone.h - opts.current.margeBas);
      if (v !== 0) {
        const ny = Math.max(0, Math.min(Math.max(0, defil.contenu - zone.h), defil.y + v));
        if (Math.abs(ny - defil.y) > 0.01) {
          scrollRef.current?.scrollTo({ y: ny, animated: false });
          defil.y = ny;
          defil.dernierAuto = Date.now();
        }
      }
      suivre();
      etat.raf = requestAnimationFrame(boucle);
    };

    const annuler = () => {
      if (lp.timer) clearTimeout(lp.timer);
      lp.timer = null;
    };

    const armer = (id: string) => {
      const o = opts.current;
      etat.blocs = o.blocs;
      etat.a = etat.blocs.findIndex((b) => b.id === id);
      const r0 = o.disposer(etat.blocs, o.hauteurs, o.largeur, o.ecart).get(id);
      if (etat.a < 0 || !r0) return;
      etat.id = id;
      etat.vers = etat.a;
      etat.r0 = r0;
      etat.x = lp.x;
      etat.y = lp.y;
      etat.t0 = Date.now();
      defil.y0 = defil.y;
      lp.arme = true;
      setVers(etat.a);
      setTenu(id);
      etat.raf = requestAnimationFrame(boucle);
    };

    const lacher = () => {
      lp.arme = false;
      cancelAnimationFrame(etat.raf);
      etat.fin = Date.now();
      // Le nouvel ordre et la fin du glisser tombent dans le même rendu : la grille ne bouge pas, le bloc rejoint sa place.
      if (etat.vers !== etat.a) opts.current.onDeposer(opts.current.deplacer(etat.blocs, etat.id, etat.vers));
      setTenu(null);
    };

    return {
      position,
      arret: () => cancelAnimationFrame(etat.raf),
      /** Vrai pendant et juste après un glisser : le toucher qui le termine n'ouvre rien. */
      recent: () => lp.arme || Date.now() - etat.fin < 400,
      zoneProps: {
        ref: zoneRef,
        onLayout: () =>
          zoneRef.current?.measureInWindow((_x, y, _w, h) => {
            zone.top = y;
            zone.h = h;
          }),
      },
      scrollProps: {
        ref: scrollRef,
        scrollEventThrottle: 16,
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (lp.arme && Date.now() - defil.dernierAuto < 80) return;
          defil.y = e.nativeEvent.contentOffset.y;
          signalerDefilement(defil.y);
        },
        onContentSizeChange: (_w: number, h: number) => void (defil.contenu = h),
      },
      toucher: (id: string) => ({
        onTouchStart: (e: GestureResponderEvent) => {
          annuler();
          const n = e.nativeEvent;
          if (lp.arme || (n.touches?.length ?? 1) > 1) return;
          lp.x = n.pageX;
          lp.y = n.pageY;
          lp.timer = setTimeout(() => {
            lp.timer = null;
            armer(id);
          }, APPUI_LONG_MS);
        },
        onTouchMove: (e: GestureResponderEvent) => {
          const n = e.nativeEvent;
          if (lp.arme) {
            etat.x = n.pageX;
            etat.y = n.pageY;
          } else if (lp.timer && Math.hypot(n.pageX - lp.x, n.pageY - lp.y) > TOLERANCE_PX) annuler();
        },
        onTouchEnd: () => {
          annuler();
          if (lp.arme) lacher();
        },
        onTouchCancel: () => {
          annuler();
          if (lp.arme) lacher();
        },
      }),
    };
  }, []);

  useEffect(() => interne.arret, [interne]);

  return {
    tenu,
    places,
    hauteur,
    /** Toutes les hauteurs sont connues : la grille peut se montrer. */
    pret: blocs.every((b) => hauteurs[b.id] != null),
    /** Hauteur naturelle d'un bloc : onLayout de son contenu, plus `bord` en haut et en bas. */
    mesure: (id: string, bord: number) => (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height + 2 * bord;
      setHauteurs((p) => (p[id] != null && Math.abs(p[id] - h) < 0.5 ? p : { ...p, [id]: h }));
    },
    ...interne,
    scrollProps: { ...interne.scrollProps, scrollEnabled: tenu == null },
  };
}

/**
 * Un bloc posé à sa place (`rect`, repère de la grille). Tenu, sa position vient du doigt ; sinon il rejoint `rect`,
 * en glissant si `animer` (mode Modifier), d'un coup sinon (premier rendu, données chargées).
 */
export function PlaceBloc({ pos, rect, tenu, animer, style, ...props }: ViewProps & { pos: PositionBloc; rect: Rect; tenu: boolean; animer: boolean }) {
  const premier = useRef(true);
  useLayoutEffect(() => {
    if (tenu) return;
    if (premier.current || !animer) {
      pos.x.value = rect.x;
      pos.y.value = rect.y;
    } else {
      pos.x.value = withTiming(rect.x, { duration: duree.depot, easing: courbe });
      pos.y.value = withTiming(rect.y, { duration: duree.depot, easing: courbe });
    }
    premier.current = false;
  }, [pos, rect.x, rect.y, tenu, animer]);
  useEffect(() => {
    pos.s.value = withTiming(tenu ? 1.03 : 1, { duration: tenu ? LEVEE_MS : duree.depot, easing: courbe });
  }, [pos, tenu]);
  const anime = useAnimatedStyle(() => ({ transform: [{ translateX: pos.x.value }, { translateY: pos.y.value }, { scale: pos.s.value }] }));
  return (
    <Animated.View
      {...props}
      style={[{ position: "absolute", left: 0, top: 0, width: rect.l, height: rect.h }, tenu && { zIndex: 1, elevation: 8 }, style, anime]}
    />
  );
}
