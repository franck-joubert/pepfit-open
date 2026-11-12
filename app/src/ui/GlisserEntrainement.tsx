import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from "react-native";
import { vitesseDefilement } from "../ecrans/glisser";
import { courbe, duree } from "../theme/mouvement";
import {
  APPUI_LONG_MS, ciblePlusProche, ciblesRoutine, cleRangee, decalageSection, decalagesRoutine, HAUTEUR_SECTION, hauts, MILIEU_ENTETE, rangVise, TOLERANCE_PX,
  type Candidat, type CibleRoutine, type Rangee,
} from "../ecrans/ordre-sections";
import { reduitMouvement } from "./reduit";
import { signalerDefilement } from "./aura-etat";

// Glisser-déposer d'Entraînements, par appui long (350 ms, 8 px de tolérance, comme ui/Glisser) :
// - un en-tête de section : toutes les sections se replient, l'en-tête suit le doigt, les voisines s'écartent (planche 3 bis) ;
// - une carte de routine : elle suit le doigt, les voisines s'écartent ; on la pose dans sa section, dans une autre, ou sur
//   l'en-tête d'une section repliée ou le cadre d'une section vide (elle va alors en fin de section).
// La liste défile près des bords. Pas de vibration : réservée aux records et aux erreurs.

const courbeVoisines = Easing.bezier(...courbe.sortie);
const borne = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Air laissé au-dessus d'une section montrée. */
const espaceHaut = 8;
/** L'élément tenu glisse un peu à droite : on voit ce qui se passe dessous (27/10). */
const decalageTenu = 16;

export type Tenu = { genre: "section" | "routine"; id: string };

export function useGlisserEntrainement({
  sections,
  rangees,
  margeBas,
  onDeposerSections,
  onDeposerRoutine,
}: {
  /** Ids des sections dans l'ordre affiché. */
  sections: string[];
  /** La liste à plat telle qu'affichée ; les hauteurs sont celles mesurées ici (h ignoré). */
  rangees: Rangee[];
  /** Bas de la zone couvert par le menu flottant : le défilement s'y déclenche au-dessus. */
  margeBas: number;
  onDeposerSections: (ids: string[]) => void;
  onDeposerRoutine: (id: string, cible: CibleRoutine) => void;
}) {
  const [tenu, setTenu] = useState<Tenu | null>(null);
  /** Section visée sans écart (en-tête repliée ou cadre vide) : elle s'éclaire. */
  const [survol, setSurvol] = useState<string | null>(null);
  const opts = useRef({ sections, rangees, margeBas, onDeposerSections, onDeposerRoutine });
  opts.current = { sections, rangees, margeBas, onDeposerSections, onDeposerRoutine };
  const scrollRef = useRef<ScrollViewInstance>(null);
  const zoneRef = useRef<ViewInstance>(null);

  const interne = useMemo(() => {
    const ty = new Animated.Value(0);
    const tx = new Animated.Value(0);
    const registre = new Map<string, Animated.Value>();
    const mesures = new Map<string, number>();
    const posSections = new Map<string, number>();
    const zone = { top: 0, h: 0 };
    const liste = { y: 0 };
    const defil = { y: 0, contenu: 0, dernierAuto: 0 };
    const lp = { timer: null as ReturnType<typeof setTimeout> | null, x: 0, y: 0, arme: false };
    const etat = {
      genre: "section" as Tenu["genre"],
      id: "",
      ids: [] as string[],
      a: 0,
      vers: 0,
      grab: 0,
      y: 0,
      yl0: 0,
      rangees: [] as Rangee[],
      tops: [] as number[],
      candidats: [] as Candidat[],
      cible: null as Candidat | null,
      fin: 0,
      raf: 0,
    };
    /** Section à montrer (vient d'être créée) : on défile vers elle une fois la feuille fermée et la section mise en page. */
    const aMontrer = { id: null as string | null, pret: false, apres: undefined as (() => void) | undefined };
    const essayerMontrer = () => {
      const y = aMontrer.id == null ? undefined : posSections.get(aMontrer.id);
      if (!aMontrer.pret || y == null) return;
      const apres = aMontrer.apres;
      aMontrer.id = null;
      scrollRef.current?.scrollTo({ y: Math.max(0, liste.y + y - espaceHaut), animated: !reduitMouvement() });
      apres?.();
    };

    const decalage = (cle: string) => {
      let v = registre.get(cle);
      if (!v) {
        v = new Animated.Value(0);
        registre.set(cle, v);
      }
      return v;
    };
    const animer = (cle: string, toValue: number) =>
      Animated.timing(decalage(cle), { toValue, duration: reduitMouvement() ? 0 : duree.depot, easing: courbeVoisines, useNativeDriver: true }).start();
    /** Le doigt dans le repère de la liste (défilement compris). */
    const yListe = () => etat.y - zone.top - liste.y + defil.y;

    const suivre = () => {
      const yl = yListe();
      if (etat.genre === "section") {
        const haut = yl - etat.grab;
        ty.setValue(haut - etat.a * HAUTEUR_SECTION);
        const vers = rangVise(haut + MILIEU_ENTETE, etat.ids.length);
        if (vers === etat.vers) return;
        etat.vers = vers;
        etat.ids.forEach((id, k) => animer(`s:${id}`, decalageSection(k, etat.a, vers)));
        return;
      }
      const d = yl - etat.yl0;
      ty.setValue(d);
      const c = ciblePlusProche(etat.candidats, etat.tops[etat.a]! + etat.rangees[etat.a]!.h / 2 + d);
      if (!c || c === etat.cible) return;
      etat.cible = c;
      const dec = decalagesRoutine(etat.rangees, etat.a, c);
      etat.rangees.forEach((r, i) => i !== etat.a && animer(cleRangee(r), dec[i]!));
      setSurvol(c.cible.ecart ? null : c.cible.sectionId);
    };

    const boucle = () => {
      if (!lp.arme) return;
      const v = vitesseDefilement(etat.y - zone.top, zone.h - opts.current.margeBas);
      if (v !== 0) {
        const ny = borne(defil.y + v, 0, Math.max(0, defil.contenu - zone.h));
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

    const armer = (t: Tenu) => {
      const o = opts.current;
      etat.genre = t.genre;
      etat.id = t.id;
      etat.y = lp.y;
      const yl = yListe();
      if (t.genre === "section") {
        etat.ids = o.sections;
        etat.a = o.sections.indexOf(t.id);
        if (etat.a < 0) return;
        etat.vers = etat.a;
        // Le doigt garde sa place sur l'en-tête : pas de saut quand les sections se replient.
        etat.grab = yl - (posSections.get(t.id) ?? 0);
      } else {
        etat.rangees = o.rangees.map((r) => ({ ...r, h: mesures.get(cleRangee(r)) ?? 0 }));
        etat.a = etat.rangees.findIndex((r) => r.genre === "carte" && r.id === t.id);
        if (etat.a < 0) return;
        etat.tops = hauts(etat.rangees);
        etat.candidats = ciblesRoutine(etat.rangees, etat.a);
        etat.cible = ciblePlusProche(etat.candidats, etat.tops[etat.a]! + etat.rangees[etat.a]!.h / 2) ?? null;
        etat.yl0 = yl;
      }
      lp.arme = true;
      registre.forEach((v) => v.setValue(0));
      ty.setValue(0);
      tx.setValue(0);
      Animated.timing(tx, { toValue: decalageTenu, duration: reduitMouvement() ? 0 : duree.relache, easing: courbeVoisines, useNativeDriver: true }).start();
      setSurvol(null);
      setTenu(t);
      etat.raf = requestAnimationFrame(boucle);
    };

    const lacher = () => {
      lp.arme = false;
      cancelAnimationFrame(etat.raf);
      etat.fin = Date.now();
      const o = opts.current;
      if (etat.genre === "section") {
        if (etat.vers !== etat.a) {
          const l = [...etat.ids];
          const [id] = l.splice(etat.a, 1);
          l.splice(etat.vers, 0, id!);
          o.onDeposerSections(l);
        }
      } else if (etat.cible) {
        o.onDeposerRoutine(etat.id, etat.cible.cible);
      }
      setSurvol(null);
      setTenu(null);
    };

    return {
      ty,
      tx,
      decalage,
      reinitialiser: () => {
        ty.setValue(0);
        registre.forEach((v) => v.setValue(0));
      },
      arret: () => cancelAnimationFrame(etat.raf),
      /** Vrai pendant et juste après un glisser : le toucher qui le termine n'ouvre rien. */
      recent: () => lp.arme || Date.now() - etat.fin < 400,
      /** Hauteur d'une rangée (onLayout de son enveloppe, marges comprises). */
      mesure: (r: Rangee) => (e: LayoutChangeEvent) => void mesures.set(cleRangee(r), e.nativeEvent.layout.height),
      /** Haut d'une section dans la liste. */
      posSection: (id: string) => (e: LayoutChangeEvent) => {
        posSections.set(id, e.nativeEvent.layout.y);
        if (id === aMontrer.id) essayerMontrer();
      },
      /** Fait défiler jusqu'à la section `id` (sans animation si « Supprimer les animations »), puis `apres`. */
      montrer: (id: string, apres?: () => void) => {
        Object.assign(aMontrer, { id, pret: false, apres });
        setTimeout(() => {
          if (aMontrer.id !== id) return;
          aMontrer.pret = true;
          essayerMontrer();
        }, duree.feuilleSortie);
      },
      reduit: reduitMouvement,
      listeProps: { onLayout: (e: LayoutChangeEvent) => void (liste.y = e.nativeEvent.layout.y) },
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
      toucher: (t: Tenu) => ({
        onTouchStart: (e: GestureResponderEvent) => {
          annuler();
          const n = e.nativeEvent;
          if (lp.arme || (n.touches?.length ?? 1) > 1) return;
          lp.x = n.pageX;
          lp.y = n.pageY;
          lp.timer = setTimeout(() => {
            lp.timer = null;
            armer(t);
          }, APPUI_LONG_MS);
        },
        onTouchMove: (e: GestureResponderEvent) => {
          const n = e.nativeEvent;
          if (lp.arme) etat.y = n.pageY;
          else if (lp.timer && Math.hypot(n.pageX - lp.x, n.pageY - lp.y) > TOLERANCE_PX) annuler();
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

  // Le nouvel ordre et la remise à zéro des décalages tombent dans la même image.
  useLayoutEffect(() => {
    if (tenu == null) interne.reinitialiser();
  }, [tenu, interne]);
  useEffect(() => interne.arret, [interne]);

  return { tenu, survol, ...interne, scrollProps: { ...interne.scrollProps, scrollEnabled: tenu == null } };
}
