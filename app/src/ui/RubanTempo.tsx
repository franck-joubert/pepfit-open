// Ruban de tempo (planche idee-plein-ecran, D1 : A ; courbe : planche tempo-courbe, A) : la courbe du geste, qui monte,
// tient en haut, descend et tient en bas au rythme du tempo ; descente et montée en couleur de la partie, paliers en t3.
// En lecture, elle défile de droite à gauche sous un repère fixe au tiers (56 dp par seconde, linéaire : c'est une mesure
// du temps) ; le point du repère monte et descend avec elle ; la phase en cours est posée sur une colonne teintée et son
// trait s'épaissit ; ce qui est passé s'estompe. En aperçu (feuille Tempo), une répétition posée au centre, sans repère.
// Mouvement réduit : le ruban saute de phase en phase, le point se pose au début de la phase.
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Canvas, Group, Paint, Path, RoundedRect, Skia, type SkPath } from "@shopify/react-native-skia";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme";
import { dureeSerie, hauteurA, segmentsCourbe, type Phase, type SegmentCourbe, type TypePhase } from "../ecrans/tempo-horloge";
import { Texte } from "./Texte";
import { t } from "../i18n/index";

/** Une seconde du ruban, en dp. */
export const PAS_RUBAN = 56;
/** Repère fixe, en part de la largeur. */
const REPERE = 0.34;
/** Hauteur du ruban en lecture ; haut et bas de la courbe (dp). */
const HAUTEUR = 88;
const HAUT = 28;
const BAS = 74;
/** Aperçu de la feuille Tempo : plus bas, même dessin. */
const HAUTEUR_APERCU = 64;
const HAUT_APERCU = 26;
const BAS_APERCU = 58;
/** Point du repère : 12 dp, cerclé de 2 dp du fond. */
const POINT = 16;

const LIBELLES: Record<TypePhase, Parameters<typeof t>[0]> = {
  descente: "ui.ruban.descente",
  pauseBas: "ui.ruban.pause",
  montee: "ui.ruban.montee",
  pauseHaut: "ui.ruban.pause",
};

let compteur = 0;

/** Ordonnée (dp) d'une hauteur du geste dans le ruban en lecture : 1 en haut, 0 en bas. */
function yRuban(h: number): number {
  "worklet";
  return BAS - h * (BAS - HAUT);
}

const yApercu = (h: number) => BAS_APERCU - h * (BAS_APERCU - HAUT_APERCU);

interface Chemins {
  paliers: SkPath;
  rampes: SkPath;
  paliersIci: SkPath;
  rampesIci: SkPath;
}

/** Tracés de la courbe : paliers et rampes à part (couleurs), ceux de la phase `ici` à part (trait épais). */
function chemins(segments: SegmentCourbe[], x: (s: number) => number, y: (h: number) => number, ici: number | null): Chemins {
  const b = { paliers: Skia.PathBuilder.Make(), rampes: Skia.PathBuilder.Make(), paliersIci: Skia.PathBuilder.Make(), rampesIci: Skia.PathBuilder.Make() };
  for (const s of segments) {
    const p = s.pause ? (s.i === ici ? b.paliersIci : b.paliers) : s.i === ici ? b.rampesIci : b.rampes;
    p.moveTo(x(s.x0), y(s.h0));
    p.lineTo(x(s.x1), y(s.h1));
  }
  return { paliers: b.paliers.build(), rampes: b.rampes.build(), paliersIci: b.paliersIci.build(), rampesIci: b.rampesIci.build() };
}

const TRAIT = 2.5;
const TRAIT_ICI = 4;

/** Courbe : paliers d'abord, pour que les bouts ronds des rampes passent par-dessus les jointures. */
function Courbe({ c, couleurs }: { c: Chemins; couleurs: { action: string; t3: string } }) {
  const trait = { style: "stroke", strokeCap: "round", strokeJoin: "round" } as const;
  return (
    <>
      <Path path={c.paliers} {...trait} strokeWidth={TRAIT} color={couleurs.t3} />
      <Path path={c.paliersIci} {...trait} strokeWidth={TRAIT_ICI} color={couleurs.t3} />
      <Path path={c.rampes} {...trait} strokeWidth={TRAIT} color={couleurs.action} />
      <Path path={c.rampesIci} {...trait} strokeWidth={TRAIT_ICI} color={couleurs.action} />
    </>
  );
}

/** Bande où un libellé s'efface avant le bord (dp) : jamais un mot coupé (« ntée »). */
const BORD_LIBELLE = 20;

/**
 * Nom d'une phase. En lecture (`ecoule` donné), il s'efface en approchant d'un bord ; en aperçu, il est gardé entier
 * dans la largeur du ruban.
 */
function Libelle({ texte, gauche, actif, largeur, ecoule }: { texte: string; gauche: number; actif: boolean; largeur: number; ecoule?: SharedValue<number> }) {
  const [l, setL] = useState(0);
  const w = useSharedValue(0);
  const fondu = useAnimatedStyle(() => {
    if (!ecoule) return {};
    const x = gauche - ecoule.value * PAS_RUBAN;
    const o = Math.min(1, Math.max(0, x / BORD_LIBELLE), Math.max(0, (largeur - x - w.value) / BORD_LIBELLE));
    return { opacity: w.value ? o : 0 };
  });
  const x = ecoule ? gauche : Math.max(0, Math.min(gauche, largeur - l));
  return (
    <Animated.View
      style={[styles.lib, { left: x }, fondu, !ecoule && !l && { opacity: 0 }]}
      onLayout={(ev) => {
        w.value = ev.nativeEvent.layout.width;
        setL(ev.nativeEvent.layout.width);
      }}
    >
      <Texte variante="meta" couleur={actif ? "t1" : "t3"} numberOfLines={1} style={styles.libTexte}>
        {texte}
      </Texte>
    </Animated.View>
  );
}

function Libelles({ phases, x0, ici, decale = 0, largeur, ecoule }: { phases: Phase[]; x0: number; ici: number | null; decale?: number; largeur: number; ecoule?: SharedValue<number> }) {
  return (
    <>
      {phases.map((ph, i) => (
        <Libelle key={i} texte={t(LIBELLES[ph.type])} gauche={x0 + ph.debut * PAS_RUBAN + decale} actif={i === ici} largeur={largeur} ecoule={ecoule} />
      ))}
    </>
  );
}

/** Fondu vers le fond aux deux bords : la courbe entre et sort sans couper net. */
function Fondu({ id, gauche, fond }: { id: string; gauche: boolean; fond: string }) {
  return (
    <Svg pointerEvents="none" width={40} height="100%" style={[styles.fondu, gauche ? { left: 0 } : { right: 0 }]}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={fond} stopOpacity={gauche ? 1 : 0} />
          <Stop offset="1" stopColor={fond} stopOpacity={gauche ? 0 : 1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Aperçu de la feuille Tempo : une répétition posée, centrée, avec le nom de chaque phase. */
export function ApercuRuban({ phases }: { phases: Phase[] }) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const x0 = (largeur - dureeSerie(phases) * PAS_RUBAN) / 2;
  const c = useMemo(() => chemins(segmentsCourbe(phases), (s) => x0 + s * PAS_RUBAN, yApercu, null), [phases, x0]);
  return (
    <View importantForAccessibility="no-hide-descendants" style={[styles.ruban, { height: HAUTEUR_APERCU }]} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}>
      {largeur ? (
        <>
          <Canvas style={StyleSheet.absoluteFill}>
            <Courbe c={c} couleurs={couleurs} />
          </Canvas>
          <Libelles phases={phases} x0={x0} ici={null} decale={6} largeur={largeur} />
        </>
      ) : null}
    </View>
  );
}

/**
 * Ruban en lecture : `ecoule` (secondes depuis le début de la série, valeur partagée animée sur le fil UI) fait glisser
 * la courbe sous le repère et monter ou descendre le point. `ici` : phase en cours (colonne teintée, trait épais, nom en
 * t1). `fond` : couleur derrière (fondus des bords, cercle du point).
 */
export function RubanTempo({ phases, ecoule, ici, fond }: { phases: Phase[]; ecoule: SharedValue<number>; ici: number; fond: string }) {
  const { couleurs, mode } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const [id] = useState(() => `ruban-${compteur++}`);
  const x0 = Math.round(largeur * REPERE);
  const segments = useMemo(() => segmentsCourbe(phases), [phases]);
  const x = (s: number) => x0 + s * PAS_RUBAN;
  // Passé : toute la courbe, au trait fin ; à venir : la phase en cours au trait épais.
  const tout = useMemo(() => chemins(segments, x, yRuban, null), [segments, x0]); // eslint-disable-line react-hooks/exhaustive-deps
  const avecIci = useMemo(() => chemins(segments, x, yRuban, ici), [segments, x0, ici]); // eslint-disable-line react-hooks/exhaustive-deps
  const passe = useMemo(() => Skia.XYWHRect(0, 0, x0, HAUTEUR), [x0]);
  const avenir = useMemo(() => Skia.XYWHRect(x0, 0, Math.max(0, largeur - x0), HAUTEUR), [x0, largeur]);
  const phase = phases[ici];
  // Une seule translation, partagée par la courbe (Skia) et les libellés (vue) ; le point lit la même horloge.
  const decalage = useDerivedValue(() => [{ translateX: -ecoule.value * PAS_RUBAN }]);
  const bande = useAnimatedStyle(() => ({ transform: [{ translateX: -ecoule.value * PAS_RUBAN }] }));
  const point = useAnimatedStyle(() => ({ transform: [{ translateY: yRuban(hauteurA(phases, ecoule.value)) }] }));
  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.ruban} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}>
      {largeur ? (
        <>
          <Canvas style={StyleSheet.absoluteFill}>
            {phase ? (
              <Group transform={decalage}>
                <RoundedRect x={x(phase.debut)} y={0} width={phase.duree * PAS_RUBAN} height={HAUTEUR} r={10} color={couleurs.action} opacity={mode === "nuit" ? 0.1 : 0.07} />
              </Group>
            ) : null}
            <Group clip={passe} layer={<Paint opacity={0.32} />}>
              <Group transform={decalage}>
                <Courbe c={tout} couleurs={couleurs} />
              </Group>
            </Group>
            <Group clip={avenir}>
              <Group transform={decalage}>
                <Courbe c={avecIci} couleurs={couleurs} />
              </Group>
            </Group>
          </Canvas>
          <Animated.View style={[StyleSheet.absoluteFill, bande]}>
            <Libelles phases={phases} x0={x0} ici={ici} decale={7} largeur={largeur} ecoule={ecoule} />
          </Animated.View>
          <View style={[styles.repere, { left: x0 - 0.75, backgroundColor: couleurs.t1 }]} />
          <Animated.View style={[styles.point, { left: x0 - POINT / 2, backgroundColor: couleurs.t1, borderColor: fond }, point]} />
          <Fondu id={`${id}-g`} gauche fond={fond} />
          <Fondu id={`${id}-d`} gauche={false} fond={fond} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ruban: { height: HAUTEUR, overflow: "hidden" },
  lib: { position: "absolute", top: 2 },
  libTexte: { fontSize: 11, fontWeight: "500" },
  repere: { position: "absolute", top: 18, width: 1.5, height: HAUTEUR - 22, opacity: 0.3 },
  point: { position: "absolute", top: -POINT / 2, width: POINT, height: POINT, borderRadius: POINT / 2, borderWidth: 2 },
  fondu: { position: "absolute", top: 0, bottom: 0 },
});
