// Bloc d'effort (lot 3) : un seul composant pour la fin de course (planche suivi-gps « Fin ») et la séance passée (planche
// Lieux « Effort »). Tracé dessiné en Skia sur un fond neutre (D2 : la carte MapLibre viendra sous le tracé, lot 6), coloré
// par zone ou par altitude ; le sélecteur bascule le tracé ET la courbe (FC par zone, profil d'altitude) ; repères des
// tours sur le tracé et les courbes ; en bas, temps par zone ou altitude, à hauteur constante (demande d'Alex : la suite
// ne bouge pas au changement de mode). Entrée de la planche Lieux (NOTES § 2) : une horloge t de 0 à 1 000 ms dont chaque
// élément tire sa phase ; rien ne bouge si l'on réduit les animations ; le changement de mode est un fondu de 200 ms.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from "react-native";
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Canvas, Circle, DashPathEffect, Group, Line, LinearGradient, Path, Rect, RoundedRect, Skia, vec, type SkPath } from "@shopify/react-native-skia";
import { t } from "../i18n/index";
import { texteEffort } from "./mesures/scores-calc";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { courbe as courbes, duree, echelle } from "../theme/mouvement";
import { espace, police, POLICE_MAX, rayon, TAILLE_MIN } from "../theme/typo";
import { largeurContenu } from "../ui/CadreContenu";
import { FondDegrade } from "../ui/Degrade";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { dureeZone, echelleAltitude, graduationsMinutes, melange, niveauAlt, repartitionZones, SEUIL_ZONE_S, type PointTrace, type VueEffort } from "./effort-vue";
import { morceauxParZone, projeter, vueProjection, type Pt } from "./suivi-direct-vue";
import { allureTexte, chronoTexte, distanceTexte, mesureDe, vitesseTexte } from "./suivi-direct-vue";
import { allureEnUnite, mesureSport, type Famille } from "./familles-sports";
import { approx, nombre } from "./format";
import { FondCarte } from "./FondCarte";
import { couleursTrace, poserTrace } from "./trace-pleine";
import { altitudeEnUnite, graduationsDistance, libelleAllure, libelleAltitude, libelleDistance, libelleVitesse, metresParUnite } from "./unites";
import { useReduit } from "../ui/reduit";
import { router } from "expo-router";
import { Icone } from "../ui/Icone";
import { Appui, courbes as easings } from "../ui/mouvement";
import { sourceZones } from "./zones-texte";
import { morceauxCourbe, texteCoupure } from "./fc-trous";
import { modeAffiche, modesEffort, modesTrace, type ModeEffort } from "./effort-modes";

/** i18n, là où `t` est l'horloge de l'entrée. */
const t2 = t;

export type { ModeEffort };
/** « fin » : planche suivi-gps (fin de course) ; « passee » : planche Lieux (séance passée). */
export type VarianteEffort = "fin" | "passee";

// ——— Horloge de l'entrée (planche Lieux, NOTES § 2 : tout est fini avant 800 ms) ———

const [x1, y1, x2, y2] = courbes.sortie;
const sortie = Easing.bezierFn(x1, y1, x2, y2);
export const ENTREE = { fin: 1000, bloc: [0, 200], chiffres: [0, 600], dessin: [100, 700], barres: { debut: 250, pas: 60, duree: 300 } } as const;

export function phase(t: number, debut: number, d: number): number {
  "worklet";
  return sortie(Math.min(1, Math.max(0, (t - debut) / d)));
}

/**
 * L'horloge part une seule fois, quand le bloc est prêt ; « Réduire les animations » : l'état final tout de suite.
 * `ralenti` (recette, NOTES de Lieux : « jouer l'entrée à 2–5× la durée ») étire l'horloge sans changer la chronologie.
 */
export function useEntree(pret: boolean, ralenti = 1): SharedValue<number> {
  const reduit = useReduit();
  const t = useSharedValue(reduit ? ENTREE.fin : 0);
  const joue = useRef(false);
  useEffect(() => {
    if (!pret || joue.current) return;
    joue.current = true;
    t.value = reduit ? ENTREE.fin : withTiming(ENTREE.fin, { duration: ENTREE.fin * ralenti, easing: Easing.linear });
  }, [pret, reduit, t, ralenti]);
  return t;
}

/** Chiffre qui compte de 0 à sa valeur (chiffres tabulaires : rien ne saute). */
function Compteur({ t, valeur, format, style }: { t: SharedValue<number>; valeur: number; format: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const [k, setK] = useState(() => phase(t.value, ENTREE.chiffres[0], ENTREE.chiffres[1]));
  useAnimatedReaction(
    () => Math.round(phase(t.value, ENTREE.chiffres[0], ENTREE.chiffres[1]) * 200) / 200,
    (x, avant) => {
      if (x !== avant) scheduleOnRN(setK, x);
    },
  );
  return <Text maxFontSizeMultiplier={POLICE_MAX} style={style}>{format(valeur * k)}</Text>;
}

// ——— Bloc ———

export interface PropsBlocEffort {
  vue: VueEffort;
  variante: VarianteEffort;
  /** Sport du suivi : allure (course, rando) ou vitesse (vélo). */
  exerciceId: string;
  /** Calories estimées (« ~ ») ; null sans poids. */
  calories: number | null;
  /** Source discrète à droite du titre (planche Lieux) ; rien pour le suivi de pepfit. */
  source?: string;
  /** Recette : entrée jouée `ralenti` fois plus lentement. */
  ralenti?: number;
  /**
   * Famille du suivi (planche familles-sports, 30/10) : les chiffres de la fin. Dehors (défaut) : durée, distance, allure,
   * FC, dénivelé, calories ; intérieur : la distance devient une case à saisir (`caseDistance`), l'allure à l'unité du sport ;
   * sports et cours : durée, FC, pas, effort, calories ; récupération : la durée seule.
   */
  famille?: Famille;
  caseDistance?: ReactNode;
  /** Sports et cours : les pas de la séance (undefined : masqués pour ce sport) et l'effort calculé par pepfit. */
  pas?: number | null;
  effortPepfit?: number | null;
  /** L'Effort pepfit est estimé (barème du sport, « ~ »). */
  effortEstime?: boolean;
  /** Séance passée : sous les zones, la ligne qui dit comment avoir ce qui manque (LigneGeste). */
  pied?: ReactNode;
  /** FC coupée et batterie encore optimisée : la ligne « FC coupée … » devient un geste (aide du réglage de batterie). */
  onCoupure?: () => void;
}

export function BlocEffort({ vue, variante, exerciceId, calories, source, ralenti, famille = "dehors", caseDistance, pas, effortPepfit, effortEstime, pied, onCoupure }: PropsBlocEffort) {
  const { couleurs } = useTheme();
  const avecTrace = vue.trace.length >= 2;
  const avecFc = vue.zonesS != null;
  const avecAlt = vue.altitude != null && vue.serieAlt.length >= 2;
  const modes = modesEffort(avecFc, avecAlt);
  // Sans FC ni profil, le tracé passe par « zones » (trait t3) : le mode affiché est toujours l'un des modes du tracé.
  const tracables = modesTrace(modes);
  const [choisi, setMode] = useState<ModeEffort>(avecFc ? "zones" : "altitude");
  const mode = modeAffiche(choisi, tracables);
  // Le bloc prend toute la largeur de la colonne : connue d'emblée, rien ne saute au premier rendu (onLayout corrige ensuite).
  const [largeur, setLargeur] = useState(() => Math.round(largeurContenu()) - 2 * espace.l);
  const h = useEntree(largeur > 0, ralenti);
  const fin = variante === "fin";

  const bloc = useAnimatedStyle(() => {
    const k = phase(h.value, ENTREE.bloc[0], ENTREE.bloc[1]);
    return { opacity: k, transform: [{ translateY: (1 - k) * 8 }] };
  });
  const onLayout = (e: LayoutChangeEvent) => {
    const l = Math.round(e.nativeEvent.layout.width) - 2 * espace.l;
    setLargeur((x) => (x === l ? x : l));
  };

  const selecteur = avecFc && avecAlt && avecTrace ? (
    <Segmente
      jourBlanc
      doux={!fin}
      options={[
        { valeur: "zones", libelle: t(fin ? "effort.zones" : "effort.zoneCardiaque") },
        { valeur: "altitude", libelle: t("effort.altitude") },
      ]}
      valeur={mode}
      onChange={setMode}
      style={fin ? styles.segFin : styles.segPassee}
    />
  ) : null;
  const carte = avecTrace && largeur > 0 ? (
    <Carte vue={vue} variante={variante} mode={mode} modes={tracables} largeur={largeur} t={h} />
  ) : null;
  // sans échantillons de FC (séance vue par Whoop) : les zones sans courbe
  const modesCourbe = modes.filter((m) => m !== "zones" || vue.serieFc.length >= 2);
  const courbe = largeur > 0 && modesCourbe.length ? <Courbes vue={vue} variante={variante} mode={mode} modes={modesCourbe} largeur={largeur} t={h} /> : null;
  // FC coupée en direct (capteur perdu) : une ligne discrète le dit, et ce qu'une autre source en a comblé.
  const coupure = courbe && vue.coupureFc && mode === "zones"
    ? onCoupure ? <LigneGeste texte={texteCoupure(vue.coupureFc)} onPress={onCoupure} /> : <LigneCoupure texte={texteCoupure(vue.coupureFc)} fin={fin} />
    : null;
  const bas = modes.length ? (
    <Superposes actif={mode === "zones" ? 0 : 1} style={fin ? styles.repart : styles.basPassee}>
      {avecFc ? (fin ? <RepartFin vue={vue} t={h} /> : <ZonesPassee vue={vue} t={h} />) : null}
      {avecAlt ? fin ? <AltFin vue={vue} /> : <AltPassee vue={vue} t={h} /> : null}
    </Superposes>
  ) : null;

  if (fin) {
    const mesure = mesureDe(exerciceId);
    const unite = mesureSport(exerciceId);
    return (
      <Animated.View onLayout={onLayout} style={bloc}>
        {carte}
        {selecteur}
        {courbe}
        {coupure}
        {bas}
        <View style={[styles.chiffres, { borderColor: couleurs.line }]}>
          <FaitFin titre={t("effort.duree")} valeur={chronoTexte(vue.dureeS * 1000)} />
          {famille === "seance" || famille === "recup" ? null : caseDistance ?? <FaitFin titre={t("effort.distance")} valeur={vue.distanceM} format={distanceTexte} unite={libelleDistance()} t={h} />}
          {famille === "seance" || famille === "recup" ? null : mesure === "vitesse" ? (
            <FaitFin titre={t("effort.vitesse")} valeur={vitesseTexte(vue.dureeS > 0 && vue.distanceM > 0 ? (vue.distanceM / vue.dureeS) * 3.6 : null)} unite={libelleVitesse()} />
          ) : (
            <FaitFin titre={t("effort.allure")} valeur={allureTexte(vue.allure == null ? null : allureEnUnite(vue.allure, unite))} unite={unite === "allure-500" ? t("effort.par500") : unite === "allure-100" ? t("effort.par100") : libelleAllure()} />
          )}
          {vue.fcMoy != null ? (
            <FaitFin titre={t("effort.fcMoyenne")} valeur={vue.fcMoy} format={entier} unite={t("effort.maxN", { n: vue.fcMax ?? 0 })} t={h} />
          ) : null}
          {famille === "seance" && pas !== undefined ? <FaitFin titre={t("effort.pas")} valeur={pas == null ? "—" : entier(pas)} /> : null}
          {/* L'Effort pepfit, le chiffre seul ; sans FC, il vient du barème du sport : estimé, « ~ ». */}
          {famille === "seance" ? <FaitFin titre={t("effort.effort")} valeur={effortPepfit == null ? "—" : texteEffort(effortPepfit)} /> : null}
          {vue.altitude && famille === "dehors" ? (
            <FaitFin titre={t("effort.denivele")} valeur={vue.altitude.plus} format={(n) => approx(`+${entier(altitudeEnUnite(n))}`, vue.altitude!.approx)} unite={libelleAltitude()} t={h} />
          ) : null}
          {calories != null && famille !== "recup" ? <FaitFin titre={t("effort.calories")} valeur={calories} format={(n) => approx(entier(n))} unite={t("effort.kcal")} t={h} /> : null}
        </View>
      </Animated.View>
    );
  }

  const faits: { titre: string; valeur: number; format: (n: number) => string }[] = [];
  if (vue.fcMoy != null) faits.push({ titre: t("effort.fcMoyenne"), valeur: vue.fcMoy, format: (n) => `${entier(n)} ${t("effort.bpm")}` });
  if (vue.fcMax != null) faits.push({ titre: t("effort.fcMax"), valeur: vue.fcMax, format: (n) => `${entier(n)} ${t("effort.bpm")}` });
  if (calories != null) faits.push({ titre: t("effort.calories"), valeur: calories, format: (n) => approx(`${entier(n)} ${t("effort.kcal")}`) });
  // Avec un tracé et un profil, le dénivelé passe en mode « Altitude » (D14 de la planche Lieux).
  if (vue.altitude && !(avecTrace && avecAlt)) faits.push({ titre: t("effort.denivele"), valeur: vue.altitude.plus, format: (n) => `${entier(altitudeEnUnite(n))} ${libelleAltitude()}` });
  return (
    <Animated.View onLayout={onLayout} style={[styles.effort, { borderBottomColor: couleurs.line }, bloc]}>
      <View style={styles.eh}>
        {/* « Cardio » (planche sport-stats v2, S11) : l'effort de la séance est en grand à droite de son nom, plus ici. */}
        <Texte variante="entete" couleur="t3" accessibilityRole="header">
          {t("sportStats.cardio")}
        </Texte>
        {source ? (
          <Texte variante="meta" couleur="t3">
            {source}
          </Texte>
        ) : null}
      </View>
      {faits.length ? (
        <View style={styles.eg}>
          {faits.map((f) => (
            <FaitPassee key={f.titre} titre={f.titre} valeur={f.valeur} format={f.format} t={h} />
          ))}
        </View>
      ) : null}
      {selecteur}
      {carte}
      {courbe}
      {coupure}
      {bas}
      {pied}
    </Animated.View>
  );
}

/** Ligne discrète qui mène quelque part (même allure que la source des zones) : 12 t3, chevron, 44 de haut. */
export function LigneGeste({ texte, onPress }: { texte: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" accessibilityLabel={texte} onPress={onPress} style={styles.zsrc}>
      <Text maxFontSizeMultiplier={POLICE_MAX} numberOfLines={2} style={[styles.zsrcT, { color: couleurs.t3 }]}>{texte}</Text>
      <Icone nom="right" taille={14} couleur={couleurs.t3} />
    </Appui>
  );
}

/** « FC coupée 14 min · complétée par Whoop » : 12 t3 sous la courbe, sans geste (même allure que la source des zones). */
function LigneCoupure({ texte, fin }: { texte: string; fin: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.zsrcT, styles.coupure, fin && styles.coupureFin, { color: couleurs.t3 }]}>
      {texte}
    </Text>
  );
}

const entier = (n: number) => nombre(Math.round(n), 0);

/** Chiffre de la fin (planche suivi-gps) : libellé 12 t2, valeur 17 medium, unité 13 t2. */
function FaitFin({ titre, valeur, format, unite, t: horloge }: { titre: string; valeur: number | string; format?: (n: number) => string; unite?: string; t?: SharedValue<number> }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.faitFin}>
      <Texte variante="meta" couleur="t2">
        {titre}
      </Texte>
      <View style={styles.faitLigne}>
        {typeof valeur === "number" && format && horloge ? (
          <Compteur t={horloge} valeur={valeur} format={format} style={[styles.faitFinB, { color: couleurs.t1 }]} />
        ) : (
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.faitFinB, { color: couleurs.t1 }]}>{String(valeur)}</Text>
        )}
        {unite ? <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.faitFinU, { color: couleurs.t2 }]}>{unite}</Text> : null}
      </View>
    </View>
  );
}

/** Chiffre du bloc de la séance passée (planche Lieux) : libellé 12 t2, valeur et unité 15 medium. */
function FaitPassee({ titre, valeur, format, t: horloge }: { titre: string; valeur: number; format: (n: number) => string; t: SharedValue<number> }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.faitPassee}>
      <Texte variante="meta" couleur="t2">
        {titre}
      </Texte>
      <Compteur t={horloge} valeur={valeur} format={format} style={[styles.faitPasseeB, { color: couleurs.t1 }]} />
    </View>
  );
}

/**
 * Plusieurs contenus au même endroit, un seul visible : la hauteur est celle du plus haut, quel que soit le visible
 * (le bas du bloc ne change pas de hauteur au changement de mode). Les cachés sont hors de l'accessibilité.
 */
function Superposes({ actif, children, style }: { actif: number; children: ReactNode[]; style?: StyleProp<TextStyle> }) {
  const [hauteurs, setHauteurs] = useState<number[]>([]);
  // un seul contenu présent (sans FC : l'altitude seule) laisse un trou dans le tableau : il ne compte pas
  const h = Math.max(0, ...hauteurs.filter((x) => Number.isFinite(x)));
  return (
    <View style={[style, { height: h || undefined }]}>
      {children.map((c, i) =>
        c ? (
          <View
            key={i}
            onLayout={(e) => {
              const v = Math.ceil(e.nativeEvent.layout.height);
              setHauteurs((x) => (x[i] === v ? x : Object.assign([...x], { [i]: v })));
            }}
            pointerEvents={i === actif ? "auto" : "none"}
            importantForAccessibility={i === actif ? "auto" : "no-hide-descendants"}
            accessibilityElementsHidden={i !== actif}
            style={[styles.superpose, { opacity: i === actif ? 1 : 0 }]}
          >
            {c}
          </View>
        ) : null,
      )}
    </View>
  );
}

/** Fondu enchaîné de 200 ms entre les modes (planche Lieux : rien ne se redessine). */
function Fondu({ visible, children }: { visible: boolean; children: ReactNode }) {
  const reduit = useReduit();
  const o = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    o.value = reduit ? (visible ? 1 : 0) : withTiming(visible ? 1 : 0, { duration: duree.entree, easing: easings.sortie });
  }, [visible, reduit, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!visible}
      style={[StyleSheet.absoluteFill, style]}
    >
      {children}
    </Animated.View>
  );
}

// ——— Tracé (Skia) ———

/** Ligne brisée par les points (x, y), de l'indice `a` à `b` inclus. */
export function ligneDe(pts: readonly Pt[], a = 0, b = pts.length - 1, fermer?: { bas: number }): SkPath {
  const p = Skia.PathBuilder.Make();
  for (let i = a; i <= b; i++) {
    const q = pts[i]!;
    if (i === a) p.moveTo(q.x, q.y);
    else p.lineTo(q.x, q.y);
  }
  if (fermer && b > a) p.lineTo(pts[b]!.x, fermer.bas).lineTo(pts[a]!.x, fermer.bas).close();
  return p.build();
}
const cheminDe = (xy: readonly Pt[], a: number, b: number) => ligneDe(xy, a, b);

interface Morceau {
  chemin: SkPath;
  couleur: string;
  /** Part du temps de la course où le morceau commence et finit (0 à 1). */
  a: number;
  b: number;
}

/** Morceaux du tracé de même couleur : par zone ; par petits morceaux de 6 points pour l'altitude (dégradé). Les couleurs sont celles de la carte pleine (couleursTrace). */
export function morceauxTrace(trace: readonly PointTrace[], xy: readonly Pt[], mode: ModeEffort, couleurs: Jetons, alt: { min: number; max: number } | null): Morceau[] {
  const finS = trace.at(-1)?.s || 1;
  const part = (i: number) => trace[i]!.s / finS;
  return couleursTrace(trace, mode, couleurs, alt).map((m) => ({ chemin: cheminDe(xy, m.a, m.b), couleur: m.couleur, a: part(m.a), b: part(m.b) }));
}

/** Un morceau qui se trace avec l'horloge (le temps de la course : départ à 100 ms, arrivée à 800 ms). */
function MorceauAnime({ m, t, largeur }: { m: Morceau; t: SharedValue<number>; largeur: number }) {
  const fin = useDerivedValue(() => {
    const p = phase(t.value, ENTREE.dessin[0], ENTREE.dessin[1]);
    return m.b > m.a ? Math.min(1, Math.max(0, (p - m.a) / (m.b - m.a))) : p >= m.a ? 1 : 0;
  });
  return <Path path={m.chemin} style="stroke" strokeWidth={largeur} strokeCap="round" strokeJoin="round" color={m.couleur} start={0} end={fin} />;
}

const CARTE = {
  fin: { hauteur: 228, marge: 28, haut: 24, trait: 5, liseré: 8, fond: "s1" as const },
  passee: { hauteur: 220, marge: 18, haut: 18, trait: 4, liseré: 7, fond: "s2" as const },
};

/**
 * Tuile du tracé : fond de carte fixe (D2, même style qu'en course ; sans réseau, le fond neutre), tracé, départ, arrivée,
 * tours. La toucher l'ouvre en plein écran (CartePleineSeance, 08/11 : il remplace l'ouverture directe de Google Maps du
 * 30/10, qui reste un bouton de la carte pleine) ; sans tracé, rien à agrandir.
 */
function Carte({ vue, variante, mode, modes, largeur, t }: { vue: VueEffort; variante: VarianteEffort; mode: ModeEffort; modes: ModeEffort[]; largeur: number; t: SharedValue<number> }) {
  const { couleurs } = useTheme();
  const c = CARTE[variante];
  const xy = useMemo(() => projeter(vue.trace, largeur, c.hauteur, c.marge, c.haut), [vue.trace, largeur, c]);
  const finS = vue.trace.at(-1)?.s || 1;
  const reperes = useMemo(
    () => vue.reperes.map((r) => {
      let i = 0;
      while (i + 1 < vue.trace.length && vue.trace[i + 1]!.s <= r.s) i++;
      return { q: xy[i]!, part: r.s / finS };
    }),
    [vue.reperes, vue.trace, xy, finS],
  );
  const a = xy[0]!;
  const z = xy[xy.length - 1]!;
  const arrivee = useDerivedValue(() => (phase(t.value, ENTREE.dessin[0], ENTREE.dessin[1]) >= 0.999 ? 1 : 0));
  const fond = useMemo(() => vueProjection(vue.trace, largeur, c.hauteur, c.marge, c.haut), [vue.trace, largeur, c]);
  const agrandir = vue.trace.length >= 2;
  const ouvrir = () => {
    poserTrace({ trace: vue.trace, altitude: vue.altitude, mode, distanceM: vue.distanceM, dureeS: vue.dureeS });
    router.push("/suivi/carte");
  };
  return (
    <Appui
      accessible
      disabled={!agrandir}
      echelle={echelle.appuiPrincipal}
      onPress={agrandir ? ouvrir : undefined}
      accessibilityRole={agrandir ? "button" : "image"}
      accessibilityLabel={agrandir ? `${t2("effort.trace")}, ${t2("effort.agrandir")}` : t2("effort.trace")}
      style={[variante === "fin" ? styles.carteFin : styles.cartePassee, { height: c.hauteur, backgroundColor: couleurs[c.fond] }]}
    >
      {fond ? <FondCarte vue={fond} /> : null}
      {modes.map((m) => (
        <Fondu key={m} visible={m === mode}>
          <TraceMode vue={vue} xy={xy} mode={m} t={t} variante={variante} largeur={largeur} />
        </Fondu>
      ))}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {variante === "fin" ? (
          <>
            <Circle cx={a.x} cy={a.y} r={5} color={couleurs.bg} />
            <Circle cx={a.x} cy={a.y} r={5} style="stroke" strokeWidth={2} color={couleurs.t1} />
            <Group opacity={arrivee}>
              <RoundedRect x={z.x - 5} y={z.y - 5} width={10} height={10} r={2} color={couleurs.t1} />
              <RoundedRect x={z.x - 5} y={z.y - 5} width={10} height={10} r={2} style="stroke" strokeWidth={2} color={couleurs.bg} />
            </Group>
          </>
        ) : (
          <>
            <Circle cx={a.x} cy={a.y} r={5} color={couleurs.t1} />
            <Circle cx={a.x} cy={a.y} r={5} style="stroke" strokeWidth={2.5} color={couleurs.bg} />
            {/* l'arrivée aussi, comme en fin de séance : sur un fond de carte, le sens du parcours se lit */}
            <Group opacity={arrivee}>
              <RoundedRect x={z.x - 5} y={z.y - 5} width={10} height={10} r={2} color={couleurs.t1} />
              <RoundedRect x={z.x - 5} y={z.y - 5} width={10} height={10} r={2} style="stroke" strokeWidth={2} color={couleurs.bg} />
            </Group>
          </>
        )}
      </Canvas>
      {reperes.map((r, k) => (
        <Pastille key={k} n={k + 1} x={r.q.x} y={r.q.y} part={r.part} t={t} />
      ))}
      {agrandir ? (
        <View pointerEvents="none" style={[styles.puce, { backgroundColor: couleurs.bg }]} importantForAccessibility="no-hide-descendants">
          <Icone nom="agrandir" couleur={couleurs.t1} taille={16} />
        </View>
      ) : null}
    </Appui>
  );
}


function TraceMode({ vue, xy, mode, t, variante, largeur }: { vue: VueEffort; xy: Pt[]; mode: ModeEffort; t: SharedValue<number>; variante: VarianteEffort; largeur: number }) {
  const { couleurs } = useTheme();
  const c = CARTE[variante];
  const morceaux = useMemo(() => morceauxTrace(vue.trace, xy, mode, couleurs, vue.altitude), [vue.trace, xy, mode, couleurs, vue.altitude]);
  return (
    <Canvas style={{ width: largeur, height: c.hauteur }}>
      {morceaux.map((m, i) => (
        <MorceauAnime key={`l${i}`} m={{ ...m, couleur: couleurs.bg }} t={t} largeur={c.liseré} />
      ))}
      {morceaux.map((m, i) => (
        <MorceauAnime key={`c${i}`} m={m} t={t} largeur={c.trait} />
      ))}
    </Canvas>
  );
}

/** Repère numéroté d'un tour (rond de 18 en t1, chiffre en couleur du fond) : paraît quand le tracé l'atteint. */
function Pastille({ n, x, y, part, t }: { n: number; x: number; y: number; part: number; t: SharedValue<number> }) {
  const { couleurs } = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: phase(t.value, ENTREE.dessin[0], ENTREE.dessin[1]) >= part ? 1 : 0 }));
  return (
    <Animated.View pointerEvents="none" style={[styles.pastille, { left: x - 11, top: y - 11, backgroundColor: couleurs.t1, borderColor: couleurs.bg }, style]}>
      <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.pastilleT, { color: couleurs.bg }]}>{n}</Text>
    </Animated.View>
  );
}

// ——— Courbes (Skia) : FC par zone ou profil d'altitude ———

/** Arrêts francs d'un dégradé vertical : la couleur de la zone où passe le trait (de haut en bas, Z5 → Z1). */
export function arretsZones(y: (v: number) => number, haut: number, bas: number, bornes: readonly number[], couleurs: Jetons) {
  const pos = (v: number) => Math.min(1, Math.max(0, (y(v) - haut) / (bas - haut)));
  const cs: string[] = [];
  const ps: number[] = [];
  for (let z = 5; z >= 1; z--) {
    const c = couleurs[`zone${z}` as keyof Jetons];
    cs.push(c, c);
    ps.push(z === 5 ? 0 : pos(bornes[z]! - 0.5), z === 1 ? 1 : pos(bornes[z - 1]! - 0.5));
  }
  return { cs, ps };
}

const COURBE = {
  fin: { hauteur: 124, haut: 16, droite: 28, gauche: 0, bas: 2 },
  passee: { hauteur: 150, haut: 6, droite: 4, gauche: 28, bas: 20 },
};

function Courbes({ vue, variante, mode, modes, largeur, t }: { vue: VueEffort; variante: VarianteEffort; mode: ModeEffort; modes: ModeEffort[]; largeur: number; t: SharedValue<number> }) {
  const c = COURBE[variante];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t2(mode === "zones" ? "effort.courbeFc" : "effort.profil")}
      style={[variante === "fin" ? styles.courbeFin : styles.courbePassee, { height: c.hauteur }]}
    >
      {modes.map((m) => (
        <Fondu key={m} visible={m === mode}>
          {m === "zones" ? <CourbeFc vue={vue} variante={variante} largeur={largeur} t={t} /> : <CourbeAlt vue={vue} variante={variante} largeur={largeur} t={t} />}
        </Fondu>
      ))}
    </View>
  );
}

/** Découpe qui s'ouvre de gauche à droite (de 100 à 800 ms) ; graduations, bandes et repères restent en place. */
export function useDecoupe(t: SharedValue<number>, x0: number, largeur: number, hauteur: number) {
  return useDerivedValue(() => Skia.XYWHRect(x0 - 2, 0, (largeur - x0 + 4) * phase(t.value, ENTREE.dessin[0], ENTREE.dessin[1]), hauteur));
}

function CourbeFc({ vue, variante, largeur, t }: { vue: VueEffort; variante: VarianteEffort; largeur: number; t: SharedValue<number> }) {
  const { couleurs, mode } = useTheme();
  const c = COURBE[variante];
  const fin = variante === "fin";
  const serie = vue.serieFc;
  const bpms = serie.map((f) => f.bpm);
  const lo = fin ? Math.min(100, Math.min(...bpms) - 2) : Math.min(85, Math.min(...bpms) - 5);
  const hi = fin ? Math.max(175, Math.max(...bpms) + 2) : Math.max(185, Math.max(...bpms) + 5);
  const finS = Math.max(vue.dureeS, serie.at(-1)?.s ?? 0) || 1;
  const pw = largeur - c.gauche - c.droite;
  const X = (s: number) => c.gauche + (s / finS) * pw;
  const yHaut = c.haut;
  const yBas = c.hauteur - c.bas;
  const Y = (v: number) => yBas - ((v - lo) / (hi - lo)) * (yBas - yHaut);
  // Coupée aux trous (jamais de ligne droite d'un bord à l'autre) ; les points comblés par Whoop ou Santé Connect à part, atténués.
  const chemins = useMemo(
    () => {
      const direct = Skia.PathBuilder.Make();
      const comble = Skia.PathBuilder.Make();
      for (const m of morceauxCourbe(serie)) {
        const p = m.source ? comble : direct;
        m.points.forEach((f, i) => (i ? p.lineTo(X(f.s), Y(f.bpm)) : p.moveTo(X(f.s), Y(f.bpm))));
      }
      return { direct: direct.build(), comble: comble.build() };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serie, largeur, lo, hi, finS],
  );
  const sourceComblee = serie.find((f) => f.source)?.source;
  const { cs, ps } = arretsZones(Y, Y(hi), Y(lo), vue.bornes, couleurs);
  const decoupe = useDecoupe(t, c.gauche, largeur, c.hauteur);
  const b = vue.bornes;
  const etiquettes: { texte: string; x: number; y: number; ancre: "debut" | "milieu" | "fin" }[] = [];
  if (fin) b.forEach((v, i) => v > lo && v < hi && etiquettes.push({ texte: t2("effort.zone", { n: i + 1 }), x: largeur, y: Y(v), ancre: "fin" }));
  else {
    [100, 140, 180].forEach((v) => v > lo && v < hi && etiquettes.push({ texte: String(v), x: 0, y: Y(v), ancre: "debut" }));
    graduationsMinutes(finS).forEach((mn, i) => etiquettes.push({ texte: i ? t2("effort.minN", { n: mn }) : "0", x: X(mn * 60), y: c.hauteur - 8, ancre: i ? "milieu" : "debut" }));
  }
  return (
    <>
      <Canvas style={{ width: largeur, height: c.hauteur }}>
        {fin
          ? b.map((v, i) =>
              v > lo && v < hi ? (
                <Line key={i} p1={vec(0, Y(v))} p2={vec(pw, Y(v))} color={couleurs.line2} strokeWidth={0.5} style="stroke">
                  <DashPathEffect intervals={[2, 3]} />
                </Line>
              ) : null,
            )
          : b.map((bas, i) => {
              const hautZ = i < 4 ? b[i + 1]! - 1 : vue.fcMaxProfil;
              const y0 = Y(Math.min(hi, hautZ + 0.5));
              const y1 = Y(Math.max(lo, bas - 0.5));
              return y1 > y0 ? (
                <Rect key={i} x={c.gauche} y={y0} width={pw} height={y1 - y0} color={couleurs[`zone${i + 1}` as keyof Jetons]} opacity={mode === "nuit" ? 0.13 : 0.1} />
              ) : null;
            })}
        <Reperes vue={vue} X={X} haut={fin ? yHaut : 6} bas={fin ? c.hauteur : yBas} couleur={couleurs.t3} />
        <Group clip={decoupe}>
          <Path path={chemins.direct} style="stroke" strokeWidth={serie.length > 400 ? 1.4 : 2} strokeJoin="round" strokeCap="round">
            <LinearGradient start={vec(0, Y(hi))} end={vec(0, Y(lo))} colors={cs} positions={ps} />
          </Path>
          {sourceComblee ? (
            <Path path={chemins.comble} style="stroke" strokeWidth={serie.length > 400 ? 1.4 : 2} strokeJoin="round" strokeCap="round" opacity={0.45}>
              <LinearGradient start={vec(0, Y(hi))} end={vec(0, Y(lo))} colors={cs} positions={ps} />
            </Path>
          ) : null}
        </Group>
      </Canvas>
      <Etiquettes l={etiquettes} variante={variante} />
      <NumerosTours vue={vue} X={X} variante={variante} />
    </>
  );
}

function CourbeAlt({ vue, variante, largeur, t }: { vue: VueEffort; variante: VarianteEffort; largeur: number; t: SharedValue<number> }) {
  const { couleurs } = useTheme();
  const c = COURBE[variante];
  const fin = variante === "fin";
  const serie = vue.serieAlt;
  const alt = vue.altitude!;
  const { lo, hi } = echelleAltitude(alt.min, alt.max, fin ? 1 : 2);
  const pw = largeur - c.gauche - c.droite;
  // Fin : profil dans le temps ; séance passée (planche Lieux) : dans la distance, graduée en km.
  const finS = Math.max(vue.dureeS, serie.at(-1)?.s ?? 0) || 1;
  const finD = vue.distanceM || 1;
  const X = (s: number) => c.gauche + (s / finS) * pw;
  const Xd = (d: number) => c.gauche + (d / finD) * pw;
  const yBas = c.hauteur - c.bas;
  const Y = (v: number) => yBas - ((v - lo) / (hi - lo)) * (yBas - c.haut);
  const xDe = (p: { s: number; d: number }) => (fin ? X(p.s) : Xd(p.d));
  const { ligne, aire } = useMemo(() => {
    const xy = serie.map((p) => ({ x: xDe(p), y: Y(p.alt) }));
    return { ligne: ligneDe(xy), aire: ligneDe(xy, 0, xy.length - 1, { bas: fin ? c.hauteur : yBas }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, largeur, lo, hi, fin]);
  const decoupe = useDecoupe(t, c.gauche, largeur, c.hauteur);
  const degrade = <LinearGradient start={vec(0, Y(alt.max))} end={vec(0, Y(alt.min))} colors={[couleurs.altHaut, couleurs.altBas]} />;
  const m = (v: number) => `${altitudeEnUnite(v)} ${libelleAltitude()}`;
  const etiquettes: { texte: string; x: number; y: number; ancre: "debut" | "milieu" | "fin" }[] = fin
    ? [{ texte: m(alt.max), x: largeur, y: Y(alt.max), ancre: "fin" }, { texte: m(alt.min), x: largeur, y: Y(alt.min), ancre: "fin" }]
    : [
        { texte: m(alt.max), x: 0, y: Y(alt.max), ancre: "debut" },
        { texte: m(alt.min), x: 0, y: Y(alt.min), ancre: "debut" },
        ...graduationsDistance(vue.distanceM).map((k, i) => ({ texte: i ? `${nombre(k, 1)} ${libelleDistance()}` : "0", x: Xd(k * metresParUnite()), y: c.hauteur - 8, ancre: (i ? "milieu" : "debut") as "milieu" | "debut" })),
      ];
  return (
    <>
      <Canvas style={{ width: largeur, height: c.hauteur }}>
        <Reperes vue={vue} X={fin ? X : (s) => Xd(vue.reperes.find((r) => r.s === s)?.d ?? 0)} haut={fin ? c.haut : 6} bas={fin ? c.hauteur : yBas} couleur={couleurs.t3} />
        <Group clip={decoupe}>
          {fin ? <Path path={aire} color={couleurs.s1} /> : <Path path={aire} opacity={0.28}>{degrade}</Path>}
          <Path path={ligne} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round">
            {degrade}
          </Path>
        </Group>
      </Canvas>
      <Etiquettes l={etiquettes} variante={variante} />
      <NumerosTours vue={vue} X={fin ? X : (s) => Xd(vue.reperes.find((r) => r.s === s)?.d ?? 0)} variante={variante} />
    </>
  );
}

/** Traits pointillés des tours sur une courbe (dans le Canvas : pas de contexte React, la couleur est passée). */
function Reperes({ vue, X, haut, bas, couleur }: { vue: VueEffort; X: (s: number) => number; haut: number; bas: number; couleur: string }) {
  return (
    <>
      {vue.reperes.map((r, i) => (
        <Line key={i} p1={vec(X(r.s), haut)} p2={vec(X(r.s), bas)} color={couleur} strokeWidth={1} style="stroke">
          <DashPathEffect intervals={[2, 3]} />
        </Line>
      ))}
    </>
  );
}

/** Numéros des tours au-dessus des traits (11 semibold t2 ; planche Lieux, sans tours dessinés : 10, en haut à droite du trait). */
function NumerosTours({ vue, X, variante }: { vue: VueEffort; X: (s: number) => number; variante: VarianteEffort }) {
  const { couleurs } = useTheme();
  return (
    <>
      {vue.reperes.map((r, i) =>
        variante === "fin" ? (
          <Text maxFontSizeMultiplier={POLICE_MAX} key={i} style={[styles.numTour, { left: X(r.s) - 12, color: couleurs.t2 }]}>
            {i + 1}
          </Text>
        ) : (
          <Text maxFontSizeMultiplier={POLICE_MAX} key={i} style={[styles.numTourP, { left: X(r.s) + 3, color: couleurs.t2 }]}>
            {i + 1}
          </Text>
        ),
      )}
    </>
  );
}

/** Graduations en texte (Inter, chiffres tabulaires) posées sur la courbe : `y` est le centre de la ligne. */
export function Etiquettes({ l, variante }: { l: { texte: string; x: number; y: number; ancre: "debut" | "milieu" | "fin" }[]; variante: VarianteEffort }) {
  const { couleurs } = useTheme();
  const taille = variante === "fin" ? 10 : 11;
  return (
    <>
      {l.map((e, i) => (
        <Text
          maxFontSizeMultiplier={POLICE_MAX}
          key={i}
          numberOfLines={1}
          style={[
            styles.etiquette,
            { fontSize: taille, lineHeight: 14, top: e.y - 7, color: couleurs.t3 },
            e.ancre === "fin" ? { right: 0, textAlign: "right" } : e.ancre === "milieu" ? { left: e.x - 40, width: 80, textAlign: "center" } : { left: e.x },
          ]}
        >
          {e.texte}
        </Text>
      ))}
    </>
  );
}

// ——— Bas du bloc ———

/** Barre des zones de la fin : écart entre segments, marge à droite de chaque étiquette, hauteur pleine et d'une zone vide. */
const BARRE_ZONES = { ecart: 2, marge: 6, haut: 8, hautVide: 4, rayon: 2, opaciteVide: 0.22, estimee: 28 } as const;

/**
 * Fin (planche suivi-gps) : temps par zone en une barre empilée, Z1 à Z5 et leur temps (« — » sous 30 s). Chaque étiquette
 * se pose à gauche sous SON segment, qui fait au moins sa largeur mesurée ; une zone vide reste une mini-barre de sa couleur,
 * pâle et moins haute (retour du 29/10). Aussi sous la courbe de FC d'une séance de muscu (BlocFcMuscu).
 */
export function RepartFin({ vue, t }: { vue: Pick<VueEffort, "zonesS" | "zonesFc">; t: SharedValue<number> }) {
  const { couleurs } = useTheme();
  const z = vue.zonesS!;
  // Sous Z1, le temps compte en Z1 (la planche n'a que cinq zones).
  const parZone = [z[0] + z[1], z[2], z[3], z[4], z[5]];
  const [largeur, setLargeur] = useState(0);
  // Largeur mesurée de chaque étiquette (« Zn » et son temps) : le minimum de son segment.
  const [tailles, setTailles] = useState<number[]>([]);
  const mesurer = (i: number, l: number) =>
    setTailles((x) => {
      if (Math.abs((x[i] ?? 0) - l) < 0.5) return x;
      const y = [...x];
      y[i] = l;
      return y;
    });
  const segments = largeur
    ? repartitionZones(parZone, largeur, parZone.map((_, i) => (tailles[i] ?? BARRE_ZONES.estimee) + BARRE_ZONES.marge), BARRE_ZONES.ecart)
    : [];
  const plein = (i: number) => segments[i] != null && !segments[i]!.vide;
  const pile = useAnimatedStyle(() => ({ transform: [{ scaleX: phase(t.value, ENTREE.barres.debut, ENTREE.barres.duree * 2) }] }));
  const R = BARRE_ZONES.rayon;
  return (
    <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.pile, { transformOrigin: "left" }, pile]}>
        {segments.map((g, i) => {
          // Une suite de zones pleines forme une barre arrondie à ses deux bouts ; une mini-barre vide a ses propres arrondis.
          const gauche = g.vide || !plein(i - 1) ? R : 0;
          const droite = g.vide || !plein(i + 1) ? R : 0;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: g.x,
                width: g.l,
                top: g.vide ? (BARRE_ZONES.haut - BARRE_ZONES.hautVide) / 2 : 0,
                height: g.vide ? BARRE_ZONES.hautVide : BARRE_ZONES.haut,
                borderTopLeftRadius: gauche,
                borderBottomLeftRadius: gauche,
                borderTopRightRadius: droite,
                borderBottomRightRadius: droite,
                backgroundColor: couleurs[`zone${i + 1}` as keyof Jetons],
                opacity: g.vide ? BARRE_ZONES.opaciteVide : 1,
              }}
            />
          );
        })}
      </Animated.View>
      <View style={styles.tz}>
        {parZone.map((s, i) => (
          <View
            key={i}
            onLayout={(e) => mesurer(i, e.nativeEvent.layout.width)}
            style={[styles.tzE, { left: segments[i]?.x ?? 0, opacity: segments.length ? 1 : 0 }]}
          >
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.tzZ, { color: couleurs[`zone${i + 1}` as keyof Jetons] }]}>{t2("effort.zone", { n: i + 1 })}</Text>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.tzT, { color: couleurs.t2 }]}>{s >= SEUIL_ZONE_S ? chronoTexte(s * 1000) : "—"}</Text>
          </View>
        ))}
      </View>
      <SourceZones vue={vue} />
    </View>
  );
}

/** Source des zones (planche vma-vo2max) : « Réserve cardiaque · FC max 184, mesurée · repos 46 › » ; ouvre Zones de FC. */
function SourceZones({ vue }: { vue: Pick<VueEffort, "zonesFc"> }) {
  const { couleurs } = useTheme();
  if (!vue.zonesFc) return null;
  const texte = sourceZones(vue.zonesFc);
  return (
    <Appui accessibilityRole="link" accessibilityLabel={`${texte}, ${t2("zones.voir")}`} onPress={() => router.push("/settings/zones")} style={styles.zsrc}>
      <Text maxFontSizeMultiplier={POLICE_MAX} numberOfLines={1} style={[styles.zsrcT, { color: couleurs.t3 }]}>{texte}</Text>
      <Icone nom="right" taille={14} couleur={couleurs.t3} />
    </Appui>
  );
}

/** Fin : rampe d'altitude, bornes basse et haute. */
function AltFin({ vue }: { vue: VueEffort }) {
  const { couleurs } = useTheme();
  const a = vue.altitude!;
  return (
    <View>
      <View style={styles.grad}>
        <FondDegrade angle={90} arrets={[{ offset: 0, couleur: couleurs.altBas }, { offset: 1, couleur: couleurs.altHaut }]} />
      </View>
      <View style={styles.bornes}>
        <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.tzT, { color: couleurs.t2 }]}>{`${altitudeEnUnite(a.min)} ${libelleAltitude()}`}</Text>
        <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.tzT, { color: couleurs.t2 }]}>{`${altitudeEnUnite(a.max)} ${libelleAltitude()}`}</Text>
      </View>
    </View>
  );
}

/** Séance passée (planche Lieux) : une ligne par zone, plage de bpm, barre, durée ; Z0 seulement si elle a du temps. */
function ZonesPassee({ vue, t }: { vue: VueEffort; t: SharedValue<number> }) {
  const { couleurs } = useTheme();
  const z = vue.zonesS!;
  const b = vue.bornes;
  const lignes = z.map((s, i) => ({ i, s })).filter((x) => x.i > 0 || x.s > 0);
  const max = Math.max(1, ...lignes.map((x) => x.s));
  return (
    <View style={styles.zones}>
      {lignes.map(({ i, s }, rang) => {
        const c = i ? couleurs[`zone${i}` as keyof Jetons] : couleurs.t3;
        const plage = i ? `${b[i - 1]}–${i < 5 ? b[i]! - 1 : vue.fcMaxProfil}` : `< ${b[0]}`;
        const d = dureeZone(s);
        return (
          <View key={i} style={styles.zoneL}>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.zoneZ, { color: c }]}>{t2("effort.zone", { n: i })}</Text>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.zonePl, { color: couleurs.t3 }]}>{plage}</Text>
            <View style={[styles.zoneBr, { backgroundColor: couleurs.s2 }]}>
              <BarreZone part={s ? Math.max(0.02, s / max) : 0} couleur={c} rang={rang} t={t} />
            </View>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.zoneM, { color: couleurs.t2 }]}>{t2(d.unite === "min" ? "effort.minN" : "effort.sN", { n: d.n })}</Text>
          </View>
        );
      })}
      <SourceZones vue={vue} />
    </View>
  );
}

/** Barre qui se remplit depuis la gauche, l'une après l'autre (250 ms puis +60 ms par barre, 300 ms chacune). */
function BarreZone({ part, couleur, rang, t }: { part: number; couleur: string; rang: number; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: phase(t.value, ENTREE.barres.debut + rang * ENTREE.barres.pas, ENTREE.barres.duree) }] }));
  return <Animated.View style={[styles.zoneI, { width: `${part * 100}%`, backgroundColor: couleur, transformOrigin: "left" }, style]} />;
}

/** Séance passée, mode « Altitude » (D14 de Lieux) : min, max et dénivelé à la place des barres. */
function AltPassee({ vue, t }: { vue: VueEffort; t: SharedValue<number> }) {
  const a = vue.altitude!;
  const m = (n: number) => `${entier(altitudeEnUnite(n))} ${libelleAltitude()}`;
  return (
    <View style={styles.eg}>
      <FaitPassee titre={t2("effort.altitudeMin")} valeur={a.min} format={m} t={t} />
      <FaitPassee titre={t2("effort.altitudeMax")} valeur={a.max} format={m} t={t} />
      <FaitPassee titre={t2("effort.denivele")} valeur={a.plus} format={(n) => approx(m(n), a.approx)} t={t} />
    </View>
  );
}

const styles = StyleSheet.create({
  // fin (planche suivi-gps)
  // 32 de dessin dans une carte entière à toucher : la zone de toucher est celle de la carte, bien au-delà de 44 (comme la page d'un circuit).
  puce: { position: "absolute", top: espace.s, right: espace.s, width: 32, height: 32, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
  carteFin: { marginTop: espace.l, marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  segFin: { marginTop: espace.m, marginHorizontal: espace.l },
  courbeFin: { marginTop: espace.m, marginHorizontal: espace.l },
  repart: { marginTop: 14, marginHorizontal: espace.l },
  pile: { height: BARRE_ZONES.haut },
  // Étiquettes posées chacune sous son segment (absolues) : la rangée garde leur hauteur (11/14 + 1 + 12/16).
  tz: { height: 31, marginTop: espace.s },
  zsrc: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  coupure: { marginTop: 6 },
  coupureFin: { marginHorizontal: espace.l },
  zsrcT: { flexShrink: 1, fontFamily: police.regular, fontSize: 12 },
  tzE: { position: "absolute", top: 0 },
  tzZ: { fontFamily: police.semibold, fontSize: 11, lineHeight: 14, marginBottom: 1 },
  tzT: { fontFamily: police.regular, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  grad: { height: 8, borderRadius: 2, overflow: "hidden" },
  bornes: { flexDirection: "row", justifyContent: "space-between", marginTop: espace.s },
  chiffres: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: espace.l,
    marginTop: espace.xl,
    marginHorizontal: espace.l,
    paddingVertical: espace.l,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  faitFin: { width: "33.333%", paddingRight: espace.l },
  faitLigne: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 3 },
  faitFinB: { fontFamily: police.medium, fontSize: 17, lineHeight: 21, fontVariant: ["tabular-nums"] },
  faitFinU: { fontFamily: police.regular, fontSize: 13 },
  // séance passée (planche Lieux)
  effort: { paddingTop: espace.l, paddingHorizontal: espace.l, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  eh: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: espace.m },
  eg: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  faitPassee: { width: "33.333%", paddingRight: espace.l },
  faitPasseeB: { fontFamily: police.medium, fontSize: 15, lineHeight: 20, marginTop: 2, fontVariant: ["tabular-nums"] },
  segPassee: { marginTop: 18, marginBottom: espace.m },
  cartePassee: { borderRadius: rayon.l, overflow: "hidden", marginBottom: 14 },
  courbePassee: { marginTop: espace.xs },
  basPassee: { marginTop: 18 },
  zones: { gap: 9 },
  zoneL: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 15 },
  zoneZ: { width: 22, fontFamily: police.semibold, fontSize: 12 },
  zonePl: { width: 58, fontFamily: police.regular, fontSize: 12, fontVariant: ["tabular-nums"] },
  zoneBr: { flex: 1, height: 6, borderRadius: 2, overflow: "hidden" },
  zoneI: { height: "100%", borderRadius: 2 },
  zoneM: { width: 48, textAlign: "right", fontFamily: police.regular, fontSize: 12, fontVariant: ["tabular-nums"] },
  // communs
  superpose: { position: "absolute", left: 0, right: 0, top: 0 },
  pastille: { position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  pastilleT: { fontFamily: police.semibold, fontSize: 11, lineHeight: 13, includeFontPadding: false },
  etiquette: { position: "absolute", fontFamily: police.regular, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  numTour: { position: "absolute", top: 0, width: 24, textAlign: "center", fontFamily: police.semibold, fontSize: 11, lineHeight: 14 },
  numTourP: { position: "absolute", top: 0, fontFamily: police.semibold, fontSize: TAILLE_MIN, lineHeight: 13 },
});
