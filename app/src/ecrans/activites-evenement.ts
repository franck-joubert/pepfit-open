// Activités détectées : « la journée a changé » (associée, ignorée, rétablie, sport changé) et « Annuler » proposé par la
// ligne à l'écran qui la porte (usePlanif : une seule bulle « Annuler » à la fois, sur Sport comme sur la page du mois).

const changees = new Set<() => void>();

export function activitesChangees(): void {
  changees.forEach((f) => f());
}

export function surActivitesChangees(f: () => void): () => void {
  changees.add(f);
  return () => void changees.delete(f);
}

/** `confirmer` : écriture différée après la bulle (suppression d'une règle) ; `action` : le mot du bouton (« Rétablir ») ; `lignes` et `coche` : texte sur plusieurs lignes, coche verte d'un geste réussi (comme BandeauAnnuler). */
export type Annulable = { texte: string; annuler: () => Promise<unknown>; confirmer?: () => Promise<unknown>; action?: string; lignes?: number; coche?: boolean };
const annulables = new Set<(a: Annulable) => void>();

export function annoncerAnnulable(a: Annulable): void {
  annulables.forEach((f) => f(a));
}

export function surAnnulable(f: (a: Annulable) => void): () => void {
  annulables.add(f);
  return () => void annulables.delete(f);
}

// Récupérations et nuit de la liste du jour (onglet Effort) : une récupération supprimée, rétablie ou aux horaires modifiés,
// une nuit modifiée : la liste du jour se relit.
const recups = new Set<() => void>();

export function recupChangee(): void {
  recups.forEach((f) => f());
}

export function surRecupChangee(f: () => void): () => void {
  recups.add(f);
  return () => void recups.delete(f);
}
