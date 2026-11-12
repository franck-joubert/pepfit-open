// Réveil d'un onglet au geste (docs/CODE-FLUIDITE-ONGLETS.md). Un onglet caché est gelé (app/(tabs)/_layout) ; il se dégelait sur
// l'événement de focus du navigateur, une mise à jour après celle qui affiche sa scène : entre les deux, l'ancien écran avait
// disparu et le nouveau était encore gelé, donc un écran vide le temps que le fil JS rende la partie (160 à 260 ms à l'émulateur).
// Le menu réveille la partie visée dans la même mise à jour que la navigation : l'ancien écran reste jusqu'à ce que le nouveau
// soit prêt, et les deux changent dans la même image.
const ecouteurs = new Map<string, Set<() => void>>();

/** L'onglet `route` (nom de la route : health, train, food) écoute les réveils ; renvoie le désabonnement. */
export function abonnerEveil(route: string, f: () => void): () => void {
  const s = ecouteurs.get(route) ?? new Set<() => void>();
  s.add(f);
  ecouteurs.set(route, s);
  return () => void s.delete(f);
}

/** Réveille l'onglet visé par un chemin du menu (« /health ») : à appeler juste avant la navigation, dans le même geste. */
export function eveillerOnglet(chemin: string): void {
  for (const f of ecouteurs.get(chemin.replace(/^\//, "")) ?? []) f();
}
