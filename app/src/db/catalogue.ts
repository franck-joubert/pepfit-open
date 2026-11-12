import { transaction } from "./exclusif";
import type { Executeur } from "./executeur";
import { normaliser } from "./normaliser";
import { allureParDefaut, equipementDuCatalogue, natureDuCatalogue, natureSansCatalogue, type Nature } from "./natures";

export interface EntreeCatalogue {
  slug: string;
  nom: string;
  nom_en: string;
  muscle: string | null;
  secondaires: string[];
  materiel: string | null;
  categorie: string | null;
  poids_corps: number;
  picto: string;
  /** sport_id Whoop de l'activité (donnees/whoop-activites.csv) ; absent pour un exercice de salle. */
  whoop_ids?: number[];
  /** Nature imposée par le catalogue (activités Whoop : durée, ou distance et durée) ; sinon déduite de la catégorie. */
  nature?: Nature;
}

export interface Catalogue {
  version: number;
  source: string;
  exercices: EntreeCatalogue[];
}

const CLE_VERSION = "catalogue_version";

/**
 * Charge le catalogue (une fois, ou si sa version a changé) : upsert par slug, sans toucher aux exercices perso.
 * Renvoie le nombre d'exercices écrits (0 si déjà à jour).
 */
export async function chargerCatalogue(db: Executeur, cat: Catalogue): Promise<number> {
  const l = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [CLE_VERSION]);
  if (l && Number(l.valeur) >= cat.version) return 0;
  const t = Date.now();
  await transaction(db, async (db) => {
    for (const e of cat.exercices) {
      const nature = natureDuCatalogue(e);
      await db.runAsync(
        // Nature, équipement et allure ne sont posés qu'à l'insertion : une mise à jour du catalogue ne défait pas un réglage d'Alex.
        // Id stable « cat:<slug> » : le même sur tous les téléphones (synchro).
        `INSERT INTO exercices (id, nom, nom_norm, nom_en, nom_en_norm, slug, muscle, secondaires, equipement, nature, allure, categorie, poids_corps, picto, whoop_ids, perso, cree_le, maj_le)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
         ON CONFLICT(slug) WHERE slug IS NOT NULL DO UPDATE SET
           nom = excluded.nom, nom_norm = excluded.nom_norm, nom_en = excluded.nom_en, nom_en_norm = excluded.nom_en_norm, muscle = excluded.muscle,
           secondaires = excluded.secondaires, categorie = excluded.categorie,
           poids_corps = excluded.poids_corps, picto = excluded.picto, whoop_ids = excluded.whoop_ids, maj_le = excluded.maj_le`,
        [
          `cat:${e.slug}`, e.nom, normaliser(e.nom), e.nom_en, e.nom_en ? normaliser(e.nom_en) : null, e.slug, e.muscle, e.secondaires.join("|"), equipementDuCatalogue(e), nature,
          nature === "distance_duree" ? allureParDefaut(e.slug) : null, e.categorie, e.poids_corps, e.picto,
          e.whoop_ids?.join("|") ?? null, t, t,
        ],
      );
      // Nature imposée après coup (version 8, retour du 30/10 : des efforts au temps proposaient des répétitions) :
      // l'exercice encore à la nature déduite et jamais servi (ni série, ni séance, ni routine) prend celle du catalogue ;
      // un exercice déjà servi garde la sienne, les séances enregistrées ne bougent pas.
      const avant = natureSansCatalogue(e);
      if (nature !== avant) {
        await db.runAsync(
          `UPDATE exercices SET nature = ?, allure = ?, maj_le = ? WHERE slug = ? AND perso = 0 AND nature = ?
             AND NOT EXISTS (SELECT 1 FROM series s WHERE s.exercice_id = exercices.id)
             AND NOT EXISTS (SELECT 1 FROM seance_exercices x WHERE x.exercice_id = exercices.id)
             AND NOT EXISTS (SELECT 1 FROM routine_exercices r WHERE r.exercice_id = exercices.id)`,
          [nature, nature === "distance_duree" ? allureParDefaut(e.slug) : null, t, e.slug, avant],
        );
      }
    }
    await db.runAsync(
      "INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
      [CLE_VERSION, String(cat.version)],
    );
  });
  return cat.exercices.length;
}
