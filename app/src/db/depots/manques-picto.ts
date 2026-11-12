import type { Executeur } from "../executeur";

// Exercices les plus utilisés qui n'ont ni picto ni 3D (docs/CODE-PICTOS-PERSO.md) : de quoi décider quels pictos produire en
// premier. Tout se calcule dans le téléphone, rien n'est envoyé au serveur ; la liste s'exporte en texte.

export const JOURS_USAGE = 90;

export interface UsageExercice {
  id: string;
  nom: string;
  slug: string | null;
  perso: number;
  series: number;
  seances: number;
}

export interface Manque extends UsageExercice {
  sansPicto: boolean;
  sans3D: boolean;
}

/** Séries faites et séances de chaque exercice depuis `depuis` (ms), les plus utilisés d'abord (séries, puis séances). */
export function usageExercices(db: Executeur, depuis: number): Promise<UsageExercice[]> {
  return db.getAllAsync<UsageExercice>(
    `SELECT e.id, e.nom, e.slug, e.perso, COUNT(*) AS series, COUNT(DISTINCT s.seance_id) AS seances
     FROM series s JOIN seances se ON se.id = s.seance_id JOIN exercices e ON e.id = s.exercice_id
     WHERE s.faite = 1 AND se.debut >= ?
     GROUP BY e.id ORDER BY series DESC, seances DESC, e.nom COLLATE NOCASE`,
    [depuis],
  );
}

/** Ceux qui manquent de picto ou de 3D, dans l'ordre d'usage ; `aPicto` et `a3D` disent si l'exercice (slug, nom) en a un. */
export function manquesParUsage(
  usage: readonly UsageExercice[],
  aPicto: (slug: string | null, nom: string) => boolean,
  a3D: (slug: string | null, nom: string) => boolean,
  max = Infinity,
): Manque[] {
  const sortie: Manque[] = [];
  for (const u of usage) {
    const sansPicto = !aPicto(u.slug, u.nom);
    const sans3D = !a3D(u.slug, u.nom);
    if (sansPicto || sans3D) sortie.push({ ...u, sansPicto, sans3D });
    if (sortie.length >= max) break;
  }
  return sortie;
}

const csv = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** La liste en CSV (nom, perso, séries, séances, sans picto, sans 3D) : à envoyer à soi-même ou à Alex, sans compte. */
export function manquesEnCsv(l: readonly Manque[]): string {
  const lignes = l.map((m) => [m.nom, m.perso ? "perso" : "catalogue", m.series, m.seances, m.sansPicto ? "oui" : "non", m.sans3D ? "oui" : "non"].map(csv).join(","));
  return ["nom,origine,series,seances,sans_picto,sans_3d", ...lignes].join("\n") + "\n";
}
