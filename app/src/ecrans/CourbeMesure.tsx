// Courbe d'une mesure (Composition, historique) : une seule ligne colorée, aire légère, une pastille par mesure, la
// dernière en grand ; 5 repères à droite, 4 dates en bas (planche sante-energie § 3).
import { View } from "react-native";
import { useLargeurContenu } from "../ui/CadreContenu";
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop, Text as SvgText } from "react-native-svg";
import { t } from "../i18n/index";
import { formater } from "../i18n/temps";
import { useTheme } from "../theme";
import { espace, police } from "../theme/typo";
import { Texte } from "../ui/Texte";
import { reperes } from "./composition-vue";
import { nombre } from "./format";

let compteur = 0;

export function CourbeMesure({ points, couleur, decimales, libelle }: { points: readonly { date: number; valeur: number }[]; couleur: string; decimales: number; libelle: string }) {
  const { couleurs } = useTheme();
  const W = useLargeurContenu() - espace.l * 2;
  const H = 168;
  const axe = 40;
  const bas = 22;
  const id = `aire-${(compteur = (compteur + 1) % 1000)}`;
  if (!points.length)
    return (
      <View style={{ height: H, alignItems: "center", justifyContent: "center" }}>
        <Texte variante="meta" couleur="t3">
          {t("sante.aucuneMesure")}
        </Texte>
      </View>
    );
  const r = reperes(points.map((p) => p.valeur));
  const y0 = r[0]!, y1 = r[r.length - 1]!;
  const t0 = points[0]!.date, t1 = points[points.length - 1]!.date;
  const X = (d: number) => (t1 === t0 ? (W - axe) / 2 : ((d - t0) / (t1 - t0)) * (W - axe));
  const Y = (v: number) => H - bas - ((v - y0) / (y1 - y0 || 1)) * (H - 30);
  const pts = points.map((p) => [X(p.date), Y(p.valeur)] as const);
  const l = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [xd, yd] = pts[pts.length - 1]!;
  const dates = t1 === t0 ? [t0] : [0, 1 / 3, 2 / 3, 1].map((k) => t0 + k * (t1 - t0));
  return (
    <Svg width={W} height={H} accessibilityLabel={t("sante.courbeDe", { nom: libelle })} style={{ marginTop: espace.m }}>
      <Defs>
        <LinearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={couleur} stopOpacity={0.28} />
          <Stop offset="1" stopColor={couleur} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {r.map((v) => (
        <G2 key={v} y={Y(v)} w={W - axe} texte={nombre(v, decimales)} grille={couleurs.line} t3={couleurs.t3} />
      ))}
      {dates.map((d, i) => (
        <SvgText
          key={i}
          x={X(d)}
          y={H - 4}
          fontSize={11}
          fontFamily={police.regular}
          fill={couleurs.t3}
          textAnchor={dates.length === 1 ? "middle" : i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}
        >
          {formater(d, { day: "2-digit", month: "2-digit" })}
        </SvgText>
      ))}
      {pts.length > 1 ? <Polygon points={`${l} ${xd.toFixed(1)},${H - bas} ${pts[0]![0].toFixed(1)},${H - bas}`} fill={`url(#${id})`} /> : null}
      {pts.length > 1 ? <Polyline points={l} fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {pts.length < 60 ? pts.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={1.6} fill={couleur} />) : null}
      <Circle cx={xd} cy={yd} r={4} fill={couleur} stroke={couleurs.bg} strokeWidth={2} />
    </Svg>
  );
}

function G2({ y, w, texte, grille, t3 }: { y: number; w: number; texte: string; grille: string; t3: string }) {
  return (
    <>
      <Line x1={0} x2={w} y1={y} y2={y} stroke={grille} strokeWidth={1} />
      <SvgText x={w + 8} y={y + 4} fontSize={11} fontFamily={police.regular} fill={t3}>
        {texte}
      </SvgText>
    </>
  );
}
