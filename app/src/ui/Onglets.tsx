import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { I18nManager, PanResponder, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { tp } from "../i18n/index";
import { useTheme } from "../theme";
import { avecOpacite } from "../theme/teintes";
import { courbe } from "../theme/mouvement";
import { onglets as T, tempsOnglets as TEMPS } from "../theme/onglets";
import { espace, police } from "../theme/typo";
import { useMargeColonne } from "./CadreContenu";
import { useFondPartie, usePartie } from "./ContextePartie";
import { Icone, type NomIcone } from "./Icone";
import { COULEUR_PARTIE } from "./partie";
import { centrer, cheminsRail, couleurActive, couleursRail, gabaritOuvert, gabaritRiche, gabaritSimple, gaucheLibelle, marqueDe, monteeVoile, ongletApresGlisse, ongletAuClavier, prendGlisseOnglets, texteCompte, voisinGlisse, type GabaritRiche, type Marque } from "./onglets-calc";
import { canaux, dureeCourse, encoche, immobile, opaciteGlisse, poser, reprise, suiviGlisse, type Canaux, type Course } from "./onglets-mouvement";
import { reduitMouvement, useReduit } from "./reduit";
import { Texte } from "./Texte";

// Onglets : UN SEUL composant, en deux versions (planche onglets, direction A « classeur ouvert », validée le 06/11 ;
// DESIGN.md § 6, composant 12). Un onglet change de panneau de contenu ; le Segmenté, lui, choisit une valeur ou un filtre dans
// la même vue (périodes, tris, réglages). tests/onglets-unique.test.ts interdit d'en refaire un autre.
//
// SIMPLE (texte, compteur facultatif) : rangée pleine largeur de 48, filet de 1 dp en `line` d'un bord à l'autre, trait de 2 dp de
// la couleur de la partie sous l'actif (le jour assombrie de 25 %), qui glisse en 220 ms. Libellé 500 en t2 au repos, 600 en t1
// pour l'actif (largeur réservée en 600 : rien ne saute). Compteur 12/400 en t2 à droite du libellé, le zéro reste écrit.
// Parts égales tant que les libellés tiennent ; sinon chaque onglet prend sa largeur et la rangée défile (l'actif est ramené au centre).
//
// RICHE (une icône par panneau) : onglets de 48, icône de 22 ; l'actif prend l'icône à la couleur de la partie et déplie son
// libellé (220 ms) ; l'actif n'a aucun fond propre : c'est une encoche dans un voile translucide `segment-piste`, bord à bord, avec un
// filet de 1 dp qui longe le bas, remonte autour de l'encoche et redescend (rattaché au contenu sur l'aura comme sur tout fond).
// `ancre` (D6, variante unie) : le voile monte au-dessus de la barre jusqu'au bord bas de l'en-tête de la page.
//
// Dans les deux cas la barre déborde des marges de la page (`marge`) jusqu'au bord de la colonne de contenu, et les onglets restent
// alignés sur ces marges. Rôle tablist, onglets en tab (selected, disabled), flèches, Début et Fin au clavier, zone de clic de 48
// au moins, texte jusqu'à 130 % sans retour à la ligne, « réduire les animations » : pas de dépli ni de glissé, un fondu de 120 ms.
//
// MOUVEMENT (refonte du 07/11, DESIGN.md « Onglets : mouvement ») : un seul état, l'onglet actif `k` (la propriété de la page). Le reste
// en découle, sur le fil UI de Reanimated : `useMouvement` pose une course (d'où l'on part, où l'on va) et lance UNE horloge de 0 à 220 ms ;
// à chaque image, des valeurs dérivées calculent les quatre canaux (ui/onglets-mouvement.ts, pur et testé), puis la géométrie des
// onglets (ui/onglets-calc.ts `gabaritOuvert`) et le rail. Chaque élément y lit sa part ; aucun `setValue`, aucun état React qui suive
// l'animation, rien d'intermédiaire qui survive à un changement d'onglet : un nouveau toucher repart de ce qui est affiché.
//   - encoche, voile, largeur des onglets, trait du simple : 220 ms, courbe « sortie » (0,23 1 0,32 1), à part égale entre l'ancien et le nouvel onglet ;
//   - libellé qui se déplie : largeur à 220 ms, opacité 160 ms après 60 ms de retard ; libellé qui se ferme : opacité en 100 ms (ils se croisent) ;
//   - icône qui prend la couleur de la partie, libellé du simple t2 → t1 : 160 ms, courbe douce `ease` (0,25 0,1 0,25 1) ;
//   - icône qui arrive : se pose de 0,82 à 1 en 220 ms ;
//   - panneaux : fondu de 180 ms et glissé de 28 dp en 220 ms ; le contenu suit le doigt de moitié (butée douce à 96 dp, il s'estompe à 60 %)
//     et revient en 180 ms s'il n'y a pas de changement ;
//   - « réduire les animations » : rien ne glisse ni ne se pose, un fondu linéaire de 120 ms.

export interface Onglet<V extends string = string> {
  valeur: V;
  libelle: string;
  /** Riche : l'icône du panneau. */
  icone?: NomIcone;
  /** Simple : compteur à droite du libellé (le zéro reste écrit). Riche : pastille sur l'icône (rien à 0, « 99+ » au-delà de 99). */
  compte?: number;
  /** Point de 8 sans chiffre (riche : sur le coin de l'icône). */
  point?: boolean;
  desactive?: boolean;
  /** Ce que lit le lecteur d'écran, quand ce n'est pas « libellé, compte » (« Followers 0 », « Activité, 2 nouveaux »). */
  lu?: string;
}

interface Props<V extends string> {
  onglets: readonly Onglet<V>[];
  valeur: V;
  onChange: (v: V) => void;
  /** Nom de la barre pour les lecteurs d'écran. */
  etiquette: string;
  /** « simple » par défaut ; « riche » demande une icône à chaque onglet. */
  version?: "simple" | "riche";
  /** Marge de contenu de la page (16 par défaut) : la barre déborde d'autant de chaque côté, les onglets s'alignent dessus. */
  marge?: number;
  /** Riche : bord bas de l'en-tête de la page, dans le repère du parent de la barre (le même que sa propre position) ; le voile monte jusque-là. */
  ancre?: number | null;
  /** Fond sur lequel se découpe la pastille (le fond de la page par défaut). */
  style?: StyleProp<ViewStyle>;
}

/** Le libellé lu d'un onglet. */
export function libelleLu<V extends string>(o: Onglet<V>, version: "simple" | "riche"): string {
  if (o.lu) return o.lu;
  if (version === "simple") return o.compte != null ? `${o.libelle} ${o.compte}` : o.libelle;
  return o.compte ? `${o.libelle}, ${tp("onglets.nouveaux", o.compte)}` : o.libelle;
}

export function Onglets<V extends string>(props: Props<V>) {
  const { onglets, valeur, onChange, version = "simple", marge = espace.l, style } = props;
  const col = useMargeColonne();
  const k = Math.max(0, onglets.findIndex((o) => o.valeur === valeur));
  const refs = useRef<Record<string, { focus?: () => void } | null>>({});
  const auClavier = useRef(false);
  const rtl = I18nManager.isRTL;

  // Clavier : un seul onglet dans l'ordre de tabulation (l'actif) ; une flèche, Début ou Fin le déplace, il prend le focus et s'active.
  const touche = useCallback(
    (e: { nativeEvent: { key: string } }) => {
      const j = ongletAuClavier(e.nativeEvent.key, onglets.map((o) => !!o.desactive), k, rtl);
      if (j == null || j === k) return;
      auClavier.current = true;
      onChange(onglets[j]!.valeur);
    },
    [onglets, k, onChange, rtl],
  );
  useEffect(() => {
    if (!auClavier.current) return;
    auClavier.current = false;
    refs.current[valeur]?.focus?.();
  }, [valeur]);

  const commun = { ...props, k, marge, col, refs, touche, style };
  return version === "riche" ? <Riche {...commun} /> : <Simple {...commun} />;
}

type Commun<V extends string> = Props<V> & { k: number; marge: number; col: number; refs: { current: Record<string, { focus?: () => void } | null> }; touche: (e: { nativeEvent: { key: string } }) => void };

function useCouleurs() {
  const { couleurs, mode } = useTheme();
  const partie = usePartie();
  const actif = couleurActive(couleurs[COULEUR_PARTIE[partie]], mode);
  const appui = avecOpacite(couleurs.t1, mode === "nuit" ? 0.1 : 0.07);
  return { couleurs, mode, partie, actif, appui };
}

// ——— Calque d'appui, focus clavier ———

function useEtatTab() {
  const [focus, setFocus] = useState(false);
  return { focus, onFocus: () => setFocus(true), onBlur: () => setFocus(false) };
}

function Calque({ presse, focus, appui, t2 }: { presse: boolean; focus: boolean; appui: string; t2: string }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.calque, presse && { backgroundColor: appui }, focus && { borderWidth: 2, borderColor: t2 }]}
    />
  );
}

// ——— Le mouvement : un seul état, une horloge ———

type Etat = Readonly<SharedValue<Canaux>>;

/** Courbe « sortie » des jetons : pour ce qui bouge dans les panneaux (le mouvement des onglets, lui, la lit dans ui/onglets-mouvement.ts). */
const sortie = Easing.bezier(courbe.sortie[0], courbe.sortie[1], courbe.sortie[2], courbe.sortie[3]);

/**
 * L'état de la barre sur le fil UI : les quatre canaux de la transition (`canaux`), recalculés à chaque image de l'horloge.
 * Entrée unique : l'onglet actif `k` (avec la liste `cle` et le mode). Le composant le pousse dans `ordre` ; la réaction pose une nouvelle
 * course qui repart de ce qui est affiché (`reprise`) et relance l'horloge de 0 à 220 ms (120 ms sous « réduire les animations »). Sans
 * changement, ou avec une autre liste, la course est déjà posée : l'horloge ne tourne pas. Aucun rappel vers React : à la fin, rien à
 * nettoyer (les canaux valent alors exactement le repos de l'onglet actif).
 */
function useMouvement(k: number, n: number, cle: string, reduit: boolean): Etat {
  const course = useSharedValue<Course>(poser(k, n, cle, reduit));
  const ms = useSharedValue(0);
  const ordre = useSharedValue({ k, n, cle, reduit });
  useLayoutEffect(() => {
    ordre.value = { k, n, cle, reduit };
  }, [ordre, k, n, cle, reduit]);
  useAnimatedReaction(
    () => ordre.value,
    (o) => {
      const c = reprise(course.value, ms.value, o);
      course.value = c;
      ms.value = 0;
      if (!immobile(c)) ms.value = withTiming(dureeCourse(o.reduit), { duration: dureeCourse(o.reduit), easing: Easing.linear });
    },
  );
  return useDerivedValue(() => canaux(course.value, ms.value));
}

/** Tout ce que la géométrie lit hors de la course : largeur de la barre, marge, largeur mesurée des libellés, marques. Poussé en bloc, à chaque changement. */
interface Entrees {
  largeur: number;
  marge: number;
  libelles: number[];
  marques: Marque[];
}

// ——— Simple ———

function Simple<V extends string>({ onglets, onChange, etiquette, k, marge, refs, touche, style }: Commun<V>) {
  const { couleurs, actif: couleurTrait, appui } = useCouleurs();
  const reduit = useReduit();
  const [largeur, setLargeur] = useState(0);
  const [mesures, setMesures] = useState<Record<string, number>>({});
  const defile = useRef<ScrollViewInstance>(null);
  const pad = Math.max(0, marge - T.margeLibelle);
  const g = useMemo(() => gabaritSimple({ largeur, marge: pad, naturels: onglets.map((o) => mesures[o.valeur] ?? 0) }), [largeur, pad, onglets, mesures]);
  const etat = useMouvement(k, onglets.length, onglets.map((o) => o.valeur).join("|"), reduit);

  // Le trait : la moyenne des onglets pondérée par leur part de géométrie ; la géométrie (x, largeurs) est la seule chose qu'il lit hors de la course.
  const geometrie = useSharedValue({ x: g.x, largeurs: g.largeurs });
  useLayoutEffect(() => {
    geometrie.value = { x: g.x, largeurs: g.largeurs };
  }, [geometrie, g.x, g.largeurs]);
  const styleTrait = useAnimatedStyle(() => {
    const t = encoche(geometrie.value, etat.value.geo);
    return { left: t.x0, width: t.x1 - t.x0 };
  });

  // Rangée qui défile : l'actif est ramené au centre.
  const posee = useRef(false);
  const xa = g.x[k] ?? 0;
  const wa = g.largeurs[k] ?? 0;
  useEffect(() => {
    if (!g.defile || !largeur) return;
    defile.current?.scrollTo({ x: centrer(xa, wa, largeur, g.contenu), animated: !reduit && posee.current });
    posee.current = true;
  }, [g.defile, g.contenu, xa, wa, largeur, reduit]);

  const surLayout = (e: LayoutChangeEvent) => setLargeur(Math.round(e.nativeEvent.layout.width));
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={etiquette}
      focusable={false}
      onKeyDown={touche}
      onLayout={surLayout}
      style={[styles.simple, { marginHorizontal: -marge }, style]}
    >
      <View pointerEvents="none" style={[styles.filet, { backgroundColor: couleurs.line }]} />
      <ScrollView
        ref={defile}
        horizontal
        scrollEnabled={g.defile}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: pad, height: T.hauteur }}
      >
        {onglets.map((o, i) => {
          const actif = i === k;
          const ecart = g.largeurs[i];
          return (
            <TabSimple
              key={o.valeur}
              o={o}
              i={i}
              etat={etat}
              actif={actif}
              largeur={largeur ? ecart : undefined}
              onMesure={(m) => setMesures((s) => (s[o.valeur] === m ? s : { ...s, [o.valeur]: m }))}
              onPress={() => !o.desactive && !actif && onChange(o.valeur)}
              refer={(r) => void (refs.current[o.valeur] = r)}
              appui={appui}
            />
          );
        })}
        {largeur ? <Animated.View pointerEvents="none" style={[styles.trait, { backgroundColor: couleurTrait }, styleTrait]} /> : null}
      </ScrollView>
    </View>
  );
}

function TabSimple<V extends string>({ o, i, etat, actif, largeur, onMesure, onPress, refer, appui }: { o: Onglet<V>; i: number; etat: Etat; actif: boolean; largeur: number | undefined; onMesure: (n: number) => void; onPress: () => void; refer: (r: { focus?: () => void } | null) => void; appui: string }) {
  const { couleurs } = useTheme();
  const e = useEtatTab();
  // Le libellé est écrit trois fois, superposés dans la largeur du 600 : la réserve (invisible), le libellé de repos (500, t2) et le libellé
  // actif (600, t1). Le canal `icone` de l'onglet (0 à 1, 160 ms, courbe douce) les croise : le texte change de couleur en douceur, sans saut de largeur.
  const styleRepos = useAnimatedStyle(() => ({ opacity: 1 - (etat.value.icone[i] ?? 0) }));
  const styleActif = useAnimatedStyle(() => ({ opacity: etat.value.icone[i] ?? 0 }));
  return (
    <Pressable
      ref={refer as never}
      accessibilityRole="tab"
      accessibilityState={{ selected: actif, disabled: !!o.desactive }}
      accessibilityLabel={libelleLu(o, "simple")}
      focusable={actif && !o.desactive}
      onFocus={e.onFocus}
      onBlur={e.onBlur}
      onPress={onPress}
      style={({ pressed }) => [styles.tabSimple, largeur != null ? { width: largeur } : { flex: 1 }, o.desactive && { opacity: T.desactive }, { minWidth: 0 }, pressed && !o.desactive ? null : null]}
    >
      {({ pressed }) => (
        <>
          <Calque presse={pressed && !o.desactive} focus={e.focus} appui={appui} t2={couleurs.t2} />
          <View
            style={styles.contenuSimple}
            onLayout={(ev) => onMesure(Math.ceil(ev.nativeEvent.layout.width) + 2 * T.margeLibelle + 1)}
          >
            <View>
              <Texte numberOfLines={1} style={[styles.libelle, { fontFamily: police.semibold, opacity: 0 }]} accessible={false} importantForAccessibility="no-hide-descendants">
                {o.libelle}
              </Texte>
              <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.sur, styleRepos]}>
                <Texte numberOfLines={1} style={[styles.libelle, styles.centre, { fontFamily: police.medium, color: couleurs.t2 }]}>
                  {o.libelle}
                </Texte>
              </Animated.View>
              <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.sur, styleActif]}>
                <Texte numberOfLines={1} style={[styles.libelle, styles.centre, { fontFamily: police.semibold, color: couleurs.t1 }]}>
                  {o.libelle}
                </Texte>
              </Animated.View>
            </View>
            {o.compte != null ? (
              <Texte numberOfLines={1} accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.compte, { color: couleurs.t2 }]}>
                {o.compte}
              </Texte>
            ) : null}
            {o.point ? <View style={[styles.pointSimple, { backgroundColor: couleurs.secondFil }]} accessible={false} /> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

// ——— Riche ———

function Riche<V extends string>({ onglets, onChange, etiquette, k, marge, col, refs, touche, ancre, style }: Commun<V>) {
  const { couleurs, mode, partie, actif: couleurIcone, appui } = useCouleurs();
  const reduit = useReduit();
  const fond = useFondPartie();
  const [dim, setDim] = useState({ l: 0, y: 0 });
  const [mesures, setMesures] = useState<Record<string, number>>({});
  const defile = useRef<ScrollViewInstance>(null);
  const marques: Marque[] = onglets.map((o) => marqueDe(o.compte, o.point));
  const libelles = onglets.map((o) => mesures[o.valeur] ?? 0);
  const liste = onglets.map((o) => o.valeur).join("|");
  // Les entrées de la géométrie ne changent que si ce qui les fait change (largeur de la barre, marge, libellés mesurés, marques, liste) :
  // une page qui se rend de nouveau avec une liste neuve mais identique ne pousse rien. La largeur d'un libellé qui arrive après coup est
  // une entrée comme une autre : la géométrie se recalcule sur la course en cours, sans cas particulier.
  const cleEntrees = [dim.l, marge, liste, libelles.join(","), marques.join(",")].join("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entrees = useMemo<Entrees>(() => ({ largeur: dim.l, marge, libelles, marques }), [cleEntrees]);
  const poussees = useSharedValue<Entrees>(entrees);
  useLayoutEffect(() => {
    poussees.value = entrees;
  }, [poussees, entrees]);

  const etat = useMouvement(k, onglets.length, liste, reduit);
  const gabarit = useDerivedValue(() => {
    const e = poussees.value;
    return gabaritOuvert({ largeur: e.largeur, marge: e.marge, libelles: e.libelles, marques: e.marques, ouvertures: etat.value.geo });
  });
  // La géométrie au repos de l'actif : de quoi savoir si la rangée défile, jusqu'où, et où ramener l'actif en vue.
  const repos = useMemo(
    () => gabaritRiche({ largeur: dim.l, marge, libelles, marques, actif: k }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cleEntrees, k],
  );

  // Rangée qui défile : l'actif est ramené en vue, l'icône suivante reste coupée. `decale` (fil UI) est ce qui a défilé : le rail le suit à l'image près.
  const decale = useSharedValue(0);
  const surDefilement = useAnimatedScrollHandler({
    onScroll: (ev) => {
      decale.value = ev.contentOffset.x;
    },
  });
  useEffect(() => {
    if (!repos.defile) decale.value = 0;
  }, [repos.defile, decale]);
  const posee = useRef(false);
  useEffect(() => {
    if (!repos.defile || !dim.l) return;
    defile.current?.scrollTo({ x: centrer(repos.x[k] ?? 0, repos.largeurs[k] ?? 0, dim.l, repos.contenu), animated: !reduit && posee.current });
    posee.current = true;
  }, [repos, k, dim.l, reduit]);

  const montee = ancre != null && dim.l ? monteeVoile(dim.y, ancre) : 0;
  const H = T.margeHaute + T.hauteur;
  const surLayout = (e: LayoutChangeEvent) => {
    const { width, y } = e.nativeEvent.layout;
    setDim((d) => (d.l === Math.round(width) && Math.abs(d.y - y) < 0.5 ? d : { l: Math.round(width), y }));
  };
  const pastille = couleurs.secondFil;
  const rail = couleursRail(couleurs[COULEUR_PARTIE[partie]], mode);
  const surPastille = mode === "nuit" ? "#000000" : "#ffffff";
  const mesure = (v: string) => (m: number) => setMesures((s) => (s[v] === m ? s : { ...s, [v]: m }));
  const pret = dim.l > 0;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={etiquette}
      focusable={false}
      onKeyDown={touche}
      onLayout={surLayout}
      style={[styles.riche, { marginHorizontal: -marge, height: H }, montee > 0 && { zIndex: -1 }, style]}
    >
      {pret ? <Rail largeur={dim.l} hauteur={H} montee={montee} debord={col} gabarit={gabarit} etat={etat} decale={decale} voile={rail.voile} filet={rail.filet} /> : null}
      <Animated.ScrollView
        ref={defile as never}
        horizontal
        scrollEnabled={repos.defile}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onScroll={surDefilement}
        contentContainerStyle={{ paddingHorizontal: marge, paddingTop: T.margeHaute, columnGap: T.ecart, height: H, ...(pret ? { minWidth: dim.l } : null) }}
      >
        {onglets.map((o, i) => {
          const actif = i === k;
          return (
            <TabRiche
              key={o.valeur}
              o={o}
              i={i}
              actif={actif}
              marque={marques[i]!}
              pret={pret}
              etat={etat}
              entrees={poussees}
              gabarit={gabarit}
              couleurIcone={couleurIcone}
              pastille={pastille}
              surPastille={surPastille}
              fond={fond}
              appui={appui}
              onMesure={mesure(o.valeur)}
              onPress={() => !o.desactive && !actif && onChange(o.valeur)}
              refer={(r) => void (refs.current[o.valeur] = r)}
            />
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const TraceAnime = Animated.createAnimatedComponent(Path);

/**
 * Le rail : voile et filet, un tracé chacun, dont le `d` est recalculé à chaque image sur le fil UI (encoche = moyenne des bords des onglets
 * pondérée par leur part de géométrie) ; en défilement, décalé de ce qui a défilé.
 */
function Rail({ largeur, hauteur, montee, debord, gabarit, etat, decale, voile, filet }: { largeur: number; hauteur: number; montee: number; debord: number; gabarit: Readonly<SharedValue<GabaritRiche>>; etat: Etat; decale: SharedValue<number>; voile: string; filet: string }) {
  const chemins = useDerivedValue(() => {
    const t = encoche(gabarit.value, etat.value.geo);
    return cheminsRail({ largeur, hauteur, montee, x0: t.x0 - decale.value, x1: t.x1 - decale.value, debord });
  });
  const dVoile = useAnimatedProps(() => ({ d: chemins.value.voile }));
  const dFilet = useAnimatedProps(() => ({ d: chemins.value.filet }));
  const W = largeur + 2 * debord;
  return (
    <Svg pointerEvents="none" width={W} height={hauteur + montee} viewBox={`${-debord} ${-montee} ${W} ${hauteur + montee}`} style={{ position: "absolute", left: -debord, top: -montee }}>
      <TraceAnime animatedProps={dVoile} fill={voile} />
      <TraceAnime animatedProps={dFilet} fill="none" stroke={filet} strokeWidth={T.filet} />
    </Svg>
  );
}

function TabRiche<V extends string>({
  o, i, actif, marque, pret, etat, entrees, gabarit, couleurIcone, pastille, surPastille, fond, appui, onMesure, onPress, refer,
}: {
  o: Onglet<V>;
  i: number;
  actif: boolean;
  marque: Marque;
  /** La barre est mesurée : les largeurs viennent de la géométrie (avant, les onglets se partagent la rangée). */
  pret: boolean;
  etat: Etat;
  entrees: SharedValue<Entrees>;
  gabarit: Readonly<SharedValue<GabaritRiche>>;
  couleurIcone: string;
  pastille: string;
  surPastille: string;
  fond: string;
  appui: string;
  onMesure: (n: number) => void;
  onPress: () => void;
  refer: (r: { focus?: () => void } | null) => void;
}) {
  const { couleurs } = useTheme();
  const e = useEtatTab();
  const nom = o.icone ?? "info";
  // Chaque style n'écrit que ce qui bouge (largeur, opacité, échelle) : rien de cela n'est dans le style fixe, rien ne peut en être resté d'un rendu à l'autre.
  const styleLargeur = useAnimatedStyle(() => {
    const w = gabarit.value.largeurs[i];
    return entrees.value.largeur > 0 && w !== undefined ? { width: w } : {};
  });
  const styleLibelle = useAnimatedStyle(() => {
    const d = entrees.value;
    const plein = gaucheLibelle(d.marques[i] ?? "aucune") + (d.libelles[i] ?? 0);
    return { width: (etat.value.geo[i] ?? 0) * plein, opacity: etat.value.libelle[i] ?? 0 };
  });
  const styleCouleur = useAnimatedStyle(() => ({ opacity: etat.value.icone[i] ?? 0 }));
  const stylePose = useAnimatedStyle(() => ({ transform: [{ scale: etat.value.pose[i] ?? 1 }] }));
  return (
    <Pressable
      ref={refer as never}
      accessibilityRole="tab"
      accessibilityState={{ selected: actif, disabled: !!o.desactive }}
      accessibilityLabel={libelleLu(o, "riche")}
      focusable={actif && !o.desactive}
      onFocus={e.onFocus}
      onBlur={e.onBlur}
      onPress={onPress}
      style={[styles.tabRiche, pret ? null : { flex: 1, minWidth: T.largeurMin }, o.desactive && { opacity: T.desactive }]}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.tabRicheDedans, pret ? null : { flex: 1 }, styleLargeur]}>
          <Calque presse={pressed && !o.desactive} focus={e.focus} appui={appui} t2={couleurs.t2} />
          <Animated.View style={[styles.icone, stylePose]}>
            <Icone nom={nom} couleur={couleurs.t2} taille={T.icone} epaisseur={1.75} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styleCouleur]}>
              <Icone nom={nom} couleur={couleurIcone} taille={T.icone} epaisseur={1.75} />
            </Animated.View>
            {marque === "point" ? (
              <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.point, { backgroundColor: pastille, borderColor: fond }]} />
            ) : marque !== "aucune" ? (
              <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.pastille, { backgroundColor: pastille, borderColor: fond }]}>
                <Texte style={[styles.pastilleTexte, { color: surPastille }]} maxFontSizeMultiplier={1}>
                  {texteCompte(o.compte ?? 0)}
                </Texte>
              </View>
            ) : null}
          </Animated.View>
          <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.libelleOuvre, styleLibelle]}>
            <Texte numberOfLines={1} style={[styles.libelle, styles.libelleLarge, { fontFamily: police.semibold, color: couleurs.t1, position: "absolute", left: gaucheLibelle(marque) }]}>
              {o.libelle}
            </Texte>
          </Animated.View>
          {/* Mesure du libellé (invisible) : sa largeur naturelle, pour le déplier sans le couper. Dans une bande large, hors de l'onglet :
              posé dans l'onglet (48 de large au repos), le texte serait plié à sa largeur et mesurerait moins que son vrai libellé. */}
          <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.mesure}>
            <Texte numberOfLines={1} onLayout={(ev) => onMesure(Math.ceil(ev.nativeEvent.layout.width) + 1)} style={[styles.libelle, { fontFamily: police.semibold }]}>
              {o.libelle}
            </Texte>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ——— Panneaux : glissement latéral (D4) ———

/**
 * Le contenu d'un onglet : fondu de 180 ms à chaque changement ; balayé vers la gauche ou la droite, il passe au panneau voisin (arrive de
 * 28 dp en 220 ms, courbe sortie). Un raccourci, jamais le seul moyen : coupé sur le bord gauche (40 dp, le volet du profil) et dans un
 * panneau qui défile à l'horizontale (`defileHorizontal`). `glisse={false}` : fondu seul.
 * Pendant le geste le panneau suit le doigt de moitié (butée douce à 96 dp, bien moins au bord de la liste, où rien ne l'attend) et
 * s'estompe jusqu'à 60 % ; lâché sans changer d'onglet, ou si le geste est repris par un autre, il revient en 180 ms. Tout est en valeurs
 * partagées : le panneau n'a d'autre état que `dx` et `op`, que le prochain geste ou le prochain changement d'onglet réécrit.
 */
export function PanneauxOnglets<V extends string>({
  onglets,
  valeur,
  onChange,
  glisse = true,
  defileHorizontal = false,
  style,
  children,
}: {
  /** Les onglets de la barre, ou seulement leurs valeurs. */
  onglets: readonly (V | Pick<Onglet<V>, "valeur" | "desactive">)[];
  valeur: V;
  onChange: (v: V) => void;
  glisse?: boolean;
  defileHorizontal?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const liste = useMemo(() => onglets.map((o) => (typeof o === "string" ? { valeur: o, desactive: false } : { valeur: o.valeur, desactive: !!o.desactive })), [onglets]);
  const k = Math.max(0, liste.findIndex((o) => o.valeur === valeur));
  const op = useSharedValue(1);
  const dx = useSharedValue(0);
  /** Le sens du glissé qui a demandé `vers` : l'arrivée de CET onglet glisse, pas un changement venu d'ailleurs plus tard. */
  const sens = useRef<{ s: 1 | -1; vers: V } | null>(null);
  const largeur = useRef(390);
  // Le départ du doigt est noté au toucher : le `x0` du PanResponder vaut 0 tant qu'il n'a pas pris le geste (même piège que le volet).
  const depart = useRef(Number.POSITIVE_INFINITY);
  // Ce que le doigt avait déjà parcouru quand le geste a été pris : le panneau part de là, sans saut.
  const origine = useRef(0);
  const etat = useRef({ onglets: liste, k, onChange, defileHorizontal, glisse });
  etat.current = { onglets: liste, k, onChange, defileHorizontal, glisse };
  const vu = useRef(valeur);
  const styleAnime = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: dx.value }] }));

  // Le nouvel onglet arrive : fondu de 180 ms (120 ms linéaire sous « réduire les animations ») et, après un glissé, 28 dp de course en 220 ms.
  // Écrit avant que le panneau soit peint (effet de mise en page) : il n'y a pas d'image du nouveau contenu à pleine opacité.
  useLayoutEffect(() => {
    if (vu.current === valeur) return;
    vu.current = valeur;
    const s = sens.current?.vers === valeur ? sens.current.s : 0;
    sens.current = null;
    const doux = reduitMouvement();
    op.value = 0;
    op.value = withTiming(1, { duration: doux ? TEMPS.reduit : TEMPS.fondu, easing: doux ? Easing.linear : sortie });
    if (s && !doux) {
      dx.value = s * TEMPS.decalage;
      dx.value = withTiming(0, { duration: TEMPS.glisse, easing: sortie });
    } else dx.value = 0;
  }, [valeur, op, dx]);

  const pan = useMemo(() => {
    /** Le panneau revient en place : un glissé qui ne change pas d'onglet, un geste repris par un autre. */
    const revenir = () => {
      dx.value = withTiming(0, { duration: TEMPS.retour, easing: sortie });
      op.value = withTiming(1, { duration: TEMPS.retour, easing: sortie });
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => etat.current.glisse && prendGlisseOnglets(g.dx, g.dy, depart.current, etat.current.defileHorizontal),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => {
        origine.current = g.dx;
      },
      onPanResponderMove: (_, g) => {
        const { onglets: os, k: kc } = etat.current;
        const d = g.dx - origine.current;
        const voisin = voisinGlisse(os.map((o) => !!o.desactive), kc, d < 0 ? 1 : -1) != null;
        const x = suiviGlisse(d, voisin);
        dx.value = x;
        op.value = opaciteGlisse(x);
      },
      onPanResponderRelease: (_, g) => {
        const { onglets: os, k: kc, onChange: ch } = etat.current;
        const j = ongletApresGlisse(os.map((o) => !!o.desactive), kc, g.dx, g.vx, largeur.current);
        // Dans tous les cas le panneau repart vers sa place : si la page change d'onglet, l'arrivée du nouveau contenu reprend la main
        // (effet ci-dessus) ; si elle ne le change pas, rien n'est resté de côté.
        revenir();
        if (j == null) return;
        sens.current = { s: j > kc ? 1 : -1, vers: os[j]!.valeur };
        ch(os[j]!.valeur);
      },
      onPanResponderTerminate: revenir,
    });
  }, [dx, op]);
  return (
    <Animated.View
      {...pan.panHandlers}
      onTouchStartCapture={(e) => void (depart.current = e.nativeEvent.pageX)}
      onLayout={(e) => void (largeur.current = e.nativeEvent.layout.width)}
      style={[styleAnime, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  simple: { height: T.hauteur },
  filet: { position: "absolute", left: 0, right: 0, bottom: 0, height: T.filet },
  trait: { position: "absolute", bottom: 0, height: T.trait, borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  tabSimple: { height: T.hauteur, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  contenuSimple: { flexDirection: "row", alignItems: "center" },
  libelle: { fontSize: T.texte, lineHeight: 20 },
  sur: { position: "absolute", left: 0, right: 0 },
  centre: { textAlign: "center" },
  compte: { marginLeft: T.ecartCompte, fontFamily: police.regular, fontSize: T.compte, lineHeight: 16 },
  pointSimple: { marginLeft: T.ecartCompte, width: T.point, height: T.point, borderRadius: T.point / 2 },
  calque: { position: "absolute", top: 4, bottom: 3, left: 2, right: 2, borderRadius: T.appuiRayon },
  riche: { overflow: "visible" },
  tabRiche: { height: T.hauteur, flexShrink: 0 },
  /** Le libellé déplié : sa largeur est animée, sa hauteur est celle de l'onglet (son texte est posé en absolu : rien ne la donnerait). */
  libelleOuvre: { height: T.hauteur, overflow: "hidden", justifyContent: "center" },
  /** Le texte du libellé déplié garde sa largeur quand l'onglet se referme : c'est le conteneur (overflow caché) qui le coupe. Posé à la
   *  largeur restante, Android le raccourcirait en « A.. » pendant les 100 ms où il s'efface. */
  libelleLarge: { width: 1000 },
  /** Bande de mesure des libellés : invisible, hors flux, assez large pour le plus long libellé à 130 %. */
  mesure: { position: "absolute", top: 0, left: 0, width: 1000, opacity: 0, alignItems: "flex-start" },
  tabRicheDedans: { height: T.hauteur, flexDirection: "row", alignItems: "center", justifyContent: "center", overflow: "visible" },
  icone: { width: T.icone, height: T.icone },
  pastille: { position: "absolute", top: -7, left: 13, minWidth: T.pastille, height: T.pastille, paddingHorizontal: 5, borderRadius: T.pastille / 2, borderWidth: 2, alignItems: "center", justifyContent: "center", boxSizing: "content-box" as never },
  pastilleTexte: { fontFamily: police.semibold, fontSize: T.pastilleTexte, lineHeight: 14 },
  point: { position: "absolute", top: -3, left: 17, width: T.point, height: T.point, borderRadius: T.point / 2, borderWidth: 2, boxSizing: "content-box" as never },
});
