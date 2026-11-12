// Porte d'entrée du récap commun « avant séance » (planche ajout-seance-v2) : toutes les anciennes portes du tiroir bleu
// (planning, accueil, liste des routines, programmes) y mènent. Une séance prévue passe par sa clé « programmation|jour
// d'origine » ; une routine par son identifiant ; un sport seul par son identifiant du catalogue.
import { router } from "expo-router";
import { cleSeance } from "../../agenda/calcul";

export interface EntreeOuvrirRecap {
  routineId?: string | null;
  /** Séance prévue (programmation et jour d'origine). */
  prevue?: { programmationId: string; origine: string } | null;
  sport?: string | null;
  /** Lieu déjà choisi (null : « Non défini »). */
  salleId?: string | null;
}

export function ouvrirRecap(e: EntreeOuvrirRecap): void {
  const params: Record<string, string> = {};
  if (e.prevue) params.seance = cleSeance(e.prevue.programmationId, e.prevue.origine);
  else if (e.routineId) params.routineId = e.routineId;
  if (e.sport) params.sport = e.sport;
  if (e.salleId !== undefined) params.salleId = e.salleId ?? "";
  router.push({ pathname: "/seance-recap", params });
}
