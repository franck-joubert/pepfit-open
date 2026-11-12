// Taille des cases de la feuille de confirmation du rattachement (FeuilleLien) : aussi grandes que la feuille le permet, sans
// jamais cacher les boutons. Pur (sans React Native) pour être testé.

/** Côté maximal d'une case (Fold déplié, tablette : la feuille garde la colonne de contenu) et minimal (feuille très haute en lignes). */
export const PLAFOND = 280;
export const MINI = 120;

// Mesures de la feuille ouverte (recette du 09/11, émulateur 856 et 1500 dp de large) : la feuille s'arrête à 78 % de la hauteur de
// la fenêtre (86 % de la zone sous la barre d'état), puis défile ; hors cases et lignes, il reste le titre, le sous-titre, la
// légende du muscle et la marge du bas ; une ligne de bouton fait 56 dp.
const PART_FEUILLE = 0.78;
const RESERVE = 174;
const LIGNE = 56;

/**
 * Côté d'une case. `utile` : largeur disponible dans la feuille ; `hauteur` : hauteur de la fenêtre ; `lignes` : nombre de boutons
 * sous l'aperçu ; `ecart` : espace entre les deux cases. Sur téléphone la largeur décide ; au Fold déplié (feuille peu large en
 * hauteur) c'est la hauteur, pour que « Annuler » reste visible sans défiler.
 */
export function coteDesCases(utile: number, hauteur: number, lignes: number, avec3D: boolean, ecart: number): number {
  const largeur = avec3D ? (utile - ecart) / 2 : utile * 0.7;
  const place = hauteur * PART_FEUILLE - RESERVE - LIGNE * lignes;
  return Math.floor(Math.max(MINI, Math.min(PLAFOND, largeur, place)));
}
