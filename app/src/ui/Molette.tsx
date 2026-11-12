import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { useTheme } from "../theme";
import { champVerre } from "../theme/effets";
import { police, POLICE_MAX, rayon } from "../theme/typo";
import { ECHELLES, interpolationLigne } from "../ecrans/roue";
import { ECART_HAPTIQUE_MS, LIGNE_MOLETTE, opacitesMolette } from "../ecrans/parcours-calc";
import { haptique } from "./haptique";
import { EchosMolette, fenetreMolette, indiceMolette, margeBas } from "./molette-calc";
import { useReduit } from "./reduit";

const H = LIGNE_MOLETTE;
const SANS_ECHELLE = ECHELLES.map(() => 1);
/** Glissé de la molette vers un indice venu de l'extérieur (scrollTo animé d'Android, ~250 ms), avec un peu de marge. */
const GLISSE_MS = 350;

/**
 * Molette du parcours (planches/parcours, NOTES § 3) : âge, poids, taille, poids visé. Ligne de 44, 7 (ou 5) visibles,
 * taille et opacité selon la distance au centre (roue.ts) sous le masque de la planche, cran de 44 avec l'inertie native
 * sans plafond, `haptique.cran` à chaque valeur franchie (au plus une toutes les 40 ms ; aucune au calage, D2).
 * Différente de la roue de repos (RoueDuree), silencieuse et sans inertie. Pas de fondu peint : sur l'aura il ferait un
 * rectangle, l'opacité des lignes tient lieu de masque. `indice` est piloté : changé de l'extérieur (jour ramené dans le
 * mois), la molette y glisse sans vibrer ; ses propres valeurs qui lui reviennent en retard pendant un lancer n'y touchent
 * pas (molette-calc.ts : c'est ce qui coupait l'élan jusqu'au 30/10).
 */
export function Molette({
  valeurs,
  indice,
  onIndice,
  texte,
  unite,
  hors,
  dernier,
  vide = false,
  visibles = 7,
  largeur,
  bande = true,
  libelle,
  lue,
  saut,
  fenetre,
}: {
  valeurs: readonly number[];
  indice: number;
  onIndice: (i: number) => void;
  texte: (v: number) => string;
  /** Unité en 14 t2 après la valeur (« kg », « cm »). */
  unite?: string;
  /** Valeurs impossibles (31 avril), en t3. */
  hors?: (i: number) => boolean;
  /** Dernier indice qu'on peut choisir (jour borné au mois) : la molette ne défile pas au-delà. */
  dernier?: number;
  /** Sans valeur connue : tout en t3 jusqu'au premier geste. */
  vide?: boolean;
  visibles?: 3 | 5 | 7;
  largeur?: number;
  /** Bande centrale translucide (sans : posée par le parent, sous plusieurs molettes). */
  bande?: boolean;
  libelle: string;
  lue?: (v: number) => string;
  /**
   * Repère des sauts : quand il change, la molette se pose sur `indice` d'un coup, sans animation ni écho (touche du clavier
   * de séance : elle n'est plus recréée à chaque chiffre, audit M5).
   */
  saut?: string | number;
  /**
   * Seules les lignes à `fenetre` crans du centre sont rendues (des cales gardent la hauteur) : le clavier de séance ouvrait
   * 201 à 721 lignes animées d'un coup (audit M5). La fenêtre suit le centre par pas de fenetre / 2 ; absente : toutes.
   */
  fenetre?: number;
}) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const n = (visibles - 1) / 2;
  const opacites = useMemo(() => opacitesMolette(visibles), [visibles]);
  const echelles = reduit ? SANS_ECHELLE : ECHELLES;
  const vue = useRef<ScrollViewInstance>(null);
  const courant = useRef(indice);
  const recu = useRef(indice);
  recu.current = indice;
  const echos = useRef(new EchosMolette()).current;
  // Doigt posé ou élan en cours : la main garde la molette, rien de l'extérieur ne la fait glisser.
  const geste = useRef(false);
  const pilote = useRef(false);
  const finPilote = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dernierCran = useRef(0);
  const [centre, setCentre] = useState(indice);
  const y = useRef(new Animated.Value(indice * H)).current;
  const surIndice = useRef(onIndice);
  surIndice.current = onIndice;
  const fin = Math.min(dernier ?? valeurs.length - 1, valeurs.length - 1);
  const finRef = useRef(fin);
  finRef.current = fin;
  // Borne du défilement : suit `fin` tout de suite quand elle s'éloigne, avec un temps de retard quand elle recule (le
  // jour glisse d'abord au dernier du mois ; raccourcie sous lui, Android le ramènerait d'un coup).
  const [borne, setBorne] = useState(fin);
  useEffect(() => {
    if (fin > borne) setBorne(fin);
    if (fin >= borne) return;
    const m = setTimeout(() => setBorne(fin), GLISSE_MS);
    return () => clearTimeout(m);
  }, [fin, borne]);

  useEffect(() => {
    const m = setTimeout(() => vue.current?.scrollTo({ y: courant.current * H, animated: false }), 0);
    return () => (clearTimeout(m), clearTimeout(finPilote.current));
  }, []);

  const glisser = (i: number) => {
    courant.current = i;
    setCentre(i);
    pilote.current = true;
    vue.current?.scrollTo({ y: i * H, animated: true });
    clearTimeout(finPilote.current);
    finPilote.current = setTimeout(() => (pilote.current = false), GLISSE_MS);
  };

  // Saut (touche du pavé) : avant l'effet suivant, qui voit alors la molette déjà posée et ne la fait pas glisser.
  const sautVu = useRef(saut);
  useEffect(() => {
    if (saut === sautVu.current) return;
    sautVu.current = saut;
    echos.oublier();
    courant.current = indice;
    setCentre(indice);
    pilote.current = true;
    vue.current?.scrollTo({ y: indice * H, animated: false });
    // Liste agrandie dans le même rendu (100 → 999 répétitions) : le contenu natif n'a pas encore sa hauteur, le défilement
    // est coupé à l'ancienne fin ; on repose la molette à l'image suivante (vu sur l'émulateur, docs/ALERTE-REPS.md).
    const image = requestAnimationFrame(() => courant.current === indice && vue.current?.scrollTo({ y: indice * H, animated: false }));
    clearTimeout(finPilote.current);
    finPilote.current = setTimeout(() => (pilote.current = false), 100);
    return () => cancelAnimationFrame(image);
  }, [saut, indice, echos]);

  // Indice changé de l'extérieur : la molette y glisse, sans vibrer ni renvoyer la valeur. Un écho de ses propres envois
  // (rendu du parent en retard sur le défilement) n'est pas un ordre de bouger.
  useEffect(() => {
    if (echos.recu(indice, courant.current, !geste.current)) glisser(indice);
  }, [indice, echos]);

  const aller = (i: number) => {
    const j = Math.max(0, Math.min(finRef.current, i));
    vue.current?.scrollTo({ y: j * H, animated: true });
  };

  // Créé une fois : le défilement est branché nativement sur `y` (thread UI) ; l'écouteur JS ne sert qu'au cran.
  const surDefilement = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const i = indiceMolette(e.nativeEvent.contentOffset.y, H, finRef.current);
          if (i === courant.current || pilote.current) return;
          courant.current = i;
          setCentre(i);
          const t = Date.now();
          if (t - dernierCran.current >= ECART_HAPTIQUE_MS) {
            dernierCran.current = t;
            haptique.cran();
          }
          echos.envoi(i);
          surIndice.current(i);
        },
      }),
    [y, echos],
  );

  // Crans du calage natif, un par ligne jusqu'à la borne. Pas snapToInterval : Android le tronque au pixel (44 dp × 2,19 =
  // 96,5 px → 96), la molette dérivait d'un demi-pixel par ligne et, après un long lancer, se posait de travers puis glissait.
  const crans = useMemo(() => Array.from({ length: borne + 1 }, (_, i) => i * H), [borne]);
  // Android cale lui-même au cran (snapToOffsets y vaut pagingEnabled : après un lancer comme après un lâcher lent). On ne
  // rattrape ici qu'une molette arrêtée de travers, à la fin de l'élan ; jamais au lâcher, où un scrollTo couperait l'élan.
  const caler = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const yy = e.nativeEvent.contentOffset.y;
    const i = indiceMolette(yy, H, finRef.current);
    if (Math.abs(yy - i * H) > 0.5) vue.current?.scrollTo({ y: i * H, animated: true });
  };
  const auRepos = () => {
    geste.current = false;
    echos.repos(recu.current, courant.current);
  };

  // Les lignes ne dépendent pas de la valeur au centre : elles ne se redessinent pas à chaque cran (441 pour le poids). Les
  // interpolations (nœuds natifs) sont faites une fois par liste : un changement de couleur (premier geste, mois plus
  // court) ne les refait pas. La liste est comparée par son contenu : le clavier de séance en refait une à chaque cran.
  const texteRef = useRef(texte);
  texteRef.current = texte;
  // La même liste (clavier de séance : gardée par étendue) n'est pas relue en entier à chaque rendu.
  const cleValeurs = useMemo(() => valeurs.join(), [valeurs]);
  const liste = useMemo(() => valeurs, [cleValeurs]);
  // Interpolations faites à la demande, gardées par ligne tant que la liste et les échelles ne changent pas.
  const anims = useMemo(() => new Map<number, { scale: Animated.AnimatedInterpolation<number>; opacity: Animated.AnimatedInterpolation<number> }>(), [liste, y, echelles, opacites]);
  const anim = (i: number) => {
    let a = anims.get(i);
    if (!a) {
      a = {
        scale: y.interpolate({ ...interpolationLigne(i, H, echelles), extrapolate: "clamp" }),
        opacity: y.interpolate({ ...interpolationLigne(i, H, opacites), extrapolate: "clamp" }),
      };
      anims.set(i, a);
    }
    return a;
  };
  const { debut, fin: finF } = fenetreMolette(centre, liste.length, fenetre);
  const horsSig = hors ? liste.map((_, i) => (hors(i) ? 1 : 0)).join("") : "";
  const lignes = useMemo(
    () =>
      liste.slice(debut, finF + 1).map((v, k) => {
        const i = debut + k;
        const pale = vide || horsSig[i] === "1";
        const a = anim(i);
        return (
          <Pressable key={v} importantForAccessibility="no" onPress={() => aller(i)} style={styles.ligne}>
            <Animated.View style={{ opacity: a.opacity, transform: [{ scale: a.scale }] }}>
              <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.valeur, { color: pale ? couleurs.t3 : couleurs.t1 }]}>
                {texteRef.current(v)}
                {unite ? <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.unite, { color: pale ? couleurs.t3 : couleurs.t2 }]}>{` ${unite}`}</Text> : null}
              </Text>
            </Animated.View>
          </Pressable>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liste, anims, vide, horsSig, couleurs.t1, couleurs.t2, couleurs.t3, unite, debut, finF],
  );
  const valeur = valeurs[centre] ?? valeurs[0]!;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={libelle}
      accessibilityValue={{ text: lue ? lue(valeur) : `${texte(valeur)}${unite ? ` ${unite}` : ""}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => aller(courant.current + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      style={{ height: H * visibles, width: largeur }}
    >
      {bande ? <View pointerEvents="none" style={[styles.bande, { top: H * n, backgroundColor: champVerre[mode].fond }]} /> : null}
      <Animated.ScrollView
        ref={vue}
        showsVerticalScrollIndicator={false}
        snapToOffsets={crans}
        decelerationRate="normal"
        scrollEventThrottle={16}
        onScroll={surDefilement}
        onScrollBeginDrag={() => {
          geste.current = true;
          // la main reprend la molette pendant un glissé venu de l'extérieur : ses crans comptent
          pilote.current = false;
        }}
        onMomentumScrollEnd={(e) => {
          auRepos();
          caler(e);
        }}
        nestedScrollEnabled
        overScrollMode="never"
        contentContainerStyle={{ paddingTop: H * n, paddingBottom: H * margeBas(n, valeurs.length, borne) }}
      >
        {debut > 0 ? <View style={{ height: debut * H }} /> : null}
        {lignes}
        {finF < liste.length - 1 ? <View style={{ height: (liste.length - 1 - finF) * H }} /> : null}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bande: { position: "absolute", left: 0, right: 0, height: H, borderRadius: rayon.l },
  ligne: { height: H, alignItems: "center", justifyContent: "center" },
  valeur: { fontFamily: police.medium, fontSize: 20, fontVariant: ["tabular-nums"] },
  unite: { fontFamily: police.regular, fontSize: 14 },
});
