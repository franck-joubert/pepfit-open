// « La séance en cours a changé » (démarrée, abandonnée) : la couche de la bulle relit alors la base.

const ecouteurs = new Set<() => void>();

export function seanceChangee(): void {
  ecouteurs.forEach((f) => f());
}

export function surSeanceChangee(f: () => void): () => void {
  ecouteurs.add(f);
  return () => void ecouteurs.delete(f);
}
