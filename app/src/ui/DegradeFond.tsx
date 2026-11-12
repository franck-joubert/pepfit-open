import Svg, { Defs, LinearGradient as DegradeSvg, Rect as RectSvg, Stop } from "react-native-svg";
import { ARRETS_FONDU } from "./menu-flottant";

/**
 * Le dégradé du fond sous un élément fixé en bas : transparent en haut, plein en bas (arrêts du voile du menu, `ARRETS_FONDU`).
 * Dessiné sur des nombres de dp, pas sur « 100 % » que le natif résout lui-même (docs/degrade-bas/README.md). Le menu du bas
 * (ui/MenuFlottant.tsx, `Fondu`) et la barre de la page d'une activité s'en servent : un seul voile.
 */
export function DegradeFond({ id, couleur, largeur, hauteur }: { id: string; couleur: string; largeur: number; hauteur: number }) {
  return (
    <Svg key={largeur} width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} preserveAspectRatio="none">
      <Defs>
        <DegradeSvg id={id} x1="0" y1="0" x2="0" y2="1">
          {ARRETS_FONDU.map((a) => (
            <Stop key={a.offset} offset={a.offset} stopColor={couleur} stopOpacity={a.opacite} />
          ))}
        </DegradeSvg>
      </Defs>
      <RectSvg x={0} y={0} width={largeur} height={hauteur} fill={`url(#${id})`} />
    </Svg>
  );
}
