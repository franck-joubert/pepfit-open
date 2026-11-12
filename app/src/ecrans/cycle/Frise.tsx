// La frise du cycle (planche cycle, D5 : une frise plutôt qu'un anneau) : un jour par case ; les règles en plein, la première
// moitié pâle, la seconde moitié plus soutenue jusqu'à aujourd'hui ; après aujourd'hui, la piste neutre ; la fourchette des
// prochaines règles, un crochet en tirets ; aujourd'hui, un point cerclé marqué « auj. ». `mini` : la version de la carte de
// Santé (sans dates ni libellés). Géométrie : cycle-vue.ts (geometrieFrise).
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import { minuscule, t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import type { EtatCycle } from "../../cycle/modele";
import { useMesure } from "../mesures/gabarit";
import { dateCourte, geometrieFrise, luPrevision, motPhase } from "./cycle-vue";

const OPACITE = { regles: 1, premiere: 0.32, seconde: 0.62 } as const;

/** `libelle` : ce qui est écrit au-dessus du point (« auj. » par défaut ; la date d'un jour passé choisi). */
export function Frise({ etat, largeur, mini = false, fond, libelle }: { etat: EtatCycle; largeur: number; mini?: boolean; fond?: string; libelle?: string }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const g = geometrieFrise(etat);
  if (!g || largeur <= 0) return null;
  const H = mini ? 34 : 80;
  const y = mini ? 14 : 34;
  const h = mini ? 8 : 10;
  const pas = largeur / g.n;
  const xj = (j: number) => (j - 1) * pas;
  const tx = xj(g.j) + pas / 2;
  const lu = t("cycle.frise.lu", { j: g.j, phase: minuscule(motPhase(etat.phase?.nom)), prevision: luPrevision(etat.prevision) });
  return (
    <Svg width={largeur} height={H} accessible accessibilityRole="image" accessibilityLabel={lu}>
      {g.segments.map((s) => {
        const x = xj(s.de) + 1;
        const w = Math.max(1, xj(s.a + 1) - xj(s.de) - 2);
        return s.sorte === "avenir" ? (
          <Rect key={`${s.sorte}${s.de}`} x={x} y={y - h / 2} width={w} height={h} rx={h / 2} fill={couleurs.jaugePiste} />
        ) : (
          <Rect key={`${s.sorte}${s.de}`} x={x} y={y - h / 2} width={w} height={h} rx={h / 2} fill={m.fort} fillOpacity={OPACITE[s.sorte]} />
        );
      })}
      {g.fourchette ? (
        <Rect
          x={xj(g.fourchette.de) + 1}
          y={y - h / 2 - 3}
          width={Math.max(4, xj(g.fourchette.a + 1) - xj(g.fourchette.de) - 2)}
          height={h + 6}
          rx={(h + 6) / 2}
          fill="none"
          stroke={m.fort}
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      ) : null}
      <Circle cx={tx} cy={y} r={mini ? 6 : 7.5} fill={couleurs.t1} stroke={fond ?? couleurs.bg} strokeWidth={2.5} />
      {mini ? null : (
        <>
          <SvgText x={tx} y={y - 16} textAnchor="middle" fontSize={12} fontFamily={police.semibold} fill={couleurs.t1}>
            {libelle ?? t("cycle.frise.auj")}
          </SvgText>
          <SvgText x={0} y={y + 30} fontSize={11} fontFamily={police.regular} fill={couleurs.t3}>
            {dateCourte(g.debut)}
          </SvgText>
          {g.dateSeconde && g.seconde != null ? (
            <SvgText x={xj(g.seconde)} y={y + 30} textAnchor="middle" fontSize={11} fontFamily={police.regular} fill={couleurs.t3}>
              {dateCourte(g.dateSeconde)}
            </SvgText>
          ) : null}
          {g.fourchette ? (
            <SvgText
              x={Math.min(largeur - 30, xj(g.fourchette.de) + (xj(g.fourchette.a + 1) - xj(g.fourchette.de)) / 2)}
              y={y + 30}
              textAnchor="middle"
              fontSize={11}
              fontFamily={police.regular}
              fill={couleurs.t3}
            >
              {t("cycle.frise.prochaines")}
            </SvgText>
          ) : null}
        </>
      )}
    </Svg>
  );
}
