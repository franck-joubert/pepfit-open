// Graphiques de la page Énergie (planche pas, donnees-mesures.js `svgEnergie`, `svgCumul`) :
//   - 7 jours : par jour, les apports (vert Nutrition) et la dépense empilée de bas en haut (métabolisme, sport, pas,
//     digestion : les nuances d'orange de couleursSante), le solde écrit au-dessus de la paire ;
//   - 30 jours et 12 mois : le solde autour du zéro, surplus vers le haut en vert, déficit vers le bas en orange, le solde
//     visé par l'objectif de poids en tirets (seulement s'il y a un objectif) ;
//   - cumul de la période : une ligne qui part de zéro, axe de droite en kg estimés (7 700 kcal ≈ 1 kg).
// Le prévu jusqu'à minuit (jour en cours, jours à venir avec une séance prévue : energie-prevu.ts) se pose au-dessus du réel,
// même teinte en tirets plus transparents (PREVU de sante-ui). Jour sans journal : petit pointillé, pas de barre (jamais un zéro). Les barres poussent et la ligne du cumul se trace à
// l'ouverture, une fois les données lues (300 ms, cascade comprise : graphes.tsx) ; une autre période arrive dessinée.
// Mouvement réduit : tout est là d'emblée.
import Animated, { useAnimatedProps, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import { useTheme } from "../../theme";
import { couleursSante } from "../../theme/effets";
import { t } from "../../i18n/index";
import { nombre } from "../format";
import { PREVU } from "../sante-ui";
import { avance, Etiquette, GRAPHE, TexteDetoure, Tirets, useApparition } from "./graphes";
import { court, signe } from "./periodes";
import { useCouleursGraphe } from "./Statistiques";
import { echelleJour, echelleSolde, KCAL_KG, type Composantes } from "./energie-stats";

const RectAnime = Animated.createAnimatedComponent(Rect);
const LineAnime = Animated.createAnimatedComponent(Line);
const PathAnime = Animated.createAnimatedComponent(Path);

export interface BarreEnergie {
  /** Solde du jour, ou moyenne par jour du mois ; null : journal non tenu. */
  v: number | null;
  app: number | null;
  dep: number;
  comp: Composantes;
  etiquette: string;
  enCours: boolean;
  /** Jour à venir de la semaine en cours : vide. */
  aVenir?: boolean;
  /** Prévu jusqu'à minuit (en plus du réel) : apports habituels à venir, dépense et ses termes, séances prévues. */
  prevu?: { app: number; dep: number; comp: Composantes; seances: string[] } | null;
}

/** Couleurs des termes de la dépense et des apports (theme/effets.ts, validées : orange, jamais un rouge d'erreur). */
export function useCouleursEnergie() {
  const { mode } = useTheme();
  const c = couleursSante[mode];
  return { bmr: c.bmr, sport: c.sport, neat: c.neat, digestion: c.digestion, apports: c.apports };
}

/** Un segment de pile : toute la pile pousse d'un bloc (le segment `dessous` de hauteur déjà empilée sous lui). */
function Segment({ p, k, nb, x, l, base, dessous, h, couleur, rx = 2 }: { p: SharedValue<number>; k: number; nb: number; x: number; l: number; base: number; dessous: number; h: number; couleur: string; rx?: number }) {
  const props = useAnimatedProps(() => {
    const e = 0.04 + 0.96 * avance(p.value, k, nb);
    return { y: base - (dessous + h) * e + 0.5, height: Math.max(0.5, h * e - 1) };
  });
  return <RectAnime x={x} width={l} rx={rx} fill={couleur} animatedProps={props} />;
}

/** Un segment prévu : une colonne en tirets posée sur la pile, qui pousse avec elle. `debut` : la hauteur où commence le
 * prévu de la pile ; les tirets des termes suivants reprennent au même rythme (sans éclats aux jonctions). */
function SegmentPrevu({ p, k, nb, cx, l, base, dessous, h, couleur, debut = dessous }: { p: SharedValue<number>; k: number; nb: number; cx: number; l: number; base: number; dessous: number; h: number; couleur: string; debut?: number }) {
  const props = useAnimatedProps(() => {
    const e = 0.04 + 0.96 * avance(p.value, k, nb);
    return { y1: base - dessous * e - 0.5, y2: base - (dessous + h) * e + 0.5, strokeDashoffset: (dessous - debut) * e };
  });
  return <LineAnime x1={cx} x2={cx} stroke={couleur} strokeOpacity={PREVU.opacite} strokeWidth={l} strokeDasharray={PREVU.tiret} animatedProps={props} />;
}

/** Barre de solde qui part du zéro, vers le haut ou vers le bas. */
function BarreSolde({ p, k, nb, x, l, mid, h, haut, couleur, opacite, rx }: { p: SharedValue<number>; k: number; nb: number; x: number; l: number; mid: number; h: number; haut: boolean; couleur: string; opacite: number; rx: number }) {
  const props = useAnimatedProps(() => {
    const hh = Math.max(2, h * (0.04 + 0.96 * avance(p.value, k, nb)));
    return { y: haut ? mid - hh : mid, height: hh };
  });
  return <RectAnime x={x} width={l} rx={rx} fill={couleur} opacity={opacite} animatedProps={props} />;
}

const ORDRE: (keyof Composantes)[] = ["bmr", "sport", "neat", "digestion"];

/** 7 jours : apports à gauche, dépense empilée à droite, solde au-dessus. */
export function GrapheSemaineEnergie({ barres, largeur, cle, pret, sel, libelle }: { barres: readonly BarreEnergie[]; largeur: number; cle: string; pret: boolean; sel: number | null; libelle: string }) {
  const c = useCouleursGraphe();
  const e = useCouleursEnergie();
  const H = 176;
  const base = H - GRAPHE.bas;
  const nb = barres.length;
  const p = useApparition(cle, pret);
  const max = echelleJour(barres.flatMap((b) => [(b.app ?? 0) + (b.prevu?.app ?? 0), b.dep + (b.prevu?.dep ?? 0)]));
  const k = (base - 22) / max;
  const pas = largeur / Math.max(1, nb);
  const bw = Math.min(14, pas * 0.3);
  return (
    <Svg width={largeur} height={H} accessibilityLabel={libelle}>
      <Line x1={0} x2={largeur} y1={base} y2={base} stroke={c.line2} strokeWidth={1} />
      {barres.map((b, i) => {
        const cx = i * pas + pas / 2;
        const ha = (b.app ?? 0) * k;
        const hd = b.dep * k;
        const hap = (b.prevu?.app ?? 0) * k;
        const choisi = sel === i;
        let dessous = 0;
        const reel = b.dep > 0
          ? ORDRE.map((cle2) => {
              const h = b.comp[cle2] * k;
              if (h < 0.5) return null;
              const s = <Segment key={cle2} p={p} k={i} nb={nb} x={cx + 1} l={bw} base={base} dessous={dessous} h={h} couleur={e[cle2]} />;
              dessous += h;
              return s;
            })
          : null;
        const debut = dessous;
        const prevu = b.prevu
          ? ORDRE.map((cle2) => {
              const h = b.prevu!.comp[cle2] * k;
              if (h < 0.5) return null;
              const s = <SegmentPrevu key={`p${cle2}`} p={p} k={i} nb={nb} cx={cx + 1 + bw / 2} l={bw} base={base} dessous={dessous} h={h} couleur={e[cle2]} debut={debut} />;
              dessous += h;
              return s;
            })
          : null;
        return (
          <G key={i}>
            {choisi ? <Rect x={i * pas + 1} y={0} width={pas - 2} height={base} rx={4} fill={c.t1} opacity={0.07} /> : null}
            {b.app != null ? <Segment p={p} k={i} nb={nb} x={cx - bw - 1} l={bw} base={base} dessous={0} h={ha + 1} couleur={e.apports} rx={3} /> : null}
            {hap >= 0.5 ? <SegmentPrevu p={p} k={i} nb={nb} cx={cx - bw / 2 - 1} l={bw} base={base} dessous={ha + (b.app != null ? 1 : 0)} h={hap} couleur={e.apports} /> : null}
            {reel}
            {prevu}
            {b.v != null ? (
              <TexteDetoure x={cx} y={base - Math.max(ha + hap, dessous, hd) - 6} texte={signe(b.v)} fort={b.enCours || choisi} />
            ) : b.aVenir || b.prevu ? null : (
              <Line x1={cx} x2={cx} y1={base - 2} y2={base - 14} stroke={c.t3} strokeWidth={1} strokeDasharray="2 3" />
            )}
            <Etiquette x={cx} y={H - 3} texte={b.etiquette} fort={b.enCours} />
          </G>
        );
      })}
    </Svg>
  );
}

/** 30 jours, 12 mois : le solde autour du zéro ; objectif en tirets ; axe à droite (±échelle). */
export function GrapheSoldeEnergie({
  barres,
  largeur,
  cle,
  pret,
  sel,
  objectif,
  annee,
  libelle,
}: {
  barres: readonly BarreEnergie[];
  largeur: number;
  cle: string;
  /** Données lues : la pousse attend leur arrivée, à l'ouverture. */
  pret: boolean;
  sel: number | null;
  objectif: number | null;
  annee: boolean;
  libelle: string;
}) {
  const c = useCouleursGraphe();
  const e = useCouleursEnergie();
  const H = 176;
  const W = largeur - GRAPHE.axe - 4;
  const mid = 78;
  const ech = echelleSolde([...barres.map((b) => b.v), objectif]);
  const k = 62 / ech;
  const nb = barres.length;
  const p = useApparition(cle, pret);
  const pas = W / Math.max(1, nb);
  const bw = Math.min(annee ? 16 : 7, pas * 0.62);
  return (
    <Svg width={largeur} height={H} accessibilityLabel={libelle}>
      <Etiquette x={W + 6} y={mid - 58} texte={`+${court(ech)}`} ancre="start" />
      <Etiquette x={W + 6} y={mid + 4} texte="0" ancre="start" />
      <Etiquette x={W + 6} y={mid + 66} texte={`−${court(ech)}`} ancre="start" />
      <Line x1={0} x2={W} y1={mid - 62} y2={mid - 62} stroke={c.grille} strokeWidth={1} />
      <Line x1={0} x2={W} y1={mid + 62} y2={mid + 62} stroke={c.grille} strokeWidth={1} />
      <Line x1={0} x2={W} y1={mid} y2={mid} stroke={c.line2} strokeWidth={1} />
      {objectif != null ? <Tirets x1={0} x2={W} y={mid - Math.max(-ech, Math.min(ech, objectif)) * k} /> : null}
      {barres.map((b, i) => {
        const x = i * pas + (pas - bw) / 2;
        const choisi = sel === i;
        return (
          <G key={i}>
            {choisi ? <Rect x={i * pas + 1} y={10} width={pas - 2} height={H - 30} rx={4} fill={c.t1} opacity={0.07} /> : null}
            {b.v == null ? (
              b.aVenir ? null : <Line x1={x + bw / 2} x2={x + bw / 2} y1={mid - 6} y2={mid + 6} stroke={c.t3} strokeWidth={1} strokeDasharray="2 3" />
            ) : (
              <BarreSolde
                p={p}
                k={i}
                nb={nb}
                x={x}
                l={bw}
                mid={mid}
                h={Math.min(70, Math.abs(b.v) * k)}
                haut={b.v >= 0}
                couleur={b.v >= 0 ? e.apports : e.sport}
                opacite={b.enCours || choisi ? 1 : 0.8}
                rx={bw > 10 ? 3 : 2}
              />
            )}
            {b.etiquette ? <Etiquette x={x + bw / 2} y={H - 3} texte={b.etiquette} fort={b.enCours} /> : null}
          </G>
        );
      })}
    </Svg>
  );
}

/** Cumul du solde sur la période : ligne qui part de 0, couleur du côté qui l'emporte, axe en kg estimés. */
export function CourbeCumul({ cumul, largeur, cle, pret = true, debut, fin, libelle }: { cumul: readonly number[]; largeur: number; cle: string; pret?: boolean; debut: string; fin: string; libelle: string }) {
  const c = useCouleursGraphe();
  const e = useCouleursEnergie();
  const p = useApparition(cle, pret);
  const H = 110;
  const W = largeur - GRAPHE.axe - 12;
  const pts = [0, ...cumul];
  const lo = Math.min(0, ...pts);
  const hi = Math.max(0, ...pts);
  const pad = (hi - lo) * 0.1 || 500;
  const y = (v: number) => 8 + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 26);
  const x = (i: number) => (pts.length < 2 ? W : (i / (pts.length - 1)) * W);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  let longueur = 0;
  for (let i = 1; i < pts.length; i++) longueur += Math.hypot(x(i) - x(i - 1), y(pts[i]!) - y(pts[i - 1]!));
  const pasKg = (hi - lo) / KCAL_KG > 2.5 ? 1 : 0.5;
  const kgs: number[] = [];
  for (let g = Math.ceil(lo / KCAL_KG / pasKg) * pasKg; g * KCAL_KG <= hi; g += pasKg) if (Math.abs(g) > 1e-9) kgs.push(g);
  const dernier = pts[pts.length - 1]!;
  const couleur = dernier < 0 ? e.sport : e.apports;
  const trace = useAnimatedProps(() => ({ strokeDashoffset: longueur * (1 - (1 - Math.pow(1 - p.value, 4))) }));
  return (
    <Svg width={largeur} height={H} accessibilityLabel={libelle}>
      {kgs.map((g) => (
        <G key={g}>
          <Line x1={0} x2={W} y1={y(g * KCAL_KG)} y2={y(g * KCAL_KG)} stroke={c.grille} strokeWidth={1} />
          <Etiquette x={W + 6} y={y(g * KCAL_KG) + 4} texte={t("energie.kgAxe", { v: signe(g, pasKg < 1 ? 1 : 0) })} ancre="start" />
        </G>
      ))}
      <Line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={c.line2} strokeWidth={1} />
      <Etiquette x={W + 6} y={y(0) + 4} texte={nombre(0, 0)} ancre="start" />
      <PathAnime d={d} fill="none" stroke={couleur} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${longueur} ${longueur}`} animatedProps={trace} />
      <Circle cx={x(pts.length - 1)} cy={y(dernier)} r={4} fill={couleur} stroke={c.groupe} strokeWidth={2} />
      <Etiquette x={0} y={H - 3} texte={debut} ancre="start" />
      <Etiquette x={W} y={H - 3} texte={fin} ancre="end" fort />
    </Svg>
  );
}
