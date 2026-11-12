// Graphiques des pages de mesure (planche pas, commun.js `svgBarres`, autres.js `svgScore`) : barres d'un cumul du jour
// ou d'un score, trait de l'objectif ou seuils en tirets dessinés SOUS les barres, barre pleine si l'objectif est atteint
// (voilée sinon : jamais la couleur seule, la hauteur dit la même chose), valeur écrite sur 7 jours, axe à droite au-delà,
// jour sans donnée = petit pointillé (pas un zéro). Les barres poussent à l'ouverture de la page, en 300 ms cascade comprise
// (revue finale n° 12) ; changer de période ou de jour ne les rejoue pas (la piste fait déjà arriver la période).
import { useEffect, useRef, type ReactNode } from "react";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { police } from "../../theme/typo";
import { useReduit } from "../../ui/reduit";
import { avance, POUSSE } from "./pousse";
export { avance } from "./pousse";
import { useCouleursGraphe } from "./Statistiques";

const RectAnime = Animated.createAnimatedComponent(Rect);

export const GRAPHE = { hauteur: 168, bas: 20, axe: 28, police: 11 } as const;

/** Haut de l'échelle : arrondi au pas lisible au-dessus de `max` (pas de 1 000, 2 000 ou 4 000 pour les pas). */
export function echelle(max: number, pas?: number): number {
  const p = pas ?? (max > 12000 ? 4000 : max > 6000 ? 2000 : max > 1000 ? 1000 : max > 100 ? 100 : max > 20 ? 10 : 5);
  return Math.max(p, Math.ceil(max / p) * p);
}

export interface BarreGraphe {
  v: number | null;
  etiquette: string;
  enCours: boolean;
  /** Jour à venir de la semaine en cours : rien n'est dessiné, pas même le tiret « sans donnée ». */
  aVenir?: boolean;
}

// Chiffres tabulaires dans les graphes : en proportionnels, Inter rend à largeur nulle l'espace fine des milliers (« +1945 »
// au lieu de « +1 945 », vu à l'émulateur, revue finale n° 18) ; alignés, ils se comparent mieux.
const TABULAIRES = "'tnum'";

/** Texte « détouré » du fond du groupe (les tirets ne le coupent pas). */
export function TexteDetoure({ x, y, texte, fort, ancre = "middle" }: { x: number; y: number; texte: string; fort?: boolean; ancre?: "start" | "middle" | "end" }) {
  const c = useCouleursGraphe();
  const commun = { x, y, fontSize: GRAPHE.police, fontFamily: fort ? police.medium : police.regular, fontFeatureSettings: TABULAIRES, textAnchor: ancre } as const;
  return (
    <G>
      <SvgText {...commun} stroke={c.groupe} strokeWidth={4} strokeLinejoin="round" fill={c.groupe}>
        {texte}
      </SvgText>
      <SvgText {...commun} fill={fort ? c.t1 : c.t2}>
        {texte}
      </SvgText>
    </G>
  );
}

/** Trait en tirets (objectif, seuils, repères) : t1 à 0,55, 1,25 px, tirets de 4. */
export function Tirets({ x1, x2, y, opacite = 0.55 }: { x1: number; x2: number; y: number; opacite?: number }) {
  const c = useCouleursGraphe();
  return <Line x1={x1} x2={x2} y1={y} y2={y} stroke={c.t1} strokeOpacity={opacite} strokeWidth={1.25} strokeDasharray="4 4" />;
}

/** Libellé d'axe ou de date (11, t3) ; `fort` : t1 medium (« auj. »). */
export function Etiquette({ x, y, texte, fort, ancre = "middle" }: { x: number; y: number; texte: string; fort?: boolean; ancre?: "start" | "middle" | "end" }) {
  const c = useCouleursGraphe();
  return (
    <SvgText x={x} y={y} fontSize={GRAPHE.police} fontFamily={fort ? police.medium : police.regular} fontFeatureSettings={TABULAIRES} fill={fort ? c.t1 : c.t3} textAnchor={ancre}>
      {texte}
    </SvgText>
  );
}

/**
 * Progression linéaire (0 → 1 en POUSSE ms) jouée une fois, à l'ouverture : la première fois que le graphe est `pret` (ses
 * données lues). Une nouvelle `cle` (période, jour) pose le dessin d'emblée. Mouvement réduit : tout est là d'emblée.
 */
export function useApparition(cle: string, pret = true): SharedValue<number> {
  const reduit = useReduit();
  const joue = useRef(false);
  const p = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    if (!pret) return;
    if (reduit || joue.current) {
      p.value = 1;
      return;
    }
    joue.current = true;
    p.value = 0;
    p.value = withTiming(1, { duration: POUSSE, easing: Easing.linear });
  }, [cle, pret, reduit, p]);
  return p;
}

/** Une barre qui pousse depuis la base : `k` = rang sur `nb` (avance), sur la progression linéaire commune. */
export function BarrePoussee({
  p,
  k,
  x,
  base,
  h,
  l,
  couleur,
  rx,
  nb,
  contour,
}: {
  p: SharedValue<number>;
  k: number;
  x: number;
  base: number;
  h: number;
  l: number;
  couleur: string;
  rx: number;
  nb: number;
  contour?: string;
}) {
  const props = useAnimatedProps(() => {
    const hh = h * (0.04 + 0.96 * avance(p.value, k, nb));
    return { y: base - hh, height: hh };
  });
  return <RectAnime x={x} width={l} rx={rx} fill={couleur} stroke={contour} strokeWidth={contour ? 1.5 : 0} animatedProps={props} />;
}

/**
 * Barres d'une période. `plein(v)` : barre au plein de la couleur (objectif atteint, score haut) ; `valeur(v)` : la valeur
 * écrite au-dessus (7 jours) ; sinon un axe à droite (`axe`). `objectif` (tirets étiquetés à gauche) et `seuils` (tirets)
 * se dessinent sous les barres. `max` : haut de l'échelle imposé (score sur 100 ou sur 21).
 */
export function GrapheBarres({
  barres,
  largeur,
  cle,
  sel,
  plein,
  objectif,
  seuils = [],
  valeur,
  axe,
  max: maxImpose,
  largeurBarre,
  hauteur = GRAPHE.hauteur,
  libelle,
  enPlus,
  plages,
  couleursPlage,
  couleurBarre,
  opaciteEnCours = 0.6,
}: {
  barres: readonly BarreGraphe[];
  largeur: number;
  cle: string;
  sel: number | null;
  plein: (v: number) => boolean;
  objectif?: number | null;
  seuils?: readonly number[];
  valeur?: (v: number) => string;
  axe?: (v: number) => string;
  max?: number;
  largeurBarre?: number;
  hauteur?: number;
  libelle: string;
  /** Dessin en plus, par-dessus (repères). */
  enPlus?: ReactNode;
  /**
   * Idéal de chaque barre (bornes affichées, page Effort, planche sport-stats v2, S12) : une bande de la piste derrière la barre,
   * un trait dessus (blanc le jour, blanc translucide la nuit) ; « 11 – 13 » va de 11 à 13,5.
   */
  plages?: readonly ([number, number] | null)[];
  couleursPlage?: { piste: string; trait: string };
  /** Couleur de chaque barre (son état), à la place de `plein`. */
  couleurBarre?: (v: number, i: number) => string;
  /** Opacité de la barre en cours avec `couleurBarre` (0,6 par défaut) ; 1 quand `couleurBarre` donne déjà sa propre teinte. */
  opaciteEnCours?: number;
}) {
  const c = useCouleursGraphe();
  const nb = barres.length;
  const W = valeur ? largeur : largeur - GRAPHE.axe;
  const base = hauteur - GRAPHE.bas;
  const haut = valeur ? 16 : 6;
  const vals = barres.map((b) => b.v ?? 0);
  const max = maxImpose ?? echelle(Math.max((objectif ?? 0) * 1.15, ...seuils, ...vals, 1) * 1.04);
  const k = (base - haut) / max;
  const pas = W / Math.max(1, nb);
  const bw = Math.min(largeurBarre ?? 28, pas * 0.62);
  const y = (v: number) => base - v * k;
  const p = useApparition(cle);
  const grille = maxImpose ? [] : [max / 2, max];
  return (
    <Svg width={largeur} height={hauteur} accessibilityLabel={libelle}>
      {grille.map((v) => (
        <G key={v}>
          <Line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={c.grille} strokeWidth={1} />
          {axe ? <Etiquette x={W + 6} y={y(v) + 4} texte={axe(v)} ancre="start" /> : null}
        </G>
      ))}
      <Line x1={0} x2={W} y1={base} y2={base} stroke={c.line2} strokeWidth={1} />
      {objectif != null ? <Tirets x1={0} x2={W} y={y(objectif)} /> : null}
      {seuils.map((s) => (
        <G key={s}>
          <Tirets x1={0} x2={W} y={y(s)} opacite={0.45} />
          {axe && !valeur ? <Etiquette x={W + 6} y={y(s) + 4} texte={axe(s)} ancre="start" /> : null}
        </G>
      ))}
      {barres.map((b, i) => {
        const x = i * pas + (pas - bw) / 2;
        const choisi = sel === i;
        const fort = b.enCours || choisi;
        const plage = plages?.[i] ?? null;
        return (
          <G key={i}>
            {choisi ? <Rect x={i * pas + 1} y={haut - 4} width={pas - 2} height={base - haut + 4} rx={4} fill={c.t1} opacity={0.07} /> : null}
            {plage && couleursPlage ? <Rect x={x} y={y(plage[1] + 0.5)} width={bw} height={y(plage[0]) - y(plage[1] + 0.5)} rx={5} fill={couleursPlage.piste} /> : null}
            {b.v == null ? (
              b.aVenir ? null : <Line x1={x + bw / 2} x2={x + bw / 2} y1={base - 2} y2={base - 14} stroke={c.t3} strokeWidth={1} strokeDasharray="2 3" />
            ) : (
              <G opacity={couleurBarre && b.enCours ? opaciteEnCours : 1}>
              <BarrePoussee
                p={p}
                k={i}
                nb={nb}
                x={x}
                base={base}
                h={Math.max(b.v ? 3 : 0, b.v * k)}
                l={bw}
                rx={bw > 12 ? 4 : 2}
                couleur={couleurBarre ? couleurBarre(b.v, i) : plein(b.v) ? c.fort : c.doux}
                contour={choisi ? c.t1 : undefined}
              />
              </G>
            )}
            {plage && couleursPlage ? (
              <Rect x={x + 5} y={y(plage[1] + 0.5)} width={Math.max(2, bw - 10)} height={y(plage[0]) - y(plage[1] + 0.5)} rx={3} fill={couleursPlage.trait} opacity={0.85} />
            ) : null}
            {valeur && b.v != null ? <TexteDetoure x={x + bw / 2} y={Math.min(y(b.v), plage ? y(plage[1] + 0.5) : y(b.v)) - 5} texte={valeur(b.v)} fort={fort} /> : null}
            {b.etiquette ? <Etiquette x={x + bw / 2} y={hauteur - 3} texte={b.etiquette} fort={b.enCours} /> : null}
          </G>
        );
      })}
      {enPlus}
    </Svg>
  );
}
