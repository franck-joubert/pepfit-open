// Où la bulle « séance en cours » s'affiche, sans React Native (testée dans tests/bulle-seance.test.ts).

/**
 * Écrans qui montrent la bulle : chemins d'expo-router, « * » = un segment. Sport, Moi (« / » redirige vers le premier onglet), les routines, la
 * vue d'une routine et les programmes (revue finale du 30/10, n° 9, D7). Chaque écran ajouté lui garde sa place : la fin de
 * sa liste et ses boutons du bas passent au-dessus (`useBulle().hauteur`, `reserverBas`). Restent à ajouter quand leur bas
 * est prêt : "/food" (« Ajouter un aliment » est à la place de la bulle), "/boutique", "/boutique/*" et "/plan/*" (boutons
 * fixes en bas).
 */
export const BULLE_SUR: readonly string[] = ["/train", "/health", "/routines", "/routine/view/*", "/programmes"];

export function bulleSur(chemin: string, liste: readonly string[] = BULLE_SUR): boolean {
  const segments = chemin.split("/");
  return liste.some((motif) => {
    const m = motif.split("/");
    return m.length === segments.length && m.every((s, i) => s === "*" || s === segments[i]);
  });
}

/**
 * Séance lue pour la bulle, sauf si elle vient d'être abandonnée : une relecture partie avant la suppression (changement
 * d'écran, événement) la rendait encore, la bulle revenait, et il fallait abandonner deux fois.
 */
export function sansAbandonnees<T extends { id: string }>(lu: T | null, abandonnees: ReadonlySet<string>): T | null {
  return lu && abandonnees.has(lu.id) ? null : lu;
}
