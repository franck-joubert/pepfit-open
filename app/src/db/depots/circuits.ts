import type { LieuPersonnel } from "../../circuits/domicile";
import { sourceRefSortie } from "../../circuits/id";
import { decoderTrace } from "../../circuits/polyline";
import { ACTIVITES_CIRCUIT, TYPES_CIRCUIT, type ActiviteCircuit, type Circuit } from "../../circuits/types";
import type { Executeur } from "../executeur";

// Circuits à soi (migration 187, planche Circuits) : un GPX importé, une sortie gardée, un circuit publié. La table est synchronisée
// chiffrée (sync/schema.ts) ; les circuits PUBLICS vus des autres ne sont pas ici (cache du lot C).

interface Ligne {
  id: string;
  nom: string;
  type: string;
  activites: string;
  depart_lieu: string | null;
  depart_nom: string | null;
  commune: string | null;
  zone: string;
  trace: string;
  profil: string | null;
  bbox: string;
  distance_m: number;
  denivele_plus_m: number | null;
  denivele_moins_m: number | null;
  alt_min_m: number | null;
  alt_max_m: number | null;
  alt_source: string | null;
  source: string;
  source_ref: string | null;
  licence: string;
  source_maj: string | null;
  visibilite: string;
  publie_le: number | null;
  cree_le: number;
  maj_le: number;
}

const COLONNES =
  "id, nom, type, activites, depart_lieu, depart_nom, commune, zone, trace, profil, bbox, distance_m, denivele_plus_m, denivele_moins_m, alt_min_m, alt_max_m, alt_source, source, source_ref, licence, source_maj, visibilite, publie_le, cree_le, maj_le";

const activitesDe = (json: string): ActiviteCircuit[] => {
  try {
    const l = JSON.parse(json) as unknown;
    return Array.isArray(l) ? l.filter((a): a is ActiviteCircuit => (ACTIVITES_CIRCUIT as readonly string[]).includes(a)) : [];
  } catch {
    return [];
  }
};

const bboxDe = (json: string): Circuit["bbox"] => {
  try {
    const b = JSON.parse(json) as unknown;
    if (Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === "number" && Number.isFinite(x))) return b as Circuit["bbox"];
  } catch {
    // ligne reçue illisible : la boîte vide ci-dessous
  }
  return [0, 0, 0, 0];
};

function circuitDe(l: Ligne): Circuit {
  return {
    id: l.id,
    nom: l.nom,
    type: (TYPES_CIRCUIT as readonly string[]).includes(l.type) ? (l.type as Circuit["type"]) : "lineaire",
    activites: activitesDe(l.activites),
    departLieu: l.depart_lieu,
    departNom: l.depart_nom,
    commune: l.commune,
    zone: l.zone,
    trace: l.trace,
    profil: l.profil,
    bbox: bboxDe(l.bbox),
    distanceM: l.distance_m,
    denivelePlusM: l.denivele_plus_m,
    deniveleMoinsM: l.denivele_moins_m,
    altMinM: l.alt_min_m,
    altMaxM: l.alt_max_m,
    altSource: l.alt_source === "ign" || l.alt_source === "trace" ? l.alt_source : null,
    source: l.source as Circuit["source"],
    sourceRef: l.source_ref,
    licence: l.licence as Circuit["licence"],
    sourceMaj: l.source_maj,
    visibilite: l.visibilite === "public" ? "public" : "prive",
    publieLe: l.publie_le,
    creeLe: l.cree_le,
    majLe: l.maj_le,
  };
}

/** Écrit un circuit (neuf, ou remplacé s'il porte déjà cet identifiant). */
export async function ecrireCircuit(db: Executeur, c: Circuit): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO circuit (${COLONNES}) VALUES (${COLONNES.split(",").map(() => "?").join(",")})`,
    [
      c.id, c.nom, c.type, JSON.stringify(c.activites), c.departLieu, c.departNom, c.commune, c.zone, c.trace, c.profil, JSON.stringify(c.bbox),
      c.distanceM, c.denivelePlusM, c.deniveleMoinsM, c.altMinM, c.altMaxM, c.altSource, c.source, c.sourceRef, c.licence, c.sourceMaj,
      c.visibilite, c.publieLe, c.creeLe, c.majLe,
    ],
  );
}

export async function lireCircuit(db: Executeur, id: string): Promise<Circuit | null> {
  const l = await db.getFirstAsync<Ligne>(`SELECT ${COLONNES} FROM circuit WHERE id = ?`, [id]);
  return l ? circuitDe(l) : null;
}

/** Les circuits à soi, du plus récent au plus ancien. */
export async function listerCircuits(db: Executeur): Promise<Circuit[]> {
  return (await db.getAllAsync<Ligne>(`SELECT ${COLONNES} FROM circuit ORDER BY cree_le DESC, id`, [])).map(circuitDe);
}

/** Le circuit déjà fait d'une sortie (un circuit par sortie : le menu dit « Déjà un circuit ») ; null s'il n'y en a pas. */
export async function circuitDeSortie(db: Executeur, seanceId: string): Promise<Circuit | null> {
  const l = await db.getFirstAsync<Ligne>(`SELECT ${COLONNES} FROM circuit WHERE source = 'sortie' AND source_ref = ? ORDER BY cree_le DESC LIMIT 1`, [sourceRefSortie(seanceId)]);
  return l ? circuitDe(l) : null;
}

export async function nombreDeCircuits(db: Executeur): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM circuit", []))?.n ?? 0;
}

/** Renomme un circuit et change ses activités (l'aperçu et le menu ⋯ de la page). */
export async function modifierCircuit(db: Executeur, id: string, m: { nom: string; activites: readonly ActiviteCircuit[] }, maintenant: number = Date.now()): Promise<void> {
  await db.runAsync("UPDATE circuit SET nom = ?, activites = ?, maj_le = ? WHERE id = ?", [m.nom, JSON.stringify(m.activites), maintenant, id]);
}

/** Note la publication (« Tout le monde ») ou son retrait (« Toi seul ») d'un circuit à soi. */
export async function noterVisibilite(db: Executeur, id: string, visibilite: Circuit["visibilite"], maintenant: number = Date.now()): Promise<void> {
  await db.runAsync("UPDATE circuit SET visibilite = ?, publie_le = ?, maj_le = ? WHERE id = ?", [visibilite, visibilite === "public" ? maintenant : null, maintenant, id]);
}

export async function supprimerCircuit(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM circuit WHERE id = ?", [id]);
}

/** Remet un circuit supprimé tel qu'il était (« Annuler »). */
export const restaurerCircuit = ecrireCircuit;

/**
 * Le domicile et les lieux perso : ce qu'un circuit public ne doit pas croiser (D5). Une salle perso est sans fiche publique
 * (`source_id` vide) ; le domicile est une salle de type `domicile`. Les lieux sans position (0, 0 compris) ne comptent pas.
 */
export async function lieuxPersonnels(db: Executeur): Promise<LieuPersonnel[]> {
  return db.getAllAsync<LieuPersonnel>(
    "SELECT id, lat, lon FROM salle WHERE (source_id IS NULL OR source_id = '' OR type = 'domicile') AND lat IS NOT NULL AND lon IS NOT NULL AND NOT (lat = 0 AND lon = 0)",
    [],
  );
}

/** Le tracé d'un circuit en points (null si la polyline est illisible : une ligne reçue abîmée). */
export const pointsDuCircuit = (c: Pick<Circuit, "trace">) => decoderTrace(c.trace);
