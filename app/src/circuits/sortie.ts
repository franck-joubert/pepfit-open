// « Faire de cette sortie un circuit » (planche Circuits, c2 et c3) : ce que l'aperçu calcule. Pur (sans React ni réseau).
// Le tracé est coupé À LA CRÉATION (coupe.ts : 400 à 800 m au début et à la fin, tirés de la graine et de l'identifiant de la
// séance) : le circuit gardé ne contient jamais le début ni la fin de la sortie ; ses chiffres (14,1 km au lieu de 15,4) sont ceux
// du tracé gardé. Un circuit par sortie : `sourceRef` = « sortie/<séance> ».
import type { SuiviEnregistre } from "../db/depots/suivi-gps";
import { altitudesRecalees } from "../ecrans/suivi-direct-vue";
import { lisserAltitude } from "../natif/suivi/logique";
import { couper, longueurM, longueursCoupees, simplifier } from "./coupe";
import { construireCircuit } from "./construire";
import { haversineM } from "./geo";
import { sourceRefSortie } from "./id";
import { POINTS_MAX, TOLERANCE_M } from "./regles";
import { typeDuTrace } from "./type";
import type { ActiviteCircuit, Circuit, Point, PointAlt, TypeCircuit } from "./types";

/** Le lieu de départ proposé est le lieu public le plus proche du début du tracé gardé, à 300 m au plus : au-delà, rien n'est proposé. */
export const DEPART_MAX_M = 300;
/** Les lieux que la feuille « Départ » propose à la place : ceux qui sont à 2 km au plus du début du tracé gardé. */
export const DEPART_CHOIX_KM = 2;

/** Les points de la sortie avec leur altitude (celle que la page de la sortie montre : baromètre recalé sur le GPS, lissée) ; les positions illisibles sont écartées. */
export function pointsDeSortie(s: Pick<SuiviEnregistre, "points" | "barometre">): PointAlt[] {
  const alt = lisserAltitude(altitudesRecalees(s.points), s.barometre);
  const sortie: PointAlt[] = [];
  s.points.forEach((p, i) => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) sortie.push({ lat: p.lat, lon: p.lon, alt: alt[i] ?? null });
  });
  return sortie;
}

export interface ApercuSortie {
  /** La sortie entière : elle se dessine en pointillé sous le tracé gardé. */
  entiere: PointAlt[];
  /** Ce qui part : sans le début ni la fin ; null quand la sortie est trop courte pour être coupée (il ne reste pas 200 m). */
  gardee: PointAlt[] | null;
  /** Ce qui ne part jamais : le début et la fin coupés (pour les dessiner en pointillé). */
  debut: Point[];
  fin: Point[];
  /** Mètres coupés au début et à la fin. */
  coupeM: [number, number];
  /** Le type déduit de la sortie ENTIÈRE : sans son début ni sa fin, une boucle ne se referme plus (400 à 800 m de chaque côté), et le tracé gardé seul dirait « linéaire ». */
  type: TypeCircuit;
}

/** Une altitude aux deux bouts coupés (points interpolés par `couper`, qui n'en portent pas) : celle du point de la sortie le plus proche. */
function avecAltitudes(coupes: readonly Point[], origine: readonly PointAlt[]): PointAlt[] {
  const plusProche = (p: Point): number | null => {
    let m = Infinity;
    let alt: number | null = null;
    for (const o of origine) {
      const d = (o.lat - p.lat) ** 2 + (o.lon - p.lon) ** 2;
      if (d < m) (m = d), (alt = o.alt);
    }
    return alt;
  };
  return coupes.map((p) => ("alt" in p ? (p as PointAlt) : { lat: p.lat, lon: p.lon, alt: plusProche(p) }));
}

/** La sortie coupée comme le profil public la coupe ; `graine` est celle du compte (`choix(db).graine`) et ne quitte pas le téléphone. */
export function apercuSortie(points: readonly PointAlt[], graine: string, seanceId: string): ApercuSortie {
  const [d, f] = longueursCoupees(graine, seanceId);
  const coupes = points.length >= 2 ? couper(points, d, f) : null;
  const total = longueurM(points);
  return {
    entiere: [...points],
    gardee: coupes ? avecAltitudes(coupes, points) : null,
    // Le début jusqu'à `d`, la fin depuis `total - f` : la même coupe, vue de l'autre côté (nulle si la sortie est trop courte).
    debut: coupes ? (couper(points, 0, total - d) ?? []) : [],
    fin: coupes ? (couper(points, total - f, 0) ?? []) : [],
    coupeM: [d, f],
    type: typeDuTrace(simplifier(points, POINTS_MAX, TOLERANCE_M)),
  };
}

/** Le sport de la sortie dit l'activité du circuit (D8 : le trail est de la course) ; un sport inconnu : la randonnée. */
export function activitesDeSport(slug: string | null | undefined): ActiviteCircuit[] {
  const s = (slug ?? "").toLowerCase();
  if (s === "course" || s.startsWith("trail") || s.startsWith("running") || s.startsWith("jogging") || s === "athletisme") return ["course"];
  if (s === "vtt") return ["vtt"];
  if (s === "bicycling" || s.startsWith("cycling")) return ["bicycling"];
  return ["randonnee"];
}

/** Les catégories de lieux d'où un circuit peut partir. */
export type CleCategorie = "courir" | "randonnee" | "velo";

/** La catégorie du lieu de départ, d'après l'activité du circuit. */
export function categorieDuDepart(a: ActiviteCircuit | undefined): CleCategorie {
  return a === "course" ? "courir" : a === "bicycling" || a === "vtt" ? "velo" : "randonnee";
}

/** Un lieu public qui peut servir de départ : jamais un lieu perso ni un domicile (D13). */
export interface DepartPossible {
  cle: string;
  nom: string;
  ville: string;
  lat: number;
  lon: number;
}

/** Le lieu public le plus proche de `debut`, à `seuilM` au plus ; null sinon (jamais un lieu inventé). */
export function departLePlusProche<L extends DepartPossible>(debut: Point, lieux: readonly L[], seuilM: number = DEPART_MAX_M): L | null {
  let meilleur: L | null = null;
  let proche = Infinity;
  for (const l of lieux) {
    const m = haversineM(debut, l);
    if (m <= seuilM && m < proche) {
      meilleur = l;
      proche = m;
    }
  }
  return meilleur;
}

export interface EntreeSortie {
  seanceId: string;
  nom: string;
  /** `ApercuSortie.gardee`. */
  gardee: readonly PointAlt[];
  activites: readonly ActiviteCircuit[];
  /** `ApercuSortie.type`, ou celui que la personne a choisi ; sinon, déduit du tracé gardé. */
  type?: TypeCircuit;
  depart?: DepartPossible | null;
  id?: string;
  maintenant?: number;
}

/** Le circuit d'une sortie, privé : ses chiffres sont ceux du tracé gardé (une seule source pour l'aperçu, « Mes circuits » et la publication). */
export function circuitDepuisSortie(e: EntreeSortie): Circuit | null {
  return construireCircuit({
    nom: e.nom,
    points: e.gardee,
    activites: e.activites,
    source: "sortie",
    sourceRef: sourceRefSortie(e.seanceId),
    type: e.type,
    departLieu: e.depart?.cle ?? null,
    departNom: e.depart?.nom ?? null,
    commune: e.depart?.ville || null,
    id: e.id,
    maintenant: e.maintenant,
  });
}
