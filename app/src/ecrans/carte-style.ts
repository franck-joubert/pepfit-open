// Fond de carte de la course guidée (planche seance-duree § 3, D2) : style Positron d'OpenFreeMap (tuiles gratuites, sans clé
// ni cookie) recoloré aux jetons de pepfit, nuit et jour, comme le rendu de la planche (outils/carte.html). Les libellés
// de pays, de villes et de cours d'eau sont retirés : ils passaient sous le tracé. Pur : testé par tests/carte-style.test.ts.
import type { ModeCouleur } from "../theme/jetons";

export const STYLE_OPENFREEMAP = "https://tiles.openfreemap.org/styles/positron";

/** Attribution obligatoire des tuiles (affichée en bas de la carte). */
export const ATTRIBUTION_CARTE = "© OpenFreeMap © OpenMapTiles © OpenStreetMap";

export interface PaletteCarte {
  sol: string;
  bati: string;
  route: string;
  maj: string;
  bord: string;
  chemin: string;
  eau: string;
  parc: string;
  rail: string;
  lib: string;
  halo: string;
  libEau: string;
}

export const PALETTES_CARTE: Record<ModeCouleur, PaletteCarte> = {
  nuit: { sol: "#121110", bati: "#1d1b19", route: "#2b2825", maj: "#38342f", bord: "#171513", chemin: "#24211e", eau: "#0b1a24", parc: "#0f1d16", rail: "#2a2724", lib: "rgba(255,255,255,0.56)", halo: "#121110", libEau: "#7aa6c8" },
  jour: { sol: "#f1f2f4", bati: "#e1e4e8", route: "#ffffff", maj: "#ffffff", bord: "#d3d8de", chemin: "#e8ebee", eau: "#c3d8ea", parc: "#d3e8d5", rail: "#d9dde2", lib: "#59626e", halo: "#f1f2f4", libEau: "#3c6c97" },
};

/** Couche de style, réduite à ce que la recoloration touche. */
interface CoucheStyle {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [cle: string]: unknown;
}

export interface StyleCarte {
  layers: CoucheStyle[];
  [cle: string]: unknown;
}

const CACHER = /^(landuse_residential|landcover_ice_shelf|landcover_glacier|aeroway|boundary|highway-shield|road_shield|airport|label_country|label_state|label_city|label_town|label_village|label_other|water_name_point_label|water_name_line_label|waterway_line_label|tunnel_|railway_service|railway_transit_dashline|railway_dashline)/;

/** Copie du style aux couleurs de la palette (le style reçu n'est pas modifié). */
export function recolorer<S extends StyleCarte>(style: S, p: PaletteCarte): S {
  const layers = style.layers.map((couche) => {
    const l: CoucheStyle = { ...couche, paint: { ...couche.paint }, layout: { ...couche.layout } };
    const c = l.paint!;
    if (CACHER.test(l.id)) l.layout!.visibility = "none";
    // Libellés d'abord : les noms de rues (« highway_name_… ») ne doivent pas recevoir une couleur de trait.
    else if (l.type === "symbol") Object.assign(c, { "text-color": /water/.test(l.id) ? p.libEau : p.lib, "text-halo-color": p.halo, "text-halo-width": 1.2 });
    else if (l.id === "background") c["background-color"] = p.sol;
    else if (l.id === "park" || l.id === "landcover_wood") Object.assign(c, { "fill-color": p.parc, "fill-opacity": 1 });
    else if (l.id === "water") c["fill-color"] = p.eau;
    else if (l.id === "waterway") c["line-color"] = p.eau;
    else if (l.id === "building") Object.assign(c, { "fill-color": p.bati, "fill-outline-color": p.bati, "fill-opacity": 1 });
    else if (/^road_(area_)?pier/.test(l.id)) c[l.type === "fill" ? "fill-color" : "line-color"] = p.route;
    else if (l.id === "highway_path") c["line-color"] = p.chemin;
    else if (l.id === "highway_minor") c["line-color"] = p.route;
    else if (/casing/.test(l.id)) c["line-color"] = p.bord;
    else if (/^highway_/.test(l.id)) c["line-color"] = p.maj;
    else if (/^railway/.test(l.id)) c["line-color"] = p.rail;
    return l;
  });
  return { ...style, layers };
}

/** Première couche de libellés : le tracé se pose dessous, les noms de rues restent lisibles. */
export const premiereCoucheLibelles = (style: StyleCarte): string | undefined => style.layers.find((l) => l.type === "symbol" && l.layout?.visibility !== "none")?.id;

const R_TERRE = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance (m) entre deux points. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const x = rad(b.lon - a.lon) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.hypot(x, y) * R_TERRE;
}

/**
 * Cône de direction (±25°, 34 m) devant la position, dans le sens de la course : le cap se lit entre la position et le
 * dernier point à au moins 8 m (sur les 15 derniers) ; null à l'arrêt.
 */
export function coneDirection(points: readonly { lat: number; lon: number }[]): [number, number][] | null {
  const pos = points.at(-1);
  if (!pos) return null;
  const avant = points.slice(-15, -1).reverse().find((q) => distanceM(q, pos) >= 8);
  if (!avant) return null;
  const cap = Math.atan2(rad(pos.lat - avant.lat), rad(pos.lon - avant.lon) * Math.cos(rad(pos.lat)));
  const m = 34 / R_TERRE;
  const cone: [number, number][] = [[pos.lon, pos.lat]];
  for (let a = cap - 0.44; a <= cap + 0.44 + 1e-9; a += 0.11)
    cone.push([pos.lon + ((m * Math.cos(a)) / Math.cos(rad(pos.lat))) * (180 / Math.PI), pos.lat + m * Math.sin(a) * (180 / Math.PI)]);
  cone.push([pos.lon, pos.lat]);
  return cone;
}
