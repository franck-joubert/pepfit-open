// Toucher une carte ouvre le lieu dans une appli de cartes (30/10). Sur Android, un lien geo: (édition libre, F-Droid) :
// Android laisse choisir l'appli (OsmAnd, Organic Maps, Google Maps…). Le point exact, avec le nom du lieu en étiquette
// (une recherche par nom et adresse échouerait dans une appli hors ligne). Sur iPhone, le lien https de l'API Google
// Maps : l'appli Google Maps le prend quand elle est installée, sinon le navigateur ; avec le nom et l'adresse, la fiche du
// lieu ; sinon le point exact (un nom seul, « Basic-Fit », tomberait n'importe où). Pur : tests/lien-maps.test.ts.

export interface LieuCarte {
  lat: number;
  lon: number;
  nom?: string | null;
  adresse?: string | null;
}

/** Coordonnée à 6 décimales (≈ 10 cm), sans zéros inutiles. */
const coord = (n: number) => String(Number(n.toFixed(6)));

/** Lien de carte du lieu (geo: sauf sur iPhone), ou null sans position utilisable (absente, hors bornes, ou 0,0 : la
 * valeur par défaut). */
export function lienCarte(l: LieuCarte | null | undefined, os: string): string | null {
  if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return null;
  if (Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180 || (l.lat === 0 && l.lon === 0)) return null;
  const point = `${coord(l.lat)},${coord(l.lon)}`;
  const nom = l.nom?.trim();
  if (os !== "ios") {
    // Forme de la doc Android (geo:lat,lon?q=lat,lon(étiquette)), virgule en clair ; les parenthèses fermeraient
    // l'étiquette : retirées du nom.
    const etiquette = nom?.replace(/[()]/g, "").trim();
    return `geo:${point}?q=${point}${etiquette ? `(${encodeURIComponent(etiquette)})` : ""}`;
  }
  const adresse = l.adresse?.trim();
  const query = nom && adresse ? `${nom}, ${adresse}` : point;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
