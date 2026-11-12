// Battement de la FC de repos dans la signature de l'Âge pepfit : double impulsion « toc-toc » sur une phase (en
// battements). Étroit dans la grande signature ; large dans l'âme de la poitrine, dessinée à 15-30 i/s avec le personnage
// (un battement étroit y tomberait entre deux images). Pendant le vol, la signature passe de l'un à l'autre. Worklets.

/** Battement de la grande signature (page Âge). */
export function battementEtroit(ph: number): number {
  "worklet";
  const f = ph - Math.floor(ph);
  return Math.exp(-(((f - 0.04) / 0.05) ** 2)) + 0.55 * Math.exp(-(((f - 0.24) / 0.06) ** 2));
}

/** Battement de l'âme (poitrine du personnage de Santé) : se lit encore à 15 i/s. */
export function battementLarge(ph: number): number {
  "worklet";
  const f = ph - Math.floor(ph);
  return Math.exp(-(((f - 0.05) / 0.08) ** 2)) + 0.55 * Math.exp(-(((f - 0.28) / 0.09) ** 2));
}
