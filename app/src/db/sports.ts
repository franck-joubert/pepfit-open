import type { Sport } from "../i18n/bienvenue";
import type { Executeur } from "./executeur";

// Sport d'une séance, d'après les slugs et catégories du catalogue (assets/catalogue/exercices.json), pour l'accueil.

const PAR_SLUG: Record<string, Sport> = {
  padel: "padel",
  tennis: "raquette", squash: "raquette", badminton: "raquette", "tennis-de-table": "raquette", pickleball: "raquette",
  course: "course", "running-treadmill": "course", "jogging-treadmill": "course", "trail-running-walking": "course", athletisme: "course",
  "course-obstacles": "course",
  bicycling: "velo", "bicycling-stationary": "velo", "recumbent-bike": "velo", "assault-bike": "velo", vtt: "velo",
  natation: "natation",
};
const MUSCU = new Set(["Force", "Haltérophilie", "Force athlétique", "Strongman", "Pliométrie", "Fitness"]);

export type ExerciceSport = { slug: string | null; categorie: string | null; perso: number };

/** Un sport nommé l'emporte (une séance de padel avec un échauffement reste du padel) ; sinon muscu ; sinon autre. */
export function sportDeSeance(exos: ExerciceSport[]): Sport {
  for (const e of exos) {
    const s = e.slug ? PAR_SLUG[e.slug] : undefined;
    if (s) return s;
  }
  return exos.some((e) => (e.categorie != null && MUSCU.has(e.categorie)) || e.perso === 1) ? "muscu" : "autre";
}

/** Le sport le plus fréquent (au moins `min` séances) ; égalité : celui de la séance la plus récente. */
export function sportDominant(sports: Sport[], min = 2): Sport | null {
  const n = new Map<Sport, number>();
  for (const s of sports) n.set(s, (n.get(s) ?? 0) + 1);
  let meilleur: Sport | null = null;
  for (const s of sports) if (s !== "autre" && (meilleur == null || n.get(s)! > n.get(meilleur)!)) meilleur = s;
  return meilleur != null && n.get(meilleur)! >= min ? meilleur : null;
}

/** Sport de chaque séance terminée depuis `depuis`, de la plus récente à la plus ancienne. */
export async function sportsDepuis(db: Executeur, depuis: number): Promise<Sport[]> {
  const l = await db.getAllAsync<ExerciceSport & { id: string; debut: number }>(
    `SELECT s.id, s.debut, e.slug, e.categorie, e.perso
     FROM seances s
     JOIN (SELECT seance_id, exercice_id FROM seance_exercices WHERE seance_id IN (SELECT id FROM seances WHERE debut >= ?)
           UNION SELECT seance_id, exercice_id FROM series WHERE seance_id IN (SELECT id FROM seances WHERE debut >= ?)
           UNION SELECT id, activite_id FROM seances WHERE activite_id IS NOT NULL AND debut >= ?) x ON x.seance_id = s.id
     JOIN exercices e ON e.id = x.exercice_id
     WHERE s.fin IS NOT NULL AND s.debut >= ?
     ORDER BY s.debut DESC`,
    // la borne dans chaque branche : l'union ne parcourt plus toutes les séries de l'historique (audit de performance, M10)
    [depuis, depuis, depuis, depuis],
  );
  const parSeance = new Map<string, ExerciceSport[]>();
  for (const r of l) parSeance.set(r.id, [...(parSeance.get(r.id) ?? []), r]);
  return [...parSeance.values()].map(sportDeSeance);
}
