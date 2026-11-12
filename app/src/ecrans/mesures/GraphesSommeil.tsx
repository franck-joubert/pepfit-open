// Graphiques de la page Sommeil (planche pas, sommeil.js) : hypnogramme (une ligne par phase, éveil en haut, profond en
// bas, phases reliées), mini-hypnogramme des cartes, barre des phases (Whoop seul), barres de durée en phases empilées
// (profond, léger, paradoxal ; l'éveil n'est pas compté ; objectif en tirets ; durée écrite sur 7 nuits), plages de coucher
// à lever sur l'axe des heures (coucher et lever moyens en tirets), piste du besoin Whoop. Couleurs : couleursSante.
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { G, Line, Rect } from "react-native-svg";
import { formater } from "../../i18n/temps";
import { heure } from "../format";
import { useTheme } from "../../theme";
import { couleursSante } from "../../theme/effets";
import { avecOpacite } from "../../theme/teintes";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { useMesure } from "./gabarit";
import { avance, Etiquette, GRAPHE, TexteDetoure, Tirets, useApparition } from "./graphes";
import type { Etape } from "./sommeil-donnees";
import { hmCourt, PHASES_HYPNO, PHASES_PILE, type BarreSommeil, type Phase } from "./sommeil-stats";
import { useCouleursGraphe } from "./Statistiques";

const RectAnime = Animated.createAnimatedComponent(Rect);

/** Couleur de chaque phase, dans le mode ; l'éveil en encre translucide t3, pas en gris opaque (revue finale n° 6). */
export function useCouleursPhases(): Record<Phase, string> {
  const { mode, couleurs } = useTheme();
  const c = couleursSante[mode];
  return { eveil: couleurs.t3, leger: c.leger, profond: c.profond, paradoxal: c.paradoxal };
}

/** Couleurs du besoin (base, dette, effort récent) : le rose de la mesure à trois opacités, du plus discret au plus marqué ;
 *  le réalisé, par-dessus, reste au plein (revue finale n° 6 : plus de gris chauds opaques). */
export function useCouleursBesoin() {
  const m = useMesure();
  return { base: avecOpacite(m.fort, 0.2), dette: avecOpacite(m.fort, 0.38), effort: avecOpacite(m.fort, 0.58) };
}

/** « 22 h », « 10 PM » : heure ronde d'un axe, `m` minutes depuis un minuit. */
export function heureAxe(m: number): string {
  const h = ((Math.round(m / 60) % 24) + 24) % 24;
  return formater(new Date(2026, 0, 5, h), { hour: "2-digit" });
}

/** Un dessin qui se révèle de gauche à droite (700 ms, courbe sortie) ; mouvement réduit : fondu. */
function Revele({ largeur, hauteur, children }: { largeur: number; hauteur: number; children: React.ReactNode }) {
  const reduit = useReduit();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(120, withTiming(1, { duration: reduit ? 200 : 700, easing: courbes.sortie }));
  }, [reduit, p]);
  const s = useAnimatedStyle(() => (reduit ? { opacity: p.value, width: largeur } : { width: Math.max(1, largeur * p.value) }));
  return (
    <Animated.View style={[{ height: hauteur, overflow: "hidden" }, s]}>
      <View style={{ width: largeur, height: hauteur }}>{children}</View>
    </Animated.View>
  );
}

/** Hypnogramme d'une nuit (chronologie Santé Connect). */
export function Hypnogramme({ etapes, libelle }: { etapes: readonly Etape[]; libelle: string }) {
  const [W, setW] = useState(0);
  const c = useCouleursGraphe();
  const coul = useCouleursPhases();
  const H = 150;
  const pasY = 28;
  const y0 = 10;
  const debut = etapes[0]!.debut;
  const fin = etapes[etapes.length - 1]!.fin;
  const X = (t: number) => ((t - debut) / Math.max(1, fin - debut)) * W;
  const rang = (p: Phase) => PHASES_HYPNO.indexOf(p);
  const heures: number[] = [];
  const minuitRef = new Date(debut);
  minuitRef.setHours(0, 0, 0, 0);
  for (let t = minuitRef.getTime(); t <= fin; t += 3_600_000) {
    const h = new Date(t).getHours();
    if (t > debut && h % 2 === 0 && X(t) > 44 && X(t) < W - 44) heures.push(t);
  }
  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} accessible accessibilityRole="image" accessibilityLabel={libelle}>
      {W > 0 ? (
        <Revele largeur={W} hauteur={H}>
          <Svg width={W} height={H}>
            {PHASES_HYPNO.map((_, i) => (
              <Line key={i} x1={0} x2={W} y1={y0 + i * pasY} y2={y0 + i * pasY} stroke={c.grille} strokeWidth={1} />
            ))}
            {etapes.map((e, i) => {
              const prec = etapes[i - 1];
              if (!prec) return null;
              return <Line key={`l${i}`} x1={X(e.debut)} x2={X(e.debut)} y1={y0 + rang(prec.phase) * pasY} y2={y0 + rang(e.phase) * pasY} stroke={c.t3} strokeWidth={1} />;
            })}
            {etapes.map((e, i) => (
              <Rect key={`r${i}`} x={X(e.debut)} y={y0 + rang(e.phase) * pasY - 5} width={Math.max(1.5, X(e.fin) - X(e.debut))} height={10} rx={2} fill={coul[e.phase]} />
            ))}
            <Etiquette x={0} y={H - 3} texte={heure(debut)} ancre="start" />
            <Etiquette x={W} y={H - 3} texte={heure(fin)} ancre="end" />
            {heures.map((t) => (
              <Etiquette key={t} x={X(t)} y={H - 3} texte={heureAxe(new Date(t).getHours() * 60)} />
            ))}
          </Svg>
        </Revele>
      ) : (
        <View style={{ height: H }} />
      )}
    </View>
  );
}

/** Mini-hypnogramme des cartes (rangs de 4 px) ; avec Whoop seul, la barre des phases à la place (BarrePhases). */
export function MiniHypnogramme({ etapes, largeur, hauteur = 26 }: { etapes: readonly Etape[]; largeur: number; hauteur?: number }) {
  const coul = useCouleursPhases();
  if (!etapes.length || largeur <= 0) return null;
  const debut = etapes[0]!.debut;
  const total = Math.max(1, etapes[etapes.length - 1]!.fin - debut);
  const pasY = (hauteur - 4) / 3;
  return (
    <Svg width={largeur} height={hauteur} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {etapes.map((e, i) => (
        <Rect
          key={i}
          x={((e.debut - debut) / total) * largeur}
          y={PHASES_HYPNO.indexOf(e.phase) * pasY}
          width={Math.max(1.5, ((e.fin - e.debut) / total) * largeur)}
          height={4}
          rx={1.5}
          fill={coul[e.phase]}
        />
      ))}
    </Svg>
  );
}

/** Barre des phases (2 px d'écart, coins de 3), dans l'ordre éveil, paradoxal, léger, profond. */
export function BarrePhases({ phases, hauteur = 16 }: { phases: Record<Phase, number>; hauteur?: number }) {
  const coul = useCouleursPhases();
  return (
    <View style={{ flexDirection: "row", gap: 2, height: hauteur }}>
      {PHASES_HYPNO.filter((p) => phases[p] > 0).map((p) => (
        <View key={p} style={{ flex: phases[p], backgroundColor: coul[p], borderRadius: 3 }} />
      ))}
    </View>
  );
}

/** Une part de la pile qui pousse avec les autres (même progression, même rang). */
function Part({ p, k, nb, x, base, dessous, h, l, couleur }: { p: SharedValue<number>; k: number; nb: number; x: number; base: number; dessous: number; h: number; l: number; couleur: string }) {
  const props = useAnimatedProps(() => {
    const e = 0.04 + 0.96 * avance(p.value, k, nb);
    return { y: base - (dessous + h) * e + 0.5, height: Math.max(0.5, h * e - 1) };
  });
  return <RectAnime x={x} width={l} rx={2} fill={couleur} animatedProps={props} />;
}

/** Durée par nuit, phases empilées ; `objectif` en tirets ; durée écrite sur 7 nuits, axe en heures au-delà. */
export function GrapheSommeil({ barres, largeur, cle, sel, objectif, semaine, libelle }: { barres: readonly BarreSommeil[]; largeur: number; cle: string; sel: number | null; objectif: number; semaine: boolean; libelle: string }) {
  const c = useCouleursGraphe();
  const coul = useCouleursPhases();
  const H = GRAPHE.hauteur;
  const W = semaine ? largeur : largeur - GRAPHE.axe;
  const base = H - GRAPHE.bas;
  const max = Math.max(600, Math.ceil(Math.max(0, ...barres.map((b) => b.v ?? 0)) / 60) * 60 + (semaine ? 30 : 0));
  const k = (base - (semaine ? 16 : 8)) / max;
  const nb = barres.length;
  const pas = W / Math.max(1, nb);
  const bw = Math.min(semaine ? 26 : nb > 20 ? 7 : 16, pas * 0.62);
  const p = useApparition(cle);
  return (
    <Svg width={largeur} height={H} accessibilityLabel={libelle}>
      {[240, 480].map((m) => (
        <G key={m}>
          <Line x1={0} x2={W} y1={base - m * k} y2={base - m * k} stroke={c.grille} strokeWidth={1} />
          {!semaine ? <Etiquette x={W + 6} y={base - m * k + 4} texte={`${m / 60} h`} ancre="start" /> : null}
        </G>
      ))}
      <Line x1={0} x2={W} y1={base} y2={base} stroke={c.line2} strokeWidth={1} />
      <Tirets x1={0} x2={W} y={base - objectif * k} />
      {barres.map((b, i) => {
        const x = i * pas + (pas - bw) / 2;
        const choisi = sel === i;
        let dessous = 0;
        const phases = b.phases;
        return (
          <G key={i}>
            {choisi ? <Rect x={i * pas + 1} y={4} width={pas - 2} height={base - 4} rx={4} fill={c.t1} opacity={0.07} /> : null}
            {b.v == null ? (
              b.aVenir ? null : <Line x1={x + bw / 2} x2={x + bw / 2} y1={base - 2} y2={base - 14} stroke={c.t3} strokeWidth={1} strokeDasharray="2 3" />
            ) : phases ? (
              PHASES_PILE.map((ph) => {
                // les phases sont rapportées au sommeil de la barre (moyennes des mois : même total que la barre)
                const somme = phases.leger + phases.profond + phases.paradoxal || 1;
                const h = (phases[ph] / somme) * b.v! * k;
                const r = <Part key={ph} p={p} k={i} nb={nb} x={x} base={base} dessous={dessous} h={h} l={bw} couleur={coul[ph]} />;
                dessous += h;
                return r;
              })
            ) : (
              <Part p={p} k={i} nb={nb} x={x} base={base} dessous={0} h={b.v * k} l={bw} couleur={c.doux} />
            )}
            {semaine && b.v != null ? <TexteDetoure x={x + bw / 2} y={base - b.v * k - 5} texte={hmCourt(b.v)} fort={b.enCours || choisi} /> : null}
            {b.etiquette ? <Etiquette x={x + bw / 2} y={H - 3} texte={b.etiquette} fort={b.enCours} /> : null}
            {choisi && b.v != null ? <Rect x={x - 1} y={base - b.v * k - 1} width={bw + 2} height={b.v * k + 1} rx={3} fill="none" stroke={c.t1} strokeWidth={1.5} /> : null}
          </G>
        );
      })}
    </Svg>
  );
}

/** Heures de coucher et de lever : une plage par nuit, coucher et lever moyens en tirets. */
export function GrapheHoraires({ barres, largeur, coucher, lever, libelle }: { barres: readonly BarreSommeil[]; largeur: number; coucher: number | null; lever: number | null; libelle: string }) {
  const c = useCouleursGraphe();
  const H = 150;
  const W = largeur - GRAPHE.axe;
  const v = barres.filter((b) => b.v != null && b.coucher != null && b.lever != null);
  const h0 = Math.min(-180, Math.floor((Math.min(0, ...v.map((b) => b.coucher!)) - 30) / 60) * 60);
  const h1 = Math.max(600, Math.ceil((Math.max(0, ...v.map((b) => b.lever!)) + 30) / 60) * 60);
  const y = (m: number) => 6 + ((m - h0) / (h1 - h0)) * (H - 26);
  const nb = barres.length;
  const pas = W / Math.max(1, nb);
  const bw = Math.min(nb <= 7 ? 18 : nb > 20 ? 5 : 12, pas * 0.6);
  const axe: number[] = [];
  for (let m = Math.ceil((h0 + 60) / 120) * 120; m <= h1 - 60; m += 120) axe.push(m);
  return (
    <Svg width={largeur} height={H} accessibilityLabel={libelle}>
      {axe.map((m) => (
        <G key={m}>
          <Line x1={0} x2={W} y1={y(m)} y2={y(m)} stroke={c.grille} strokeWidth={1} />
          <Etiquette x={W + 6} y={y(m) + 4} texte={heureAxe(m)} ancre="start" />
        </G>
      ))}
      {barres.map((b, i) =>
        b.v != null && b.coucher != null && b.lever != null ? (
          <Rect key={i} x={i * pas + (pas - bw) / 2} y={y(b.coucher)} width={bw} height={Math.max(2, y(b.lever) - y(b.coucher))} rx={Math.min(4, bw / 2)} fill={b.enCours ? c.fort : c.doux} />
        ) : null,
      )}
      {coucher != null ? <Tirets x1={0} x2={W} y={y(coucher)} /> : null}
      {lever != null ? <Tirets x1={0} x2={W} y={y(lever)} /> : null}
      {barres.map((b, i) => (b.etiquette ? <Etiquette key={`e${i}`} x={i * pas + pas / 2} y={H - 3} texte={b.etiquette} fort={b.enCours} /> : null))}
    </Svg>
  );
}

/** Piste du besoin Whoop : base, dette, effort récent (tons gris), et le sommeil réalisé par-dessus en rose. */
export function PisteBesoin({ base, dette, effort, fait }: { base: number; dette: number; effort: number; fait: number }) {
  const cb = useCouleursBesoin();
  const c = useCouleursGraphe();
  const reduit = useReduit();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(80, withTiming(1, { duration: reduit ? 200 : 420, easing: courbes.sortie }));
  }, [reduit, p]);
  const s = useAnimatedStyle(() => (reduit ? { opacity: p.value } : { transform: [{ scaleX: 0.02 + 0.98 * p.value }] }));
  return (
    <View style={{ height: 12, flexDirection: "row", gap: 2, marginTop: 2 }}>
      {base > 0 ? <View style={{ flex: base, backgroundColor: cb.base, borderRadius: 3 }} /> : null}
      {dette > 0 ? <View style={{ flex: dette, backgroundColor: cb.dette, borderRadius: 3 }} /> : null}
      {effort > 0 ? <View style={{ flex: effort, backgroundColor: cb.effort, borderRadius: 3 }} /> : null}
      <Animated.View
        style={[{ position: "absolute", left: 0, top: -3, bottom: -3, width: `${Math.max(0, Math.min(1, fait)) * 100}%`, borderRadius: 4, backgroundColor: c.fort, transformOrigin: "left" }, s]}
      />
    </View>
  );
}

/** Légende d'une couleur : carré 8 (ou 10) et libellé 12 t2. */
export function Pastille({ couleur, libelle, taille = 8 }: { couleur: string; libelle: string; taille?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: taille, height: taille, borderRadius: taille > 8 ? 3 : 2, backgroundColor: couleur }} />
      <Texte variante="meta" couleur="t2" numberOfLines={1}>
        {libelle}
      </Texte>
    </View>
  );
}
