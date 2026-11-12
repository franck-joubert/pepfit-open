import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewInstance, type ViewProps, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { courbe, fonduSuppression, ressort } from "../theme/mouvement";
import { reduitMouvement } from "./reduit";
import { useDesintegrable } from "./Desintegration";
import { degrades } from "../theme/effets";
import { Icone, type NomIcone } from "./Icone";
import { Texte } from "./Texte";
import { useLangue } from "../i18n/useLangue";
import { t } from "../i18n/index";
import { BOUTON_SUPPRIMER, decalageLigne, departGeste, horizontal, ouvreAuLacher, SORTIE_LIGNE_MS } from "./arbitrage-gestes";

// Fin de course après « Supprimer » : « out » quadratique, en SORTIE_LIGNE_MS (arbitrage-gestes.ts).
const sortieGlisse = Easing.out(Easing.quad);
const repli = Easing.bezier(...courbe.deplacement);

// Une seule ligne ouverte à la fois : en ouvrir une referme la précédente.
// Jonction (29/10 : encoche entre les coins arrondis de la carte et le bouton) : la ligne et le bouton forment un seul
// ensemble dans le cadre arrondi de la ligne (overflow caché), coins extérieurs arrondis seulement. Tant que la ligne est
// décalée, un contenu qui dessine sa propre carte arrondie (useLigneDecalee) perd ses coins de droite, à la jonction ; revenue
// en place, elle retrouve ses quatre coins (cachés dans le cadre pendant le geste, ils ne se voient jamais changer).
let ouverte: { fermer: () => void; cadre?: { x: number; y: number; l: number; h: number } } | null = null;

/**
 * Toucher ailleurs referme la ligne ouverte (planche sport-programmes-routines v2, B8, validée le 29/10) : la racine de l'appli
 * appelle ceci à chaque début de toucher (capture) ; hors du cadre de la ligne ouverte, la ligne se referme et le toucher est
 * pris (vrai) : il ne fait rien d'autre, il ne fait que refermer (une autre carte touchée ne s'ouvre pas, un défilement non plus).
 * Sur la ligne elle-même (son « Supprimer » compris), rien n'est pris.
 */
export function toucherAilleurs(x: number, y: number): boolean {
  const o = ouverte;
  if (!o) return false;
  const c = o.cadre;
  if (c && x >= c.x && x <= c.x + c.l && y >= c.y && y <= c.y + c.h) return false;
  o.fermer();
  return true;
}

/**
 * Ligne supprimable (option A d'Alex, 28/10) : glissée vers la gauche, elle suit le doigt, 100 % opaque, et découvre à droite
 * le bouton rouge « Supprimer » (corbeille et libellé nets, dans la largeur découverte). Le glissé ne supprime jamais : lâchée,
 * la ligne reste ouverte sur le bouton ou se referme (ressort, vitesse du doigt) ; tirée plus loin, elle suit, freinée. Toucher
 * « Supprimer » confirme : la ligne finit de sortir ; dans un Desintegrable, la ligne et le fond se désintègrent, puis la liste
 * se referme ; ailleurs, sa hauteur se replie ; puis `onSupprimer` (l'écran propose « Annuler » quelques secondes). Toucher la
 * ligne ouverte, ou glisser vers la droite, la referme. Un glissé parti de la ligne est à elle (arbitrage-gestes.ts) : il ne
 * change pas de jour. translateX (pilote natif) et hauteur (pilote JS) sont sur deux vues distinctes. Pas de vibration.
 * Composant unique de toutes les lignes supprimables.
 */
const ContexteDecalee = createContext(false);

/**
 * Vrai tant que la ligne qui contient ce contenu est décalée (geste, ouverte, retour en place) : une carte arrondie met alors ses
 * coins de droite à 0, pour une jonction nette avec le bouton « Supprimer ».
 */
export function useLigneDecalee(): boolean {
  return useContext(ContexteDecalee);
}

/** Style à ajouter à une carte arrondie posée dans une ligne supprimable : coins de droite droits quand elle est décalée. */
export const coinsJonction = (decalee: boolean) => (decalee ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : null);

/** Vue arrondie construite hors de la ligne puis posée dedans (LigneSerie) : lit l'état de la ligne au bon endroit. */
export function VueDecalable({ style, ...props }: ViewProps) {
  const decalee = useLigneDecalee();
  return <View {...props} style={[style, coinsJonction(decalee)]} />;
}

export function GlisserSupprimer({
  actif = true,
  cle,
  onSupprimer,
  style,
  fondContenu,
  action,
  libelle,
  choix = false,
  children,
}: {
  /** Une fonction est lue au début de chaque geste (un autre geste vient de prendre la ligne, par exemple). */
  actif?: boolean | (() => boolean);
  /** Identité de la ligne : quand elle change (liste indexée par rang), la ligne revient en place. */
  cle?: string;
  onSupprimer: () => void;
  style?: StyleProp<ViewStyle>;
  /** Fond du contenu qui glisse (le fond de l'écran par défaut) ; transparent pour une carte qui a le sien. Le rouge n'est
   *  jamais dessous : il n'occupe que la part découverte, à droite de la ligne. */
  fondContenu?: string;
  /** Autre geste que « Supprimer », qui ne détruit rien (« Ignorer » une activité détectée) : bouton tonal, pas rouge. */
  action?: { libelle: string; icone: NomIcone };
  /** Libellé du bouton rouge à la place de « Supprimer » (« Révoquer » une IA connectée). */
  libelle?: string;
  /** Un choix précède la suppression (« Cette séance / Toute la série ») : « Supprimer » touché ne fait pas sortir la ligne, elle
   *  se referme et `onSupprimer` ouvre la feuille de choix ; l'écran marque la ligne s'il la retire ensuite. */
  choix?: boolean;
  children: ReactNode;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const sur = degrades.entrainement.sur;
  const [largeurLigne, setLargeurLigne] = useState(0);
  const [sortie, setSortie] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  // Décalée : du premier mouvement jusqu'au retour complet en place (coins de la carte à la jonction).
  const [decalee, setDecalee] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const h = useRef(new Animated.Value(0)).current;
  // Pendant la désintégration (seulement) : la ligne capturée se cache, le fond rouge s'efface.
  const vue = useRef(new Animated.Value(1)).current;
  const rouge = useRef(new Animated.Value(1)).current;
  const cadre = useRef<ViewInstance>(null);
  const des = useDesintegrable();
  const etat = useRef({ largeur: 0, hauteur: 0, ouvert: false, depart: 0, actif, onSupprimer, des, choix });
  etat.current.actif = actif;
  etat.current.onSupprimer = onSupprimer;
  etat.current.des = des;
  etat.current.choix = choix;

  useEffect(() => {
    des?.cible(cadre);
    return () => des?.cible(null);
  }, [des]);

  const etatDes = des?.etat;
  const grains = !!des?.grains;
  const parentSort = des?.sortant && etatDes !== "sort";
  useEffect(() => {
    // Un parent sort (dernière série d'un exercice) : la ligne se remet en place pour la capture de la carte entière.
    if (parentSort) {
      x.setValue(0);
      rouge.setValue(0);
    }
  }, [parentSort, x, rouge]);
  useEffect(() => {
    if (etatDes === "sort" && grains) {
      // La ligne et le fond ont été capturés ensemble : les grains, déjà dessinés, les remplacent à l'image suivante. Sans
      // grains (réduire les animations, capture impossible), la ligne reste et s'efface avec le fondu de l'élément.
      Animated.sequence([Animated.delay(16), Animated.parallel([Animated.timing(vue, { toValue: 0, duration: 0, useNativeDriver: true }), Animated.timing(rouge, { toValue: 0, duration: 0, useNativeDriver: true })])]).start();
    } else if (etatDes === "entre") {
      x.setValue(0);
      vue.setValue(1);
      rouge.setValue(1);
    }
  }, [etatDes, grains, x, vue, rouge]);

  const actions = useMemo(() => {
    const e = etat.current;
    const moi: { fermer: () => void; cadre?: { x: number; y: number; l: number; h: number } } = { fermer: () => placer(false) };
    const placer = (ouvrir: boolean, vx = 0) => {
      e.ouvert = ouvrir;
      setOuvert(ouvrir);
      if (ouvrir) {
        if (ouverte && ouverte !== moi) ouverte.fermer();
        ouverte = moi;
        // Cadre de la ligne à l'écran : un toucher dedans n'est pas « ailleurs ».
        cadre.current?.measureInWindow((x0, y0, l, hh) => {
          if (ouverte === moi) moi.cadre = { x: x0, y: y0, l, h: hh };
        });
      } else if (ouverte === moi) ouverte = null;
      const vers = ouvrir ? -BOUTON_SUPPRIMER : 0;
      if (ouvrir) setDecalee(true);
      if (reduitMouvement()) {
        x.setValue(vers);
        if (!ouvrir) setDecalee(false);
      } else
        Animated.spring(x, { toValue: vers, velocity: vx, useNativeDriver: true, ...ressort.retour }).start(({ finished }) => {
          if (finished && !e.ouvert) setDecalee(false);
        });
    };
    const confirmer = () => {
      if (e.choix) {
        placer(false);
        e.onSupprimer();
        return;
      }
      if (ouverte === moi) ouverte = null;
      if (reduitMouvement()) {
        if (e.des) e.des.marquer();
        e.onSupprimer();
        return;
      }
      Animated.timing(x, { toValue: -e.largeur, duration: SORTIE_LIGNE_MS, easing: sortieGlisse, useNativeDriver: true }).start(() => {
        if (e.des) {
          e.des.marquer();
          e.onSupprimer();
          // La liste n'a pas retiré la ligne (erreur, refus) : elle revient, fermée.
          setTimeout(() => {
            if (etat.current.des?.etat === "vu") placer(false);
          }, 1000);
          return;
        }
        h.setValue(e.hauteur);
        setSortie(true);
        Animated.timing(h, { toValue: 0, duration: fonduSuppression.resserre, easing: repli, useNativeDriver: false }).start(() => e.onSupprimer());
      });
    };
    const estActif = () => {
      const a = e.actif;
      return typeof a === "function" ? a() : a;
    };
    const pan = PanResponder.create({
      // Départ du doigt sur la ligne : le glissé horizontal sera à elle (la zone du jour a effacé la marque juste avant).
      onStartShouldSetPanResponderCapture: () => {
        if (estActif()) departGeste.ligne();
        return false;
      },
      onMoveShouldSetPanResponder: (_, g) => estActif() && horizontal(g.dx, g.dy),
      onPanResponderGrant: () => {
        x.stopAnimation();
        setDecalee(true);
        e.depart = e.ouvert ? -BOUTON_SUPPRIMER : 0;
      },
      onPanResponderMove: (_, g) => x.setValue(decalageLigne(e.depart + g.dx)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => placer(ouvreAuLacher(decalageLigne(e.depart + g.dx), g.vx), g.vx),
      onPanResponderTerminate: () => placer(e.ouvert),
    });
    return { pan, placer, confirmer, moi };
  }, [x, h]);

  useEffect(() => {
    etat.current.ouvert = false;
    setOuvert(false);
    setDecalee(false);
    x.setValue(0);
    setSortie(false);
  }, [cle, x]);
  useEffect(() => () => void (ouverte === actions.moi && (ouverte = null)), [actions]);

  // Le rouge suit le bord droit de la ligne : il n'occupe que la part découverte (translateX = largeur + x).
  const l = largeurLigne;
  return (
    <Animated.View
      ref={cadre}
      collapsable={false}
      {...actions.pan.panHandlers}
      onLayout={(ev) => {
        etat.current.largeur = ev.nativeEvent.layout.width;
        setLargeurLigne(ev.nativeEvent.layout.width);
        if (!sortie) etat.current.hauteur = ev.nativeEvent.layout.height;
      }}
      style={[style, styles.cadre, sortie && { height: h }]}
    >
      {l > 0 ? (
        <Animated.View
          style={[
            styles.fond,
            { backgroundColor: action ? couleurs.s3 : couleurs.rate, opacity: rouge, transform: [{ translateX: x.interpolate({ inputRange: [-l, 0], outputRange: [0, l], extrapolate: "clamp" }) }] },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action?.libelle ?? libelle ?? t("ui.supprimer")}
            disabled={!ouvert}
            onPress={actions.confirmer}
            style={({ pressed }) => [styles.bouton, pressed && styles.presse]}
          >
            <Icone nom={action?.icone ?? "trash"} couleur={action ? couleurs.t1 : sur} taille={20} />
            <Texte variante="corps" numberOfLines={1} style={{ color: action ? couleurs.t1 : sur, fontFamily: "Inter-Medium", fontSize: 13 }}>
              {action?.libelle ?? libelle ?? t("ui.supprimer")}
            </Texte>
          </Pressable>
        </Animated.View>
      ) : null}
      <Animated.View collapsable={false} style={{ backgroundColor: fondContenu ?? couleurs.bg, opacity: vue, transform: [{ translateX: x }] }}>
        <ContexteDecalee.Provider value={decalee}>{children}</ContexteDecalee.Provider>
        {/* Ouverte : toucher la ligne la referme (sans ouvrir la ligne). */}
        {ouvert ? <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => actions.placer(false)} /> : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cadre: { overflow: "hidden" },
  // Toute la largeur, posée à droite de la ligne ; le bouton occupe la part découverte quand la ligne est ouverte.
  fond: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" },
  bouton: { width: BOUTON_SUPPRIMER, alignItems: "center", justifyContent: "center", gap: espace.xs },
  // Appui : un voile sombre, pas de transparence (le rouge et le libellé restent pleins).
  presse: { backgroundColor: "rgba(0,0,0,0.16)" },
});
