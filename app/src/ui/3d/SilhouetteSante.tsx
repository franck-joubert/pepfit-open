// Silhouette du personnage de Santé pendant le chargement du corps 3D (30/10 : « une silhouette ou un halo très léger,
// sans GL ni calcul lourd, pas de spinner ») : un chemin SVG fixe (scripts/generer-silhouette.ts), à la place exacte du corps,
// teinté comme son verre (rose en haut, violet en bas) et presque transparent. CorpsSante l'efface en fondu quand le corps paraît.
import { useMemo } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { ModeCouleur } from "../../theme/jetons";
import { SILHOUETTE } from "./silhouette";
import { COULEURS_VERRE, HAUTEUR_CORPS, SCENE_H, tailleCadre, yCorps } from "./verre";

/** Opacité de la silhouette : à peine plus qu'une ombre (le verre du corps est à 0,46 au moins). */
export const OPACITE_SILHOUETTE: Record<ModeCouleur, number> = { nuit: 0.16, jour: 0.12 };

const points = (d: string) => d.slice(1, -1).split("L").map((p) => p.split(" ").map(Number) as [number, number]);
const CHEMINS = { homme: points(SILHOUETTE.homme), femme: points(SILHOUETTE.femme) };

/** Chemin de la silhouette en dp, dans une zone de `largeur` dp : centrée, pieds et tête comme ceux du corps 3D. */
export function cheminSilhouette(femme: boolean, tailleCm: number, largeur: number): string {
  const k = ((tailleCadre(tailleCm) / 100) * HAUTEUR_CORPS) / SCENE_H; // dp par part de la taille
  const pied = yCorps(0, tailleCm);
  return "M" + CHEMINS[femme ? "femme" : "homme"].map(([u, v]) => `${(largeur / 2 + u * k).toFixed(1)} ${(pied - v * k).toFixed(1)}`).join("L") + "Z";
}

const rvb = (c: readonly [number, number, number]) => `rgb(${c.map((x) => Math.round(x * 255)).join(",")})`;

export function SilhouetteSante({ femme, tailleCm, largeur, mode }: { femme: boolean; tailleCm: number; largeur: number; mode: ModeCouleur }) {
  const d = useMemo(() => cheminSilhouette(femme, tailleCm, largeur), [femme, tailleCm, largeur]);
  const v = COULEURS_VERRE[mode];
  return (
    <Svg width={largeur} height={HAUTEUR_CORPS} pointerEvents="none">
      <Defs>
        <LinearGradient id="silhouette" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={rvb(v.top)} />
          <Stop offset="1" stopColor={rvb(v.bot)} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#silhouette)" fillOpacity={OPACITE_SILHOUETTE[mode]} />
    </Svg>
  );
}
