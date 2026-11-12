import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from "react-native";
import { useTheme } from "../theme";
import { courbe, duree } from "../theme/mouvement";
import { rayon } from "../theme/typo";
import { reduitMouvement } from "./reduit";
import { signalerErreur } from "./FeuilleMessage";
import {
  cibleGlisser, decalagesVoisins, depotDe, fentes, HAUTEUR_REPLIEE, hautDeLaPlace, hauteurReduite, hauteursGlisser, uniteTenue, vitesseDefilement,
  type Depot, type Fente, type Mode, type Rangee,
} from "../ecrans/glisser";

// Glisser-déposer (direction C) : la carte tenue se soulève, les cartes dépliées se replient, les voisines s'écartent en direct,
// la liste défile près des bords, le tout revient en place au lâcher. La liste est à plat (exercice, en-tête, membre, pied) :
// un exercice se prend seul et peut entrer dans un superset ou en sortir ; l'en-tête prend le superset entier.
// Plusieurs glisser peuvent partager une même liste qui défile (séance : les exercices, et les séries de chaque exercice) :
// l'écran pose le défilement (useDefilementGlisser) dans ContexteDefilement, chaque glisser s'en sert.

const APPUI_LONG_MS = 350;
const TOLERANCE_PX = 8;

export type Phase = "repos" | "glisse" | "depot" | "retour";
/** Ce qui est tenu : rangées (une seule pour un exercice, tout le superset pour un en-tête) et superset d'origine. */
export type Tenu = { ids: string[]; mode: Mode; groupe: number | null };

export type Controle = {
  p: Animated.Value;
  ty: Animated.Value;
  leve: Animated.Value;
  decalage: (id: string) => Animated.Value;
  pleine: (id: string) => number;
  mesure: (id: string, h: number) => void;
  demarrer: (id: string, pageY: number) => void;
  deplacer: (pageY: number) => void;
  lacher: () => void;
  toucherDebut: (id: string, e: GestureResponderEvent) => void;
  toucherBouge: (e: GestureResponderEvent) => void;
  toucherFin: () => void;
  recent: () => boolean;
  reduit: () => boolean;
};

/** Liste qui défile, partagée par les glisser qu'elle contient : position, taille, zone visible, défilement coupé pendant un geste. */
export type Defilement = {
  scrollRef: React.RefObject<ScrollViewInstance | null>;
  defil: { y: number; contenu: number; dernierAuto: number };
  zone: { top: number; h: number };
  mesurerZone: () => void;
  /** Un geste commence (prendre) ou finit (rendre) : la liste ne défile plus au doigt tant qu'un geste est en cours. */
  prendre: () => void;
  rendre: () => void;
  occupee: () => boolean;
};

export const ContexteDefilement = createContext<Defilement | null>(null);

/** Le défilement d'une liste à glisser : à poser sur la ScrollView (scrollProps) et sur la vue qui l'entoure (zoneProps). */
export function useDefilementGlisser() {
  const [libre, setLibre] = useState(true);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const zoneRef = useRef<ViewInstance>(null);
  const defilement = useMemo<Defilement>(() => {
    const defil = { y: 0, contenu: 0, dernierAuto: 0 };
    const zone = { top: 0, h: 0 };
    let gestes = 0;
    return {
      scrollRef,
      defil,
      zone,
      mesurerZone: () =>
        zoneRef.current?.measureInWindow((_x, y, _w, h) => {
          zone.top = y;
          zone.h = h;
        }),
      prendre: () => {
        gestes++;
        setLibre(false);
      },
      rendre: () => {
        gestes = Math.max(0, gestes - 1);
        if (gestes === 0) setLibre(true);
      },
      occupee: () => gestes > 0,
    };
  }, []);
  const { defil } = defilement;
  const scrollProps = {
    ref: scrollRef,
    scrollEnabled: libre,
    scrollEventThrottle: 16,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (defilement.occupee() && Date.now() - defil.dernierAuto < 80) return;
      defil.y = e.nativeEvent.contentOffset.y;
    },
    onContentSizeChange: (_w: number, h: number) => (defil.contenu = h),
  };
  const zoneProps = { ref: zoneRef, onLayout: () => defilement.mesurerZone() };
  return { defilement, scrollProps, zoneProps };
}

const courbeVoisines = Easing.bezier(...courbe.sortie);
const courbeCompact = Easing.bezier(...courbe.deplacement);
const borne = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const somme = (l: number[]) => l.reduce((t, h) => t + h, 0);

export function useGlisser({
  rangees,
  margeBas,
  onDebut,
  onDeposer,
}: {
  rangees: Rangee[];
  margeBas: number;
  onDebut: () => void;
  /** Appelé au lâcher, avant le retour : l'écran affiche tout de suite le nouvel ordre (même image que la remise à zéro). */
  onDeposer: (d: Depot) => Promise<unknown>;
}) {
  // Dans une liste qui pose son défilement (ContexteDefilement), le glisser s'en sert ; sinon il a le sien.
  const commun = useContext(ContexteDefilement);
  const propre = useDefilementGlisser();
  const defilement = commun ?? propre.defilement;
  const refDefilement = useRef(defilement);
  refDefilement.current = defilement;
  const [phase, setPhaseEtat] = useState<Phase>("repos");
  const [tenu, setTenu] = useState<Tenu | null>(null);
  const [dedans, setDedans] = useState(false);

  const opts = useRef({ rangees, margeBas, onDebut, onDeposer });
  opts.current = { rangees, margeBas, onDebut, onDeposer };

  const interne = useMemo(() => {
    const p = new Animated.Value(0);
    const ty = new Animated.Value(0);
    const leve = new Animated.Value(0);
    const mesures = new Map<string, number>();
    const registre = new Map<string, Animated.Value>();
    const dd = () => refDefilement.current;
    const lp = { timer: null as ReturnType<typeof setTimeout> | null, id: "", x: 0, y: 0, arme: false };
    const etat = {
      phase: "repos" as Phase,
      actif: false,
      ids: [] as string[],
      a: 0,
      b: 0,
      mode: "exercice" as Mode,
      rangees: [] as Rangee[],
      autres: [] as Rangee[],
      hAutres: [] as number[],
      permises: [] as Fente[],
      vers: { index: 0, groupe: null } as Fente,
      hTenu: 0,
      haut0: 0,
      y0: 0,
      y: 0,
      autoCum: 0,
      comp: 0,
      compFaite: 0,
      pVal: 0,
      raf: 0,
      dernierGlisse: 0,
    };
    p.addListener(({ value }) => (etat.pVal = value));

    const temps = (ms: number) => (reduitMouvement() ? Math.min(ms, 100) : ms);
    const setPhase = (ph: Phase) => {
      if (etat.phase === "repos" && ph !== "repos") dd().prendre();
      else if (etat.phase !== "repos" && ph === "repos") dd().rendre();
      etat.phase = ph;
      setPhaseEtat(ph);
    };
    const decalage = (id: string) => {
      let v = registre.get(id);
      if (!v) {
        v = new Animated.Value(0);
        registre.set(id, v);
      }
      return v;
    };
    const pleine = (id: string) => mesures.get(id) ?? HAUTEUR_REPLIEE;

    const appliquerDecalages = () => {
      const dec = decalagesVoisins(etat.autres.length, etat.a, etat.vers.index, etat.hTenu);
      etat.autres.forEach((r, k) => {
        Animated.timing(decalage(r.id), { toValue: dec[k]!, duration: temps(duree.depot), easing: courbeVoisines, useNativeDriver: true }).start();
      });
    };

    const recalculer = () => {
      const haut = etat.haut0 + (etat.y - etat.y0) + etat.autoCum;
      const f = cibleGlisser(etat.hAutres, etat.permises, haut, etat.a);
      if (f.index !== etat.vers.index) {
        etat.vers = f;
        appliquerDecalages();
        setDedans(f.groupe != null);
      }
    };

    const boucle = () => {
      if (!etat.actif || etat.phase !== "glisse") return;
      const { defil, zone, scrollRef } = dd();
      const yEcran = etat.y - zone.top;
      const v = vitesseDefilement(yEcran, zone.h - opts.current.margeBas);
      const cibleComp = etat.comp * etat.pVal;
      const dc = cibleComp - etat.compFaite;
      etat.compFaite = cibleComp;
      const max = Math.max(0, defil.contenu - zone.h);
      const ny = borne(defil.y + v - dc, 0, max);
      const reel = ny - defil.y;
      if (Math.abs(reel) > 0.01) {
        scrollRef.current?.scrollTo({ y: ny, animated: false });
        defil.y = ny;
        defil.dernierAuto = Date.now();
        if (v !== 0) etat.autoCum += reel + dc;
      }
      ty.setValue(etat.y - etat.y0 + etat.autoCum);
      recalculer();
      etat.raf = requestAnimationFrame(boucle);
    };

    const fin = () => {
      const { onDeposer: deposer } = opts.current;
      if (etat.vers.index !== etat.a) {
        Promise.resolve(deposer(depotDe(etat.rangees, etat.a, etat.b, etat.mode, etat.vers))).catch(signalerErreur());
      }
      setPhase("retour");
      Animated.timing(p, { toValue: 0, duration: temps(duree.deplacement), easing: courbeCompact, useNativeDriver: false }).start(() => {
        etat.actif = false;
        etat.dernierGlisse = Date.now();
        setTenu(null);
        setPhase("repos");
        dd().scrollRef.current?.scrollTo({ y: dd().defil.y, animated: false });
      });
    };

    const lacher = () => {
      if (!etat.actif || etat.phase !== "glisse") return;
      cancelAnimationFrame(etat.raf);
      etat.dernierGlisse = Date.now();
      const tyFinal = hautDeLaPlace(etat.hAutres, etat.vers.index) - etat.haut0;
      setPhase("depot");
      Animated.timing(leve, { toValue: 0, duration: temps(duree.depot), easing: courbeVoisines, useNativeDriver: true }).start();
      // Dépôt sur le pilote natif (revue finale n° 65) : ty ne porte qu'une translation ; la hauteur (p) reste au pilote JS.
      Animated.timing(ty, { toValue: tyFinal, duration: temps(duree.depot), easing: courbeVoisines, useNativeDriver: true }).start(fin);
    };

    const demarrer = (id: string, pageY: number) => {
      const { rangees: liste, onDebut: debut } = opts.current;
      const u = uniteTenue(liste, id);
      if (etat.actif || !u) return;
      const { a, b, mode } = u;
      Keyboard.dismiss();
      dd().mesurerZone();
      const pleines = liste.map((r) => pleine(r.id));
      const hauts = hauteursGlisser(liste, pleines, a, b);
      const sansTenu = <T,>(l: T[]) => [...l.slice(0, a), ...l.slice(b + 1)];
      etat.actif = true;
      etat.ids = liste.slice(a, b + 1).map((r) => r.id);
      etat.a = a;
      etat.b = b;
      etat.mode = mode;
      etat.rangees = liste;
      etat.autres = sansTenu(liste);
      etat.hAutres = sansTenu(hauts);
      etat.permises = fentes(etat.autres, mode);
      etat.vers = etat.permises.find((f) => f.index === a) ?? { index: a, groupe: liste[a]!.groupe };
      etat.hTenu = somme(pleines.slice(a, b + 1));
      etat.haut0 = somme(hauts.slice(0, a));
      etat.y0 = pageY;
      etat.y = pageY;
      etat.autoCum = 0;
      etat.comp = Math.min(dd().defil.y, somme(pleines.slice(0, a)) - etat.haut0);
      etat.compFaite = 0;
      etat.dernierGlisse = Date.now();
      ty.setValue(0);
      p.setValue(0);
      leve.setValue(0);
      registre.forEach((v) => v.setValue(0));
      setTenu({ ids: etat.ids, mode, groupe: liste[a]!.groupe });
      setDedans(etat.vers.groupe != null);
      setPhase("glisse");
      debut();
      Animated.timing(p, { toValue: 1, duration: temps(duree.deplacement), easing: courbeCompact, useNativeDriver: false }).start();
      Animated.timing(leve, { toValue: 1, duration: temps(duree.sortie), easing: courbeVoisines, useNativeDriver: true }).start();
      etat.raf = requestAnimationFrame(boucle);
    };

    const mesure = (id: string, h: number) => {
      mesures.set(id, h);
      if (!etat.actif || !etat.ids.includes(id)) return;
      const hTenu = somme(etat.ids.map(pleine));
      if (Math.abs(hTenu - etat.hTenu) > 1) {
        etat.hTenu = hTenu;
        recalculer();
        if (etat.phase === "glisse") appliquerDecalages();
      }
    };

    const annulerAppuiLong = () => {
      if (lp.timer) clearTimeout(lp.timer);
      lp.timer = null;
    };

    const ctl: Controle = {
      p,
      ty,
      leve,
      decalage,
      pleine,
      mesure,
      demarrer,
      deplacer: (pageY) => (etat.y = pageY),
      lacher,
      toucherDebut: (id, e) => {
        annulerAppuiLong();
        lp.arme = false;
        const n = e.nativeEvent;
        if (etat.actif || (n.touches?.length ?? 1) > 1) return;
        lp.id = id;
        lp.x = n.pageX;
        lp.y = n.pageY;
        lp.timer = setTimeout(() => {
          lp.timer = null;
          lp.arme = true;
          demarrer(lp.id, lp.y);
        }, APPUI_LONG_MS);
      },
      toucherBouge: (e) => {
        const n = e.nativeEvent;
        if (lp.arme) {
          etat.y = n.pageY;
          return;
        }
        if (lp.timer && Math.hypot(n.pageX - lp.x, n.pageY - lp.y) > TOLERANCE_PX) annulerAppuiLong();
      },
      toucherFin: () => {
        annulerAppuiLong();
        if (lp.arme) {
          lp.arme = false;
          lacher();
        }
      },
      recent: () => etat.phase !== "repos" || Date.now() - etat.dernierGlisse < 400,
      reduit: reduitMouvement,
    };
    const reinitialiser = () => {
      ty.setValue(0);
      leve.setValue(0);
      registre.forEach((v) => v.setValue(0));
    };
    return { ctl, etat, reinitialiser };
  }, []);
  const { ctl, etat, reinitialiser } = interne;

  // Le nouvel ordre (posé par onDeposer) et la remise à zéro des décalages doivent tomber dans la même image.
  useLayoutEffect(() => {
    if (phase === "retour") reinitialiser();
  }, [phase, reinitialiser]);

  useEffect(() => () => cancelAnimationFrame(etat.raf), [etat]);

  // Démonté en plein geste (exercice retiré…) : la liste se remet à défiler.
  useEffect(() => () => {
    if (etat.phase !== "repos") refDefilement.current.rendre();
  }, [etat]);

  return { ctl, phase, tenu, dedans, scrollProps: propre.scrollProps, zoneProps: propre.zoneProps, defilement };
}

export type Glisse = { ctl: Controle; phase: Phase; tenu: Tenu | null; dedans: boolean };

/**
 * Une rangée de la liste : exercice seul, en-tête, membre ou pied de superset. Elle s'écarte quand la carte tenue la dépasse,
 * se replie pendant le glisser (carte dépliée → forme repliée) et porte le trait rose quand elle est dans un superset.
 * Un exercice tenu porte le trait tant que l'emplacement visé est dans un superset.
 */
export function RangeeGlissable({
  rangee,
  glisse: { ctl, phase, tenu, dedans },
  appuiLong,
  dansSuperset,
  trait,
  ecartHaut = 0,
  ecartBas = 0,
  zoneAppui = false,
  children,
}: {
  rangee: Rangee;
  glisse: Glisse;
  appuiLong: boolean;
  dansSuperset: boolean;
  /** Style du trait rose (bord gauche du superset). */
  trait: object;
  ecartHaut?: number;
  ecartBas?: number;
  /** Vrai : l'appui long ne se prend pas sur toute la rangée mais sur la zone qui reçoit `appui` (séance : la tête de
   *  l'exercice, le numéro d'une série), pour que les rangées imbriquées (séries dans un exercice) gardent chacune le leur. */
  zoneAppui?: boolean;
  children: (poignee: object, appui: object) => ReactNode;
}) {
  const { couleurs } = useTheme();
  const id = rangee.id;
  const estTenue = tenu?.mode === "exercice" && tenu.ids[0] === id;
  const dansBlocTenu = tenu?.mode === "bloc" && tenu.ids.includes(id);
  const explicite = phase !== "repos" && !estTenue && !dansBlocTenu;
  const zero = useRef(new Animated.Value(0)).current;
  const pret = useRef({ ctl, id });
  pret.current = { ctl, id };

  const poignee = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => pret.current.ctl.demarrer(pret.current.id, g.y0),
      onPanResponderMove: (_, g) => pret.current.ctl.deplacer(g.moveY),
      onPanResponderRelease: () => pret.current.ctl.lacher(),
      onPanResponderTerminate: () => pret.current.ctl.lacher(),
    }),
  ).current.panHandlers;

  // Repli pendant le glisser : de la hauteur mesurée vers la forme repliée ; au retour, vers la hauteur mesurée à nouveau.
  const hauteur = useMemo(() => {
    if (!explicite) return undefined;
    const h = ctl.pleine(id);
    return ctl.p.interpolate({ inputRange: [0, 1], outputRange: [h, hauteurReduite(rangee, h)] });
  }, [explicite, phase, ctl, id, rangee.type]);
  const echelle = estTenue ? ctl.leve.interpolate({ inputRange: [0, 1], outputRange: [1, ctl.reduit() ? 1 : 1.03] }) : 1;
  const avecTrait = estTenue ? dedans : dansSuperset;

  const appui = appuiLong
    ? { onTouchStart: (e: GestureResponderEvent) => ctl.toucherDebut(id, e), onTouchMove: ctl.toucherBouge, onTouchEnd: ctl.toucherFin, onTouchCancel: ctl.toucherFin }
    : {};

  return (
    <Animated.View
      {...(zoneAppui ? {} : appui)}
      style={[{ transform: [{ translateY: explicite ? ctl.decalage(id) : zero }] }, estTenue && { zIndex: 10 }]}
    >
      <Animated.View pointerEvents={explicite ? "none" : "auto"} style={[{ transform: [{ translateY: estTenue ? ctl.ty : zero }] }, explicite && { height: hauteur }]}>
        <Animated.View
          style={[
            { transform: [{ scale: echelle }] },
            estTenue && { elevation: 8, backgroundColor: couleurs.s1, borderRadius: rayon.l },
          ]}
        >
          <View onLayout={(e: LayoutChangeEvent) => ctl.mesure(id, e.nativeEvent.layout.height)} style={{ paddingTop: ecartHaut, paddingBottom: ecartBas }}>
            <View style={avecTrait ? trait : undefined}>{children(poignee, zoneAppui ? appui : {})}</View>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** Un superset : ses rangées restent des sœurs dans la liste ; le cadre ne bouge que si l'en-tête le prend en entier. */
export function CadreSuperset({ groupe, glisse: { ctl, tenu }, children }: { groupe: number; glisse: Glisse; children: ReactNode }) {
  const { couleurs } = useTheme();
  const estTenu = tenu?.mode === "bloc" && tenu.groupe === groupe;
  const contient = tenu?.mode === "exercice" && tenu.groupe === groupe;
  const zero = useRef(new Animated.Value(0)).current;
  const echelle = estTenu ? ctl.leve.interpolate({ inputRange: [0, 1], outputRange: [1, ctl.reduit() ? 1 : 1.03] }) : 1;
  // ty et l'échelle sur deux vues : ty est posé image par image depuis le fil JS pendant le glisser (setValue), puis animé
  // au pilote natif au dépôt ; la vue de ty ne porte jamais de hauteur (une propriété de mise en page y planterait le pilote natif).
  return (
    <Animated.View style={[{ transform: [{ translateY: estTenu ? ctl.ty : zero }] }, (estTenu || contient) && { zIndex: 10 }]}>
      <Animated.View
        style={[
          { transform: [{ scale: echelle }] },
          estTenu && { elevation: 8, backgroundColor: couleurs.s1, borderRadius: rayon.l },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
