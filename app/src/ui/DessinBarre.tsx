// Barres dessinées (planche materiel, briques.mjs) : le picto d'un type de barre (48 × 24, trait du catalogue d'icônes) et la
// barre chargée vue de profil, manchons et disques de chaque côté, les plus lourds contre la bague, chacun à l'échelle de son poids.
import Svg, { G, Path, Rect } from "react-native-svg";
import { useTheme } from "../theme";

const PICTO: Record<string, string[]> = {
  droite: ["M4 12h40M8 8v8M11 9.5v5M40 8v8M37 9.5v5"],
  ez: ["M4 12h9l3-3 4 6 4-6 4 6 4-6 3 3h9M8 8v8M40 8v8"],
  hexagonale: ["M16 5h16l6 7-6 7H16l-6-7zM10 12H3M38 12h7M19 9.5v5M29 9.5v5", "M4 9v6M44 9v6"],
  courte: ["M12 12h24M15 8.5v7M33 8.5v7M17.5 10v4M30.5 10v4"],
  lesmills: ["M6 12h36M10 7v10M13 7v10M35 7v10M38 7v10"],
  autre: ["M8 8v8M40 8v8"],
};

/** Picto d'un type de barre (droite, ez, hexagonale, courte, lesmills, autre), décoratif : le texte voisin le nomme. */
export function BarrePicto({ forme, largeur = 44, couleur }: { forme: string | null; largeur?: number; couleur?: string }) {
  const { couleurs } = useTheme();
  const c = couleur ?? couleurs.t2;
  const f = forme && PICTO[forme] ? forme : "autre";
  return (
    <Svg width={largeur} height={largeur / 2} viewBox="0 0 48 24" fill="none" stroke={c} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      {f === "autre" ? <Path d="M4 12h40" strokeDasharray="3 3" /> : null}
      {PICTO[f]!.map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}

/** Hauteur et épaisseur d'un disque de profil, selon son poids (kg). */
const DIM: Record<string, [number, number]> = {
  "25": [44, 10], "20": [42, 9], "15": [37, 8], "10": [31, 7], "7.5": [28, 7], "5": [23, 6], "2.5": [18, 5], "2": [17, 5], "1.5": [15, 4.5],
  "1.25": [14, 4], "1": [13, 4], "0.5": [10, 3.5],
};
export const dimDisque = (kg: number): [number, number] => DIM[String(kg)] ?? [Math.max(10, Math.min(44, 10 + kg * 1.4)), 5];

/** La barre chargée de profil : `cote`, les disques d'un côté en kg, les plus lourds d'abord. */
export function BarreChargee({ cote, largeur = 146, hauteur = 40 }: { cote: readonly number[]; largeur?: number; hauteur?: number }) {
  const { couleurs } = useTheme();
  // Repère de la planche : 190 × 52, bague à 58 ; mis à l'échelle de la largeur voulue.
  const L = 190;
  const H = 52;
  const bague = 58;
  const mid = H / 2;
  let x = bague;
  const plaques = cote.map((kg) => {
    const [h, w] = dimDisque(kg);
    x -= w + 1;
    return { x, y: mid - h / 2, w, h };
  });
  return (
    <Svg width={largeur} height={hauteur} viewBox={`0 0 ${L} ${H}`} accessible={false}>
      <Rect x={18} y={mid - 3.5} width={bague - 16} height={7} rx={2} fill={couleurs.t3} />
      <Rect x={L - bague - 2} y={mid - 3.5} width={bague - 16} height={7} rx={2} fill={couleurs.t3} />
      <Rect x={bague} y={mid - 6} width={4} height={12} rx={1} fill={couleurs.t2} />
      <Rect x={L - bague - 4} y={mid - 6} width={4} height={12} rx={1} fill={couleurs.t2} />
      <Rect x={bague + 4} y={mid - 1.5} width={L - 2 * bague - 8} height={3} rx={1.5} fill={couleurs.t3} />
      <G fill={couleurs.t1}>
        {plaques.map((p, i) => (
          <Rect key={`g${i}`} x={p.x} y={p.y} width={p.w} height={p.h} rx={1.6} />
        ))}
        {plaques.map((p, i) => (
          <Rect key={`d${i}`} x={L - p.x - p.w} y={p.y} width={p.w} height={p.h} rx={1.6} />
        ))}
      </G>
    </Svg>
  );
}
