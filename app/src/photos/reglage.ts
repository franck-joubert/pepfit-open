// Réglages de la photo de séance (NOTES § 4) : WebP réencodé, ce qui retire les EXIF (dont la position GPS).

export const PHOTO = { cote: 1600, qualite: 0.72 } as const;
export const VIGNETTE = { cote: 320, qualite: 0.6 } as const;
export const DOSSIER_PHOTOS = "photos";

/** Taille cible : le grand côté ramené à `cote` au plus, jamais agrandi, proportions gardées. */
export function dimensionsCible(largeur: number, hauteur: number, cote: number): { width: number; height: number } {
  const grand = Math.max(largeur, hauteur);
  if (grand <= cote || grand <= 0) return { width: Math.max(1, Math.round(largeur)), height: Math.max(1, Math.round(hauteur)) };
  const k = cote / grand;
  return { width: Math.max(1, Math.round(largeur * k)), height: Math.max(1, Math.round(hauteur * k)) };
}

/** Chemins relatifs au dossier des documents (le chemin absolu peut changer d'une installation à l'autre). */
export function cheminsPhoto(id: string): { photo: string; vignette: string } {
  return { photo: `${DOSSIER_PHOTOS}/${id}.webp`, vignette: `${DOSSIER_PHOTOS}/${id}-v.webp` };
}
