import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLargeurContenu } from "./CadreContenu";
import Animated, { useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { debutMois, moisCourt, nombre } from "../ecrans/format";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { longueurTrace } from "../ecrans/exercice-vue";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { Texte } from "./Texte";

const CheminAnime = Animated.createAnimatedComponent(Path);

/** Périodes des courbes (progression d'un exercice, page d'une routine) ; 0 jour = tout. */
export const PERIODES: readonly { readonly libelle: string; readonly court: string; readonly jours: number }[] = [
  { get libelle() { return t("accueil.courbe.unMois"); }, get court() { return t("accueil.courbe.unMoisCourt"); }, jours: 30 },
  { get libelle() { return t("accueil.courbe.troisMois"); }, get court() { return t("accueil.courbe.troisMoisCourt"); }, jours: 91 },
  { get libelle() { return t("accueil.courbe.unAn"); }, get court() { return t("accueil.courbe.unAnCourt"); }, jours: 365 },
  { get libelle() { return t("accueil.courbe.tout"); }, get court() { return t("accueil.courbe.toutCourt"); }, jours: 0 },
];

/** Pastilles de période sous une courbe : celle choisie sur s2. */
export function Periodes({ valeur, onChange }: { valeur: number; onChange: (i: number) => void }) {
  const { couleurs } = useTheme();
  useLangue();
  return (
    <View style={styles.periodes} accessibilityRole="radiogroup" accessibilityLabel={t("accueil.courbe.periode")}>
      {PERIODES.map((p, i) => (
        <Pressable
          key={i}
          accessibilityRole="radio"
          accessibilityState={{ checked: i === valeur }}
          onPress={() => onChange(i)}
          style={[styles.periode, i === valeur && { backgroundColor: couleurs.s2 }]}
        >
          <Texte variante="saisie" couleur={i === valeur ? "t1" : "t2"} style={{ fontSize: 15, fontFamily: "Inter-Regular" }}>
            {p.libelle}
          </Texte>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Pastilles à choix unique (mesure, période) : rayon des boutons, la choisie pleine (t1 sur fond, texte bg) ; elles
 * défilent de côté si elles débordent. Zone de clic de 44 px pour une pastille de 36.
 */
export function Pastilles<T extends string | number>({
  options,
  valeur,
  onChange,
  libelle,
}: {
  options: readonly { valeur: T; libelle: string; lu?: string }[];
  valeur: T;
  onChange: (v: T) => void;
  libelle: string;
}) {
  const { couleurs, mode } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pastilles} accessibilityRole="radiogroup" accessibilityLabel={libelle}>
      {options.map((o) => {
        const on = o.valeur === valeur;
        return (
          <Pressable
            key={String(o.valeur)}
            accessibilityRole="radio"
            accessibilityLabel={o.lu ?? o.libelle}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.valeur)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[
              styles.pastille,
              on
                ? { backgroundColor: couleurs.t1 }
                : mode === "jour"
                  ? { backgroundColor: couleurs.s1 }
                  : { borderWidth: 1, borderColor: couleurs.line2 },
            ]}
          >
            <Texte variante="meta" style={{ fontSize: 13, fontFamily: police.medium, color: on ? couleurs.bg : couleurs.t2 }}>
              {o.libelle}
            </Texte>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Courbe du carnet (page d'un exercice) : repères en pointillé avec le haut et le bas à droite, aire très légère, trait
 * plein en t1 qui se dessine de gauche à droite (400 ms, rien en mouvement réduit), dernier point plein (or si record).
 */
export function CourbeCarnet({
  points,
  recordFin = false,
  inverse = false,
  hauteur: H = 150,
  montrer = (v: number) => nombre(v, 0),
  vide = t("accueil.courbe.vide"),
}: {
  points: { date: number; valeur: number }[];
  recordFin?: boolean;
  inverse?: boolean;
  hauteur?: number;
  montrer?: (v: number) => string;
  vide?: string;
}) {
  const { couleurs } = useTheme();
  useLangue();
  const reduit = useReduit();
  const largeur = useLargeurContenu() - espace.l * 2;
  const droite = 34;
  const bas = 20;
  const haut = 16;
  const w = largeur - droite;
  const vals = points.map((p) => p.valeur);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const ecart = max - min || Math.abs(max) * 0.1 || 1;
  const bornes = { min: min - ecart * 0.1, max: max + ecart * 0.1 };
  const t0 = points[0]?.date ?? 0;
  const t1 = points[points.length - 1]?.date ?? 0;
  const x = (t: number) => (t1 === t0 ? w / 2 : 8 + ((t - t0) / (t1 - t0)) * (w - 16));
  const y = (v: number) => {
    const k = (v - bornes.min) / (bornes.max - bornes.min);
    return haut + (inverse ? k : 1 - k) * (H - haut - bas);
  };
  const xy = points.map((p) => ({ x: x(p.date), y: y(p.valeur) }));
  const trace = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const aire = xy.length > 1 ? `${trace} L${xy[xy.length - 1]!.x.toFixed(1)} ${H - bas} L${xy[0]!.x.toFixed(1)} ${H - bas} Z` : "";
  const longueur = Math.max(1, longueurTrace(xy));

  // Le trait se dessine à chaque nouvelle série de points (changement de mesure ou de période).
  const p = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    if (reduit) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withTiming(1, { duration: duree.record, easing: courbes.sortie });
  }, [trace, reduit, p]);
  const dessin = useAnimatedProps(() => ({ strokeDashoffset: longueur * (1 - p.value) }));

  const mois = (() => {
    const l: { x: number; libelle: string }[] = [];
    if (!points.length) {
      [-2, -1, 0].forEach((k, i) => {
        l.push({ x: 8 + ((i + 0.5) / 3) * (w - 16), libelle: moisCourt(debutMois(Date.now(), k)) });
      });
      return l;
    }
    for (let d = debutMois(t0, 1); d.getTime() <= t1; d = debutMois(d, 1)) l.push({ x: x(d.getTime()), libelle: moisCourt(d) });
    return l.filter((_, i) => i % Math.ceil(l.length / 3 || 1) === 0);
  })();
  const fin = xy[xy.length - 1];
  const reperes = points.length ? (max === min ? [max] : [max, min]) : [];
  const ligne = (v: number) => (points.length ? y(v) : 0);

  return (
    <View style={{ width: largeur }}>
      <Svg width={largeur} height={H} accessibilityLabel={inverse ? t("accueil.courbe.courbeInverse") : t("accueil.courbe.courbe")}>
        {(points.length ? reperes.map(ligne) : [haut, (H - bas + haut) / 2, H - bas]).map((yy, i) => (
          <Line key={i} x1={8} x2={w} y1={yy} y2={yy} stroke={couleurs.line2} strokeWidth={1} strokeDasharray="2 4" />
        ))}
        {reperes.map((r) => (
          <SvgText key={`t${r}`} x={w + 6} y={y(r) + 4} fill={couleurs.t3} fontSize={11} fontFamily={police.regular}>
            {montrer(r)}
          </SvgText>
        ))}
        {aire ? <Path d={aire} fill={couleurs.t1} opacity={0.045} /> : null}
        {xy.length > 1 ? (
          <CheminAnime
            d={trace}
            fill="none"
            stroke={couleurs.t1}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={[longueur, longueur]}
            animatedProps={dessin}
          />
        ) : null}
        {fin ? <Circle cx={fin.x} cy={fin.y} r={4.5} fill={recordFin ? couleurs.record : couleurs.t1} /> : null}
        {mois.map((m) => (
          <SvgText key={m.libelle + m.x} x={m.x} y={H - 4} fill={couleurs.t3} fontSize={11} fontFamily={police.regular} textAnchor="middle">
            {m.libelle}
          </SvgText>
        ))}
      </Svg>
      {!points.length ? (
        <View style={[StyleSheet.absoluteFill, { bottom: bas, right: droite, alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
          <Texte variante="meta" couleur="t3" style={{ backgroundColor: couleurs.bg, paddingHorizontal: espace.s }}>
            {vide}
          </Texte>
        </View>
      ) : null}
    </View>
  );
}

/** Courbe de la base (.chart) : trois repères, mois en bas, cercles creux, dernier point plein en sarcelle s'il est un record. */
export function Courbe({ points, recordFin = false, inverse = false, vide = t("accueil.courbe.vide") }: { points: { date: number; valeur: number }[]; recordFin?: boolean; inverse?: boolean; vide?: string }) {
  const { couleurs } = useTheme();
  useLangue();
  const largeur = useLargeurContenu() - espace.xl * 2;
  const H = 200;
  const haut = 12;
  const bas = 30;
  const droite = 44;
  if (points.length === 0) {
    // Gabarit sans courbe : trois repères en pointillé et les derniers mois, pour qu'on lise « ici viendra la courbe ».
    const w = largeur - droite;
    const mois = [-2, -1, 0].map((k) => moisCourt(debutMois(Date.now(), k)));
    return (
      <View style={{ marginTop: espace.xl }}>
        <Svg width={largeur} height={H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1, 2].map((i) => {
            const yy = haut + (i / 2) * (H - haut - bas);
            return <Line key={i} x1={0} x2={w} y1={yy} y2={yy} stroke={couleurs.line} strokeWidth={1} strokeDasharray="4 5" />;
          })}
          {mois.map((m, i) => (
            <SvgText key={m} x={8 + ((i + 0.5) / 3) * (w - 16)} y={H - 8} fill={couleurs.t3} fontSize={11} fontFamily="Inter-Regular" textAnchor="middle">
              {m}
            </SvgText>
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { bottom: bas, right: droite, alignItems: "center", justifyContent: "center" }]}>
          <Texte variante="libelle" couleur="t3" style={{ backgroundColor: couleurs.bg, paddingHorizontal: espace.s }}>
            {vide}
          </Texte>
        </View>
      </View>
    );
  }
  const vals = points.map((p) => p.valeur);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  // Valeurs toutes égales : un écart de 10 % autour, pas un axe de 0 au double.
  const pas = pasRond((max - min || max * 0.1 || 10) / 2);
  min = Math.floor(min / pas) * pas;
  max = Math.max(min + 2 * pas, Math.ceil(max / pas) * pas);
  const t0 = points[0]!.date;
  const t1 = points[points.length - 1]!.date;
  const w = largeur - droite;
  const x = (t: number) => (t1 === t0 ? w / 2 : 8 + ((t - t0) / (t1 - t0)) * (w - 16));
  const y = (v: number) => haut + (inverse ? (v - min) / (max - min) : 1 - (v - min) / (max - min)) * (H - haut - bas);
  const reperes = [max, (max + min) / 2, min];
  const mois: { x: number; libelle: string }[] = [];
  for (let d = debutMois(t0, 1); d.getTime() <= t1; d = debutMois(d, 1)) mois.push({ x: x(d.getTime()), libelle: moisCourt(d) });
  const visibles = mois.filter((_, i) => i % Math.ceil(mois.length / 4 || 1) === 0);
  const montres = points.length > 12 ? points.filter((_, i) => i % Math.ceil(points.length / 6) === 0) : points;
  const fin = points[points.length - 1]!;
  return (
    <Svg width={largeur} height={H} style={{ marginTop: espace.xl }} accessibilityLabel={inverse ? t("accueil.courbe.courbeInverse") : t("accueil.courbe.courbe")}>
      {inverse ? (
        <SvgText x={0} y={haut - 1} fill={couleurs.t3} fontSize={11} fontFamily="Inter-Regular">
          {t("accueil.courbe.plusBas")}
        </SvgText>
      ) : null}
      {reperes.map((r) => (
        <Line key={r} x1={0} x2={w} y1={y(r)} y2={y(r)} stroke={couleurs.line} strokeWidth={1} />
      ))}
      {reperes.map((r) => (
        <SvgText key={`t${r}`} x={w + 8} y={y(r) + 4} fill={couleurs.t2} fontSize={11} fontFamily="Inter-Regular">
          {nombre(r, 0)}
        </SvgText>
      ))}
      <Polyline points={points.map((p) => `${x(p.date)},${y(p.valeur)}`).join(" ")} fill="none" stroke={couleurs.t2} strokeWidth={1.75} strokeLinejoin="round" />
      {montres.map((p) => (
        <Circle key={p.date} cx={x(p.date)} cy={y(p.valeur)} r={3.5} fill={couleurs.bg} stroke={couleurs.t2} strokeWidth={1.5} />
      ))}
      <Circle cx={x(fin.date)} cy={y(fin.valeur)} r={5} fill={recordFin ? couleurs.record : couleurs.t1} />
      {visibles.map((m) => (
        <SvgText key={m.libelle + m.x} x={m.x} y={H - 8} fill={couleurs.t2} fontSize={11} fontFamily="Inter-Regular" textAnchor="middle">
          {m.libelle}
        </SvgText>
      ))}
    </Svg>
  );
}

function pasRond(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 0.1))));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const styles = StyleSheet.create({
  periodes: { flexDirection: "row", gap: espace.xs, marginTop: espace.m },
  periode: { minHeight: 44, borderRadius: rayon.l, paddingHorizontal: espace.l, justifyContent: "center" },
  pastilles: { gap: espace.s, paddingHorizontal: espace.l, paddingVertical: 4 },
  pastille: { minHeight: 36, borderRadius: rayon.l, paddingHorizontal: 14, justifyContent: "center" },
});
