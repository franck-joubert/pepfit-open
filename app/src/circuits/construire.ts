// Un circuit prêt à garder : le tracé simplifié (400 points au plus, 3 m), codé en polyline, avec ses chiffres. Le même calcul
// que le serveur (serveur/pb_hooks/circuits.js, construire) : la distance est celle du tracé GARDÉ, le type est déduit de ce
// tracé. Le dénivelé d'une sortie ou d'un GPX est calculé sur les altitudes du fichier, au seuil de 3 m (`denivele()` du
// suivi) ; celui d'un circuit public vient des altitudes de l'IGN, lues par le serveur (D6).
import { denivele } from "../natif/suivi/logique";
import { simplifier } from "./coupe";
import { arrondiCodage, bbox, longueurM, zoneDe } from "./geo";
import { idCircuit } from "./id";
import { encoderAltitudes, encoderTrace } from "./polyline";
import { ALTITUDES_MIN, NOM_MAX, POINTS_MAX, SEUIL_DENIVELE_M, TOLERANCE_M } from "./regles";
import { typeDuTrace } from "./type";
import type { ActiviteCircuit, Circuit, PointAlt, SourceCircuit, TypeCircuit } from "./types";

/**
 * Altitudes sans trou : une valeur absente est comblée par ses voisines ; null si plus de 20 % manquent (le circuit n'a alors pas
 * d'altitudes : « Dénivelé indisponible », jamais un chiffre inventé).
 */
export function completerAltitudes(lues: readonly (number | null)[]): number[] | null {
  const bonnes = lues.map((v) => (typeof v === "number" && Number.isFinite(v) && v > -500 && v < 9000 ? v : null));
  const manquantes = bonnes.filter((v) => v == null).length;
  if (!bonnes.length || manquantes === bonnes.length || manquantes > bonnes.length * (1 - ALTITUDES_MIN)) return null;
  const r: number[] = [];
  for (let i = 0; i < bonnes.length; i++) {
    const v = bonnes[i];
    if (v != null) {
      r.push(v);
      continue;
    }
    let a = i - 1;
    while (a >= 0 && bonnes[a] == null) a--;
    let b = i + 1;
    while (b < bonnes.length && bonnes[b] == null) b++;
    if (a >= 0 && b < bonnes.length) r.push(bonnes[a]! + ((bonnes[b]! - bonnes[a]!) * (i - a)) / (b - a));
    else r.push(a >= 0 ? bonnes[a]! : bonnes[b]!);
  }
  return r;
}

/** Le plus petit ou le plus grand (une boucle, pas de `Math.min(...)` : un fichier de 20 Mo a plus d'arguments que la pile n'en tient). */
const extreme = (v: readonly number[], f: (a: number, b: number) => number) => v.reduce((m, x) => f(m, x), v[0]!);

/** Un nom de circuit : espaces réduits, 80 caractères au plus ; null s'il est vide. */
export function nomDeCircuit(brut: string | null | undefined): string | null {
  const t = (brut ?? "").replace(/\s+/g, " ").trim();
  return t ? Array.from(t).slice(0, NOM_MAX).join("") : null;
}

export interface EntreeCircuit {
  nom: string;
  /** Le tracé entier (une sortie, un fichier lu), avec ses altitudes quand il en a. */
  points: readonly PointAlt[];
  activites: readonly ActiviteCircuit[];
  /** Un circuit à soi : un fichier GPX (D4 : privé pour toujours en V1) ou une sortie. */
  source: Extract<SourceCircuit, "gpx" | "sortie">;
  /** Sinon, déduit du tracé. */
  type?: TypeCircuit;
  departLieu?: string | null;
  departNom?: string | null;
  commune?: string | null;
  /** D'où vient le circuit (« sortie/<id de la séance> ») : retrouve « Déjà un circuit » pour une sortie ; null pour un fichier. */
  sourceRef?: string | null;
  /** Un identifiant tiré (15 caractères) ; sinon un neuf. */
  id?: string;
  maintenant?: number;
}

/** Les chiffres d'un tracé : null quand la construction est impossible (moins de deux points valides). */
export function construireCircuit(e: EntreeCircuit): Circuit | null {
  if (e.points.length < 2) return null;
  const alts = completerAltitudes(e.points.map((p) => p.alt));
  const pleins: PointAlt[] = e.points.map((p, i) => ({ lat: p.lat, lon: p.lon, alt: alts ? alts[i]! : null }));
  // Simplifié sur les points entiers (comme le serveur), puis arrondi aux 5 décimales du codage : le tracé gardé est celui qu'on garde.
  const gardes = simplifier(pleins, POINTS_MAX, TOLERANCE_M).map((p) => ({ lat: arrondiCodage(p.lat), lon: arrondiCodage(p.lon), alt: (p as PointAlt).alt }));
  const d = alts ? denivele(alts, SEUIL_DENIVELE_M) : null;
  const maintenant = e.maintenant ?? Date.now();
  return {
    id: e.id ?? idCircuit(),
    nom: nomDeCircuit(e.nom) ?? "Circuit",
    type: e.type ?? typeDuTrace(gardes),
    activites: [...e.activites],
    departLieu: e.departLieu ?? null,
    departNom: e.departNom ?? null,
    commune: e.commune ?? null,
    zone: zoneDe(gardes[0]!.lat, gardes[0]!.lon),
    trace: encoderTrace(gardes),
    profil: alts ? encoderAltitudes(gardes.map((p) => p.alt!)) : null,
    bbox: bbox(gardes),
    distanceM: Math.round(longueurM(gardes)),
    denivelePlusM: d ? Math.round(d.plus) : null,
    deniveleMoinsM: d ? Math.round(d.moins) : null,
    altMinM: alts ? Math.round(extreme(alts, Math.min)) : null,
    altMaxM: alts ? Math.round(extreme(alts, Math.max)) : null,
    altSource: alts ? "trace" : null,
    source: e.source,
    sourceRef: e.sourceRef ?? null,
    licence: "propre",
    sourceMaj: null,
    visibilite: "prive",
    publieLe: null,
    creeLe: maintenant,
    majLe: maintenant,
  };
}
