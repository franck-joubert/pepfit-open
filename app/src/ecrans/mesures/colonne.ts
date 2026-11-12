// Piste des graphiques de mesure (planche pas, NOTES § 2 « touch-target-chart ») : colonnes jointives pleine hauteur, un
// toucher prend toujours la plus proche ; réglages du glissé entre périodes. Pur : tests/mesures-periodes.test.ts.

export const GESTE_PISTE = { appuiLongMs: 300, seuilGlisse: 56, resistance: 0.25, sortieMs: 180, arriveeMs: 260, retourMs: 200, recul: 0.6 } as const;

/** Colonne visée par un doigt à `x` sur une piste de `largeur` partagée en `nb` colonnes jointives. */
export function colonne(x: number, largeur: number, nb: number): number {
  if (nb <= 0 || largeur <= 0) return 0;
  return Math.max(0, Math.min(nb - 1, Math.floor((x / largeur) * nb)));
}
