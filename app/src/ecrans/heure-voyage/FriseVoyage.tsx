// La frise du voyage (planche sommeil, c3) : une bande de 24 h par jour, de midi à midi, à l'heure du lieu de la ligne.
// Sommeil en accent, lumière vive en ocre, peu de lumière hachuré, repas en points ; jour et lieu à gauche (64).
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Line, Pattern, Rect, Text as SvgText } from "react-native-svg";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { useMesure } from "../mesures/gabarit";
import { heureMin, jourCourt, MIN_JOUR } from "./horloge";
import type { LigneVoyage, Plage } from "./voyage";

const X0 = 64;
const RANG = 22;
const ECART = 14;
const HAUT = 22;
const DEBUT = 12 * 60;
const FIN = DEBUT + MIN_JOUR;

/** Ocre de la lumière vive, blanc ou noir des repas (planche : --lum, --repas). */
const LUMIERE = { nuit: "rgba(245,176,20,0.58)", jour: "rgba(214,138,0,0.42)" };
const REPAS = { nuit: "#ffffff", jour: "rgba(0,0,0,0.82)" };

export function FriseVoyage({ lignes }: { lignes: readonly LigneVoyage[] }) {
  const { couleurs, mode } = useTheme();
  const m = useMesure();
  const [l, setL] = useState(0);
  const W = l;
  const ph = (W - X0) / MIN_JOUR;
  const X = (min: number) => X0 + (Math.min(FIN, Math.max(DEBUT, min)) - DEBUT) * ph;
  const H = HAUT + lignes.length * (RANG + ECART) - ECART + 2;
  const lieu = (x: LigneVoyage) => (x.lieu === "vol" ? t("heureVoyage.vol") : villeDuFuseau(x.fuseau));
  const lu = t("heureVoyage.friseLu", {
    nuits: lignes.map((x) => t("heureVoyage.friseNuit", { jour: jourCourt(x.jour), lieu: lieu(x), coucher: heureMin(x.coucher) })).join(" ; "),
  });
  const barre = (p: Plage, y: number, fill: string, cle: string) =>
    p[1] > DEBUT && p[0] < FIN ? <Rect key={cle} x={X(p[0])} y={y} width={Math.max(0, X(p[1]) - X(p[0]))} height={RANG} rx={5} fill={fill} /> : null;
  const axe: [number, string, "start" | "middle" | "end"][] = [
    [DEBUT, "12 h", "start"],
    [18 * 60, "18 h", "middle"],
    [24 * 60, "00 h", "middle"],
    [30 * 60, "06 h", "middle"],
    [FIN, "12 h", "end"],
  ];
  return (
    <View onLayout={(e) => setL(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={lu}>
      {W > 0 ? (
        <Svg width={W} height={H}>
          <Defs>
            <Pattern id="peuDeLumiere" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect width={5} height={5} fill={couleurs.s2} />
              <Line x1={0} y1={0} x2={0} y2={5} stroke={couleurs.t2} strokeWidth={1.5} />
            </Pattern>
          </Defs>
          {axe.map(([h, s, a]) => (
            <SvgText key={h} x={X(h)} y={11} textAnchor={a} fontSize={11} fontFamily={police.regular} fill={couleurs.t2}>
              {s}
            </SvgText>
          ))}
          {[18, 24, 30].map((h) => (
            <Line key={h} x1={X(h * 60)} x2={X(h * 60)} y1={HAUT - 4} y2={H} stroke={couleurs.t3} strokeWidth={1} strokeDasharray="1 3" />
          ))}
          {lignes.map((x, i) => {
            const y = HAUT + i * (RANG + ECART);
            return (
              <G key={x.jour}>
                <SvgText x={0} y={y + 9} fontSize={11} fontFamily={police.semibold} fill={couleurs.t1}>
                  {jourCourt(x.jour)}
                </SvgText>
                <SvgText x={0} y={y + 22} fontSize={11} fontFamily={police.regular} fill={couleurs.t2}>
                  {lieu(x)}
                </SvgText>
                <Rect x={X0} y={y} width={W - X0} height={RANG} rx={5} fill={couleurs.s2} />
                {x.lumiere ? barre(x.lumiere, y, LUMIERE[mode], "l") : null}
                {x.eviter ? barre(x.eviter, y, "url(#peuDeLumiere)", "e") : null}
                {barre([x.coucher, x.lever], y, m.fort, "s")}
                {x.repas
                  .filter((r) => r >= DEBUT && r <= FIN)
                  .map((r) => (
                    <Circle key={r} cx={X(r)} cy={y + RANG / 2} r={3.5} fill={REPAS[mode]} stroke={m.groupe} strokeWidth={1.5} />
                  ))}
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
    </View>
  );
}

/** Légende de la frise (planche : .cles) : sommeil, lumière vive, peu de lumière, repas. Le vol n'a pas d'heures : pas de clé. */
export function LegendeFrise() {
  const { couleurs, mode } = useTheme();
  const m = useMesure();
  const cle = (libelle: string, carre: ReactNode) => (
    <View key={libelle} style={styles.cle}>
      {carre}
      <Texte variante="meta" couleur="t2">
        {libelle}
      </Texte>
    </View>
  );
  return (
    <View style={styles.cles}>
      {cle(t("heureVoyage.cleSommeil"), <View style={[styles.carre, { backgroundColor: m.fort }]} />)}
      {cle(t("heureVoyage.cleLumiere"), <View style={[styles.carre, { backgroundColor: LUMIERE[mode] }]} />)}
      {cle(
        t("heureVoyage.clePeuLumiere"),
        <Svg width={10} height={10}>
          <Rect width={10} height={10} rx={3} fill={couleurs.s2} />
          <Line x1={0} y1={10} x2={10} y2={0} stroke={couleurs.t2} strokeWidth={1.5} />
          <Line x1={-3} y1={5} x2={5} y2={-3} stroke={couleurs.t2} strokeWidth={1.5} />
          <Line x1={5} y1={13} x2={13} y2={5} stroke={couleurs.t2} strokeWidth={1.5} />
        </Svg>,
      )}
      {cle(t("heureVoyage.cleRepas"), <View style={[styles.point, { backgroundColor: REPAS[mode] }]} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  cles: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6, marginTop: 12 },
  cle: { flexDirection: "row", alignItems: "center", gap: 6 },
  carre: { width: 10, height: 10, borderRadius: 3 },
  point: { width: 7, height: 7, borderRadius: 3.5 },
});
