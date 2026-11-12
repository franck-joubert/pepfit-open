// Lecteur de GPX (planche Circuits, « Importer un fichier GPX »), SUR LE TÉLÉPHONE : le fichier n'est jamais envoyé au serveur
// (D4 : un GPX importé est privé pour toujours en V1). Il ne retient que latitude, longitude et altitude de chaque point, jamais
// les horodatages ni la fréquence cardiaque des extensions, et le nom pour le nom du circuit.
// Une seule passe sur le texte (indexOf, pas d'arbre XML : un fichier de 20 Mo en ferait des millions de nœuds) ; rien des
// extensions n'est lu, aucune entité déclarée n'est développée (pas de DTD). Trois refus, chacun avec ce qu'on peut faire :
// « illisible » (pas un GPX, ou coupé), « trop_lourd » (plus de 20 Mo, refusé avant de lire) et « sans_trace » (des points
// d'intérêt seulement, ou moins de deux points).
import { construireCircuit, nomDeCircuit } from "./construire";
import { GPX_OCTETS_MAX } from "./regles";
import type { ActiviteCircuit, Circuit, PointAlt } from "./types";

export type ErreurGpx = "illisible" | "trop_lourd" | "sans_trace";

export interface GpxLu {
  /** Le nom du tracé dans le fichier (trk, sinon metadata, sinon rte), sans espaces en trop ; null s'il n'en a pas. */
  nom: string | null;
  /** Le tracé entier, les segments bout à bout ; l'altitude est null quand le point n'en a pas. */
  points: PointAlt[];
  /** Points valides lus (l'aperçu dit « N points »). */
  nPoints: number;
  /** Poids du fichier, en octets (l'aperçu le dit). */
  octets: number;
  /** Au moins 80 % des points ont une altitude. */
  avecAltitudes: boolean;
}

export type ResultatGpx = { ok: true; gpx: GpxLu } | { ok: false; erreur: ErreurGpx };

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Le texte d'un élément : CDATA ouvert, les cinq entités et les références numériques ; rien d'autre n'est développé. */
function texteXml(s: string): string {
  const sansCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  return sansCdata.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/g, (m, e: string) => {
    if (e[0] !== "#") return ENTITES[e] ?? m;
    const c = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return c > 0 && c <= 0x10ffff && !(c >= 0xd800 && c <= 0xdfff) ? String.fromCodePoint(c) : m;
  });
}

function attribut(balise: string, nom: string): number {
  const m = new RegExp(`[\\s]${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(balise);
  const v = m ? (m[1] ?? m[2] ?? "") : "";
  return v.trim() === "" ? NaN : Number(v);
}

/** Le premier `<name>…</name>` entre `de` et `jusqua`, ou null. */
function premierNom(t: string, de: number, jusqua: number): string | null {
  const a = t.indexOf("<name>", de);
  if (a < 0 || a >= jusqua) return null;
  const b = t.indexOf("</name>", a);
  if (b < 0 || b >= jusqua + 400) return null;
  return nomDeCircuit(texteXml(t.slice(a + 6, b)));
}

/** Les points de `<trkpt>` (ou `<rtept>`), dans l'ordre du fichier ; null si le fichier est coupé au milieu d'un point. */
function lirePoints(t: string, balise: string): PointAlt[] | null {
  const points: PointAlt[] = [];
  const ouverture = `<${balise}`;
  const fermeture = `</${balise}>`;
  let pos = 0;
  for (;;) {
    const debut = t.indexOf(ouverture, pos);
    if (debut < 0) return points;
    const suite = t.charCodeAt(debut + ouverture.length);
    // « <trkptext » n'est pas un point : après le nom, une espace, « > » ou « / »
    if (!(suite === 32 || suite === 9 || suite === 10 || suite === 13 || suite === 62 || suite === 47)) {
      pos = debut + ouverture.length;
      continue;
    }
    const fin = t.indexOf(">", debut);
    if (fin < 0) return null;
    const tag = t.slice(debut, fin);
    const lat = attribut(tag, "lat");
    const lon = attribut(tag, "lon");
    let alt: number | null = null;
    if (t.charCodeAt(fin - 1) === 47) {
      pos = fin + 1;
    } else {
      const close = t.indexOf(fermeture, fin);
      if (close < 0) return null;
      const e = t.indexOf("<ele>", fin);
      if (e >= 0 && e < close) {
        const e2 = t.indexOf("</ele>", e);
        if (e2 > e && e2 < close) {
          const v = parseFloat(t.slice(e + 5, e2));
          if (Number.isFinite(v) && v > -500 && v < 9000) alt = v;
        }
      }
      pos = close + fermeture.length;
    }
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) points.push({ lat, lon, alt });
  }
}

/**
 * Lit un fichier GPX. `octets` : son poids sur le disque (contrôlé avant de lire : au-delà de 20 Mo, « trop_lourd »), à défaut la
 * longueur du texte. Un fichier sans altitudes est lu quand même (`avecAltitudes` faux).
 */
export function lireGpx(texte: string, octets: number = texte.length): ResultatGpx {
  if (octets > GPX_OCTETS_MAX || texte.length > GPX_OCTETS_MAX) return { ok: false, erreur: "trop_lourd" };
  const racine = texte.indexOf("<gpx");
  const finRacine = texte.lastIndexOf("</gpx>");
  if (racine < 0 || finRacine < racine) return { ok: false, erreur: "illisible" };

  const trk = lirePoints(texte, "trkpt");
  if (!trk) return { ok: false, erreur: "illisible" };
  // Pas de trace : la route (`rte`) ; les points d'intérêt (`wpt`) ne sont jamais un tracé
  const points = trk.length >= 2 ? trk : (lirePoints(texte, "rtept") ?? []);
  if (points.length < 2) return { ok: false, erreur: "sans_trace" };

  const piste = trk.length >= 2;
  const dansPiste = texte.indexOf(piste ? "<trk>" : "<rte>");
  const premierPoint = texte.indexOf(piste ? "<trkpt" : "<rtept", Math.max(dansPiste, 0));
  const meta = texte.indexOf("<metadata");
  const nom =
    (dansPiste >= 0 && premierPoint > dansPiste ? premierNom(texte, dansPiste, premierPoint) : null) ??
    (meta >= 0 ? premierNom(texte, meta, Math.max(meta, texte.indexOf("</metadata>"))) : null);

  const avecAlt = points.filter((p) => p.alt != null).length >= points.length * 0.8;
  return { ok: true, gpx: { nom, points, nPoints: points.length, octets, avecAltitudes: avecAlt } };
}

/** Le nom d'un fichier sans son dossier ni son extension (« Boucle du lac.gpx » devient « Boucle du lac »). */
export function nomDuFichier(chemin: string): string | null {
  const base = decodeURIComponent(chemin.split(/[\\/]/).pop() ?? "").replace(/\.gpx$/i, "");
  return nomDeCircuit(base);
}

/**
 * Le circuit d'un fichier lu : privé, `source` « gpx », sans lieu de départ ni commune. Le nom est celui du tracé, sinon celui du
 * fichier, sinon « Circuit » (modifiable à l'aperçu). Null : le tracé n'a pas deux points valides (jamais après `lireGpx`).
 */
export function circuitDepuisGpx(gpx: GpxLu, opts: { nomFichier?: string | null; activites?: readonly ActiviteCircuit[]; id?: string; maintenant?: number } = {}): Circuit | null {
  return construireCircuit({
    nom: gpx.nom ?? nomDuFichier(opts.nomFichier ?? "") ?? "Circuit",
    points: gpx.points,
    activites: opts.activites ?? ["randonnee"],
    source: "gpx",
    id: opts.id,
    maintenant: opts.maintenant,
  });
}
