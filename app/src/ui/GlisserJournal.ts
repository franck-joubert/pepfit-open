import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, type GestureResponderEvent, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance, type ViewInstance } from "react-native";
import { vitesseDefilement } from "../ecrans/glisser";
import { APPUI_LONG_MS, TOLERANCE_PX } from "../ecrans/ordre-sections";
import { rangDeDepot } from "../nutrition/glisser";

// Glisser-déposer du journal, par appui long (350 ms, 8 px de tolérance, comme les autres listes) : l'aliment saisi suit le
// doigt (il est dessiné par-dessus la liste), son emplacement d'arrivée est une place en pointillé vert ; le repas visé se
// cerne de vert, un repas replié s'ouvre après 0,5 s de survol ; la liste défile près des bords. Pas de vibration.

export type Tenu = { id: string; repasId: string; h: number; haut: number };
export type Cible = { repasId: string; rang: number };

const DELAI_OUVERTURE_MS = 500;

export function useGlisserJournal({
  repasIds,
  lignesDe,
  ouvert,
  margeBas,
  onDeposer,
  onOuvrir,
  decalage = 0,
}: {
  /** Haut du bloc qui contient la liste, dans le contenu défilé (la liste est mesurée dans sa page : glissé entre les jours). */
  decalage?: number;
  repasIds: string[];
  /** Ids des aliments d'un repas, dans l'ordre affiché. */
  lignesDe: (repasId: string) => string[];
  ouvert: (repasId: string) => boolean;
  margeBas: number;
  onDeposer: (id: string, repasId: string, rang: number) => void;
  onOuvrir: (repasId: string) => void;
}) {
  const [tenu, setTenu] = useState<Tenu | null>(null);
  const [cible, setCible] = useState<Cible | null>(null);
  const opts = useRef({ repasIds, lignesDe, ouvert, margeBas, onDeposer, onOuvrir, decalage });
  opts.current = { repasIds, lignesDe, ouvert, margeBas, onDeposer, onOuvrir, decalage };
  const scrollRef = useRef<ScrollViewInstance>(null);
  const zoneRef = useRef<ViewInstance>(null);

  const interne = useMemo(() => {
    const ty = new Animated.Value(0);
    const cartes = new Map<string, { y: number; h: number }>();
    const lignes = new Map<string, { y: number; h: number }>();
    // Décalage de la liste des aliments dans sa carte (en-tête et totaux au-dessus).
    const listes = new Map<string, number>();
    const zone = { top: 0, h: 0 };
    const liste = { y: 0 };
    const defil = { y: 0, contenu: 0, dernierAuto: 0 };
    const lp = { timer: null as ReturnType<typeof setTimeout> | null, x: 0, y: 0, arme: false };
    const etat = { id: "", repasId: "", h: 0, haut0: 0, y: 0, yl0: 0, raf: 0, fin: 0, cible: null as Cible | null, ouverture: null as ReturnType<typeof setTimeout> | null };

    const yListe = () => etat.y - zone.top - liste.y - opts.current.decalage + defil.y;
    const hautDe = (id: string, repasId: string) => (cartes.get(repasId)?.y ?? 0) + (listes.get(repasId) ?? 0) + (lignes.get(id)?.y ?? 0);

    const viser = () => {
      const o = opts.current;
      const centre = etat.haut0 + (yListe() - etat.yl0) + etat.h / 2;
      const cartesOrdre = o.repasIds.map((id) => ({ id, ...(cartes.get(id) ?? { y: 0, h: 0 }) }));
      let vers = cartesOrdre[0];
      let meilleure = Infinity;
      for (const c of cartesOrdre) {
        const d = centre < c.y ? c.y - centre : centre > c.y + c.h ? centre - (c.y + c.h) : 0;
        if (d < meilleure) {
          meilleure = d;
          vers = c;
        }
      }
      if (!vers) return;
      const ids = o.lignesDe(vers.id).filter((x) => x !== etat.id);
      const rang = o.ouvert(vers.id)
        ? rangDeDepot(
            centre,
            ids.map((x) => {
              const l = lignes.get(x);
              return l ? vers!.y + (listes.get(vers!.id) ?? 0) + l.y + l.h / 2 : Infinity;
            }),
          )
        : ids.length;
      const c = etat.cible;
      if (c && c.repasId === vers.id && c.rang === rang) return;
      etat.cible = { repasId: vers.id, rang };
      setCible(etat.cible);
      if (etat.ouverture) clearTimeout(etat.ouverture);
      etat.ouverture = null;
      if (!o.ouvert(vers.id)) {
        const rid = vers.id;
        etat.ouverture = setTimeout(() => opts.current.onOuvrir(rid), DELAI_OUVERTURE_MS);
      }
    };

    const boucle = () => {
      if (!lp.arme) return;
      const v = vitesseDefilement(etat.y - zone.top, zone.h - opts.current.margeBas);
      if (v !== 0) {
        const ny = Math.min(Math.max(0, defil.y + v), Math.max(0, defil.contenu - zone.h));
        if (Math.abs(ny - defil.y) > 0.01) {
          scrollRef.current?.scrollTo({ y: ny, animated: false });
          defil.y = ny;
          defil.dernierAuto = Date.now();
        }
      }
      ty.setValue(yListe() - etat.yl0);
      viser();
      etat.raf = requestAnimationFrame(boucle);
    };

    const annuler = () => {
      if (lp.timer) clearTimeout(lp.timer);
      lp.timer = null;
    };

    const armer = (id: string, repasId: string) => {
      const l = lignes.get(id);
      if (!l) return;
      etat.id = id;
      etat.repasId = repasId;
      etat.h = l.h;
      etat.haut0 = hautDe(id, repasId);
      etat.y = lp.y;
      etat.yl0 = yListe();
      etat.cible = null;
      lp.arme = true;
      ty.setValue(0);
      setTenu({ id, repasId, h: l.h, haut: etat.haut0 });
      viser();
      etat.raf = requestAnimationFrame(boucle);
    };

    const lacher = () => {
      lp.arme = false;
      cancelAnimationFrame(etat.raf);
      if (etat.ouverture) clearTimeout(etat.ouverture);
      etat.ouverture = null;
      etat.fin = Date.now();
      const c = etat.cible;
      setTenu(null);
      setCible(null);
      if (c) opts.current.onDeposer(etat.id, c.repasId, c.rang);
    };

    return {
      ty,
      arret: () => {
        cancelAnimationFrame(etat.raf);
        if (etat.ouverture) clearTimeout(etat.ouverture);
      },
      /** Vrai pendant et juste après un glisser : le toucher qui le termine n'ouvre rien et ne supprime rien. */
      recent: () => lp.arme || Date.now() - etat.fin < 400,
      mesureCarte: (id: string) => (e: LayoutChangeEvent) => void cartes.set(id, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }),
      /** Position de la liste des aliments dans la carte du repas. */
      mesureListe: (id: string) => (e: LayoutChangeEvent) => void listes.set(id, e.nativeEvent.layout.y),
      mesureLigne: (id: string) => (e: LayoutChangeEvent) => {
        // Une ligne tenue passe à hauteur 0 : on garde sa vraie mesure.
        if (e.nativeEvent.layout.height > 0 || !lp.arme || etat.id !== id) lignes.set(id, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height });
      },
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
        },
        onContentSizeChange: (_w: number, h: number) => void (defil.contenu = h),
      },
      toucher: (id: string, repasId: string) => ({
        onTouchStart: (e: GestureResponderEvent) => {
          annuler();
          const n = e.nativeEvent;
          if (lp.arme || (n.touches?.length ?? 1) > 1) return;
          lp.x = n.pageX;
          lp.y = n.pageY;
          lp.timer = setTimeout(() => {
            lp.timer = null;
            armer(id, repasId);
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

  useEffect(() => interne.arret, [interne]);

  return { tenu, cible, ...interne, scrollProps: { ...interne.scrollProps, scrollEnabled: tenu == null } };
}
