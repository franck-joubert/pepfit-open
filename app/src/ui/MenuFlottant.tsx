import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentRef, type ReactNode, type RefObject } from "react";
import { Keyboard, PanResponder, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { router, usePathname, useRouter } from "expo-router";
import Animated, { Easing, FadeIn, LinearTransition, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import { useTheme } from "../theme";
import { arretsIconeActive, degrades, menu as couleursMenu, type Partie } from "../theme/effets";
import { menuFlottant as m } from "../theme/mouvement";
import { espace, menuOnglets, police } from "../theme/typo";
import { Icone } from "./Icone";
import { barreVisible, dimensionsMenu, estOnglet, menuVisible, ONGLETS, ongletsVisibles, premierOnglet, rangDePartie } from "./menu-flottant";
import { DegradeFond } from "./DegradeFond";
import { ongletVoisin, prendGlisse, sensGlisse } from "./glisser-jour";
import { useApp } from "../ecrans/contexte";
import { eveillerOnglet } from "./eveil-onglet";
import { retoucher } from "./onglet-retouche";
import { signalerChemin } from "./onglet-quitte";
import { garderRouteur } from "./garde-routeur";
import { useReduit } from "./reduit";
import { FeuilleErreur } from "./FeuilleMessage";
import { arriveeDebut } from "./3d/arrivee";
import { FOND_PARTIE, partieDe } from "./partie";
import { Texte } from "./Texte";
import { centreOnglet, couleursVague, ECHANTILLONS, rvbDe, type Rvb } from "./vague-menu";
import { useLangue } from "../i18n/useLangue";
import { t } from "../i18n/index";

// Menu flottant des onglets (refonte du 26/10, fonds du 27/10) : pilule de verre dépoli détachée du bas, teintée du
// dégradé de la section, icônes rondes blanches ; l'onglet actif est sur un rond blanc, libellé noir, icône au dégradé
// du geste principal de sa partie. Le contenu défile dessous jusqu'au bas de l'écran et s'efface dans un dégradé du
// fond, plein derrière la barre système. Rendu une seule fois au-dessus de la pile, il n'existe que sur les quatre
// onglets et ne se cache plus au défilement.
// Flou : expo-blur (RenderEffect, Android 12+) sur la pile enveloppée dans un BlurTargetView. Teinte : canevas Skia dont
// les couleurs sont recalculées à chaque image sur le thread UI ; au changement de section, la nouvelle teinte arrive en
// vague au bord fondu, de l'ancien onglet vers le nouveau, au rythme de la pastille (vague-menu.ts). « Réduire les
// animations » : fond sans flou, simple fondu des teintes.
// La teinte est celle de la PAGE affichée (partieDe(chemin), la même table que le hook usePartie et que l'aura), pas celle du
// dernier onglet actif. La vague part de la place de la
// couleur d'avant et va vers celle de la couleur d'après dans la barre (rangDePartie) ; une couleur sans onglet visible
// (Accueil bleu, onglet éteint) se fond sur place, sans vague.

const bezier = (c: readonly [number, number, number, number]) => Easing.bezier(c[0], c[1], c[2], c[3]);
const transition = LinearTransition.duration(m.elargir).easing(bezier(m.courbeElargir));
const apparition = FadeIn.duration(m.libelle).easing(bezier(m.courbeLibelle));
const courbeCacher = bezier(m.courbeCacher);
const courbeVague = bezier(m.courbeElargir);

/** Par partie : arrêts du dégradé de la partie (sRGB 0 → 1) et voile d'assombrissement. */
type Teinte = { arrets: { offset: number; rvb: Rvb }[]; sombre: number };
const PARTIES: readonly Partie[] = ["accueil", "entrainement", "nutrition", "sante", "fil"];
const TEINTES: Teinte[] = PARTIES.map((p) => ({ arrets: degrades[p].arrets.map((a) => ({ offset: a.offset, rvb: rvbDe(a.couleur) })), sombre: couleursMenu.jour.assombrir[p] }));
/** Icône de l'onglet actif : dégradé du geste principal de sa partie, lisible sur le rond blanc. */
const ICONES_ACTIVES = Object.fromEntries(ONGLETS.map((o) => [o.chemin, arretsIconeActive(partieDe(o.chemin))]));
/** Glissé sur la pilule : 40 px (le quart de 160) ou un geste vif changent d'onglet. */
const LARGEUR_GLISSE = 160;
/** Hauteur du dégradé du fond sous le menu, sans l'aplat derrière la barre système : il démarre au niveau du haut du menu (06/11), pas au-dessus. */
const hauteurFondu = menuOnglets.hauteur + menuOnglets.ecartBas;
const POSITIONS = Array.from({ length: ECHANTILLONS }, (_, i) => i / (ECHANTILLONS - 1));

/** Entoure la pile d'écrans et dessine le menu par-dessus. */
export function FournisseurMenu({ children }: { children: ReactNode }) {
  const ici = usePathname();
  // Activité recréée (police, langue…) : le `router` global reste lié à cette racine, pas à l'ancienne (ui/garde-routeur).
  const actions = useRouter();
  useLayoutEffect(() => garderRouteur(router as unknown as Record<string, unknown>, actions as unknown as Record<string, unknown>), [actions]);
  // Entraînements et Nutrition reviennent à aujourd'hui quand on les quitte pour un autre onglet (ui/onglet-quitte).
  useEffect(() => signalerChemin(ici, estOnglet(ici)), [ici]);
  const cible = useRef<ComponentRef<typeof View>>(null);
  return (
    <>
      <BlurTargetView ref={cible} style={styles.cible}>
        {children}
      </BlurTargetView>
      {/* Hors de la cible du flou : sinon le verre floute ce voile presque opaque au lieu de la page. */}
      <Fondu chemin={ici} />
      <MenuFlottant chemin={ici} cible={cible} />
      {/* Écritures ratées (signalerErreur) : une feuille pour toute l'appli. */}
      <FeuilleErreur />
    </>
  );
}

// Un onglet peut cacher le menu le temps d'un mode (Modifier l'accueil) : compteur partagé, remis à zéro au démontage.
let masques = 0;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());
const sAbonner = (f: () => void) => {
  abonnes.add(f);
  return () => void abonnes.delete(f);
};

/** Menu montré : sur un onglet, sans clavier ni mode qui le cache. */
function useMontre(chemin: string) {
  const [clavier, setClavier] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => setClavier(true));
    const b = Keyboard.addListener("keyboardDidHide", () => setClavier(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  const masque = useSyncExternalStore(sAbonner, () => masques > 0);
  return menuVisible(chemin) && !clavier && !masque;
}

/** Valeur animée de la présence du menu (0 → 1). */
function usePresence(montre: boolean) {
  const v = useSharedValue(montre ? 1 : 0);
  useEffect(() => {
    v.value = withTiming(montre ? 1 : 0, { duration: m.cacher, easing: courbeCacher });
  }, [montre, v]);
  return v;
}

/**
 * Dégradé du fond sous le menu : transparent `fondu` px au-dessus de la pilule, plein derrière la barre système (noir
 * la nuit, fond teinté de la partie le jour). Dans la cible du flou : le verre le floute avec le contenu.
 */
export function Fondu({ chemin }: { chemin: string }) {
  const { mode, couleurs } = useTheme();
  // Largeur de l'écran en dp, relue à chaque changement (Fold déplié, plié, rotation) : le dessin est posé sur des nombres, pas
  // sur « 100 % » que le natif résout lui-même (docs/degrade-bas/README.md).
  const largeur = useWindowDimensions().width;
  // le jour, le fond teinté de la partie (quasi-blanc), comme la page sous l'aura
  const couleur = mode === "jour" ? couleurs[FOND_PARTIE[partieDe(chemin)]] : couleursMenu[mode].fondu;
  const bas = useSafeAreaInsets().bottom;
  const v = usePresence(useMontre(chemin));
  const visible = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.View pointerEvents="none" style={[styles.fondu, { width: largeur }, visible]}>
      <DegradeFond id="fonduMenu" couleur={couleur} largeur={largeur} hauteur={hauteurFondu} />
      <View style={{ height: bas, backgroundColor: couleur }} />
    </Animated.View>
  );
}

/** Vrai tant qu'un écran cache le menu (mode Modifier) : la bulle de séance se cache avec lui. */
export function useMenuMasque() {
  return useSyncExternalStore(sAbonner, () => masques > 0);
}

/** Cache le menu tant que `masquer` est vrai. */
export function useMasquerMenu(masquer: boolean) {
  useEffect(() => {
    if (!masquer) return;
    masques++;
    prevenir();
    return () => {
      masques--;
      prevenir();
    };
  }, [masquer]);
}

/** Marge de fin de liste d'un onglet : rien n'est caché sous le menu. */
export function useMargeMenu() {
  return useSafeAreaInsets().bottom + menuOnglets.marge;
}

/** Place réservée sous un élément fixé en bas d'un onglet (bandeau de séance) : il reste au-dessus du menu. */
export function useEspaceMenu() {
  return useSafeAreaInsets().bottom + menuOnglets.hauteur + 2 * menuOnglets.ecartBas;
}

/**
 * Bas d'un onglet qui porte un élément fixe (bandeau de séance) : il flotte au-dessus du menu et le contenu passe
 * dessous. `onHauteur` reçoit la hauteur de toute la zone flottante (élément, menu, inset bas) : la marge de fin de liste.
 */
export function BasFlottant({ children, onHauteur }: { children: ReactNode; onHauteur: (h: number) => void }) {
  const espaceMenu = useEspaceMenu();
  return (
    <View pointerEvents="box-none" style={[styles.basFlottant, { paddingBottom: espaceMenu }]} onLayout={(e) => onHauteur(e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}

/**
 * Fond de la pilule : flou, puis teinte de la page en vague. Plus large que la pilule, que son parent découpe. `partie` : celle
 * de la page affichée ; `rang` : sa place dans la barre (la vague part de celle d'avant) ; `n` : nombre d'onglets de la barre.
 */
function Fond({ partie, rang, n, cible, reduit, flou, rayonPilule }: { partie: Partie; rang: number; n: number; cible: RefObject<ComponentRef<typeof View> | null>; reduit: boolean; flou: boolean; rayonPilule: number }) {
  const { mode } = useTheme();
  const c = couleursMenu[mode];
  const largeur = useWindowDimensions().width;
  const [l, setL] = useState(0);
  const mesurer = (e: LayoutChangeEvent) => setL(e.nativeEvent.layout.width);

  const teinte = PARTIES.indexOf(partie);
  const avantT = useSharedValue(teinte);
  const apresT = useSharedValue(teinte);
  const avantR = useSharedValue(rang);
  const apresR = useSharedValue(rang);
  const e = useSharedValue(1);
  const vu = useRef({ teinte, rang });
  useEffect(() => {
    if (vu.current.teinte === teinte && vu.current.rang === rang) return;
    const de = vu.current;
    vu.current = { teinte, rang };
    // Les valeurs changent dans la même image du thread UI : la vague part toujours de zéro.
    scheduleOnUI(() => {
      "worklet";
      avantT.value = de.teinte;
      apresT.value = teinte;
      avantR.value = de.rang;
      apresR.value = rang;
      e.value = 0;
      e.value = withTiming(1, { duration: m.elargir, easing: courbeVague });
    });
  }, [teinte, rang, avantT, apresT, avantR, apresR, e]);

  const couleurs = useDerivedValue(() => {
    const a = TEINTES[avantT.value]!;
    const b = TEINTES[apresT.value]!;
    const sens = apresR.value - avantR.value;
    // Même place dans la barre (couleur sans onglet, ou deux pages du même onglet) : un fondu sur place, pas de vague.
    return couleursVague(a.arrets, a.sombre, b.arrets, b.sombre, centreOnglet(avantR.value, n), sens, e.value, c.opacite, reduit || sens === 0);
  }, [n, reduit, c.opacite]);

  return (
    <Animated.View layout={transition} style={[styles.verre, { borderRadius: rayonPilule }]} onLayout={mesurer} pointerEvents="none">
      {reduit ? (
        <View style={[styles.couche, { width: largeur, backgroundColor: c.sansFlou }]} />
      ) : flou ? (
        <BlurView
          blurTarget={cible}
          blurMethod="dimezisBlurViewSdk31Plus"
          tint={c.verre.teinte}
          intensity={c.verre.intensite}
          blurReductionFactor={c.verre.reduction}
          style={[styles.couche, { width: largeur }]}
        />
      ) : null}
      {l > 0 ? (
        <Canvas style={[styles.couche, { width: largeur }]}>
          <Rect x={0} y={0} width={largeur} height={menuOnglets.hauteur}>
            <LinearGradient start={vec(0, 0)} end={vec(l, 0)} colors={couleurs} positions={POSITIONS} />
          </Rect>
        </Canvas>
      ) : null}
    </Animated.View>
  );
}

/** Vers un onglet ; Santé : la mesure de son arrivée part du geste (ui/3d/arrivee.ts). */
function allerA(chemin: Parameters<typeof router.navigate>[0]) {
  if (chemin === "/health") arriveeDebut();
  // La partie visée est dégelée dans la même mise à jour que la navigation (ui/eveil-onglet) : pas d'écran vide entre les deux.
  if (typeof chemin === "string") eveillerOnglet(chemin);
  router.navigate(chemin);
}

function MenuFlottant({ chemin, cible }: { chemin: string; cible: RefObject<ComponentRef<typeof View> | null> }) {
  useLangue();
  const { mode } = useTheme();
  const c = couleursMenu[mode];
  const bas = useSafeAreaInsets().bottom;
  const reduit = useReduit();
  // Quatre entrées : barre resserrée sous 380 dp (écran extérieur du Fold, planche fil D4).
  const largeurEcran = useWindowDimensions().width;
  const d = dimensionsMenu(largeurEcran, menuOnglets);
  const onglet = estOnglet(chemin);
  const montre = useMontre(chemin);
  const v = usePresence(montre);
  // Menu caché (écran poussé, clavier, mode Modifier) : le flou est démonté à la fin de la sortie, sinon il capture la pile à
  // chaque image sous son opacité nulle (docs/AUDIT-PERF.md, M16) ; il revient dès que le menu remonte.
  const [flou, setFlou] = useState(montre);
  useEffect(() => {
    if (montre) {
      setFlou(true);
      return;
    }
    const minuterie = setTimeout(() => setFlou(false), m.cacher);
    return () => clearTimeout(minuterie);
  }, [montre]);
  const sortie = menuOnglets.hauteur + menuOnglets.ecartBas + bas;
  // « Réduire les animations » : fondu seul, sans glissé.
  const anime = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: reduit ? 0 : (1 - v.value) * sortie }],
  }));

  // Onglets éteints dans le profil : hors du menu (aucun n'est obligatoire, au moins un reste) ; sur un onglet qu'on vient
  // d'éteindre, retour au premier onglet allumé.
  const { reglages } = useApp();
  const visibles = useMemo(() => ongletsVisibles(reglages.parties), [reglages.parties]);
  const premier = premierOnglet(reglages.parties);
  useEffect(() => {
    if (onglet && !visibles.some((o) => o.chemin === chemin)) router.navigate(premier);
  }, [onglet, chemin, visibles, premier]);
  // Un seul onglet allumé : rien à choisir, la barre n'est pas dessinée.
  const barre = barreVisible(reglages.parties);

  // Teinte de la barre : celle de la page affichée (« / » redirige vers le premier onglet : sa teinte). Sa place dans la barre
  // (celle d'un onglet de même partie, sinon la dernière) donne le point de départ de la vague.
  const partie = partieDe(chemin === "/" ? premier : chemin);
  const rangVu = useRef(0);
  const rangTeinte = rangDePartie(visibles.map((o) => partieDe(o.chemin)), partie, rangVu.current);
  rangVu.current = rangTeinte;

  // Hors des onglets, le dernier onglet connu reste dessiné le temps que le menu descende.
  const dernier = useRef<string>(premier);
  if (onglet) dernier.current = chemin;
  const actifChemin = dernier.current;

  // Glisser le doigt sur la pilule (retours du 28/10) : onglet voisin, dans le sens de la page (vers la droite : celui de
  // gauche), comme le glissé des jours. Un toucher reste un toucher.
  const glisse = useRef({ visibles, actifChemin });
  glisse.current = { visibles, actifChemin };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => prendGlisse(g.dx, g.dy),
        onPanResponderRelease: (_, g) => {
          const { visibles: v, actifChemin: ici } = glisse.current;
          const vers = ongletVoisin(v.map((o) => o.chemin), ici, sensGlisse(g.dx, g.vx, LARGEUR_GLISSE));
          if (vers === ici) return;
          // Sans vibration (D6, 29/10) : elle est réservée aux records et aux erreurs.
          allerA(vers);
        },
      }),
    [],
  );

  return (
    <Animated.View
      pointerEvents={montre ? "box-none" : "none"}
      style={[styles.zone, { bottom: bas + menuOnglets.ecartBas }, anime]}
    >
      {barre ? (
        <Animated.View
          {...pan.panHandlers}
          accessibilityRole="tablist"
          layout={transition}
          style={[
            styles.pilule,
            { borderColor: c.filet, boxShadow: c.ombre, gap: d.ecart, padding: (d.hauteur - d.onglet) / 2, borderRadius: d.hauteur / 2 },
          ]}
        >
          <Fond partie={partie} rang={rangTeinte} n={visibles.length} cible={cible} reduit={reduit} flou={flou} rayonPilule={d.hauteur / 2} />
          {visibles.map((o) => {
            const actif = o.chemin === actifChemin;
            return (
              <Animated.View key={o.chemin} layout={transition}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={t(o.cle)}
                  accessibilityState={{ selected: actif }}
                  // Le doigt posé réveille déjà la partie visée (ui/eveil-onglet) : son rendu part pendant le toucher, pas après.
                  onPressIn={() => (actif ? undefined : eveillerOnglet(o.chemin))}
                  onPress={() => (actif ? retoucher(o.chemin) : allerA(o.chemin))}
                  style={[
                    styles.onglet,
                    { height: d.onglet, minWidth: d.largeur, borderRadius: d.onglet / 2 },
                    actif && { paddingLeft: d.actif[0], paddingRight: d.actif[1], backgroundColor: c.actifFond },
                  ]}
                >
                  <Icone nom={o.icone} couleur={actif ? c.actifTexte : c.inactif} degrade={actif ? ICONES_ACTIVES[o.chemin] : undefined} taille={22} />
                  {actif ? (
                    <Animated.View entering={apparition}>
                      <Texte variante="exercice" numberOfLines={1} style={[styles.libelle, { color: c.actifTexte }]}>
                        {t(o.cle)}
                      </Texte>
                    </Animated.View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Ligne du bas : la pilule seule, centrée (l'avatar est dans l'en-tête de l'Accueil).
  zone: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  fondu: { position: "absolute", left: 0, right: 0, bottom: 0 },
  basFlottant: { position: "absolute", left: 0, right: 0, bottom: 0 },
  cible: { flex: 1 },
  verre: { ...StyleSheet.absoluteFill, borderRadius: menuOnglets.hauteur / 2, overflow: "hidden" },
  couche: { position: "absolute", left: 0, top: 0, bottom: 0 },
  pilule: {
    flexDirection: "row",
    gap: espace.xs,
    padding: (menuOnglets.hauteur - menuOnglets.onglet) / 2,
    borderRadius: menuOnglets.hauteur / 2,
    borderWidth: StyleSheet.hairlineWidth,
    // Le rond actif grandit pendant que la pilule s'ajuste : rien ne dépasse de la pilule pendant le changement d'onglet.
    overflow: "hidden",
  },
  onglet: {
    height: menuOnglets.onglet,
    minWidth: menuOnglets.onglet,
    borderRadius: menuOnglets.onglet / 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espace.s,
  },
  libelle: { fontFamily: police.semibold, fontSize: 14 },
});
