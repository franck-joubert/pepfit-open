// Courbe d'une mesure « état » (poids, masse grasse, VFC, FC au repos ; planche pas, donnees-mesures.js `svgCourbe`) : une
// pastille par relevé (cerclée si saisie à la main), la moyenne lissée en trait, la bande de ta normale en voile dessous (VFC,
// FC au repos), l'objectif en tirets s'il tombe dans la plage, sinon « Objectif 75,0 ↓ » au bord, du côté où il est. Axe à
// droite, dates dessous ; l'axe du temps garde toute la période, même sans relevé (la partie vide reste vide). Une colonne de
// toucher par jour : les pastilles sont posées au centre de leur colonne, la piste commune (Statistiques.tsx) partage toute sa
// largeur, axe compris, en `colonnesPiste()` colonnes égales (celles de l'axe reviennent au dernier jour).
// Changer de période anime le domaine sur le fil UI (retour du 29/10) : la durée affichée passe de l'ancienne à la
// nouvelle, ancrée à droite sur le dernier jour (320 ms, courbe sortie) ; la courbe s'écrase ou s'étire, les jours qui entrent
// arrivent par la gauche, ceux qui sortent partent à gauche, l'échelle des valeurs suit, et avec elle la grille, les repères,
// les dates, l'objectif et le jour touché (les étiquettes qui changent se croisent en fondu). Tout ce qui dépend du domaine lit
// des valeurs partagées dans le corps même des fonctions du fil UI (bug du 30/10 : lues par une fonction intermédiaire, elles
// n'étaient pas suivies, la courbe restait figée au domaine d'avant). Changements rapides : chaque passage repart d'où en est
// le précédent ; seul le dernier, fini, ramène la série à sa période (courbe-domaine.ts). Mouvement réduit : tout se pose, la
// courbe arrive en fondu de 200 ms. Le glissé d'une période à l'autre reste celui de la piste (le domaine se pose).
import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { t } from "../../i18n/index";
import { police } from "../../theme/typo";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { fixe } from "../composition-vue";
import {
  aChange,
  changer,
  dansCadre,
  domaineEtat,
  etatInitial,
  etiquettesAxe,
  etiquettesDates,
  couches,
  opaciteRole,
  rayonPastille,
  terminer,
  versUI,
  yValeur,
  type BandeJour,
  type Cible,
  type EtiquetteCourbe,
  type Role,
  type TraceUI,
} from "./courbe-domaine";
import { xDepuisFin, type PointEtat } from "./corps-calc";
export { colonnesPiste } from "./corps-calc";
export type { BandeJour } from "./courbe-domaine";
import { GRAPHE } from "./graphes";
import { useCouleursGraphe } from "./Statistiques";

const PathAnime = Animated.createAnimatedComponent(Path);

export const COURBE_ETAT = { hauteur: 176, haut: 10, echelleMs: 320, fonduMs: 200 } as const;

/** Étiquettes en texte natif posé sur le dessin : boîte fixe (l'ancre se fait par l'alignement), ligne de base à 11 px du haut. */
const ETIQ = { boite: 120, ligne: 14, ligneDeBase: 11 } as const;

/** Premier jour à dessiner : celui juste à gauche du bord (les plus anciens sont hors cadre, on ne les écrit pas). */
function debutVisible(T: number, D: number): number {
  "worklet";
  return Math.max(0, Math.floor(T - 2.5 - D));
}

/** Pastilles (cercles en arcs) d'un seul chemin : `manuel` 1 = les relevés saisis, 0 = les autres. */
function cheminPastilles(V: readonly number[], M: readonly number[], manuel: number, W: number, D: number, base: number, k: number, lo: number, r: number): string {
  "worklet";
  const T = V.length;
  const pas = W / Math.max(1, D);
  let d = "";
  for (let i = debutVisible(T, D); i < T; i++) {
    const v = V[i]!;
    if (Number.isNaN(v) || M[i] !== manuel) continue;
    const x = W - (T - 1 - i + 0.5) * pas;
    if (x < -r) continue;
    const y = base - (v - lo) * k;
    d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return d || "M0 0";
}

/** Moyenne lissée : un trait de jour en jour (il entre par le bord gauche). */
function cheminLigne(L: readonly number[], W: number, D: number, base: number, k: number, lo: number): string {
  "worklet";
  const T = L.length;
  const pas = W / Math.max(1, D);
  let d = "";
  for (let i = debutVisible(T, D); i < T; i++) {
    const l = L[i]!;
    if (Number.isNaN(l)) continue;
    d += `${d ? "L" : "M"}${(W - (T - 1 - i + 0.5) * pas).toFixed(1)} ${(base - (l - lo) * k).toFixed(1)}`;
  }
  return d || "M0 0";
}

/** Bande de ta normale : un polygone par suite de jours qui en ont une, élargi d'une demi-colonne de chaque côté. */
function cheminBande(B: readonly number[], Hb: readonly number[], W: number, D: number, base: number, k: number, lo: number): string {
  "worklet";
  const T = B.length;
  const pas = W / Math.max(1, D);
  const X = (i: number) => W - (T - 1 - i + 0.5) * pas;
  const Y = (v: number) => (base - (v - lo) * k).toFixed(1);
  let d = "";
  let i = debutVisible(T, D);
  while (i < T) {
    if (Number.isNaN(B[i]!)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < T && !Number.isNaN(B[j + 1]!)) j++;
    d += `M${(X(i) - pas / 2).toFixed(1)} ${Y(Hb[i]!)}`;
    for (let n = i; n <= j; n++) d += `L${X(n).toFixed(1)} ${Y(Hb[n]!)}`;
    d += `L${(X(j) + pas / 2).toFixed(1)} ${Y(Hb[j]!)}L${(X(j) + pas / 2).toFixed(1)} ${Y(B[j]!)}`;
    for (let n = j; n >= i; n--) d += `L${X(n).toFixed(1)} ${Y(B[n]!)}`;
    d += `L${(X(i) - pas / 2).toFixed(1)} ${Y(B[i]!)}Z`;
    i = j + 1;
  }
  return d || "M0 0";
}

/** Le domaine affiché sur le fil UI, et l'avancée du passage en cours (`gen` : son numéro, `t` : 0 → 1). */
interface Domaine {
  duree: SharedValue<number>;
  lo: SharedValue<number>;
  hi: SharedValue<number>;
  rayon: SharedValue<number>;
  gen: SharedValue<number>;
  t: SharedValue<number>;
}

/** Géométrie du dessin. */
interface Cadre {
  W: number;
  H: number;
  base: number;
  haut: number;
}

export function CourbeEtat({
  pts,
  bande = null,
  largeur,
  cle,
  sel,
  objectif,
  etiquettes,
  libelle,
}: {
  pts: readonly PointEtat[];
  /** Bande de ta normale, jour par jour (alignée sur `pts`). */
  bande?: readonly BandeJour[] | null;
  largeur: number;
  /** Clé de la période : son changement joue le passage d'un domaine à l'autre. */
  cle: string;
  sel: number | null;
  objectif?: number | null;
  etiquettes: readonly (readonly [number, string])[];
  libelle: string;
}) {
  const c = useCouleursGraphe();
  const reduit = useReduit();
  const H = COURBE_ETAT.hauteur;
  const base = H - GRAPHE.bas;
  const haut = COURBE_ETAT.haut;
  const W = largeur - GRAPHE.axe;
  const cadre: Cadre = { W, H, base, haut };
  const N = pts.length;

  // La cible (période, données, étiquettes) et le passage en cours : état dérivé pendant le rendu (aucune image sans lui).
  const cible: Cible = { cle, periode: { pts, bande }, axe: etiquettesAxe(domaineEtat(pts, bande), fixe), dates: etiquettesDates(etiquettes, N) };
  const [etat, setEtat] = useState(() => etatInitial(cible));
  let e = etat;
  if (aChange(etat, cible)) {
    e = changer(etat, cible, reduit);
    setEtat(e);
  }

  const d0 = useRef(e.domaine).current;
  const dom: Domaine = {
    duree: useSharedValue(d0.duree),
    lo: useSharedValue(d0.lo),
    hi: useSharedValue(d0.hi),
    rayon: useSharedValue(rayonPastille(d0.duree)),
    gen: useSharedValue(e.gen),
    t: useSharedValue(1),
  };
  const premiere = useRef<TraceUI | null>(null);
  if (!premiere.current) premiere.current = versUI(e.trace);
  const trace = useSharedValue<TraceUI>(premiere.current);
  const op = useSharedValue(1);

  // La série dessinée part au fil UI à chaque changement (passage, puis fin du passage qui la ramène à la période).
  const traceEnvoyee = useRef(e.trace);
  useLayoutEffect(() => {
    if (traceEnvoyee.current === etat.trace) return;
    traceEnvoyee.current = etat.trace;
    trace.value = versUI(etat.trace);
  }, [etat.trace, trace]);

  // Le passage : le domaine part de là où il en est (même au milieu d'un passage) vers celui de la période.
  useLayoutEffect(() => {
    if (etat.gen === 0) return;
    const d = etat.domaine;
    const r = rayonPastille(d.duree);
    dom.gen.value = etat.gen;
    if (!etat.anime) {
      dom.t.value = 1;
      dom.duree.value = d.duree;
      dom.lo.value = d.lo;
      dom.hi.value = d.hi;
      dom.rayon.value = r;
      if (reduit && etat.autrePeriode) {
        op.value = 0;
        op.value = withTiming(1, { duration: COURBE_ETAT.fonduMs, easing: courbes.sortie });
      }
      return;
    }
    const gen = etat.gen;
    const fini = (g: number) => setEtat((x) => terminer(x, g));
    const cfg = { duration: COURBE_ETAT.echelleMs, easing: courbes.sortie };
    dom.t.value = 0;
    dom.t.value = withTiming(1, cfg, (ok) => {
      if (ok) scheduleOnRN(fini, gen);
    });
    dom.duree.value = withTiming(d.duree, cfg);
    dom.lo.value = withTiming(d.lo, cfg);
    dom.hi.value = withTiming(d.hi, cfg);
    dom.rayon.value = withTiming(r, cfg);
    // un passage par génération : le reste est lu dans `etat` de ce rendu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat.gen]);

  // Ce qui se dessine sur le fil UI : chaque fonction lit elle-même les valeurs partagées (sinon elle n'est pas rejouée).
  const { duree, lo, hi, rayon } = dom;
  const propsBande = useAnimatedProps(() => {
    const k = (base - haut) / Math.max(1e-6, hi.value - lo.value);
    const s = trace.value;
    return { d: s.B.length ? cheminBande(s.B, s.Hb, W, duree.value, base, k, lo.value) : "M0 0" };
  });
  const propsAuto = useAnimatedProps(() => {
    const k = (base - haut) / Math.max(1e-6, hi.value - lo.value);
    return { d: cheminPastilles(trace.value.V, trace.value.M, 0, W, duree.value, base, k, lo.value, rayon.value) };
  });
  const propsSaisies = useAnimatedProps(() => {
    const k = (base - haut) / Math.max(1e-6, hi.value - lo.value);
    return { d: cheminPastilles(trace.value.V, trace.value.M, 1, W, duree.value, base, k, lo.value, rayon.value) };
  });
  const propsLigne = useAnimatedProps(() => {
    const k = (base - haut) / Math.max(1e-6, hi.value - lo.value);
    return { d: cheminLigne(trace.value.L, W, duree.value, base, k, lo.value) };
  });

  // Le jour touché : trait vertical et point, posés dans le domaine courant.
  const ptSel = sel != null && sel < N ? pts[sel]! : null;
  const oSel = ptSel ? N - 1 - sel! : -1;
  const vSel = ptSel?.v ?? NaN;
  const propsSelTrait = useAnimatedProps(() => {
    if (oSel < 0) return { d: "M0 0" };
    const x = xDepuisFin(oSel, duree.value, W);
    return { d: `M${x.toFixed(1)} ${haut - 4}V${base}` };
  });
  const propsSelPoint = useAnimatedProps(() => {
    if (oSel < 0 || Number.isNaN(vSel)) return { d: "M0 0" };
    const x = xDepuisFin(oSel, duree.value, W);
    const y = yValeur(vSel, lo.value, hi.value, base, haut);
    const r = rayon.value + 2;
    return { d: `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0` };
  });

  // L'objectif : en tirets dans la plage (il suit l'échelle), sinon au bord avec sa flèche.
  const obj = objectif ?? NaN;
  const propsObjectif = useAnimatedProps(() => {
    if (Number.isNaN(obj)) return { d: "M0 0", strokeOpacity: 0 };
    const y = yValeur(obj, lo.value, hi.value, base, haut);
    return { d: `M0 ${y.toFixed(1)}H${W}`, strokeOpacity: 0.55 * dansCadre(y, haut, base, 6) };
  });
  const fondu = useAnimatedStyle(() => ({ opacity: op.value }));

  const axe = couches(e.avant?.axe ?? null, e.axe, e.anime);
  const dates = couches(e.avant?.dates ?? null, e.dates, e.anime);
  const texteObjectif = objectif != null ? t("mesuresCorps.objectifCourbe", { v: fixe(objectif, 1) }) : "";

  return (
    <View style={{ width: largeur, height: H }} accessible accessibilityLabel={libelle}>
      <Svg width={largeur} height={H} style={StyleSheet.absoluteFill}>
        {axe.map(({ e: x, role }) => (
          <Grille key={`g${x.pos}|${x.texte}`} v={x.pos} role={role} gen={e.gen} dom={dom} cadre={cadre} couleur={c.grille} />
        ))}
        <Line x1={0} x2={W} y1={base} y2={base} stroke={c.line2} strokeWidth={1} />
        {objectif != null ? <PathAnime fill="none" stroke={c.t1} strokeWidth={1.25} strokeDasharray="4 4" animatedProps={propsObjectif} /> : null}
        {ptSel ? <PathAnime fill="none" stroke={c.t1} strokeOpacity={0.25} strokeWidth={1} animatedProps={propsSelTrait} /> : null}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {axe.map(({ e: x, role }) => (
          <EtiquetteAnimee key={`a${x.pos}|${x.texte}`} e={x} sorte="axe" role={role} gen={e.gen} dom={dom} cadre={cadre} />
        ))}
        {dates.map(({ e: x, role }) => (
          <EtiquetteAnimee key={`d${x.pos}|${x.texte}`} e={x} sorte="date" role={role} gen={e.gen} dom={dom} cadre={cadre} />
        ))}
        {objectif != null ? <EtiquetteObjectif v={objectif} texte={texteObjectif} dom={dom} cadre={cadre} /> : null}
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, fondu]}>
        <Svg width={largeur} height={H}>
          {bande ? <PathAnime fill={c.voile} animatedProps={propsBande} /> : null}
          <PathAnime fill={c.doux} animatedProps={propsAuto} />
          <PathAnime fill={c.doux} stroke={c.t1} strokeWidth={1} animatedProps={propsSaisies} />
          <PathAnime fill="none" stroke={c.fort} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" animatedProps={propsLigne} />
          {ptSel?.v != null ? <PathAnime fill={c.t1} animatedProps={propsSelPoint} /> : null}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Ligne de la grille d'un repère : elle suit l'échelle des valeurs, s'efface au bord du cadre et en fondu de rôle. */
function Grille({ v, role, gen, dom, cadre, couleur }: { v: number; role: Role; gen: number; dom: Domaine; cadre: Cadre; couleur: string }) {
  const { W, base, haut } = cadre;
  const { lo, hi, gen: g, t: tt } = dom;
  const props = useAnimatedProps(() => {
    const y = yValeur(v, lo.value, hi.value, base, haut);
    const a = g.value === gen ? tt.value : 0;
    return { d: `M0 ${y.toFixed(1)}H${W}`, strokeOpacity: opaciteRole(role, a) * dansCadre(y, haut, base, 6) };
  });
  return <PathAnime fill="none" stroke={couleur} strokeWidth={1} animatedProps={props} />;
}

/** Repère de l'axe (à droite de la grille) ou date (sous la courbe) : suit le domaine, se croise en fondu avec l'ancienne. */
function EtiquetteAnimee({ e, sorte, role, gen, dom, cadre }: { e: EtiquetteCourbe; sorte: "axe" | "date"; role: Role; gen: number; dom: Domaine; cadre: Cadre }) {
  const c = useCouleursGraphe();
  const { W, H, base, haut } = cadre;
  const { duree, lo, hi, gen: g, t: tt } = dom;
  const { pos, ancre } = e;
  const style = useAnimatedStyle(() => {
    const a = opaciteRole(role, g.value === gen ? tt.value : 0);
    if (sorte === "axe") {
      const y = yValeur(pos, lo.value, hi.value, base, haut);
      return { opacity: a * dansCadre(y, haut, base, 6), transform: [{ translateX: W + 6 }, { translateY: y + 4 - ETIQ.ligneDeBase }] };
    }
    const x = xDepuisFin(pos, duree.value, W);
    const dx = ancre === "start" ? 0 : ancre === "middle" ? -ETIQ.boite / 2 : -ETIQ.boite;
    return { opacity: a * dansCadre(x, 0, W, 16), transform: [{ translateX: x + dx }, { translateY: H - 3 - ETIQ.ligneDeBase }] };
  });
  return (
    <Animated.Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.etiquette,
        { color: e.fort ? c.t1 : c.t3, fontFamily: e.fort ? police.medium : police.regular, textAlign: ancre === "start" ? "left" : ancre === "end" ? "right" : "center" },
        style,
      ]}
    >
      {e.texte}
    </Animated.Text>
  );
}

/** « Objectif 75,0 » au-dessus des tirets dans la plage ; hors plage, au bord du côté où il est, avec sa flèche. */
function EtiquetteObjectif({ v, texte, dom, cadre }: { v: number; texte: string; dom: Domaine; cadre: Cadre }) {
  const c = useCouleursGraphe();
  const { base, haut } = cadre;
  const { lo, hi } = dom;
  const dans = useAnimatedStyle(() => {
    const y = yValeur(v, lo.value, hi.value, base, haut);
    return { opacity: dansCadre(y, haut, base, 6), transform: [{ translateY: y - 6 - ETIQ.ligneDeBase }] };
  });
  const dessous = useAnimatedStyle(() => ({ opacity: v < lo.value ? 1 - dansCadre(yValeur(v, lo.value, hi.value, base, haut), haut, base, 6) : 0 }));
  const dessus = useAnimatedStyle(() => ({ opacity: v > hi.value ? 1 - dansCadre(yValeur(v, lo.value, hi.value, base, haut), haut, base, 6) : 0 }));
  const st = [styles.etiquette, { color: c.t3, fontFamily: police.regular }];
  return (
    <>
      <Animated.Text allowFontScaling={false} numberOfLines={1} style={[st, dans]}>
        {texte}
      </Animated.Text>
      <Animated.Text allowFontScaling={false} numberOfLines={1} style={[st, { transform: [{ translateY: base - 6 - ETIQ.ligneDeBase }] }, dessous]}>
        {`${texte} ↓`}
      </Animated.Text>
      <Animated.Text allowFontScaling={false} numberOfLines={1} style={[st, { transform: [{ translateY: haut + 4 - ETIQ.ligneDeBase }] }, dessus]}>
        {`${texte} ↑`}
      </Animated.Text>
    </>
  );
}

const styles = StyleSheet.create({
  etiquette: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ETIQ.boite,
    fontSize: GRAPHE.police,
    lineHeight: ETIQ.ligne,
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
});
