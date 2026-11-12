// Briques de la page Santé complète (planche sante-energie) : barres en segments qui se remplissent (D11), valeur avec son
// unité en petit, pastille de couleur, titre de section, navigation jour par jour.
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Line, Rect } from "react-native-svg";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { useCouleurPartie } from "../ui/ContextePartie";
import { Icone } from "../ui/Icone";
import { avecOpacite } from "../theme/teintes";
import { courbes } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { useReduit } from "../ui/reduit";
import { PRECISIONS, type Precision } from "./energie-precision";

/** D11 : chaque segment se remplit de gauche à droite en 260 ms, 40 ms après le précédent ; mouvement réduit : fondu 200 ms. */
export const REMPLISSAGE = { dureeMs: 260, ecartMs: 40, fonduMs: 200, depart: 0.02 } as const;

/** Le prévu (page Énergie, demande d'Alex du 04/11) : la teinte du réel, en tirets et plus transparente. */
export const PREVU = { tiret: "5 3", opacite: 0.6 } as const;

/** Une piste en tirets, de toute la largeur de son parent (pastille prévue). */
function Tirets({ couleur, hauteur, tiret = PREVU.tiret }: { couleur: string; hauteur: number; tiret?: string }) {
  return (
    <Svg width="100%" height={hauteur}>
      <Line x1={0} x2="100%" y1={hauteur / 2} y2={hauteur / 2} stroke={couleur} strokeOpacity={PREVU.opacite} strokeWidth={hauteur} strokeDasharray={tiret} />
    </Svg>
  );
}

const [PLEIN, VIDE] = PREVU.tiret.split(" ").map(Number) as [number, number];

/** Les termes prévus d'une barre en une seule suite de tirets au rythme régulier : chaque tiret prend la couleur du terme
 * sous son milieu (des tirets par terme se coupaient en éclats sur les petits termes, recette du 04/11). */
function SuiteTirets({ termes, hauteur }: { termes: readonly { couleur: string; valeur: number }[]; hauteur: number }) {
  const [w, setW] = useState(0);
  const total = termes.reduce((a, x) => a + Math.max(0, x.valeur), 0);
  const tirets: ReactNode[] = [];
  for (let x = 0, i = 0, fin = 0; w > 0 && total > 0 && x < w; x += PLEIN + VIDE) {
    const milieu = ((x + PLEIN / 2) / w) * total;
    while (i < termes.length - 1 && milieu > fin + Math.max(0, termes[i]!.valeur)) fin += Math.max(0, termes[i++]!.valeur);
    tirets.push(<Rect key={x} x={x} y={0} width={Math.min(PLEIN, w - x)} height={hauteur} fill={termes[i]!.couleur} fillOpacity={PREVU.opacite} />);
  }
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={hauteur}>{tirets}</Svg>
    </View>
  );
}

type Morceau = { couleur: string; valeur: number; prevu?: boolean };

function Segment({ couleur, flex, rang, cle, tirets, hauteur }: { couleur: string; flex: number; rang: number; cle: string; tirets?: readonly Morceau[]; hauteur: number }) {
  const reduit = useReduit();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(rang * REMPLISSAGE.ecartMs, withTiming(1, { duration: reduit ? REMPLISSAGE.fonduMs : REMPLISSAGE.dureeMs, easing: courbes.sortie }));
    // re-joué seulement quand les valeurs changent (cle), pas à chaque rendu
  }, [cle, rang, reduit, p]);
  const style = useAnimatedStyle(() =>
    reduit ? { opacity: p.value } : { transform: [{ scaleX: REMPLISSAGE.depart + (1 - REMPLISSAGE.depart) * p.value }] },
  );
  if (tirets)
    return (
      <Animated.View style={[{ flex, flexDirection: "row", borderRadius: 3, overflow: "hidden", transformOrigin: "left" }, style]}>
        <SuiteTirets termes={tirets} hauteur={hauteur} />
      </Animated.View>
    );
  return <Animated.View style={[{ flex, backgroundColor: couleur, borderRadius: 3, transformOrigin: "left" }, style]} />;
}

/** Barre en segments (2 dp d'écart, coins de 3) ; `largeur` : fraction de la piste ; `premier` : rang du premier segment
 * dans l'apparition (la barre Apports suit les quatre segments de la Dépense). Les segments `prevu` qui se suivent (page
 * Énergie : ce qui reste jusqu'à minuit) se dessinent en une seule suite de tirets, après le réel. */
export function BarreSegments({
  segments,
  hauteur = 8,
  largeur = 1,
  premier = 0,
  style,
}: {
  segments: readonly Morceau[];
  hauteur?: number;
  largeur?: number;
  premier?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const cle = segments.map((s) => `${Math.round(s.valeur)}${s.prevu ? "p" : ""}`).join("|") + `|${largeur.toFixed(3)}`;
  const pieces: { couleur: string; valeur: number; tirets?: Morceau[] }[] = [];
  for (const s of segments) {
    const der = pieces[pieces.length - 1];
    if (s.prevu && der?.tirets) (der.tirets.push(s), (der.valeur += Math.max(0, s.valeur)));
    else pieces.push(s.prevu ? { couleur: s.couleur, valeur: Math.max(0, s.valeur), tirets: [s] } : s);
  }
  return (
    <View style={[{ height: hauteur, width: `${Math.max(0, Math.min(1, largeur)) * 100}%`, flexDirection: "row", gap: 2 }, style]}>
      {pieces.map((s, i) => (
        <Segment key={i} couleur={s.couleur} flex={Math.max(0.0001, s.valeur)} rang={premier + i} cle={cle} tirets={s.tirets} hauteur={hauteur} />
      ))}
    </View>
  );
}

/** « 78,0 kg » : la valeur en `taille`, l'unité en 12 t3. */
export function Valeur({ v, unite, taille = 15, gras = police.medium, couleur, style }: { v: string; unite?: string | null; taille?: number; gras?: string; couleur?: string; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "baseline" }, style]}>
      <Texte variante="corps" numberOfLines={1} style={{ fontSize: taille, fontFamily: gras, color: couleur ?? couleurs.t1, fontVariant: ["tabular-nums"] }}>
        {v}
      </Texte>
      {unite ? (
        <Texte variante="meta" couleur="t3" style={{ marginLeft: 3 }}>
          {unite}
        </Texte>
      ) : null}
    </View>
  );
}

/** Pastille 10 × 10 (coins de 3) d'un terme ou d'un stade ; `prevu` : en tirets, comme le prévu des barres. */
export function Point({ couleur, taille = 10, prevu }: { couleur: string; taille?: number; prevu?: boolean }) {
  if (prevu)
    return (
      <View style={{ width: taille, height: taille, borderRadius: 3, overflow: "hidden" }}>
        <Tirets couleur={couleur} hauteur={taille} tiret="2 2" />
      </View>
    );
  return <View style={{ width: taille, height: taille, borderRadius: 3, backgroundColor: couleur }} />;
}

/** Titre de section (11, majuscules, t3), aligné sur le bord des groupes. */
export function Section({ children, dansFeuille }: { children: string; dansFeuille?: boolean }) {
  return (
    <Texte variante="entete" couleur="t3" accessibilityRole="header" style={dansFeuille ? styles.sectionFeuille : styles.section}>
      {children}
    </Texte>
  );
}

/** ‹ libellé › : jour ou nuit précédent et suivant (44 × 44), le suivant éteint au jour courant. */
export function NavJour({
  libelle,
  onPrecedent,
  onSuivant,
  suivantPossible,
  libellePrecedent,
  libelleSuivant,
  etale,
}: {
  libelle: string;
  onPrecedent: () => void;
  onSuivant: () => void;
  suivantPossible: boolean;
  libellePrecedent: string;
  libelleSuivant: string;
  /** Flèches aux deux bords (Sommeil), sinon groupées à droite (feuille Énergie). */
  etale?: boolean;
}) {
  return (
    <View style={[styles.nav, etale && { flex: 1, justifyContent: "space-between" }]}>
      <BoutonIcone nom="left" libelle={libellePrecedent} onPress={onPrecedent} />
      <Texte variante="corps" style={{ fontFamily: police.medium, minWidth: 84, textAlign: "center" }} accessibilityLiveRegion="polite">
        {libelle}
      </Texte>
      <View style={!suivantPossible && { opacity: 0.45 }}>
        <BoutonIcone nom="right" libelle={libelleSuivant} onPress={suivantPossible ? onSuivant : () => {}} />
      </View>
    </View>
  );
}

/**
 * Précision d'une estimation (NOTES-ENERGIE § 3) : quatre traits qui montent, ceux atteints en t2, le libellé en t3.
 * Indicateur mini de la précision pepfit (planche precision, section 7) avec `onPress` : un chevron de 14, une zone de 44 plus
 * large que lui, un fond tonal le temps de l'appui (jamais de cadre) ; il ouvre la feuille de son calcul. `court` : le mot
 * seul, dans un en-tête de section. `attente` : une lecture pas encore sûre (cercle en pointillés).
 */
export function IndicePrecision({
  niveau,
  style,
  onPress,
  court,
  attente,
}: {
  niveau: Precision;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  court?: boolean;
  attente?: boolean;
}) {
  const { couleurs, mode } = useTheme();
  const partie = useCouleurPartie();
  const rang = PRECISIONS.indexOf(niveau);
  const libelle = attente ? t("precision.enAttente") : court ? t(`precision.mot.${niveau}`) : t(`sante.precision.${niveau}` as "sante.precision.faible");
  const contenu = (
    <>
      {attente ? (
        <Icone nom="attente" couleur={couleurs.t3} taille={14} />
      ) : (
        <View style={styles.traits}>
          {PRECISIONS.map((p, i) => (
            <View key={p} style={{ width: 3, height: 4 + i * 2, borderRadius: 1, backgroundColor: i <= rang ? couleurs.t2 : couleurs.line2 }} />
          ))}
        </View>
      )}
      <Texte variante="meta" couleur="t3" numberOfLines={1}>
        {libelle}
      </Texte>
    </>
  );
  if (!onPress)
    return (
      <View style={[styles.precision, style]} accessible accessibilityLabel={libelle}>
        {contenu}
      </View>
    );
  const complet = attente ? t("precision.mini.attenteA11y") : t("precision.mini.a11y", { niveau: t(`sante.precision.${niveau}` as "sante.precision.faible") });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={complet}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.precision,
        styles.mini,
        pressed && { backgroundColor: avecOpacite(partie, mode === "nuit" ? 0.12 : 0.08) },
        style,
      ]}
    >
      {contenu}
      <View style={{ marginLeft: -2 }}>
        <Icone nom="right" couleur={couleurs.t3} taille={14} />
      </View>
    </Pressable>
  );
}

export function Pile({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: espace.m }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { marginTop: espace.xxl, marginHorizontal: espace.l },
  sectionFeuille: { marginTop: espace.xl, marginHorizontal: espace.xs },
  nav: { flexDirection: "row", alignItems: "center" },
  precision: { flexDirection: "row", alignItems: "center", gap: 6 },
  mini: { height: 28, paddingHorizontal: 6, borderRadius: 8, alignSelf: "flex-start" },
  traits: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 10 },
});
