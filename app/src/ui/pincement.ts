// Pincement à deux doigts sur une photo en grand (retour du 29/10) : calcul seul, sans React Native (testé dans
// tests/pincement.test.ts). La photo grossit autour du point pris entre les deux doigts, ce point suit leur milieu ; au
// relâcher elle reprend sa taille (PhotoZoom.tsx).

export type Pt = { x: number; y: number };

/** Pas au-delà de 4 fois : la photo de séance est compressée, plus gros elle se pixelise. */
export const ZOOM_MAX = 4;

const ecart = ([a, b]: readonly [Pt, Pt]) => Math.hypot(b.x - a.x, b.y - a.y);
const milieu = ([a, b]: readonly [Pt, Pt]): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Échelle et décalage (transformée translate puis scale, origine au centre de la vue) pour que le point de la photo pris
 * entre les doigts au départ reste entre eux ; doigts qui se rapprochent : pas sous la taille d'origine.
 */
export function pincement(debut: readonly [Pt, Pt], maintenant: readonly [Pt, Pt], centre: Pt): { echelle: number; x: number; y: number } {
  const d0 = ecart(debut);
  const echelle = Math.min(ZOOM_MAX, Math.max(1, d0 > 0 ? ecart(maintenant) / d0 : 1));
  const m0 = milieu(debut);
  const m = milieu(maintenant);
  return { echelle, x: m.x - centre.x - echelle * (m0.x - centre.x), y: m.y - centre.y - echelle * (m0.y - centre.y) };
}
