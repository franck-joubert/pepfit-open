// Calculs purs du glisser-déposer du journal (testés sous Node).

/** Rang d'insertion dans un repas : nombre d'aliments (hors celui qu'on tient) dont le centre est au-dessus du centre de l'aliment tenu. */
export function rangDeDepot(centreTenu: number, centresDesAutres: readonly number[]): number {
  return centresDesAutres.filter((c) => c < centreTenu).length;
}

/** Nouvel ordre des ids d'un repas : l'aliment `id` retiré de `ids`, puis posé au rang `rang`. */
export function placerAliment(ids: readonly string[], id: string, rang: number): string[] {
  const sans = ids.filter((x) => x !== id);
  sans.splice(Math.max(0, Math.min(sans.length, rang)), 0, id);
  return sans;
}
