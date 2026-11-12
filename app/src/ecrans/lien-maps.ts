// Toucher une carte ouvre le lieu dans Google Maps (30/10 : « même si tu utilises OpenStreetMap »). Le lien https
// de l'API Maps : l'appli Google Maps le prend quand elle est installée, sinon le navigateur. Avec le nom et l'adresse, la
// fiche du lieu ; sinon le point exact (un nom seul, « Basic-Fit », tomberait n'importe où). Pur : tests/lien-maps.test.ts.

export interface LieuCarte {
  lat: number;
  lon: number;
  nom?: string | null;
  adresse?: string | null;
}

/** Coordonnée à 6 décimales (≈ 10 cm), sans zéros inutiles. */
const coord = (n: number) => String(Number(n.toFixed(6)));

/** Lien Google Maps du lieu, ou null sans position utilisable (absente, hors bornes, ou 0,0 : la valeur par défaut). */
export function lienGoogleMaps(l: LieuCarte | null | undefined): string | null {
  if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return null;
  if (Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180 || (l.lat === 0 && l.lon === 0)) return null;
  const nom = l.nom?.trim();
  const adresse = l.adresse?.trim();
  const query = nom && adresse ? `${nom}, ${adresse}` : `${coord(l.lat)},${coord(l.lon)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
