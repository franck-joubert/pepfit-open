// Le sceau de vérification : la géométrie de l'icône au trait (ui/Icone.tsx, « sceau ») : 8 lobes, symétrique autour de
// (12, 12) sur une grille de 24, coche centrée sur le même point.

const LOBES = 8;
const RAYON = 9.3;
const AMPLITUDE = 0.95;
const POINTS = 120;

/** Contour du sceau : un point tous les 3 degrés, rayon R + A·cos(8·θ). */
export const SCEAU_D = (() => {
  const pts: string[] = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (2 * Math.PI * i) / POINTS;
    const r = RAYON + AMPLITUDE * Math.cos(LOBES * a);
    pts.push(`${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")}Z`;
})();

/** Coche, centrée sur (12, 12). */
export const COCHE_D = "M8.1 12 L10.8 14.7 L15.9 9.3";
