// La photo d'une séance a changé (ajoutée, remplacée, supprimée) : les écrans qui la gardaient en mémoire (le Fil de l'Accueil,
// « Mes séances ») la relisent, au lieu de montrer l'ancienne jusqu'au prochain démarrage. Sans React ni Expo, pour les tests.

type Ecoute = (seanceId: string) => void;

const ecoutes = new Set<Ecoute>();

/** Écoute les changements ; rend la fonction qui arrête d'écouter. */
export function surChangementPhoto(f: Ecoute): () => void {
  ecoutes.add(f);
  return () => {
    ecoutes.delete(f);
  };
}

export function signalerChangementPhoto(seanceId: string): void {
  for (const f of [...ecoutes]) f(seanceId);
}
