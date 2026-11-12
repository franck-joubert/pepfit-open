// Page d'un exercice (refonte du 26/10) : calculs sans écran. Résumé d'une séance en une ligne, seuils du défilement
// (barre, titre, courbe repliée) et tracé de la mini-courbe.
import { t } from "../i18n/index";
import { charge, serieNatureTexte, type Unite } from "./format";

interface SerieResumee {
  kg: number | null;
  reps: number | null;
  duree_s: number | null;
  distance_m: number | null;
}

/**
 * Séries d'une séance en une ligne : « 82,5 × 8, 7, 7 » tant que la charge ne change pas, « 82,5 × 8 · 80 × 7 » sinon ;
 * « PC × 12, 10 » au poids du corps sans lest. Les autres natures : textes des séries séparés par des virgules.
 */
export function resumeSeries(series: readonly SerieResumee[], champs: readonly string[], u: Unite): string {
  if (!series.length) return "";
  if (champs.includes("kg") && champs.includes("reps")) {
    const groupes: { kg: number | null; reps: number[] }[] = [];
    for (const s of series) {
      if (s.reps == null) continue;
      const kg = s.kg || null;
      const der = groupes[groupes.length - 1];
      if (der && der.kg === kg) der.reps.push(s.reps);
      else groupes.push({ kg, reps: [s.reps] });
    }
    return groupes.map((g) => `${g.kg == null ? t("exercices.vue.pc") : charge(g.kg, u)} × ${g.reps.join(", ")}`).join(", ");
  }
  if (champs.length === 1 && champs[0] === "reps") {
    const r = series.filter((s) => s.reps != null).map((s) => s.reps);
    return r.length ? t("communs.reps", { n: r.join(", ") }) : "";
  }
  return series.map((s) => serieNatureTexte(champs, s, u)).filter(Boolean).join(", ");
}

/** Bloc 3D agrandi (tap) : format portrait 4:3 sur toute la largeur, jamais plus bas que sa taille normale. */
export function hauteur3DAgrandie(largeur: number, normale: number): number {
  return Math.max(normale, Math.round((largeur * 4) / 3));
}

/** Ce que montre la barre du haut selon le défilement `y` : fond plein, titre, courbe repliée dessous. */
export function etatDefilement(
  y: number,
  bornes: { bas3d: number; basTitre: number; basCourbe: number; barre: number },
): { fond: boolean; titre: boolean; mini: boolean } {
  return {
    fond: y > bornes.bas3d - bornes.barre,
    titre: y > bornes.basTitre - bornes.barre,
    mini: bornes.basCourbe > 0 && y > bornes.basCourbe - bornes.barre,
  };
}

/** Tracé SVG de la mini-courbe (largeur l, hauteur h, 2 px de marge) ; `inverse` : plus bas = mieux, la courbe monte quand on progresse. */
export function traceMini(valeurs: readonly number[], l: number, h: number, inverse = false): string {
  if (!valeurs.length) return "";
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const m = 2;
  const x = (i: number) => (valeurs.length === 1 ? l / 2 : m + (i * (l - 2 * m)) / (valeurs.length - 1));
  const y = (v: number) => {
    const k = max === min ? 0.5 : (v - min) / (max - min);
    return m + (inverse ? k : 1 - k) * (h - 2 * m);
  };
  return valeurs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
}

/** Longueur d'une ligne brisée : le trait de la courbe se dessine de gauche à droite sur cette longueur. */
export function longueurTrace(points: readonly { x: number; y: number }[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return l;
}
