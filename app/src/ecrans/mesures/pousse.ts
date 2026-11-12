// Pousse des graphes des pages de mesure (revue finale n° 12) : 300 ms en tout, cascade comprise, à l'ouverture seulement
// (useApparition de graphes.tsx). Sans React Native : tests/l5-sante.test.ts.

/** Durée de la pousse d'un graphe, cascade comprise (moins de 300 ms en interface). */
export const POUSSE = 300;

/**
 * Avance (0 → 1, courbe sortie approchée) de la colonne de rang `k` sur `nb` : elle part `k` écarts après la première, l'écart
 * valant min(18, 100 / nb) ms, et la dernière finit à POUSSE ; `p` est la progression linéaire commune (0 → 1 en POUSSE ms).
 */
export function avance(p: number, k: number, nb: number): number {
  "worklet";
  const ecart = Math.min(18, 100 / Math.max(1, nb));
  const duree = POUSSE - ecart * Math.max(0, nb - 1);
  const u = Math.max(0, Math.min(1, (p * POUSSE - k * ecart) / duree));
  // courbe sortie approchée (cubic-bezier(0.23, 1, 0.32, 1)) : 1 − (1 − u)^4
  return 1 - Math.pow(1 - u, 4);
}
