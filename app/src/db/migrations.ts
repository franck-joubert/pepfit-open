// Migrations de la base (PRAGMA user_version = dernière version appliquée).
//
// Règle des témoins (décision du 27/10), obligatoire pour toute migration à partir de la 25 : chaque migration déclare un
// `temoin`, ce qu'elle crée, une table (« blessure ») ou une colonne (« salle.type »). Des branches développées en parallèle
// prennent le même numéro, et un téléphone de test a pu recevoir l'une avant la fusion ; les numéros sont refaits à la fusion,
// dans l'ordre d'arrivée dans main. Le témoin fait foi, dans les deux sens :
//   - témoin ABSENT, numéro déjà passé : la migration s'applique quand même (son numéro a été pris par une autre branche) ;
//   - témoin PRÉSENT, numéro pas encore passé : elle est sautée, la version avance (déjà faite sous un autre numéro : un
//     ALTER TABLE ou un CREATE refait planterait).
// Une migration à témoin crée donc son témoin, et rien d'autre ne le crée. Avant la 25, rien ne change (numéros seuls).
import { transaction } from "./exclusif";
import type { Executeur } from "./executeur";
import { PREFIXE_CACHE } from "./depots/reglages";
import { IDS_ARTICULATIONS, IDS_MUSCLES } from "./zones-blessure";

export interface Migration {
  version: number;
  nom: string;
  sql: string;
  /** Ce que la migration crée : « table », « table.colonne » ou un index (règle des témoins ci-dessus ; obligatoire dès la 25). */
  temoin?: string;
}

/** Première version soumise à la règle des témoins. */
export const PREMIERE_A_TEMOIN = 25;

// Ajouter à la fin, ne jamais modifier une migration déjà livrée.
/** Équipement corrigé des exercices du catalogue (slug, ancienne valeur, nouvelle) : tractions et dips mal classés avant la migration 17. */
export const CORRECTIONS_EQUIPEMENT: readonly (readonly [string, string, string])[] = [
  ["band-assisted-pull-up", "autre", "barre_fixe"],
  ["dips-chest-version", "autre", "poids_du_corps"],
  ["gironda-sternum-chins", "autre", "barre_fixe"],
  ["kipping-muscle-up", "autre", "barre_fixe"],
  ["knee-hip-raise-on-parallel-bars", "autre", "poids_du_corps"],
  ["mixed-grip-chin", "autre", "barre_fixe"],
  ["muscle-up", "autre", "barre_fixe"],
  ["one-arm-chin-up", "autre", "barre_fixe"],
  ["one-handed-hang", "autre", "barre_fixe"],
  ["parallel-bar-dip", "autre", "poids_du_corps"],
  ["ring-dips", "autre", "poids_du_corps"],
  ["rocky-pull-ups-pulldowns", "autre", "barre_fixe"],
  ["scapular-pull-up", "poids_du_corps", "barre_fixe"],
  ["side-to-side-chins", "autre", "barre_fixe"],
  ["trap-bar-deadlift", "autre", "barre"],
  ["weighted-bench-dip", "autre", "poids_du_corps"],
  ["weighted-pull-ups", "autre", "barre_fixe"],
  ["wide-grip-rear-pull-up", "poids_du_corps", "barre_fixe"],
];

/** Id de la section « Routines » créée par la migration 21 (fixe : le même sur tous les téléphones). */
export const SECTION_ROUTINES = "sec:routines";

/** Réglages synchronisés à la migration 49 (liste figée, recopiée de sync/schema.ts ; en ajouter une demande une migration). */
const REGLAGES_49 = [
  "prenom", "naissance", "annee_naissance", "sexe", "sexe_declare", "parcours_objectifs", "parcours_sports", "niveau_sport", "niveau_nutrition",
  "partie_train", "partie_food", "partie_health", "unite", "unite_distance", "langue", "repos_defaut", "demander_effort", "tempo_poly",
  "tempo_isolation", "planif_heure_defaut", "planif_rappel_min", "zones_methode", "fc_max", "fc_max_mode", "pas_objectif",
  "sommeil_objectif_min", "sante_bmr_methode", "sante_kcal_pas", "sante_kcal_pas_mode", "sante_digestion", "nutri_auto",
  "nutri_poids_cible", "nutri_rythme", "nutri_activite",
];

/** Réglages ajoutés à la migration 55 (le Fil) : l'onglet allumé et les réglages « Ton fil » (ecrans/fil/reglages.ts). */
const REGLAGES_55 = ["partie_feed", "fil_visibilite", "fil_types", "fil_reactions", "fil_commentaires", "fil_depuis"];

/** Réglage ajouté à la migration 57 : la calibration personnelle des kcal (ecrans/calibration.ts). */
const REGLAGES_57 = ["kcal_calibration"];

/** Réglages ajoutés à la migration 58 : le suivi du cycle (cycle/donnees.ts ; planche cycle, NOTES § 2.2). */
const REGLAGES_58 = ["cycle_suivi", "cycle_sante_connect", "cycle_recup", "cycle_poids", "cycle_prevision", "cycle_mention_effort"];

/** Réglage ajouté à la migration 60 : le partage de Whoop brut avec l'IA (sync/schema.ts, CLE_PARTAGE_WHOOP_IA). */
const REGLAGES_60 = ["partage_whoop_ia"];

/**
 * Réglages ajoutés à la migration 61 (macros, D15 et D9) : le niveau d'entraînement choisi et l'alerte de glucides. Pas
 * « nutri_declarations » ni « nutri_cible_geste » : les réponses des garde-fous restent sur le téléphone (D21).
 */
const REGLAGES_61 = ["nutri_niveau", "nutri_alerte_glucides"];

/**
 * Réglages ajoutés à la migration 185 (fibres et eau, planche Fibres et eau, D9) : suivre les fibres, leur objectif en grammes,
 * l'astuce de la carte (masquée pour de bon) et le suivi de l'eau avec son objectif en millilitres.
 */
const REGLAGES_185 = ["nutri_fibres_suivi", "nutri_fibres_objectif_g", "nutri_fibres_astuce", "nutri_eau_suivi", "nutri_eau_objectif_ml"];

/** L'heure (ms depuis 1970) dans un déclencheur SQL, comme celle du journal de synchro. */
const MS_SQL = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
/** Un nombre écrit en JSON sans « .0 » quand il est entier (2.0 → 2) : les listes reprises restent lisibles et comparables. */
const ENTIER_SQL = (x: string) => `CASE WHEN ${x} = CAST(${x} AS INTEGER) THEN CAST(${x} AS INTEGER) ELSE ${x} END`;

/** Filtre SQL des réglages qui voyagent (clés exactes et préfixes), sur la ligne `r` (NEW, OLD ou un alias). */
function filtreReglages(r: string, cles: readonly string[]): string {
  return `(${r}.cle IN (${cles.map((c) => `'${c}'`).join(", ")})${["unite:", "nutri_entrainement:", "nutri_repeter:", "nutri_repete_fait:"]
    .map((p) => ` OR substr(${r}.cle, 1, ${p.length}) = '${p}'`)
    .join("")})`;
}

/** Liste SQL de chaînes connues (ids de zones) : « ('a', 'b') ». */
const sqlListe = (l: readonly string[]) => `(${l.map((z) => `'${z}'`).join(", ")})`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    nom: "schema-initial",
    sql: `
      CREATE TABLE reglages (
        cle TEXT PRIMARY KEY NOT NULL,
        valeur TEXT NOT NULL
      );

      CREATE TABLE exercices (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        muscle TEXT,
        materiel TEXT,
        poids_corps INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );

      CREATE TABLE routines (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        note TEXT,
        ordre INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );

      CREATE TABLE routine_exercices (
        id TEXT PRIMARY KEY NOT NULL,
        routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        exercice_id TEXT NOT NULL REFERENCES exercices(id),
        position INTEGER NOT NULL,
        groupe_superset INTEGER,
        nb_series INTEGER NOT NULL DEFAULT 3,
        repos_s INTEGER NOT NULL DEFAULT 120,
        note TEXT
      );
      CREATE INDEX idx_routine_exercices_routine ON routine_exercices(routine_id, position);

      CREATE TABLE seances (
        id TEXT PRIMARY KEY NOT NULL,
        routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL,
        debut INTEGER NOT NULL,
        fin INTEGER,
        salle TEXT,
        note TEXT,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_seances_debut ON seances(debut);

      CREATE TABLE series (
        id TEXT PRIMARY KEY NOT NULL,
        seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        exercice_id TEXT NOT NULL REFERENCES exercices(id),
        position INTEGER NOT NULL,
        groupe_superset INTEGER,
        type TEXT NOT NULL DEFAULT 'normale'
          CHECK (type IN ('normale','echauffement','rate','degressive')),
        kg REAL,
        reps INTEGER,
        faite INTEGER NOT NULL DEFAULT 0,
        fait_le INTEGER
      );
      CREATE INDEX idx_series_seance ON series(seance_id, position);
      CREATE INDEX idx_series_exercice ON series(exercice_id);
    `,
  },
  {
    version: 2,
    nom: "muscu-catalogue-records",
    sql: `
      ALTER TABLE exercices ADD COLUMN slug TEXT;
      ALTER TABLE exercices ADD COLUMN nom_en TEXT;
      ALTER TABLE exercices ADD COLUMN nom_norm TEXT;
      ALTER TABLE exercices ADD COLUMN secondaires TEXT NOT NULL DEFAULT '';
      ALTER TABLE exercices ADD COLUMN categorie TEXT;
      ALTER TABLE exercices ADD COLUMN picto TEXT;
      ALTER TABLE exercices ADD COLUMN perso INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE exercices ADD COLUMN mesure TEXT NOT NULL DEFAULT 'kg_reps'
        CHECK (mesure IN ('kg_reps','reps','duree','distance_duree'));
      CREATE UNIQUE INDEX idx_exercices_slug ON exercices(slug) WHERE slug IS NOT NULL;
      CREATE INDEX idx_exercices_norm ON exercices(nom_norm);

      CREATE TABLE exercice_alias (
        nom_norm TEXT PRIMARY KEY NOT NULL,
        exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        source TEXT NOT NULL DEFAULT 'hevy'
      );

      ALTER TABLE seances ADD COLUMN titre TEXT;
      ALTER TABLE seances ADD COLUMN source_ref TEXT;
      ALTER TABLE seances ADD COLUMN volume_kg REAL NOT NULL DEFAULT 0;
      ALTER TABLE seances ADD COLUMN nb_series INTEGER NOT NULL DEFAULT 0;
      CREATE UNIQUE INDEX idx_seances_source ON seances(source_ref) WHERE source_ref IS NOT NULL;

      ALTER TABLE series ADD COLUMN volume REAL NOT NULL DEFAULT 0;
      ALTER TABLE series ADD COLUMN e1rm REAL;
      ALTER TABLE series ADD COLUMN precedent_kg REAL;
      ALTER TABLE series ADD COLUMN precedent_reps INTEGER;
      ALTER TABLE series ADD COLUMN duree_s INTEGER;
      ALTER TABLE series ADD COLUMN distance_m REAL;
      ALTER TABLE series ADD COLUMN rpe REAL;

      CREATE TABLE seance_exercices (
        seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        exercice_id TEXT NOT NULL REFERENCES exercices(id),
        position INTEGER NOT NULL,
        groupe_superset INTEGER,
        repos_s INTEGER NOT NULL DEFAULT 120,
        note TEXT,
        PRIMARY KEY (seance_id, exercice_id)
      );

      CREATE TABLE records (
        id TEXT PRIMARY KEY NOT NULL,
        exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('e1rm','charge','volume_serie','volume_seance','reps')),
        valeur REAL NOT NULL,
        serie_id TEXT,
        seance_id TEXT NOT NULL,
        atteint_le INTEGER NOT NULL,
        actuel INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_records_exercice ON records(exercice_id, type, atteint_le);
      CREATE INDEX idx_records_seance ON records(seance_id);
    `,
  },
  {
    version: 3,
    nom: "routine-cibles-par-serie",
    // Charge et répétitions visées pour chaque série d'une ligne de routine (rang 0 = première série).
    // Ligne absente ou champ nul : la séance reprend la dernière séance (précédent).
    sql: `
      CREATE TABLE routine_series (
        ligne_id TEXT NOT NULL REFERENCES routine_exercices(id) ON DELETE CASCADE,
        rang INTEGER NOT NULL CHECK (rang >= 0),
        kg REAL,
        reps INTEGER,
        PRIMARY KEY (ligne_id, rang)
      );
    `,
  },
  {
    version: 4,
    nom: "natures-pesees-salles-paliers",
    // D7 à D17 (planche v2.3). `mesure` devient `nature` (les 4 anciennes valeurs gardent leur sens), le matériel texte devient
    // un équipement, les salles texte des séances deviennent des salles. Rien n'est effacé : les séries gardent leurs valeurs.
    sql: `
      CREATE TABLE salle (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        defaut INTEGER NOT NULL DEFAULT 0,
        equipements TEXT NOT NULL DEFAULT '',
        ordre INTEGER NOT NULL DEFAULT 0,
        proprietaire_id TEXT NOT NULL DEFAULT 'local',
        publique INTEGER NOT NULL DEFAULT 0,
        source_id TEXT,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );

      CREATE TABLE appareil (
        id TEXT PRIMARY KEY NOT NULL,
        salle_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        nom TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'pile' CHECK (type IN ('pile','poulie','smith','halteres','disques','assistance')),
        paliers_kg TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX idx_appareil_salle ON appareil(salle_id);

      CREATE TABLE appareil_exercice (
        appareil_id TEXT NOT NULL REFERENCES appareil(id) ON DELETE CASCADE,
        exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        PRIMARY KEY (appareil_id, exercice_id)
      );
      CREATE INDEX idx_appareil_exercice_ex ON appareil_exercice(exercice_id);

      CREATE TABLE pesee (
        id TEXT PRIMARY KEY NOT NULL,
        date INTEGER NOT NULL,
        kg REAL NOT NULL CHECK (kg > 0),
        source TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','sante_connect'))
      );
      CREATE INDEX idx_pesee_date ON pesee(date);

      ALTER TABLE exercices ADD COLUMN nature TEXT NOT NULL DEFAULT 'poids_reps'
        CHECK (nature IN ('poids_reps','reps','leste','assiste','duree','duree_poids','distance_duree','poids_distance'));
      ALTER TABLE exercices ADD COLUMN equipement TEXT NOT NULL DEFAULT 'autre'
        CHECK (equipement IN ('poids_du_corps','barre','halteres','kettlebell','machine','poulie','smith','barre_fixe','elastique','cardio','disque','autre'));
      ALTER TABLE exercices ADD COLUMN allure TEXT CHECK (allure IN ('500m','km','kmh'));
      ALTER TABLE exercices ADD COLUMN appareil_id TEXT REFERENCES appareil(id) ON DELETE SET NULL;
      ALTER TABLE exercices ADD COLUMN a_verifier INTEGER NOT NULL DEFAULT 0;

      UPDATE exercices SET nature = CASE mesure
        WHEN 'reps' THEN 'reps' WHEN 'duree' THEN 'duree' WHEN 'distance_duree' THEN 'distance_duree' ELSE 'poids_reps' END;

      UPDATE exercices SET equipement = CASE
        WHEN categorie = 'Cardio' THEN 'cardio'
        WHEN slug LIKE '%smith%' THEN 'smith'
        WHEN materiel = 'Poids du corps' AND (slug LIKE '%pullup%' OR slug LIKE '%chin-up%' OR slug LIKE '%hanging%') THEN 'barre_fixe'
        WHEN materiel IN ('Barre','Barre EZ') THEN 'barre'
        WHEN materiel = 'Haltère' THEN 'halteres'
        WHEN materiel IN ('Poids du corps','Aucun') THEN 'poids_du_corps'
        WHEN materiel = 'Poulie' THEN 'poulie'
        WHEN materiel = 'Machine' THEN 'machine'
        WHEN materiel = 'Kettlebell' THEN 'kettlebell'
        WHEN materiel = 'Élastique' THEN 'elastique'
        ELSE 'autre' END;

      -- Au poids du corps, sans série déjà faite qui contredise : lesté si des kg ont été saisis, sinon réps seules.
      UPDATE exercices SET nature = CASE
          WHEN EXISTS (SELECT 1 FROM series WHERE exercice_id = exercices.id AND kg > 0) THEN 'leste' ELSE 'reps' END
        WHERE poids_corps = 1 AND mesure = 'kg_reps';
      UPDATE exercices SET nature = 'distance_duree'
        WHERE categorie = 'Cardio' AND mesure = 'kg_reps'
          AND NOT EXISTS (SELECT 1 FROM series WHERE exercice_id = exercices.id AND (kg > 0 OR reps > 0));
      UPDATE exercices SET nature = 'duree'
        WHERE (categorie = 'Étirement' OR slug = 'plank') AND mesure = 'kg_reps'
          AND NOT EXISTS (SELECT 1 FROM series WHERE exercice_id = exercices.id AND (kg > 0 OR reps > 0));

      ALTER TABLE exercices DROP COLUMN mesure;
      ALTER TABLE exercices DROP COLUMN materiel;

      ALTER TABLE routine_series ADD COLUMN duree_s INTEGER;
      ALTER TABLE routine_series ADD COLUMN distance_m REAL;

      ALTER TABLE series ADD COLUMN charge_eff REAL;
      ALTER TABLE series ADD COLUMN precedent_duree_s INTEGER;
      ALTER TABLE series ADD COLUMN precedent_distance_m REAL;

      CREATE TABLE records_nouveau (
        id TEXT PRIMARY KEY NOT NULL,
        exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('e1rm','charge','volume_serie','volume_seance','reps','duree','distance','allure')),
        valeur REAL NOT NULL,
        serie_id TEXT,
        seance_id TEXT NOT NULL,
        atteint_le INTEGER NOT NULL,
        actuel INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO records_nouveau SELECT id, exercice_id, type, valeur, serie_id, seance_id, atteint_le, actuel FROM records;
      DROP TABLE records;
      ALTER TABLE records_nouveau RENAME TO records;
      CREATE INDEX idx_records_exercice ON records(exercice_id, type, atteint_le);
      CREATE INDEX idx_records_seance ON records(seance_id);

      ALTER TABLE seances ADD COLUMN salle_id TEXT REFERENCES salle(id) ON DELETE SET NULL;
      INSERT INTO salle (id, nom, defaut, equipements, cree_le, maj_le)
        SELECT lower(hex(randomblob(8))), MIN(TRIM(salle)), 0,
               'poids_du_corps|barre|halteres|kettlebell|machine|poulie|smith|barre_fixe|elastique|cardio|disque|autre',
               CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
        FROM seances WHERE salle IS NOT NULL AND TRIM(salle) <> '' GROUP BY LOWER(TRIM(salle));
      UPDATE seances SET salle_id = (SELECT id FROM salle WHERE LOWER(nom) = LOWER(TRIM(seances.salle)))
        WHERE salle IS NOT NULL AND TRIM(salle) <> '';
      UPDATE salle SET defaut = 1 WHERE id = (SELECT salle_id FROM seances WHERE salle_id IS NOT NULL GROUP BY salle_id ORDER BY COUNT(*) DESC LIMIT 1);
      ALTER TABLE seances DROP COLUMN salle;

      INSERT INTO reglages (cle, valeur) VALUES ('recalcul_en_attente', '1')
        ON CONFLICT(cle) DO UPDATE SET valeur = '1';
    `,
  },
  {
    version: 5,
    nom: "routine-type-de-serie-et-plage-de-reps",
    // Type de chaque série d'une routine (échauffement, normale, dégressive, échec), recopié dans la séance ; plage de répétitions
    // (min = reps, max = reps_max) par ligne de routine, indiquée sur la série de séance. Rien n'est perdu : les lignes existantes
    // prennent 'normale' et le mode « répétitions ».
    sql: `
      ALTER TABLE routine_series ADD COLUMN type TEXT NOT NULL DEFAULT 'normale';
      ALTER TABLE routine_series ADD COLUMN reps_max INTEGER;
      ALTER TABLE routine_exercices ADD COLUMN plage_reps INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE series ADD COLUMN plage_min INTEGER;
      ALTER TABLE series ADD COLUMN plage_max INTEGER;
    `,
  },
  {
    version: 6,
    nom: "seance-pause",
    // Pause de la séance en cours : instant où la pause a commencé (null si elle ne l'est pas) et secondes de pause déjà écoulées.
    sql: `
      ALTER TABLE seances ADD COLUMN pause_debut INTEGER;
      ALTER TABLE seances ADD COLUMN pause_cumul_s INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 7,
    nom: "abdos-sans-charge-effective",
    // Les abdos, lombaires et le cou ne comptent plus le poids du corps (compteLePoidsDuCorps) : un recalcul retire leur
    // charge effective et le volume qu'elle donnait.
    sql: `
      INSERT INTO reglages (cle, valeur) VALUES ('recalcul_en_attente', '1')
        ON CONFLICT(cle) DO UPDATE SET valeur = '1';
    `,
  },
  {
    version: 8,
    nom: "routine-tempo",
    // Tempo d'un exercice de routine, en notation des coachs « 3-1-1-0 » ; null = aucun (durée de répétition par défaut).
    sql: `
      ALTER TABLE routine_exercices ADD COLUMN tempo TEXT;
    `,
  },
  {
    version: 9,
    nom: "notes-exercice-routine-seance",
    // Trois notes par exercice : d'exercice (exercices.note, toutes les séances), de routine (routine_exercices.note) et de
    // séance (seance_exercices.note). Jusqu'ici la note de routine était recopiée dans la séance au démarrage : une note de
    // séance identique à celle de la routine d'origine est vidée (elle s'affiche depuis la routine). Rien d'autre ne bouge :
    // les notes Hevy importées restent des notes de séance.
    sql: `
      ALTER TABLE exercices ADD COLUMN note TEXT;
      UPDATE seance_exercices SET note = NULL
        WHERE note IS NOT NULL AND EXISTS (
          SELECT 1 FROM seances s JOIN routine_exercices re ON re.routine_id = s.routine_id AND re.exercice_id = seance_exercices.exercice_id
          WHERE s.id = seance_exercices.seance_id AND re.note = seance_exercices.note);
    `,
  },
  {
    version: 10,
    nom: "pesee-origine",
    // Appli qui a déposé une pesée importée dans Santé Connect (nom de paquet Android, ex. com.withings.wiscale2) ;
    // null pour une pesée manuelle ou une importée avant cette version.
    sql: `
      ALTER TABLE pesee ADD COLUMN origine TEXT;
    `,
  },
  {
    version: 11,
    nom: "salle-osm-et-photo-de-seance",
    // Salles d'OpenStreetMap (source_id = « node/123 », « way/456 ») : adresse et position ; une salle OSM n'est ajoutée
    // qu'une fois. Une photo au plus par séance (fichiers dans documentDirectory/photos, chemins relatifs) ; cle_distante
    // reste vide tant que la photo n'est pas envoyée au serveur.
    sql: `
      ALTER TABLE salle ADD COLUMN adresse TEXT;
      ALTER TABLE salle ADD COLUMN lat REAL;
      ALTER TABLE salle ADD COLUMN lon REAL;
      CREATE UNIQUE INDEX idx_salle_source ON salle(source_id) WHERE source_id IS NOT NULL;

      CREATE TABLE seance_photo (
        id TEXT PRIMARY KEY NOT NULL,
        seance_id TEXT NOT NULL UNIQUE REFERENCES seances(id) ON DELETE CASCADE,
        chemin_local TEXT NOT NULL,
        chemin_vignette TEXT NOT NULL,
        largeur INTEGER NOT NULL,
        hauteur INTEGER NOT NULL,
        octets INTEGER NOT NULL,
        cle_distante TEXT,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
    `,
  },
  {
    version: 12,
    nom: "synchro",
    // Synchro (NOTES § 6.2). 1. Les exercices du catalogue prennent un id stable, « cat:<slug> », le même sur tous les
    // téléphones ; les références suivent. 2. Chaque écriture d'une table synchronisée est notée dans sync_journal (une ligne
    // par enregistrement, la dernière écriture) ; sync_silence coupe le journal pendant l'application des changements reçus.
    // sync_version garde l'horloge hybride de la dernière version connue de chaque ligne (et si c'était une suppression). records, reglages et exercice_alias
    // restent locaux (les records se recalculent).
    sql: `
      PRAGMA defer_foreign_keys = ON;
      CREATE TEMP TABLE _renomme AS
        SELECT id AS ancien, 'cat:' || slug AS nouveau FROM exercices WHERE slug IS NOT NULL AND perso = 0 AND id <> 'cat:' || slug;
      ${["series", "routine_exercices", "seance_exercices", "records", "appareil_exercice", "exercice_alias"]
        .map(
          (t) => `UPDATE ${t} SET exercice_id = (SELECT nouveau FROM _renomme WHERE ancien = ${t}.exercice_id)
        WHERE exercice_id IN (SELECT ancien FROM _renomme);`,
        )
        .join("\n      ")}
      UPDATE exercices SET id = (SELECT nouveau FROM _renomme WHERE ancien = exercices.id) WHERE id IN (SELECT ancien FROM _renomme);
      DROP TABLE _renomme;

      CREATE TABLE sync_journal (
        tab TEXT NOT NULL,
        cle TEXT NOT NULL,
        ms INTEGER NOT NULL,
        supprime INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tab, cle)
      );
      CREATE TABLE sync_version (
        tab TEXT NOT NULL,
        cle TEXT NOT NULL,
        hlc TEXT NOT NULL,
        supprime INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tab, cle)
      );
      CREATE TABLE sync_etat (
        cle TEXT PRIMARY KEY NOT NULL,
        valeur TEXT NOT NULL
      );
      CREATE TABLE sync_silence (un INTEGER PRIMARY KEY CHECK (un = 1));
      ${(
        [
          ["salle", "id"], ["appareil", "id"], ["exercices", "id"], ["appareil_exercice", "appareil_id|exercice_id"],
          ["routines", "id"], ["routine_exercices", "id"], ["routine_series", "ligne_id|rang"], ["seances", "id"],
          ["seance_exercices", "seance_id|exercice_id"], ["series", "id"], ["pesee", "id"], ["seance_photo", "id"],
        ] as const
      )
        .map(([t, cles]) => {
          const cle = (r: string) => cles.split("|").map((c) => `${r}.${c}`).join(" || '|' || ");
          const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
          // Upsert et non « OR REPLACE » : une instruction « INSERT OR ABORT » ou « OR IGNORE » imposerait sa règle au déclencheur.
          const trig = (quand: string, r: string, supprime: number) =>
            `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${t} AFTER ${quand} ON ${t} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${t}', ${cle(r)}, ${ms}, ${supprime})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          return [trig("INSERT", "NEW", 0), trig("UPDATE", "NEW", 0), trig("DELETE", "OLD", 1)].join("\n      ");
        })
        .join("\n      ")}
    `,
  },
  {
    version: 13,
    nom: "exercices-whoop",
    // sport_id Whoop des activités du catalogue (« 106|249 » pour le padel), pour une future synchro ; posé par chargerCatalogue.
    sql: `
      ALTER TABLE exercices ADD COLUMN whoop_ids TEXT;
    `,
  },
  {
    version: 14,
    nom: "sans-autre-activite",
    // « Autre activité » (entrées Whoop non sportives) sort du catalogue (26/10) : effacée si rien ne s'en sert.
    sql: `
      DELETE FROM exercices WHERE id = 'cat:autre-activite'
        AND NOT EXISTS (SELECT 1 FROM series WHERE exercice_id = 'cat:autre-activite')
        AND NOT EXISTS (SELECT 1 FROM seance_exercices WHERE exercice_id = 'cat:autre-activite')
        AND NOT EXISTS (SELECT 1 FROM routine_exercices WHERE exercice_id = 'cat:autre-activite');
    `,
  },
  {
    version: 15,
    nom: "seance-tempo",
    // Tempo propre à l'exercice dans la séance (menu « … ») ; null = celui de la routine, s'il y en a un.
    sql: `
      ALTER TABLE seance_exercices ADD COLUMN tempo TEXT;
    `,
  },
  {
    version: 16,
    nom: "notes-multiples",
    // Plusieurs notes par type et par lieu : table notes (type exercice : exercice_id ; routine : + ligne_id ; seance : + seance_id).
    // Les notes des trois colonnes y sont recopiées avec un id déterministe (le même sur tous les téléphones, la synchro ne double
    // donc rien) ; les colonnes restent, on n'y écrit plus. Journal de synchro comme les autres tables (migration 12).
    sql: `
      CREATE TABLE notes (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('exercice', 'routine', 'seance')),
        exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        ligne_id TEXT REFERENCES routine_exercices(id) ON DELETE CASCADE,
        seance_id TEXT REFERENCES seances(id) ON DELETE CASCADE,
        texte TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_notes_exercice ON notes(exercice_id, type);
      CREATE INDEX idx_notes_ligne ON notes(ligne_id);
      CREATE INDEX idx_notes_seance ON notes(seance_id, exercice_id);
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_notes AFTER ${quand} ON notes WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('notes', ${r}.id, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
      INSERT INTO notes (id, type, exercice_id, ligne_id, seance_id, texte, position, cree_le, maj_le)
        SELECT 'n:exercice:' || id, 'exercice', id, NULL, NULL, trim(note), 0, maj_le, maj_le FROM exercices
        WHERE note IS NOT NULL AND trim(note) <> '';
      INSERT INTO notes (id, type, exercice_id, ligne_id, seance_id, texte, position, cree_le, maj_le)
        SELECT 'n:routine:' || re.id, 'routine', re.exercice_id, re.id, NULL, trim(re.note), 0, r.maj_le, r.maj_le
        FROM routine_exercices re JOIN routines r ON r.id = re.routine_id
        WHERE re.note IS NOT NULL AND trim(re.note) <> '';
      INSERT INTO notes (id, type, exercice_id, ligne_id, seance_id, texte, position, cree_le, maj_le)
        SELECT 'n:seance:' || se.seance_id || ':' || se.exercice_id, 'seance', se.exercice_id, NULL, se.seance_id, trim(se.note), 0, s.maj_le, s.maj_le
        FROM seance_exercices se JOIN seances s ON s.id = se.seance_id
        WHERE se.note IS NOT NULL AND trim(se.note) <> '';
    `,
  },
  {
    version: 17,
    nom: "equipement-tractions-dips",
    // Tractions et dips du catalogue mal classés (equipementDuCatalogue corrigé). Seuls les exercices du catalogue (perso = 0) qui portent
    // encore l'ancienne valeur changent : un équipement réglé à la main par Alex n'est pas touché.
    sql: CORRECTIONS_EQUIPEMENT.map(
      ([slug, avant, apres]) => `UPDATE exercices SET equipement = '${apres}' WHERE slug = '${slug}' AND perso = 0 AND equipement = '${avant}';`,
    ).join("\n"),
  },
  {
    version: 18,
    nom: "seance-remplacement",
    // Remplacer l'exercice / Alternative : remplace_id = exercice remplacé dans la même séance (clé de seance_exercices), raison_alternative =
    // 'occupe' | 'manquant' | null (remplacement libre). Colonnes synchronisées comme les autres de seance_exercices (SELECT * à l'envoi).
    sql: `
      ALTER TABLE seance_exercices ADD COLUMN remplace_id TEXT;
      ALTER TABLE seance_exercices ADD COLUMN raison_alternative TEXT CHECK (raison_alternative IN ('occupe', 'manquant'));
    `,
  },
  {
    version: 19,
    nom: "inventaire-salle",
    // Inventaire d'une salle (planches salles-inventaire et salle-organique). Machines = appareil, enrichi : machine_id (catalogue
    // machines.ts), palier et max (null = sans max) dans l'unité propre à l'équipement (kg ou lbs, la valeur saisie reste exacte).
    // salle_poids_libre : haltères (min, max, pas), kettlebells (liste), barre et disques (min = barre, max = charge totale).
    // equipement_detecte : un équipement vu en séance mais absent de l'inventaire, ou une charge au-dessus du plafond ; un par salle et
    // type, statut a_confirmer | confirme | ignore. salle_retrait : instantané d'un équipement retiré, pour l'annuler (local).
    sql: `
      ALTER TABLE appareil ADD COLUMN machine_id TEXT;
      ALTER TABLE appareil ADD COLUMN palier REAL;
      ALTER TABLE appareil ADD COLUMN max_val REAL;
      ALTER TABLE appareil ADD COLUMN unite TEXT NOT NULL DEFAULT 'kg' CHECK (unite IN ('kg', 'lbs'));
      CREATE UNIQUE INDEX idx_appareil_machine ON appareil(salle_id, machine_id) WHERE machine_id IS NOT NULL;

      CREATE TABLE salle_poids_libre (
        salle_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('halteres', 'kettlebell', 'barre')),
        min_val REAL,
        max_val REAL,
        pas REAL,
        liste TEXT NOT NULL DEFAULT '[]',
        unite TEXT NOT NULL DEFAULT 'kg' CHECK (unite IN ('kg', 'lbs')),
        PRIMARY KEY (salle_id, type)
      );

      CREATE TABLE equipement_detecte (
        id TEXT PRIMARY KEY NOT NULL,
        salle_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        type_equipement TEXT NOT NULL,
        plafond_kg REAL,
        exercice_id TEXT NOT NULL,
        seance_id TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT 'a_confirmer' CHECK (statut IN ('a_confirmer', 'confirme', 'ignore')),
        detecte_le INTEGER NOT NULL,
        traite_le INTEGER,
        avant TEXT,
        UNIQUE (salle_id, type_equipement)
      );

      CREATE TABLE salle_retrait (
        id TEXT PRIMARY KEY NOT NULL,
        salle_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        type_equipement TEXT NOT NULL,
        instantane TEXT NOT NULL,
        retire_le INTEGER NOT NULL,
        annule INTEGER NOT NULL DEFAULT 0
      );
      ${(
        [
          ["salle_poids_libre", "salle_id || '|' || {r}.type"],
          ["equipement_detecte", "id"],
        ] as const
      )
        .map(([t, cle]) => {
          const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
          const trig = (quand: string, r: string, supprime: number) =>
            `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${t} AFTER ${quand} ON ${t} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${t}', ${r}.${cle.replaceAll("{r}", r)}, ${ms}, ${supprime})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          return [trig("INSERT", "NEW", 0), trig("UPDATE", "NEW", 0), trig("DELETE", "OLD", 1)].join("\n      ");
        })
        .join("\n      ")}
    `,
  },
  {
    version: 20,
    nom: "noms-bilingues",
    // nom_en_norm : nom anglais normalisé (sans accent ni ponctuation), cherché avec nom_norm. Rempli par completerNoms (depots/noms.ts) au démarrage.
    sql: `
      ALTER TABLE exercices ADD COLUMN nom_en_norm TEXT;
      CREATE INDEX idx_exercices_nom_en_norm ON exercices(nom_en_norm);
    `,
  },
  {
    version: 21,
    nom: "sections-de-routines",
    // Sections de la liste Entraînements (27/10) : une routine appartient à une section, les sections ont leur ordre et
    // se replient. La section « Routines » (id fixe, la même sur tous les téléphones : la synchro ne la double pas) reçoit toutes
    // les routines existantes. Une routine sans section (section supprimée ailleurs) s'affiche dans la première.
    sql: `
      CREATE TABLE routine_sections (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        ordre INTEGER NOT NULL DEFAULT 0,
        repliee INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      ALTER TABLE routines ADD COLUMN section_id TEXT REFERENCES routine_sections(id) ON DELETE SET NULL;
      CREATE INDEX idx_routines_section ON routines(section_id, ordre);
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_routine_sections AFTER ${quand} ON routine_sections WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('routine_sections', ${r}.id, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
      INSERT INTO routine_sections (id, nom, ordre, repliee, cree_le, maj_le)
        VALUES ('${SECTION_ROUTINES}', 'Routines', 0, 0, 0, 0);
      UPDATE routines SET section_id = '${SECTION_ROUTINES}';
    `,
  },
  {
    version: 22,
    nom: "accueil-modulable",
    // Accueil modulable (planche B · Mosaïque, 27/10) : les blocs de l'accueil, leur ordre et leur taille. Locale, comme les
    // réglages : chaque téléphone a son accueil. Une table vide veut dire que tout a été retiré ; une base neuve reçoit
    // l'accueil par défaut.
    sql: `
      CREATE TABLE accueil_blocs (
        id TEXT PRIMARY KEY NOT NULL,
        ordre INTEGER NOT NULL,
        taille TEXT NOT NULL CHECK (taille IN ('pleine', 'demie'))
      );
      INSERT INTO accueil_blocs (id, ordre, taille) VALUES
        ('a-suivre', 0, 'pleine'), ('semaine', 1, 'pleine'), ('pas', 2, 'pleine'), ('derniere', 3, 'pleine');
    `,
  },
  {
    version: 23,
    nom: "planification",
    // Planification des séances (planche v7, 27/10) : les règles d'une routine (regle : JSON, voir ecrans/planification.ts) et
    // leurs exceptions par occurrence (retirée, décalée). Une séance manquée n'est pas stockée : c'est une occurrence passée
    // sans séance faite. Synchronisées, comme les routines qu'elles référencent.
    sql: `
      CREATE TABLE programmations (
        id TEXT PRIMARY KEY NOT NULL,
        routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        texte TEXT NOT NULL,
        regle TEXT NOT NULL,
        actif INTEGER NOT NULL DEFAULT 1,
        rappel_min INTEGER,
        ordre INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_programmations_routine ON programmations(routine_id, ordre);
      CREATE TABLE programmation_exceptions (
        id TEXT PRIMARY KEY NOT NULL,
        programmation_id TEXT NOT NULL REFERENCES programmations(id) ON DELETE CASCADE,
        date_origine TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('retiree', 'decalee')),
        nouvelle_date TEXT,
        nouvelle_heure TEXT,
        maj_le INTEGER NOT NULL,
        UNIQUE (programmation_id, date_origine)
      );
      ${["programmations", "programmation_exceptions"]
        .flatMap((tab) =>
          ["INSERT", "UPDATE", "DELETE"].map((quand) => {
            const r = quand === "DELETE" ? "OLD" : "NEW";
            const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
            return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${tab} AFTER ${quand} ON ${tab} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${tab}', ${r}.id, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          }),
        )
        .join("\n      ")}
    `,
  },
  {
    version: 24,
    nom: "nutrition",
    // Nutrition, lot 1 (planche validée le 27/10) : copie locale des produits (nutriments pour 100, portions), les cinq repas
    // du jour, les consommations datées par repas, les objectifs (jour d'entraînement / repos) et les mensurations avec
    // historique (le poids reste dans « pesee »). Locale pour l'instant : la synchro chiffrée viendra avec le serveur.
    sql: `
      CREATE TABLE produits (
        id TEXT PRIMARY KEY NOT NULL,
        code_barres TEXT UNIQUE,
        nom TEXT NOT NULL,
        marque TEXT,
        categorie TEXT,
        base TEXT NOT NULL DEFAULT '100g' CHECK (base IN ('100g', '100ml')),
        nutriments TEXT NOT NULL DEFAULT '{}',
        portions TEXT NOT NULL DEFAULT '[]',
        nutriscore TEXT,
        nova INTEGER,
        ingredients TEXT,
        source TEXT NOT NULL DEFAULT 'perso' CHECK (source IN ('off', 'fonte', 'perso')),
        licence TEXT,
        off_maj INTEGER,
        cree_le INTEGER NOT NULL,
        vu_le INTEGER NOT NULL,
        favori INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_produits_nom ON produits(nom);

      CREATE TABLE repas (
        id TEXT PRIMARY KEY NOT NULL,
        cle TEXT NOT NULL UNIQUE,
        nom TEXT,
        ordre INTEGER NOT NULL,
        heure_min INTEGER NOT NULL
      );
      INSERT INTO repas (id, cle, nom, ordre, heure_min) VALUES
        ('repas:petit_dej', 'petit_dej', NULL, 0, 450),
        ('repas:collation', 'collation', NULL, 1, 625),
        ('repas:dejeuner', 'dejeuner', NULL, 2, 750),
        ('repas:gouter', 'gouter', NULL, 3, 990),
        ('repas:diner', 'diner', NULL, 4, 1170);

      CREATE TABLE consommations (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        repas_id TEXT NOT NULL REFERENCES repas(id),
        produit_id TEXT NOT NULL REFERENCES produits(id),
        quantite_g REAL NOT NULL,
        unite TEXT NOT NULL DEFAULT 'g' CHECK (unite IN ('g', 'portion', 'piece', 'paquet')),
        nb_unites REAL NOT NULL,
        repete INTEGER NOT NULL DEFAULT 0,
        ordre INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL
      );
      CREATE INDEX idx_consommations_jour ON consommations(date, repas_id, ordre);
      CREATE INDEX idx_consommations_produit ON consommations(produit_id, date);

      CREATE TABLE objectifs (
        jour TEXT PRIMARY KEY NOT NULL CHECK (jour IN ('entrainement', 'repos')),
        proteines REAL NOT NULL,
        glucides REAL NOT NULL,
        lipides REAL NOT NULL,
        sucres REAL NOT NULL
      );

      CREATE TABLE mensurations (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        date INTEGER NOT NULL,
        valeur REAL NOT NULL
      );
      CREATE INDEX idx_mensurations_type ON mensurations(type, date);
    `,
  },
  {
    version: 25,
    nom: "blessures-traitements",
    temoin: "blessure",
    // Santé : blessures et compléments (planche sante-suivi, NOTES § 1, validée le 27/10). Toute écriture porte son auteur :
    // 'moi' ou l'id d'une connexion IA (le futur serveur MCP écrit au nom de l'IA). Jours en AAAA-MM-JJ, heures en HH:MM, instants
    // (cree_le, maj_le, supprime_le) en ms comme les autres tables. blessure.statut copie le dernier changement de
    // blessure_statut (le plus récent par date puis cree_le). supprime_le : suppression douce (Annuler ; une IA n'efface pas
    // pour de bon). Une prise = une case cochée ; rien n'est écrit pour une prise oubliée. Synchronisées (journal, migration 12).
    sql: `
      CREATE TABLE blessure (
        id TEXT PRIMARY KEY NOT NULL,
        titre TEXT NOT NULL,
        zone TEXT,
        cote TEXT NOT NULL DEFAULT '-' CHECK (cote IN ('g', 'd', '2', '-')),
        debut TEXT NOT NULL,
        notes TEXT,
        notes_auteur TEXT,
        notes_maj INTEGER,
        statut TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'reduite', 'disparue')),
        auteur TEXT NOT NULL DEFAULT 'moi',
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL,
        supprime_le INTEGER
      );
      CREATE TABLE blessure_statut (
        id TEXT PRIMARY KEY NOT NULL,
        blessure_id TEXT NOT NULL REFERENCES blessure(id) ON DELETE CASCADE,
        statut TEXT NOT NULL CHECK (statut IN ('active', 'reduite', 'disparue')),
        date TEXT NOT NULL,
        auteur TEXT NOT NULL DEFAULT 'moi',
        cree_le INTEGER NOT NULL
      );
      CREATE INDEX idx_blessure_statut ON blessure_statut(blessure_id, date, cree_le);
      CREATE TABLE blessure_journal (
        id TEXT PRIMARY KEY NOT NULL,
        blessure_id TEXT NOT NULL REFERENCES blessure(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('douleur', 'ressenti', 'aide')),
        douleur INTEGER CHECK (douleur BETWEEN 0 AND 10),
        texte TEXT NOT NULL DEFAULT '',
        auteur TEXT NOT NULL DEFAULT 'moi',
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL,
        supprime_le INTEGER
      );
      CREATE INDEX idx_blessure_journal ON blessure_journal(blessure_id, date);
      CREATE TABLE traitement (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'complement' CHECK (type IN ('complement', 'medicament')),
        dose TEXT,
        frequence TEXT NOT NULL DEFAULT 'jour',
        max_jour INTEGER,
        moment TEXT CHECK (moment IN ('matin', 'midi', 'soir', 'coucher')),
        debut TEXT NOT NULL,
        fin TEXT,
        blessure_id TEXT REFERENCES blessure(id) ON DELETE SET NULL,
        notes TEXT,
        notes_auteur TEXT,
        notes_maj INTEGER,
        rappel TEXT,
        auteur TEXT NOT NULL DEFAULT 'moi',
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL,
        supprime_le INTEGER
      );
      CREATE INDEX idx_traitement_blessure ON traitement(blessure_id);
      CREATE TABLE prise (
        id TEXT PRIMARY KEY NOT NULL,
        traitement_id TEXT NOT NULL REFERENCES traitement(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        heure TEXT NOT NULL,
        dose TEXT,
        auteur TEXT NOT NULL DEFAULT 'moi',
        cree_le INTEGER NOT NULL
      );
      CREATE INDEX idx_prise_jour ON prise(date, traitement_id);
      CREATE INDEX idx_prise_traitement ON prise(traitement_id, date);
      ${["blessure", "blessure_statut", "blessure_journal", "traitement", "prise"]
        .flatMap((tab) =>
          ["INSERT", "UPDATE", "DELETE"].map((quand) => {
            const r = quand === "DELETE" ? "OLD" : "NEW";
            const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
            return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${tab} AFTER ${quand} ON ${tab} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${tab}', ${r}.id, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          }),
        )
        .join("\n      ")}
    `,
  },
  {
    version: 26,
    nom: "lieux",
    temoin: "salle.type",
    // Lieux (planche Lieux, NOTES § 1) : une salle devient un lieu d'un type ouvert (texte libre, pas de CHECK : un type nouveau ne
    // touche pas la base ; registre dans db/lieux.ts). Les lignes existantes restent des salles, équipements intacts. lieu_activite :
    // 0 à n activités habituelles par lieu, `ordre` = ordre de coche. Synchronisée (clé lieu_id|exercice_id), comme la migration 12.
    sql: `
      ALTER TABLE salle ADD COLUMN type TEXT NOT NULL DEFAULT 'salle';
      CREATE TABLE lieu_activite (
        lieu_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        ordre INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (lieu_id, exercice_id)
      );
      CREATE INDEX idx_lieu_activite_exercice ON lieu_activite(exercice_id);
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_lieu_activite AFTER ${quand} ON lieu_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('lieu_activite', ${r}.lieu_id || '|' || ${r}.exercice_id, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
    `,
  },
  {
    version: 27,
    temoin: "repas.actif",
    nom: "nutrition-repas-import",
    // Numéro 27 réservé à Nutrition (les Lieux ont la 26, le lanceur de sports la 28) ; un téléphone de test a pu la recevoir
    // en 25 ou 26 : le témoin repas.actif fait foi.
    // Nutrition, lot 2 : un repas s'allume ou s'éteint (Repas et horaires) ; l'apéritif existe, éteint (comme dans Fitatu) ;
    // une consommation ou un produit importé garde sa clé d'origine (« fitatu:… ») : relancer l'import ne double rien.
    sql: `
      ALTER TABLE repas ADD COLUMN actif INTEGER NOT NULL DEFAULT 1;
      UPDATE repas SET ordre = ordre + 1 WHERE cle = 'diner';
      INSERT OR IGNORE INTO repas (id, cle, nom, ordre, heure_min, actif) VALUES ('repas:aperitif', 'aperitif', NULL, 4, 1140, 0);
      ALTER TABLE consommations ADD COLUMN import_cle TEXT;
      CREATE UNIQUE INDEX idx_consommations_import ON consommations(import_cle) WHERE import_cle IS NOT NULL;
      ALTER TABLE produits ADD COLUMN import_cle TEXT;
      CREATE UNIQUE INDEX idx_produits_import ON produits(import_cle) WHERE import_cle IS NOT NULL;
    `,
  },
  {
    version: 28,
    nom: "lanceur-sports",
    temoin: "lanceur_sport",
    // Lanceur de sports de la page Entraînements (planche A · Grille, 27/10) : les sports gardés sous la main et leur ordre.
    // Locale, comme l'accueil modulable. Pas de défaut ici (le catalogue n'est pas encore chargé sur une base neuve) :
    // le premier passage le pose (depots/lanceur), puis une table vide veut dire que tout a été retiré. La 27 est réservée à
    // Nutrition (fusion à venir) : le témoin couvre l'ordre d'arrivée.
    sql: `
      CREATE TABLE lanceur_sport (
        exercice_id TEXT PRIMARY KEY NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
        ordre INTEGER NOT NULL
      );
    `,
  },
  {
    version: 29,
    nom: "mesure-corps",
    temoin: "mesure_corps",
    // Santé, page complète (planche sante-energie, D8) : mesures datées du corps hors poids (« pesee ») et tours
    // (« mensurations ») : gras (%), maigre, os, eau (kg), bmr (kcal/j), vfc (ms), fc (bpm au repos). Importées de Santé
    // Connect (source « sante_connect », origine = paquet de l'appli) ; dédoublonnées par (type, date, source) comme les
    // pesées. Locale, comme les mensurations. 27 est réservée à Nutrition.
    sql: `
      CREATE TABLE mesure_corps (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        date INTEGER NOT NULL,
        valeur REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'sante_connect',
        origine TEXT,
        cree_le INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_mesure_corps ON mesure_corps(type, date, source);
    `,
  },
  {
    version: 30,
    nom: "programmes-types",
    temoin: "routines.type",
    // Programmes par sport (planche idee-programmes, validée le 28/10, D1) : une routine devient un programme d'un type (texte
    // libre : muscu, cross, course, velo, natation, mobilite, autre ; registre dans db/programmes.ts). Les routines existantes et
    // celles importées de Hevy (INSERT sans type) sont de la musculation, intactes. format : AMRAP, EMOM, For time ou Rounds
    // d'un WOD (null ailleurs) ; format_valeur : durée en s, ou nombre de rounds. Synchronisées avec la ligne (SELECT *).
    sql: `
      ALTER TABLE routines ADD COLUMN type TEXT NOT NULL DEFAULT 'muscu';
      ALTER TABLE routines ADD COLUMN format TEXT;
      ALTER TABLE routines ADD COLUMN format_valeur INTEGER;
    `,
  },
  {
    version: 31,
    nom: "superset-transition",
    temoin: "seance_exercices.repos_transition_s",
    // Superset (planche idee-plein-ecran, lot 1) : temps « entre les exercices » d'un tour (changer de machine), porté par
    // chaque membre, copié de la routine au démarrage comme repos_s. 0 = on enchaîne (comportement d'avant). La 30 est
    // réservée aux Programmes : le témoin couvre l'ordre d'arrivée. Les colonnes partent avec la ligne (SELECT *).
    sql: `
      ALTER TABLE routine_exercices ADD COLUMN repos_transition_s INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE seance_exercices ADD COLUMN repos_transition_s INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 32,
    nom: "suivi-gps",
    temoin: "suivi_point",
    // Suivi GPS (planches/suivi-gps, NOTES § 4, lot 2) : tracé (un point par seconde au plus), FC (course et, au lot 5, muscu)
    // et bornes des tours d'une séance ; temps, allure, zones et dénivelé des tours se recalculent depuis les points et la FC.
    // suivi_seance garde ce qui ne se recalcule pas sans le baromètre : le dénivelé retenu et la source de l'altitude.
    // Additive et locale : la synchro (blob par séance) se tranche au lot 3. s = temps de séance hors pauses (ms).
    sql: `
      CREATE TABLE suivi_point (
        seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        t INTEGER NOT NULL,
        s INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        alt_baro REAL,
        alt_gps REAL,
        precision REAL,
        vitesse REAL,
        PRIMARY KEY (seance_id, t)
      ) WITHOUT ROWID;
      CREATE TABLE seance_fc (
        seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        t INTEGER NOT NULL,
        s INTEGER NOT NULL,
        bpm INTEGER NOT NULL,
        PRIMARY KEY (seance_id, t)
      ) WITHOUT ROWID;
      CREATE TABLE suivi_tour (
        seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        n INTEGER NOT NULL,
        t INTEGER NOT NULL,
        d REAL NOT NULL,
        PRIMARY KEY (seance_id, n)
      ) WITHOUT ROWID;
      CREATE TABLE suivi_seance (
        seance_id TEXT PRIMARY KEY NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        denivele_plus_m REAL,
        denivele_moins_m REAL,
        barometre INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 33,
    nom: "whoop",
    temoin: "whoop_jour",
    // Connexion Whoop (API officielle + pas par l'API privée) : un résumé par jour (récupération, sommeil, cycle, pas) et les
    // séances Whoop (strain, zones, FC), reliées à la séance pepfit qu'elles enrichissent (chevauchement ±10 min) ou créée pour
    // elles. Locale, comme mesure_corps. jour = minuit local (ms) du réveil pour le sommeil et la récupération, du cycle sinon.
    sql: `
      CREATE TABLE whoop_jour (
        jour INTEGER PRIMARY KEY NOT NULL,
        recup REAL, vfc REAL, fc_repos REAL, spo2 REAL, temp_peau REAL,
        sommeil_debut INTEGER, sommeil_fin INTEGER, sommeil_min REAL, sommeil_perf REAL, sommeil_dette_min REAL,
        leger_min REAL, profond_min REAL, paradoxal_min REAL, eveil_min REAL,
        strain REAL, kj REAL, fc_moy REAL, fc_max REAL,
        pas INTEGER,
        maj_le INTEGER NOT NULL
      );
      CREATE TABLE whoop_seance (
        id TEXT PRIMARY KEY NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        sport_id INTEGER,
        sport TEXT,
        strain REAL, kj REAL, fc_moy REAL, fc_max REAL, distance_m REAL,
        zones TEXT,
        seance_id TEXT REFERENCES seances(id) ON DELETE SET NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_whoop_seance_debut ON whoop_seance(debut);
      CREATE INDEX idx_whoop_seance_seance ON whoop_seance(seance_id);
    `,
  },
  {
    version: 34,
    nom: "plans-programmes",
    temoin: "plans",
    // Boutique de programmes (planche boutique-programmes, A validée le 28/10) : un programme du catalogue démarré devient un
    // plan, avec ses routines (une par séance différente, plan_id) et une programmation « unique » par date. Le plan garde ce
    // qui a été choisi au démarrage (jours, heure, début) ; le calendrier se lit dans les programmations. Locale, comme
    // whoop_jour ; les routines et les programmations du plan partent avec la synchro (plan_id sans plan = une routine
    // ordinaire sur un autre téléphone).
    sql: `
      CREATE TABLE plans (
        id TEXT PRIMARY KEY NOT NULL,
        catalogue_id TEXT NOT NULL,
        catalogue_version INTEGER NOT NULL DEFAULT 1,
        nom TEXT NOT NULL,
        debut TEXT NOT NULL,
        fin TEXT NOT NULL,
        jours TEXT NOT NULL,
        heure TEXT NOT NULL,
        nb_seances INTEGER NOT NULL,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      ALTER TABLE routines ADD COLUMN plan_id TEXT;
      CREATE INDEX idx_routines_plan ON routines(plan_id);
    `,
  },
  {
    version: 35,
    nom: "aliments-masques",
    temoin: "produits.masque_le",
    // « Retirer de mes aliments » (audit du 28/10, constat 21) : l'heure du retrait, le journal n'est pas touché. Un aliment
    // retiré revient dans Mes aliments dès qu'une consommation est créée après cette heure. Part avec la ligne dans la
    // sauvegarde chiffrée (SELECT *) ; les produits ne sont pas synchronisés.
    sql: `
      ALTER TABLE produits ADD COLUMN masque_le INTEGER;
    `,
  },
  {
    version: 36,
    nom: "tempo-exercice",
    temoin: "exercices.tempo",
    // Tempo propre à un exercice (29/10) : null = défaut de sa famille (Guidage), « off » = pas de tempo (ni option,
    // ni ruban, ni défaut), sinon « 3-0-1-0 ». Le tempo d'une ligne de routine ou de séance passe devant ; « off » coupe tout.
    // Seulement pour les natures à répétitions (ecrans/tempo.ts). Synchronisée avec la ligne (SELECT *).
    sql: `
      ALTER TABLE exercices ADD COLUMN tempo TEXT;
    `,
  },
  {
    version: 37,
    nom: "whoop-sommeil-detail",
    temoin: "whoop_jour.respiration",
    // Pages Sommeil et Récupération (planche pas, 28/10) : ce que l'API Whoop donne d'une nuit et que l'appli ne gardait pas
    // (respiration, efficacité, régularité, réveils, cycles, temps au lit, besoin détaillé : base, dette, effort, sieste).
    // Le curseur des nuits est effacé : la synchro suivante relit les 90 derniers jours et remplit ces colonnes.
    sql: `
      ALTER TABLE whoop_jour ADD COLUMN respiration REAL;
      ALTER TABLE whoop_jour ADD COLUMN sommeil_efficacite REAL;
      ALTER TABLE whoop_jour ADD COLUMN sommeil_regularite REAL;
      ALTER TABLE whoop_jour ADD COLUMN sommeil_reveils INTEGER;
      ALTER TABLE whoop_jour ADD COLUMN sommeil_cycles INTEGER;
      ALTER TABLE whoop_jour ADD COLUMN au_lit_min REAL;
      ALTER TABLE whoop_jour ADD COLUMN besoin_base_min REAL;
      ALTER TABLE whoop_jour ADD COLUMN besoin_effort_min REAL;
      ALTER TABLE whoop_jour ADD COLUMN besoin_sieste_min REAL;
      DELETE FROM reglages WHERE cle = 'whoop_curseur_sleep';
    `,
  },
  {
    version: 38,
    nom: "cible-duree-serie",
    temoin: "series.duree_cible_s",
    // Cible d'une série en durée au moment où son compte à rebours l'enregistre (planche seance-duree, D1 A) : duree_s porte
    // le temps réel, duree_cible_s la durée prévue, d'où l'écart affiché sous le temps (« +7 s »). Null : saisie à la main.
    // Synchronisée avec la ligne (SELECT *).
    sql: `
      ALTER TABLE series ADD COLUMN duree_cible_s INTEGER;
    `,
  },
  {
    version: 39,
    nom: "etapes-seance",
    temoin: "series.ligne_id",
    // Étapes d'une séance gardées (planche seance-duree, D3 option b, audit A11) : une séance de course d'un programme répète
    // le même exercice sur plusieurs lignes (échauffement, fractionné, retour au calme) ; seance_exercices garde sa clé
    // (séance, exercice), chaque série garde sa ligne de routine d'origine, sa zone visée et sa récupération. La zone d'une
    // ligne de routine (routine_exercices.zone) vient du bloc du programme. Synchronisées avec les lignes (SELECT *).
    sql: `
      ALTER TABLE routine_exercices ADD COLUMN zone INTEGER;
      ALTER TABLE series ADD COLUMN ligne_id TEXT;
      ALTER TABLE series ADD COLUMN zone INTEGER;
      ALTER TABLE series ADD COLUMN repos_s INTEGER;
    `,
  },
  {
    version: 40,
    nom: "fc-muscu",
    temoin: "seance_repos",
    // FC pendant une séance de muscu (planches/suivi-gps § 6, lot 5) : la FC va dans seance_fc (migration 32) ; ici, chaque
    // repos de la séance avec sa fin réelle (fin prévue, déplacée par −15 / +15, ou moment du « Passer »), qui borne la fenêtre
    // d'effort de la série suivante, et le nom du capteur (« Whoop · en direct »). Locale, comme seance_fc.
    sql: `
      CREATE TABLE seance_repos (
        seance_id TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        PRIMARY KEY (seance_id, debut)
      ) WITHOUT ROWID;
      ALTER TABLE suivi_seance ADD COLUMN capteur TEXT;
    `,
  },
  {
    version: 41,
    nom: "effort-vise",
    temoin: "routine_exercices.rir",
    // Effort visé d'une ligne de routine créée par un programme (planche programmes-charges) : répétitions en réserve à la
    // fin de chaque série (0 à 5). Il fixe le poids proposé à la séance suivante et le poids cherché à la première séance
    // d'un exercice sans historique (boutique/poids.ts). Null : ligne ordinaire. Synchronisée avec la ligne (SELECT *).
    sql: `
      ALTER TABLE routine_exercices ADD COLUMN rir INTEGER;
    `,
  },
  {
    version: 42,
    nom: "plans-arretes",
    temoin: "plans.arrete_le",
    // Programmes passés (planche sport-programmes-routines v2, A2, validée le 29/10) : un programme arrêté n'est plus effacé ;
    // il garde son plan et ses routines (cachées, comme celles d'un plan en cours), ses programmations sont désactivées, et
    // l'heure de l'arrêt se note ici (« Arrêté semaine 5 »). « Supprimer » (glisser sur un passé) efface comme avant.
    sql: `
      ALTER TABLE plans ADD COLUMN arrete_le INTEGER;
    `,
  },
  {
    version: 43,
    nom: "activites-detectees",
    temoin: "activite_detectee",
    // Activités détectées (planche activite-detectee, validée le 29/10) : un effort vu par Whoop, Santé Connect ou pepfit
    // sans sport, à associer, ignoré ou associé à une séance ; kcal mesurées (montre) ou brutes (Whoop, FC). Les choix de
    // sport de l'utilisateur, pour la reconnaissance apprise : sur le téléphone seulement (ni l'une ni l'autre n'est
    // synchronisée). Une séance d'exercices peut porter un autre sport (activite_id, D6) ; un sport posé par pepfit est
    // gardé avec sa raison (reconnu, JSON), pour « Reconnu : Padel · Changer ». Ces deux colonnes partent avec la séance.
    sql: `
      CREATE TABLE activite_detectee (
        cle TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        fc_moy INTEGER,
        fc_max INTEGER,
        pas INTEGER,
        kcal REAL,
        kcal_brutes REAL,
        sport_brut TEXT,
        etat TEXT NOT NULL DEFAULT 'a-associer',
        seance_id TEXT,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX activite_detectee_debut ON activite_detectee (debut);
      CREATE TABLE reconnaissance_choix (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        refuse TEXT,
        detectee INTEGER NOT NULL DEFAULT 1,
        seance_id TEXT,
        contexte TEXT NOT NULL,
        le INTEGER NOT NULL
      );
      ALTER TABLE seances ADD COLUMN activite_id TEXT;
      ALTER TABLE seances ADD COLUMN reconnu TEXT;
    `,
  },
  {
    version: 44,
    nom: "score-seance",
    temoin: "seances.score",
    // Score ou niveau d'une séance (planche familles-sports, D5 du 30/10) : texte libre, facultatif, saisi à la fin d'un sport
    // et cours (« 6-4 3-6 7-5 », « 6b+ en tête »). Synchronisé avec la ligne (SELECT *), chiffré comme la note.
    sql: `
      ALTER TABLE seances ADD COLUMN score TEXT;
    `,
  },
  {
    version: 45,
    nom: "whoop-seance-detail",
    temoin: "whoop_seance_detail",
    // Pas et FC d'une séance Whoop lus dans l'API privée (option « Compteur de pas », 30/10) : lus une fois, gardés ici. fc :
    // JSON [[t, bpm], …] en heure murale (ms). Locale comme whoop_seance (pas de synchro) ; partie avec la séance Whoop.
    sql: `
      CREATE TABLE whoop_seance_detail (
        whoop_id TEXT PRIMARY KEY NOT NULL REFERENCES whoop_seance(id) ON DELETE CASCADE,
        pas INTEGER,
        fc TEXT,
        lu_le INTEGER NOT NULL
      );
    `,
  },
  {
    version: 46,
    nom: "coach",
    temoin: "sync_coach_lignes",
    // Partage avec un coach (docs/APPLI-COACH.md du dépôt PWA, src/coach/partages.ts) : locales, jamais synchronisées ni
    // sauvegardées (préfixe sync_). Les clés de partage de chaque génération, scellées par la clé de données (un envoi peut
    // dater d'avant un changement de domaines) ; le choix « tout l'historique » ; l'empreinte de chaque ligne écrite, pour
    // n'envoyer que ce qui a changé.
    sql: `
      CREATE TABLE sync_coach_cles (
        partage TEXT NOT NULL,
        generation INTEGER NOT NULL,
        cle_membre TEXT NOT NULL,
        PRIMARY KEY (partage, generation)
      );
      CREATE TABLE sync_coach_partages (
        partage TEXT PRIMARY KEY NOT NULL,
        generation INTEGER NOT NULL,
        historique INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE sync_coach_lignes (
        partage TEXT NOT NULL,
        domaine TEXT NOT NULL,
        cle TEXT NOT NULL,
        empreinte TEXT NOT NULL,
        PRIMARY KEY (partage, domaine, cle)
      );
    `,
  },
  {
    version: 47,
    nom: "plats",
    temoin: "plats",
    // Plats personnalisés (planche plats, validée le 30/10) : un nom, des ingrédients et leurs quantités, des portions et un
    // poids cuit facultatif, une photo facultative (fichiers dans documents/photos, envoyés chiffrés comme la photo de séance).
    // Un plat sans ingrédients (recette Fitatu sans détail) garde ses valeurs pour 100 g et son poids entier. Synchronisés et
    // chiffrés (sync/schema.ts) ; l'ingrédient garde une copie de son produit (`produit`, JSON) : les produits ne voyagent pas.
    // Une consommation de plat garde la composition mangée (P4 : modifier le plat ne change pas les jours passés), ajustements
    // compris ; son produit_id vise un produit figé (catégorie « plat »), ce qui garde au journal ses calculs d'aliment.
    sql: `
      CREATE TABLE plats (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        portions INTEGER NOT NULL DEFAULT 1 CHECK (portions >= 1),
        poids_cuit_g REAL,
        favori INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'perso' CHECK (source IN ('perso', 'fitatu')),
        import_cle TEXT,
        sans_ingredients INTEGER NOT NULL DEFAULT 0,
        nutriments_100g TEXT,
        poids_total_g REAL,
        photo TEXT,
        photo_vignette TEXT,
        photo_distante TEXT,
        cree_le INTEGER NOT NULL,
        modifie_le INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_plats_import ON plats(import_cle) WHERE import_cle IS NOT NULL;
      CREATE TABLE plat_ingredients (
        id TEXT PRIMARY KEY NOT NULL,
        plat_id TEXT NOT NULL REFERENCES plats(id) ON DELETE CASCADE,
        produit_id TEXT NOT NULL,
        produit TEXT NOT NULL,
        quantite_g REAL NOT NULL,
        unite TEXT NOT NULL DEFAULT 'g' CHECK (unite IN ('g', 'portion', 'piece', 'paquet')),
        nb_unites REAL NOT NULL,
        ordre INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_plat_ingredients ON plat_ingredients(plat_id, ordre);
      ALTER TABLE consommations ADD COLUMN plat_id TEXT;
      ALTER TABLE consommations ADD COLUMN composition TEXT;
      ALTER TABLE consommations ADD COLUMN ajuste INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_consommations_plat ON consommations(plat_id, date) WHERE plat_id IS NOT NULL;
      ${["plats", "plat_ingredients"]
        .map((tab) =>
          (["INSERT", "UPDATE", "DELETE"] as const)
            .map((quand) => {
              const r = quand === "DELETE" ? "OLD" : "NEW";
              const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
              return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${tab} AFTER ${quand} ON ${tab} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${tab}', ${r}.id, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
            })
            .join("\n      "),
        )
        .join("\n      ")}
    `,
  },
  {
    version: 48,
    nom: "hors-medical",
    temoin: "hors_medical",
    // Hors du médical (31/10, D1 et D3) : les médicaments déjà saisis et leurs prises sont effacés pour de bon, et plus
    // aucun complément n'est lié à une blessure. Les triggers de synchro notent les suppressions : le serveur les efface aussi.
    // La sauvegarde et l'export lisent les tables : rien n'y reste. La table `hors_medical`, vide, n'est que le témoin.
    sql: `
      CREATE TABLE hors_medical (fait_le INTEGER);
      DELETE FROM prise WHERE traitement_id IN (SELECT id FROM traitement WHERE type <> 'complement');
      DELETE FROM traitement WHERE type <> 'complement';
      UPDATE traitement SET blessure_id = NULL WHERE blessure_id IS NOT NULL;
    `,
  },
  {
    version: 49,
    nom: "synchro-complete",
    temoin: "sync_attente",
    // Tout ce que la personne saisit voyage (docs/SYNC-COMPLETE.md, le 31/10 : l'IA doit pouvoir le lire et l'écrire) :
    // produits et journal, repas, objectifs, mensurations, mesures du corps, programmes suivis (plans) et les réglages qui
    // valent pour la personne (liste figée ici, recopiée de sync/schema.ts : en ajouter une demande une nouvelle migration).
    // Les lignes déjà là sont notées au journal à l'heure 0 : au premier envoi, ce que le serveur a déjà (un autre appareil,
    // ou l'IA) gagne, le reste part. Le curseur repart de zéro : ce que l'IA a écrit dans ces tables, ignoré jusqu'ici, arrive.
    // sync_attente : ligne reçue avant son parent, gardée telle que reçue jusqu'à son arrivée. sync_alias : perdant d'une
    // fusion de doublons et son gagnant. produits.remplace_par : produit en double fusionné dans le plus ancien (gardé).
    sql: `
      ALTER TABLE produits ADD COLUMN remplace_par TEXT;
      CREATE TABLE sync_attente (
        tab TEXT NOT NULL,
        cle TEXT NOT NULL,
        hlc TEXT NOT NULL,
        charge TEXT,
        attend_tab TEXT NOT NULL,
        attend_col TEXT NOT NULL,
        attend_val TEXT NOT NULL,
        PRIMARY KEY (tab, cle)
      );
      CREATE INDEX idx_sync_attente_parent ON sync_attente(attend_tab, attend_val);
      CREATE TABLE sync_alias (
        tab TEXT NOT NULL,
        ancien TEXT NOT NULL,
        nouveau TEXT NOT NULL,
        PRIMARY KEY (tab, ancien)
      );
      ${(
        [
          ["produits", "id", null],
          ["repas", "id", null],
          ["consommations", "id", null],
          ["objectifs", "jour", null],
          ["mensurations", "id", null],
          ["mesure_corps", "id", null],
          ["plans", "id", null],
          [
            "reglages",
            "cle",
            (r: string) => filtreReglages(r, REGLAGES_49),
          ],
        ] as const
      )
        .map(([tab, cle, filtre]) => {
          const ms = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
          const trig = (quand: string, r: string) =>
            `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${tab} AFTER ${quand} ON ${tab} WHEN NOT EXISTS (SELECT 1 FROM sync_silence)${filtre ? ` AND ${filtre(r)}` : ""} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${tab}', ${r}.${cle}, ${ms}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          return [
            trig("INSERT", "NEW"),
            trig("UPDATE", "NEW"),
            trig("DELETE", "OLD"),
            `INSERT OR IGNORE INTO sync_journal (tab, cle, ms, supprime) SELECT '${tab}', x.${cle}, 0, 0 FROM ${tab} x
        WHERE ${filtre ? filtre("x") : "1"} AND NOT EXISTS (SELECT 1 FROM sync_version v WHERE v.tab = '${tab}' AND v.cle = x.${cle});`,
          ].join("\n      ");
        })
        .join("\n      ")}
      DELETE FROM sync_etat WHERE cle = 'curseur';
    `,
  },
  {
    version: 50,
    nom: "effort-pepfit",
    temoin: "seance_charge",
    // L'Effort pepfit (planche effort-pepfit, 31/10) : la charge brute de chaque séance (points d'Edwards, de Foster ou du
    // barème), jamais le score, qui se calcule à l'affichage par la courbe (ecrans/effort-pepfit.ts). `version` : celle des
    // paramètres de la charge ; `empreinte` : ce qui a servi au calcul (une séance qui change est recalculée, effort-charges.ts).
    // Locale comme seance_fc, d'où elle vient : chaque téléphone la recalcule.
    sql: `
      CREATE TABLE seance_charge (
        seance_id TEXT PRIMARY KEY NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
        charge REAL NOT NULL,
        methode TEXT NOT NULL CHECK (methode IN ('fc', 'ressenti', 'bareme')),
        estime INTEGER NOT NULL DEFAULT 0,
        minutes REAL NOT NULL,
        zones TEXT,
        ressenti TEXT,
        source_fc TEXT,
        version INTEGER NOT NULL,
        empreinte TEXT NOT NULL,
        maj_le INTEGER NOT NULL
      );
    `,
  },
  {
    version: 51,
    nom: "effort-synchro",
    temoin: "seance_charge.avec_fc",
    // La charge de l'Effort voyage (31/10, D2 : l'IA doit tout voir). avec_fc : l'appareil qui l'a calculée avait la FC
    // de la séance ; une ligne calculée avec la FC n'est jamais remplacée par une ligne calculée sans (sync/schema.ts,
    // garderLocale ; ecrans/effort-charges.ts), sinon la plus récente gagne. Le déclencheur de mise à jour ne note que ce qui
    // change la mesure : l'empreinte et l'heure du calcul, propres à chaque appareil, ne voyagent pas seules. Les lignes déjà là
    // sont notées au journal à l'heure 0 (au premier envoi, ce que le serveur a déjà gagne).
    sql: `
      ALTER TABLE seance_charge ADD COLUMN avec_fc INTEGER NOT NULL DEFAULT 0;
      UPDATE seance_charge SET avec_fc = 1 WHERE methode = 'fc' OR source_fc IS NOT NULL;
      CREATE TRIGGER sync_i_seance_charge AFTER INSERT ON seance_charge WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('seance_charge', NEW.seance_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_seance_charge AFTER UPDATE ON seance_charge WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (
          OLD.charge IS NOT NEW.charge OR OLD.methode IS NOT NEW.methode OR OLD.estime IS NOT NEW.estime OR OLD.minutes IS NOT NEW.minutes
          OR OLD.zones IS NOT NEW.zones OR OLD.ressenti IS NOT NEW.ressenti OR OLD.source_fc IS NOT NEW.source_fc OR OLD.avec_fc IS NOT NEW.avec_fc
          OR OLD.version IS NOT NEW.version) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('seance_charge', NEW.seance_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_seance_charge AFTER DELETE ON seance_charge WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('seance_charge', OLD.seance_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      INSERT OR IGNORE INTO sync_journal (tab, cle, ms, supprime) SELECT 'seance_charge', x.seance_id, 0, 0 FROM seance_charge x
        WHERE NOT EXISTS (SELECT 1 FROM sync_version v WHERE v.tab = 'seance_charge' AND v.cle = x.seance_id);
    `,
  },
  {
    version: 52,
    nom: "objectif-gras",
    temoin: "temoin_objectif_gras",
    // % de gras cible (docs/OBJECTIF-GRAS.md, le 31/10) : la clé « nutri_gras_cible » voyage comme le poids cible ; les
    // déclencheurs des réglages sont refaits avec la liste allongée (aucune ligne à noter : la clé est neuve). La migration ne
    // crée ni table ni colonne : la table vide « temoin_objectif_gras » ne sert que de témoin (règle en tête du fichier).
    sql: "CREATE TABLE temoin_objectif_gras (fait INTEGER);\n      " + ["INSERT", "UPDATE", "DELETE"]
      .map((quand) => {
        const r = quand === "DELETE" ? "OLD" : "NEW";
        return `DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible"])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
      })
      .join("\n      "),
  },
  {
    version: 53,
    nom: "effort-activite",
    temoin: "jour_activite",
    // L'activité de la journée hors séances (31/10 : les pas comptent, avec ou sans séance ; docs/EFFORT-ACTIVITE.md) :
    // sa charge brute en points (FC de la journée au-dessus de la zone 1, sinon les pas), jamais le score. jour : AAAA-MM-JJ
    // local (la même clé sur tous les appareils et pour le MCP). pas : hors séances ; heures : comptés heure par heure (cadence) ;
    // rang : 2 FC, 1 pas heure par heure, 0 total. Voyage comme seance_charge (l'IA doit tout voir) : une journée n'est jamais
    // remplacée par une mesure plus grossière (sync/schema.ts) ; l'empreinte et l'heure du calcul ne voyagent pas seules.
    sql: `
      CREATE TABLE jour_activite (
        jour TEXT PRIMARY KEY NOT NULL,
        charge REAL NOT NULL,
        methode TEXT NOT NULL CHECK (methode IN ('fc', 'pas')),
        pas INTEGER,
        heures INTEGER NOT NULL DEFAULT 0,
        zones TEXT,
        source_pas TEXT,
        source_fc TEXT,
        rang INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL,
        empreinte TEXT NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE TRIGGER sync_i_jour_activite AFTER INSERT ON jour_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('jour_activite', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_jour_activite AFTER UPDATE ON jour_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (
          OLD.charge IS NOT NEW.charge OR OLD.methode IS NOT NEW.methode OR OLD.pas IS NOT NEW.pas OR OLD.heures IS NOT NEW.heures
          OR OLD.zones IS NOT NEW.zones OR OLD.source_pas IS NOT NEW.source_pas OR OLD.source_fc IS NOT NEW.source_fc
          OR OLD.rang IS NOT NEW.rang OR OLD.version IS NOT NEW.version) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('jour_activite', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_jour_activite AFTER DELETE ON jour_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('jour_activite', OLD.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
    `,
  },
  {
    version: 54,
    nom: "index-perf",
    temoin: "idx_seances_routine",
    // Audit de performance (docs/AUDIT-PERF.md, M10 ; docs/PERF-B.md) : les recherches qui parcouraient toute une table. Séances
    // d'une routine (dernière fois, compte) et d'une salle ; séances d'un exercice ; séries faites d'un exercice (précédent,
    // progrès, recalcul) ; récents d'un repas. Le témoin est l'index qu'elle crée (temoinPresent lit aussi les index) ; IF NOT
    // EXISTS : rejouée sous un autre numéro, elle ne casse rien.
    sql: `
      CREATE INDEX IF NOT EXISTS idx_seances_routine ON seances(routine_id, debut);
      CREATE INDEX IF NOT EXISTS idx_seances_salle ON seances(salle_id, debut);
      CREATE INDEX IF NOT EXISTS idx_seance_exercices_exercice ON seance_exercices(exercice_id, seance_id);
      CREATE INDEX IF NOT EXISTS idx_series_exercice_faite ON series(exercice_id, faite, seance_id);
      CREATE INDEX IF NOT EXISTS idx_consommations_repas_date ON consommations(repas_id, date);
    `,
  },
  {
    version: 55,
    nom: "fil",
    temoin: "publications",
    // Le Fil (planche fil, validée le 31/10 ; docs/CODE-FIL.md) : tes activités en publications, visibles par toi
    // seul aujourd'hui, avec réactions et commentaires. Le modèle est déjà celui de l'ouverture (NOTES § 5.2) : chaque ligne a
    // son auteur (« moi » ou l'id d'une connexion IA, comme les tables de santé) et la publication sa visibilité (« moi »
    // seulement aujourd'hui). La publication ne copie aucun chiffre : son contenu se lit dans l'activité (une séance corrigée
    // corrige sa publication). Son id est tiré de l'activité (« seance:<id> », « programme:<id>, « serie:<lundi> »,
    // « pesee:<id> ») : générée sur deux appareils, elle reste une seule ligne. Une réaction : une par auteur, publication et
    // émoji (plusieurs émojis possibles) ; l'émoji voyage chiffré, l'id est tiré au hasard, le doublon se fusionne (le plus
    // ancien gagne). Un commentaire : 500 signes au plus ; distinct des notes de séance, qui ne partent jamais (D3).
    // Les trois tables voyagent chiffrées (légende, émoji, texte). Les réglages du Fil et l'onglet allumé aussi (liste des
    // réglages refaite, comme à la migration 52).
    sql: `
      CREATE TABLE publications (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('seance', 'record', 'programme_termine', 'serie', 'pesee')),
        source TEXT NOT NULL,
        jour TEXT NOT NULL,
        cree_le INTEGER NOT NULL,
        auteur TEXT NOT NULL DEFAULT 'moi',
        legende TEXT,
        visibilite TEXT NOT NULL DEFAULT 'moi' CHECK (visibilite IN ('moi', 'abonnes', 'public')),
        retiree INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_publications_ordre ON publications(cree_le);
      CREATE TABLE reactions (
        id TEXT PRIMARY KEY NOT NULL,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        auteur TEXT NOT NULL DEFAULT 'moi',
        emoji TEXT NOT NULL,
        cree_le INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_reactions_unique ON reactions(publication_id, auteur, emoji);
      CREATE TABLE commentaires (
        id TEXT PRIMARY KEY NOT NULL,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        auteur TEXT NOT NULL DEFAULT 'moi',
        texte TEXT NOT NULL,
        cree_le INTEGER NOT NULL,
        modifie_le INTEGER,
        retire INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_commentaires_publication ON commentaires(publication_id, cree_le);
      ${(["publications", "reactions", "commentaires"] as const)
        .flatMap((tab) =>
          ["INSERT", "UPDATE", "DELETE"].map((quand) => {
            const r = quand === "DELETE" ? "OLD" : "NEW";
            return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${tab} AFTER ${quand} ON ${tab} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${tab}', ${r}.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          }),
        )
        .join("\n      ")}
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible", ...REGLAGES_55])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
      INSERT OR IGNORE INTO sync_journal (tab, cle, ms, supprime) SELECT 'reglages', x.cle, 0, 0 FROM reglages x
        WHERE x.cle IN (${REGLAGES_55.map((c) => `'${c}'`).join(", ")}) AND NOT EXISTS (SELECT 1 FROM sync_version v WHERE v.tab = 'reglages' AND v.cle = x.cle);
    `,
  },
  {
    version: 56,
    nom: "recup-nuit",
    temoin: "recup_nuit",
    // La Récupération pepfit (planche recuperation, validée le 31/10 ; numérotée après le Fil, déjà installé sur le Fold) :
    // les mesures brutes de chaque nuit, jamais le score
    // (recup-pepfit.ts le calcule à l'affichage). jour : AAAA-MM-JJ local du réveil (la même clé partout, MCP compris).
    // rmssd : VFC de la nuit (ms) ; fc_repos ; sommeil_min ; milieu_min : milieu de la nuit en minutes depuis midi la veille
    // (heure locale, 720 = minuit : la régularité se lit sans fuseau) ; besoin_min : besoin donné par le capteur, sinon NULL
    // (l'objectif du profil). source_sommeil : 'montre' (phases, Whoop) ou 'telephone' (la durée seule). rang : 4 VFC + 2 FC
    // + 2 sommeil de montre (1 du téléphone). Voyage (l'IA lit la Récupération, et un téléphone sans montre a les nuits de
    // l'autre) : une nuit n'est jamais remplacée par une nuit moins bien mesurée (sync/schema.ts) ; les mesures sont chiffrées
    // comme mesure_corps ; l'heure du calcul ne voyage pas seule.
    sql: `
      CREATE TABLE recup_nuit (
        jour TEXT PRIMARY KEY NOT NULL,
        rmssd REAL,
        fc_repos REAL,
        sommeil_min REAL,
        milieu_min REAL,
        besoin_min REAL,
        source_vfc TEXT,
        source_sommeil TEXT CHECK (source_sommeil IS NULL OR source_sommeil IN ('montre', 'telephone')),
        rang INTEGER NOT NULL DEFAULT 0,
        maj_le INTEGER NOT NULL
      );
      CREATE TRIGGER sync_i_recup_nuit AFTER INSERT ON recup_nuit WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_nuit', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_recup_nuit AFTER UPDATE ON recup_nuit WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (
          OLD.rmssd IS NOT NEW.rmssd OR OLD.fc_repos IS NOT NEW.fc_repos OR OLD.sommeil_min IS NOT NEW.sommeil_min
          OR OLD.milieu_min IS NOT NEW.milieu_min OR OLD.besoin_min IS NOT NEW.besoin_min OR OLD.source_vfc IS NOT NEW.source_vfc
          OR OLD.source_sommeil IS NOT NEW.source_sommeil OR OLD.rang IS NOT NEW.rang) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_nuit', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_recup_nuit AFTER DELETE ON recup_nuit WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_nuit', OLD.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
    `,
  },
  {
    version: 57,
    nom: "kcal-calibration",
    temoin: "temoin_kcal_calibration",
    // Calibration personnelle des kcal (docs/KCAL-CALIBRATION.md, demande d'Alex du 31/10) : les rapports mesure ÷ calcul
    // par famille de sport, appris sur le téléphone face aux kcal de Whoop, voyagent chiffrés comme les autres réglages (la
    // règle de la synchro complète) : la clé « kcal_calibration » rejoint la liste, les déclencheurs des réglages sont refaits
    // (comme aux migrations 52 et 55 ; aucune ligne à noter : la clé est neuve). La table vide ne sert que de témoin.
    sql: "CREATE TABLE temoin_kcal_calibration (fait INTEGER);\n      " + ["INSERT", "UPDATE", "DELETE"]
      .map((quand) => {
        const r = quand === "DELETE" ? "OLD" : "NEW";
        return `DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible", ...REGLAGES_55, ...REGLAGES_57])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
      })
      .join("\n      "),
  },
  {
    version: 58,
    nom: "cycle-jour",
    temoin: "cycle_jour",
    // Le suivi du cycle (planche cycle, validée le 31/10 ; NOTES § 2) : des jours de règles, jamais une phase, une
    // prévision ni un score (cycle/modele.ts recalcule tout). Une ligne par jour : flux (0 inconnue à 3 abondantes, les valeurs
    // de Santé Connect ; NULL : notes seules, pas de règles), fin (le dernier jour d'un épisode noté comme tel), les notes
    // facultatives (énergie, humeur : 1 à 3 ; gêne : 0 à 2), la source (saisie ou sante_connect) et l'identifiant Santé Connect.
    // La clé de synchro est un id tiré au hasard : le serveur ne voit ni le jour ni rien d'autre (toutes les colonnes partent
    // chiffrées, sauf maj_le). Le même jour créé sur deux appareils se fusionne sur l'index unique du jour : « ordre » fait
    // gagner la saisie sur Santé Connect, puis la plus ancienne (sync/schema.ts). Les réglages du suivi voyagent (liste refaite,
    // comme aux migrations 52, 55 et 57 ; aucune ligne à noter : les clés sont neuves). Jamais lue par le Fil ni par les coachs.
    sql: `
      CREATE TABLE cycle_jour (
        id TEXT PRIMARY KEY NOT NULL,
        jour TEXT NOT NULL,
        flux INTEGER CHECK (flux IS NULL OR flux IN (0, 1, 2, 3)),
        fin INTEGER NOT NULL DEFAULT 0,
        energie INTEGER CHECK (energie IS NULL OR energie IN (1, 2, 3)),
        humeur INTEGER CHECK (humeur IS NULL OR humeur IN (1, 2, 3)),
        gene INTEGER CHECK (gene IS NULL OR gene IN (0, 1, 2)),
        source TEXT NOT NULL CHECK (source IN ('saisie', 'sante_connect')),
        hc_id TEXT,
        ordre INTEGER NOT NULL,
        auteur TEXT NOT NULL DEFAULT 'moi',
        maj_le INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_cycle_jour_jour ON cycle_jour(jour);
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_cycle_jour AFTER ${quand} ON cycle_jour WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('cycle_jour', ${r}.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible", ...REGLAGES_55, ...REGLAGES_57, ...REGLAGES_58])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
    `,
  },
  {
    version: 59,
    nom: "recup-activite",
    temoin: "recup_activite",
    // « Récupérer » (planche recuperer, validée le 31/10 ; numérotée après le suivi du cycle, migration 58) : une table pour la sieste et
    // toutes les activités de récupération (recuperer.ts). On stocke les sessions, jamais un effet ni un score. type : sieste,
    // respiration, sauna, bain-froid, massage, rouleau, etirements, mobilite, marche, active (sans CHECK : un type ajouté par
    // une version plus récente arrive quand même par la synchro). mode : minuteur, libre, apres-coup, import.
    // duree_choisie_min : 20, 90… (NULL en libre ou à l'import) ; sommeil_min : le sommeil mesuré par l'appareil (sieste), NULL
    // sinon (recuperer.ts l'estime) ; fc_moy, fc_debut, fc_fin : s'il y a un capteur ; ressenti : repose, pareil, fatigue
    // (facultatif) ; sources : JSON (« ["pepfit","com.sec.android.app.shealth"] » après une fusion) ; id_externe : la session
    // Whoop ou Santé Connect fusionnée ou importée (empêche le réimport, même supprimée) ; supprime : suppression douce. Pas de
    // kcal : elles se recalculent à la lecture (kcal-seance.ts, sauna et bain froid aux MET), comme celles des séances.
    // Voyage (règle de la synchro complète) : les mesures et le ressenti chiffrés ; deux appareils qui importent la même
    // session (id_externe) n'en gardent qu'une, la plus ancienne (sync/schema.ts).
    // D2 : les séances passées de sauna, bain froid, massage, étirements et méditation (→ respiration) deviennent des activités de
    // récupération, sous un identifiant tiré de la séance (le même sur chaque appareil) ; leurs séances partent, partout. Le
    // yoga reste un sport. Les séances Whoop de ces sports ne sont plus gardées dans whoop_seance : elles arrivent ici.
    sql: `
      CREATE TABLE recup_activite (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        mode TEXT NOT NULL,
        duree_choisie_min INTEGER,
        sommeil_min REAL,
        fc_moy REAL,
        fc_debut REAL,
        fc_fin REAL,
        ressenti TEXT,
        sources TEXT NOT NULL DEFAULT '["pepfit"]',
        id_externe TEXT,
        supprime INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_recup_activite_debut ON recup_activite(debut);
      CREATE UNIQUE INDEX idx_recup_activite_externe ON recup_activite(id_externe) WHERE id_externe IS NOT NULL;
      CREATE TRIGGER sync_i_recup_activite AFTER INSERT ON recup_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_activite', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_recup_activite AFTER UPDATE ON recup_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_activite', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_recup_activite AFTER DELETE ON recup_activite WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_activite', OLD.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      INSERT OR IGNORE INTO recup_activite (id, type, debut, fin, mode, sources, id_externe, cree_le, maj_le)
        SELECT 'seance:' || x.id,
          CASE x.sport WHEN 'cat:sauna' THEN 'sauna' WHEN 'cat:bain-froid' THEN 'bain-froid' WHEN 'cat:massage' THEN 'massage'
            WHEN 'cat:etirements' THEN 'etirements' ELSE 'respiration' END,
          x.debut, x.fin,
          CASE WHEN x.source_ref LIKE 'whoop:%' THEN 'import' ELSE 'apres-coup' END,
          CASE WHEN x.source_ref LIKE 'whoop:%' THEN '["whoop"]' ELSE '["pepfit"]' END,
          CASE WHEN x.source_ref LIKE 'whoop:%' THEN x.source_ref END,
          x.debut, x.maj_le
        FROM (
          SELECT s.id, s.debut, s.fin, s.source_ref, s.maj_le,
            COALESCE(s.activite_id, (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id
              WHERE se.seance_id = s.id AND (e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation') ORDER BY se.position LIMIT 1)) AS sport
          FROM seances s WHERE s.fin IS NOT NULL
        ) x
        WHERE x.sport IN ('cat:sauna', 'cat:bain-froid', 'cat:massage', 'cat:etirements', 'cat:meditation');
      DELETE FROM seances WHERE id IN (SELECT substr(id, 8) FROM recup_activite WHERE id LIKE 'seance:%');
      DELETE FROM whoop_seance WHERE sport_id IN (233, 88, 121, 237, 128, 70);
    `,
  },
  {
    version: 60,
    nom: "jour-energie-whoop-ia",
    temoin: "jour_energie",
    // Parité appli ↔ IA, lot 2 (docs/PARITE-MCP.md, décision du 01/11). jour_energie : ce que l'appli a calculé pour un
    // jour (jour : AAAA-MM-JJ local), en JSON chiffré : depense (dépense du jour détaillée, apports, précision), seances (kcal
    // nettes et brutes de chaque séance, y compris Santé Connect et Whoop), age (Âge pepfit) et vo2max (VO2max retenu, VMA,
    // catégorie), les deux derniers sur la ligne du jour du calcul. whoop_brut_jour et whoop_brut_seance : les valeurs brutes de
    // Whoop (FC, VFC, SpO2, température cutanée, phases du sommeil, besoins et dette), jamais ses scores (strain, récupération,
    // performance et régularité du sommeil) ; elles ne sont écrites et ne voyagent que si « partage_whoop_ia » vaut « 1 »
    // (Données et confidentialité, éteint par défaut). Le réglage rejoint la liste synchronisée (déclencheurs refaits, comme aux
    // migrations 57 et 58 ; aucune ligne à noter : la clé est neuve). Le curseur de synchro repart de zéro : les lignes de ces
    // tables écrites par un autre appareil arrivent (D7 du MCP).
    sql: `
      CREATE TABLE jour_energie (
        jour TEXT PRIMARY KEY NOT NULL,
        depense TEXT NOT NULL,
        seances TEXT NOT NULL DEFAULT '[]',
        age TEXT,
        vo2max TEXT,
        maj_le INTEGER NOT NULL
      );
      CREATE TABLE whoop_brut_jour (
        jour TEXT PRIMARY KEY NOT NULL,
        valeurs TEXT NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE TABLE whoop_brut_seance (
        id TEXT PRIMARY KEY NOT NULL,
        valeurs TEXT NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE TRIGGER sync_i_jour_energie AFTER INSERT ON jour_energie WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('jour_energie', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_jour_energie AFTER UPDATE ON jour_energie WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (OLD.depense IS NOT NEW.depense OR OLD.seances IS NOT NEW.seances OR OLD.age IS NOT NEW.age OR OLD.vo2max IS NOT NEW.vo2max) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('jour_energie', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_jour_energie AFTER DELETE ON jour_energie WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('jour_energie', OLD.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_i_whoop_brut_jour AFTER INSERT ON whoop_brut_jour WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('whoop_brut_jour', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_whoop_brut_jour AFTER UPDATE ON whoop_brut_jour WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (OLD.valeurs IS NOT NEW.valeurs) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('whoop_brut_jour', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_whoop_brut_jour AFTER DELETE ON whoop_brut_jour WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('whoop_brut_jour', OLD.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_i_whoop_brut_seance AFTER INSERT ON whoop_brut_seance WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('whoop_brut_seance', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_whoop_brut_seance AFTER UPDATE ON whoop_brut_seance WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (OLD.valeurs IS NOT NEW.valeurs) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('whoop_brut_seance', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_whoop_brut_seance AFTER DELETE ON whoop_brut_seance WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('whoop_brut_seance', OLD.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible", ...REGLAGES_55, ...REGLAGES_57, ...REGLAGES_58, ...REGLAGES_60])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
      DELETE FROM sync_etat WHERE cle = 'curseur';
    `,
  },
  {
    version: 61,
    nom: "macros-reglages",
    temoin: "temoin_macros_reglages",
    // Macros (docs/CODE-MACROS.md, D15) : le niveau d'entraînement choisi (« nutri_niveau ») remplace le rythme en prise de muscle
    // et l'alerte de glucides (« nutri_alerte_glucides ») se règle sur tous les appareils ; les deux rejoignent la liste
    // synchronisée pour que l'IA (MCP) calcule les mêmes objectifs. Déclencheurs des réglages refaits (comme aux migrations 57 et
    // 60 ; aucune ligne à noter : les clés sont neuves). Les réponses des garde-fous (« nutri_declarations », D21) restent hors de
    // la liste : sur le téléphone seulement, ni synchronisées ni lues par l'IA. La table vide ne sert que de témoin.
    sql: "CREATE TABLE temoin_macros_reglages (fait INTEGER);\n      " + ["INSERT", "UPDATE", "DELETE"]
      .map((quand) => {
        const r = quand === "DELETE" ? "OLD" : "NEW";
        return `DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible", ...REGLAGES_55, ...REGLAGES_57, ...REGLAGES_58, ...REGLAGES_60, ...REGLAGES_61])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
      })
      .join("\n      "),
  },
  {
    version: 62,
    nom: "agenda-routines",
    temoin: "routines.visible",
    // Agenda ≠ routines (lot AF, 02/11 ; docs/AGENDA-ROUTINES.md) : une séance prévue a son propre contenu, une routine
    // cachée (visible = 0) créée avec sa programmation par un coach, une IA ou soi-même pour une date ; Mes routines ne montre
    // que les visibles. origine : moi, coach ou ia (« proposée par ton coach »). Séance d'un coach ou d'une IA (décision 3 du
    // 02/11) : version_origine garde la version reçue (JSON, chiffrée en synchro), modifie_par (moi, coach, ia) et modifie_le
    // la dernière retouche ; les déclencheurs agenda_modif_* notent « moi » à chaque retouche faite sur ce téléphone (pas
    // pendant la synchro) d'une routine qui a une version d'origine. Les routines existantes restent visibles et à soi
    // (défauts) : aucune ligne réécrite, rien ne part au serveur. Synchronisées avec la ligne (SELECT *) ; une ligne reçue sans
    // ces champs (MCP ou appli d'avant) prend les défauts.
    sql: `
      ALTER TABLE routines ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE routines ADD COLUMN origine TEXT NOT NULL DEFAULT 'moi';
      ALTER TABLE routines ADD COLUMN version_origine TEXT;
      ALTER TABLE routines ADD COLUMN modifie_par TEXT;
      ALTER TABLE routines ADD COLUMN modifie_le INTEGER;
      CREATE TRIGGER agenda_modif_routine AFTER UPDATE OF nom, note, type, format, format_valeur ON routines
        WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND OLD.version_origine IS NOT NULL AND NEW.version_origine IS NOT NULL
          AND (OLD.nom IS NOT NEW.nom OR OLD.note IS NOT NEW.note OR OLD.type IS NOT NEW.type OR OLD.format IS NOT NEW.format
            OR OLD.format_valeur IS NOT NEW.format_valeur) BEGIN
        UPDATE routines SET modifie_par = 'moi', modifie_le = ${MS_SQL} WHERE id = NEW.id;
      END;
      ${(
        [
          ["routine_exercices", "R.routine_id", ""],
          ["routine_series", "(SELECT routine_id FROM routine_exercices WHERE id = R.ligne_id)", ""],
          ["notes", "(SELECT routine_id FROM routine_exercices WHERE id = R.ligne_id)", " AND R.type = 'routine'"],
        ] as const
      )
        .flatMap(([tab, routine, filtre]) =>
          ["INSERT", "UPDATE", "DELETE"].map((quand) => {
            const r = quand === "DELETE" ? "OLD" : "NEW";
            return `CREATE TRIGGER agenda_modif_${quand[0]!.toLowerCase()}_${tab} AFTER ${quand} ON ${tab} WHEN NOT EXISTS (SELECT 1 FROM sync_silence)${filtre.replaceAll("R.", `${r}.`)} BEGIN
        UPDATE routines SET modifie_par = 'moi', modifie_le = ${MS_SQL} WHERE id = ${routine.replaceAll("R.", `${r}.`)} AND version_origine IS NOT NULL;
      END;`;
          }),
        )
        .join("\n      ")}
    `,
  },
  {
    version: 63,
    nom: "agenda-telephone",
    temoin: "agenda_liens",
    // Agenda du téléphone (planche agenda-ics, D11 à D13 ; docs/CODE-AGENDA.md) : pour chaque séance prévue écrite dans
    // l'agenda (clé « programmation|jour d'origine »), l'événement écrit, ses heures au dernier passage et son état (écrite,
    // déplacée dans l'agenda, retirée de l'agenda). Locale : les identifiants d'événement sont propres à ce téléphone.
    sql: `
      CREATE TABLE agenda_liens (
        cle TEXT PRIMARY KEY,
        programmation_id TEXT NOT NULL,
        date_origine TEXT NOT NULL,
        evenement_id TEXT NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        etat TEXT NOT NULL DEFAULT 'ecrite' CHECK (etat IN ('ecrite', 'deplacee', 'retiree')),
        maj_le INTEGER NOT NULL
      );
    `,
  },
  {
    version: 64,
    nom: "agenda-telephone-ajustements",
    temoin: "agenda_liens.contenu",
    // Agenda du téléphone, retours du 03/11 (docs/CODE-AGENDA.md § 6) : `vu`, l'événement a été relu une fois sous son
    // identifiant (avant, il ne peut pas être dit « retiré ») ; `contenu`, empreinte du titre, du lieu et de la description
    // écrits (un changement de format réécrit l'événement). Les liens d'avant partent non vus et sans empreinte.
    sql: `
      ALTER TABLE agenda_liens ADD COLUMN vu INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE agenda_liens ADD COLUMN contenu TEXT;
    `,
  },
  {
    version: 65,
    nom: "blessure-type-signes",
    temoin: "blessure.type",
    // Articulations (planche articulations, D5 ; docs/CODE-ARTICULATIONS.md) : `blessure.type` (muscle, articulation, autre) et
    // `blessure_journal.signes` (« raideur|gonflement », facultatif). L'existant est rangé d'après la zone : un muscle connu
    // reste « muscle », une articulation connue devient « articulation », le reste (texte libre, zone vide) « autre ». Ce
    // classement se fait journal coupé : rien ne part au serveur (une ligne locale pas encore à jour écraserait une écriture
    // plus récente d'un autre appareil) ; une ligne sans type, au serveur ou reçue d'une appli d'avant, se lit d'après sa zone
    // (zones-blessure.ts, typeBlessure). Sans défaut : NULL = « déduit de la zone ». Les deux colonnes voyagent chiffrées.
    sql: `
      ALTER TABLE blessure ADD COLUMN type TEXT CHECK (type IN ('muscle', 'articulation', 'autre'));
      ALTER TABLE blessure_journal ADD COLUMN signes TEXT;
      CREATE TEMP TABLE m65_silence AS SELECT COUNT(*) AS n FROM sync_silence;
      INSERT OR IGNORE INTO sync_silence (un) VALUES (1);
      UPDATE blessure SET type = CASE
        WHEN zone IN ${sqlListe(IDS_MUSCLES)} THEN 'muscle'
        WHEN zone IN ${sqlListe(IDS_ARTICULATIONS)} THEN 'articulation'
        ELSE 'autre' END;
      DELETE FROM sync_silence WHERE (SELECT n FROM m65_silence) = 0;
      DROP TABLE m65_silence;
    `,
  },
  {
    version: 66,
    nom: "effort-series",
    temoin: "seance_charge.muscu",
    // L'Effort de la muscu à ses séries (docs/CODE-EFFORT-CHARGE.md, 03/11) : `muscu`, les points des séries (ressenti mêlé,
    // habitude comprise) ; `series`, combien de séries de travail. NULL : séance mesurée sans ses séries. La part musculaire
    // et la part cardio d'une séance s'en lisent (muscu ÷ charge), jamais stockées. Elles voyagent avec la ligne : le
    // déclencheur de mise à jour les suit aussi. Les lignes d'avant seront recalculées (CHARGE_EFFORT, version 3).
    sql: `
      ALTER TABLE seance_charge ADD COLUMN muscu REAL;
      ALTER TABLE seance_charge ADD COLUMN series INTEGER;
      DROP TRIGGER IF EXISTS sync_u_seance_charge;
      CREATE TRIGGER sync_u_seance_charge AFTER UPDATE ON seance_charge WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (
          OLD.charge IS NOT NEW.charge OR OLD.methode IS NOT NEW.methode OR OLD.estime IS NOT NEW.estime OR OLD.minutes IS NOT NEW.minutes
          OR OLD.zones IS NOT NEW.zones OR OLD.ressenti IS NOT NEW.ressenti OR OLD.source_fc IS NOT NEW.source_fc OR OLD.avec_fc IS NOT NEW.avec_fc
          OR OLD.version IS NOT NEW.version OR OLD.muscu IS NOT NEW.muscu OR OLD.series IS NOT NEW.series) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('seance_charge', NEW.seance_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
    `,
  },
  {
    version: 67,
    nom: "materiel-lieu",
    temoin: "salle_materiel",
    // Matériel d'un lieu (planche materiel, validée le 03/11 ; docs/CODE-MATERIEL.md). salle_materiel : une ligne par élément
    // possédé (D1) ; genre halteres, kettlebell, leste (une liste de poids), reglables (poignées et disques), barre (forme,
    // poids propre, nombre, charge maximale, disques par côté, trou ; ou pré-chargées : une liste), disques (un jeu par trou :
    // [{kg, paires}]). Les valeurs sont dans l'unité de la ligne. exercice_materiel : la barre choisie pour un exercice dans un
    // lieu (D8). appareil.min_val : première charge d'une pile, poids à vide d'une machine à disques ; appareil.appoint : les
    // petites masses (D10). salle.postes : postes et cardio cochés, par clé fine (natures.ts, POSTES_LIEU).
    // Reprise (D12), journal coupé, ids tirés de la salle (deux téléphones qui migrent la même salle écrivent la même ligne),
    // notées à l'heure 0 : elles partent au serveur, mais ce qui y est déjà gagne. Plage ou liste vers une liste ; la barre vers
    // une barre droite de son poids ; ses disques, inconnus, vers un jeu vide « à vérifier ». salle_poids_libre reste lue une
    // version (rien ne l'écrit plus), puis part.
    sql: `
      CREATE TABLE salle_materiel (
        id TEXT PRIMARY KEY NOT NULL,
        salle_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        genre TEXT NOT NULL CHECK (genre IN ('halteres', 'kettlebell', 'leste', 'reglables', 'barre', 'disques')),
        forme TEXT,
        nom TEXT,
        poids TEXT NOT NULL DEFAULT '[]',
        poids_propre REAL,
        nombre INTEGER,
        charge_max REAL,
        max_par_cote INTEGER,
        trou TEXT,
        prechargee INTEGER NOT NULL DEFAULT 0,
        disques TEXT NOT NULL DEFAULT '[]',
        unite TEXT NOT NULL DEFAULT 'kg' CHECK (unite IN ('kg', 'lbs')),
        a_verifier INTEGER NOT NULL DEFAULT 0,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_salle_materiel_salle ON salle_materiel(salle_id);
      CREATE TABLE exercice_materiel (
        exercice_id TEXT NOT NULL,
        salle_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
        materiel_id TEXT NOT NULL,
        maj_le INTEGER NOT NULL,
        PRIMARY KEY (exercice_id, salle_id)
      );
      ALTER TABLE appareil ADD COLUMN min_val REAL;
      ALTER TABLE appareil ADD COLUMN appoint TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE salle ADD COLUMN postes TEXT NOT NULL DEFAULT '';
      ${(
        [
          ["salle_materiel", "{r}.id"],
          ["exercice_materiel", "{r}.exercice_id || '|' || {r}.salle_id"],
        ] as const
      )
        .map(([t, cle]) => {
          const trig = (quand: string, r: string, supprime: number) =>
            `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_${t} AFTER ${quand} ON ${t} WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('${t}', ${cle.replaceAll("{r}", r)}, ${MS_SQL}, ${supprime})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
          return [trig("INSERT", "NEW", 0), trig("UPDATE", "NEW", 0), trig("DELETE", "OLD", 1)].join("\n      ");
        })
        .join("\n      ")}
      CREATE TEMP TABLE m67_silence AS SELECT COUNT(*) AS n FROM sync_silence;
      INSERT OR IGNORE INTO sync_silence (un) VALUES (1);
      WITH RECURSIVE p(salle_id, type, v, fin, pas, n) AS (
        SELECT salle_id, type, min_val, max_val, pas, 0 FROM salle_poids_libre
        WHERE type IN ('halteres', 'kettlebell') AND liste = '[]' AND min_val IS NOT NULL AND max_val IS NOT NULL AND pas > 0 AND max_val >= min_val
        UNION ALL
        SELECT salle_id, type, round(v + pas, 2), fin, pas, n + 1 FROM p WHERE v + pas <= fin + 0.001 AND n < 119
      )
      INSERT OR IGNORE INTO salle_materiel (id, salle_id, genre, poids, unite, cree_le, maj_le)
      SELECT 'pl:' || l.salle_id || ':' || l.type, l.salle_id, l.type,
        CASE
          WHEN l.liste <> '[]' THEN l.liste
          WHEN EXISTS (SELECT 1 FROM p WHERE p.salle_id = l.salle_id AND p.type = l.type)
            THEN (SELECT json_group_array(CASE WHEN v = CAST(v AS INTEGER) THEN CAST(v AS INTEGER) ELSE v END) FROM (SELECT v FROM p WHERE p.salle_id = l.salle_id AND p.type = l.type ORDER BY v))
          WHEN l.min_val IS NOT NULL AND l.max_val IS NOT NULL AND l.max_val > l.min_val THEN json_array(${ENTIER_SQL('l.min_val')}, ${ENTIER_SQL('l.max_val')})
          WHEN COALESCE(l.min_val, l.max_val) IS NOT NULL THEN json_array(${ENTIER_SQL('COALESCE(l.min_val, l.max_val)')})
          ELSE '[]' END,
        l.unite, ${MS_SQL}, ${MS_SQL}
      FROM salle_poids_libre l WHERE l.type IN ('halteres', 'kettlebell');
      DELETE FROM salle_materiel WHERE id LIKE 'pl:%' AND poids = '[]';
      INSERT OR IGNORE INTO salle_materiel (id, salle_id, genre, forme, poids_propre, nombre, charge_max, trou, unite, cree_le, maj_le)
      SELECT 'pl:' || salle_id || ':barre', salle_id, 'barre', 'droite', COALESCE(min_val, CASE unite WHEN 'lbs' THEN 45 ELSE 20 END), 1, max_val, '50',
        unite, ${MS_SQL}, ${MS_SQL}
      FROM salle_poids_libre WHERE type = 'barre';
      INSERT OR IGNORE INTO salle_materiel (id, salle_id, genre, trou, disques, unite, a_verifier, cree_le, maj_le)
      SELECT 'pl:' || salle_id || ':disques', salle_id, 'disques', '50', '[]', unite, 1, ${MS_SQL}, ${MS_SQL}
      FROM salle_poids_libre WHERE type = 'barre';
      INSERT OR IGNORE INTO sync_journal (tab, cle, ms, supprime)
      SELECT 'salle_materiel', m.id, 0, 0 FROM salle_materiel m
      WHERE m.id LIKE 'pl:%' AND NOT EXISTS (SELECT 1 FROM sync_version v WHERE v.tab = 'salle_materiel' AND v.cle = m.id);
      UPDATE salle SET postes = trim(
        CASE WHEN '|' || equipements || '|' LIKE '%|barre_fixe|%' THEN 'barre_traction|' ELSE '' END ||
        CASE WHEN '|' || equipements || '|' LIKE '%|elastique|%' THEN 'elastiques' ELSE '' END, '|')
      -- un lieu d'OpenStreetMap part avec tous les équipements cochés (filtre des exercices) : ce n'est pas un inventaire
      WHERE equipements <> 'poids_du_corps|barre|halteres|kettlebell|machine|poulie|smith|barre_fixe|elastique|cardio|disque|autre';
      DELETE FROM sync_silence WHERE (SELECT n FROM m67_silence) = 0;
      DROP TABLE m67_silence;
    `,
  },
  {
    version: 68,
    nom: "lieu-seance-prevue",
    temoin: "programmation_lieux",
    // Lieu d'une séance prévue (retour du 03/11 ; docs/LIEU-SEANCE-FUTURE.md) : une ligne par occurrence (la
    // programmation et son jour d'origine, comme programmation_exceptions), donc « cette séance seulement » pour une règle qui
    // se répète. lieu_id NULL : « Aucun lieu » choisi. Pas de clé étrangère vers salle (la ligne peut arriver par la synchro
    // avant son lieu) : un lieu disparu se lit comme rien de choisi. Synchronisée.
    sql: `
      CREATE TABLE programmation_lieux (
        id TEXT PRIMARY KEY NOT NULL,
        programmation_id TEXT NOT NULL REFERENCES programmations(id) ON DELETE CASCADE,
        date_origine TEXT NOT NULL,
        lieu_id TEXT,
        maj_le INTEGER NOT NULL,
        UNIQUE (programmation_id, date_origine)
      );
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_programmation_lieux AFTER ${quand} ON programmation_lieux WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('programmation_lieux', ${r}.id, ${MS_SQL}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
    `,
  },
  {
    version: 69,
    nom: "seances-groupe-cache",
    temoin: "seances_groupe_cache",
    // Séance à plusieurs (planche seance-live, lot L2 ; docs/CODE-SEANCE-PLUSIEURS.md) : la dernière vue reçue du serveur pour
    // chaque séance, telle quelle (JSON), et l'heure du chargement. Hors ligne, l'appli montre ce qui était chargé (G1) ;
    // l'agenda du téléphone et le lien d'agenda la lisent. Locale : la fiche vit sur le serveur, rien n'est synchronisé ni
    // sauvegardé (docs/SYNC-COMPLETE.md).
    sql: `
      CREATE TABLE seances_groupe_cache (
        id TEXT PRIMARY KEY NOT NULL,
        vue TEXT NOT NULL,
        debut INTEGER NOT NULL,
        charge_le INTEGER NOT NULL
      );
      CREATE INDEX idx_seances_groupe_cache_debut ON seances_groupe_cache(debut);
    `,
  },
  {
    version: 70,
    nom: "exercices-perso",
    temoin: "exercices.photo",
    // Exercices perso (planche exercices-perso, validée le 03/11 ; docs/CODE-EXERCICES-PERSO.md). La photo d'un exercice (D2) :
    // photo et vignette dans documents/photos, comme celle d'un plat ; photo_distante, posée par la synchro, dit qu'elle est
    // partie (chiffrée par le moteur, photos). machine_id : la machine du catalogue (db/machines.ts) pour Machine, Poulie ou
    // Machine Smith ; NULL = « Sans précision » (D4). seance_exercices.rir : le ressenti visé changé pendant la séance (D6),
    // pour elle seule ; NULL = celui de la ligne de routine, -1 = « Aucun ». Colonnes parties avec leurs lignes (SELECT *).
    sql: `
      ALTER TABLE exercices ADD COLUMN photo TEXT;
      ALTER TABLE exercices ADD COLUMN photo_vignette TEXT;
      ALTER TABLE exercices ADD COLUMN photo_distante TEXT;
      ALTER TABLE exercices ADD COLUMN machine_id TEXT;
      ALTER TABLE seance_exercices ADD COLUMN rir INTEGER;
    `,
  },
  {
    version: 71,
    nom: "reactions-une-par-auteur",
    temoin: "idx_reactions_auteur",
    // Une réaction par membre et par publication (planche social-cercles D29, validée ; docs/CODE-SOCIAL.md) : changer d'émoji
    // remplace l'ancien. Avant, un membre pouvait poser les cinq ; on garde la plus récente (la suppression des autres part à
    // la synchro), puis l'index unique passe à (publication, auteur).
    sql: `
      DELETE FROM reactions WHERE EXISTS (
        SELECT 1 FROM reactions r WHERE r.publication_id = reactions.publication_id AND r.auteur = reactions.auteur
          AND (r.cree_le > reactions.cree_le OR (r.cree_le = reactions.cree_le AND r.id > reactions.id))
      );
      DROP INDEX IF EXISTS idx_reactions_unique;
      CREATE UNIQUE INDEX idx_reactions_auteur ON reactions(publication_id, auteur);
    `,
  },
  {
    version: 72,
    nom: "social-cache",
    temoin: "social_cache",
    // Social hors ligne (planche social-cercles D31, S2 ; docs/CODE-SOCIAL.md) : la dernière réponse du serveur pour chaque vue
    // (ton profil, un profil, tes cercles, la page d'un cercle, ses publications), telle quelle (JSON). Les contenus y restent
    // chiffrés par la clé de leur groupe (copie chiffrée) ; le cache est vidé à la déconnexion et ce qui a plus de 7 jours part.
    // Locale : ni synchronisée ni sauvegardée.
    sql: `
      CREATE TABLE social_cache (
        cle TEXT PRIMARY KEY NOT NULL,
        vue TEXT NOT NULL,
        charge_le INTEGER NOT NULL
      );
      CREATE INDEX idx_social_cache_charge ON social_cache(charge_le);
    `,
  },
  {
    version: 73,
    nom: "seances-groupe-miennes",
    temoin: "seances_groupe_miennes",
    // Direct sur écran et fin de séance pour tous (planche seance-live, lots L6 et L7 ; docs/CODE-LIVE-APPLI.md) : la séance
    // à plusieurs que tu as rejointe par « Participer » et ta séance à toi, commencée avec elle. Le téléphone suit la séance
    // du groupe pour se fermer avec elle (D17) : fermee_le, l'heure où l'appli l'a fermée (« Rouvrir » 10 minutes),
    // hors_ligne, vue fermée plus d'une minute après la fin du coach ; rouverte, « Rouvrir » touché (le groupe ne la referme
    // plus). ecran, code, cle (clé PUBLIQUE de l'écran), fc, nom :
    // de quoi revenir sur l'écran après un redémarrage du relais. Locale : ni synchronisée ni sauvegardée (docs/SYNC-COMPLETE.md).
    sql: `
      CREATE TABLE seances_groupe_miennes (
        groupe TEXT PRIMARY KEY NOT NULL,
        seance_id TEXT,
        avec TEXT NOT NULL DEFAULT '',
        debut_groupe INTEGER NOT NULL,
        ecran TEXT,
        code TEXT,
        cle TEXT,
        fc INTEGER NOT NULL DEFAULT 0,
        nom TEXT NOT NULL DEFAULT '',
        fermee_le INTEGER,
        hors_ligne INTEGER NOT NULL DEFAULT 0,
        rouverte INTEGER NOT NULL DEFAULT 0,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_seances_groupe_miennes_seance ON seances_groupe_miennes(seance_id);
    `,
  },
  {
    version: 74,
    nom: "annuaire-lieux",
    temoin: "annuaire_zone",
    // Annuaire pepfit des lieux (docs/CODE-ANNUAIRE-LIEUX.md). annuaire_zone : la dernière liste reçue de chaque zone d'un
    // degré (« 48_2 »), son ETag et l'heure du chargement : l'annuaire hors ligne. Locale : un cache de la liste publique, ni
    // synchronisé ni sauvegardé. salle.annuaire_non : les fiches de l'annuaire que la personne a dit ne pas être ce lieu
    // (« Non » à « C'est le même lieu que … ? »), clés séparées par « | » ; part avec la ligne (SELECT *), chiffrée.
    sql: `
      CREATE TABLE annuaire_zone (
        zone TEXT PRIMARY KEY NOT NULL,
        etag TEXT,
        lieux TEXT NOT NULL DEFAULT '[]',
        charge_le INTEGER NOT NULL
      );
      ALTER TABLE salle ADD COLUMN annuaire_non TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 75,
    nom: "mensurations-origine",
    temoin: "mensurations.origine",
    // Fiches gérées, lot 2 (src/coach/suivi.ts) : un tour noté par un coach, puis récupéré, garde son auteur
    // (« coach:<pseudo> ») ; null pour un tour pris soi-même. Comme pesee.origine et mesure_corps.origine : D2, deux mesures du
    // même jour restent chacune avec son auteur. Part avec la ligne (SELECT *) ; une ligne reçue sans ce champ : null.
    sql: `
      ALTER TABLE mensurations ADD COLUMN origine TEXT;
    `,
  },
  {
    version: 76,
    nom: "recup-nuit-sources",
    temoin: "recup_nuit.source_nuit",
    // Conformité Whoop, point 1 (docs/CODE-CONFORMITE-WHOOP.md) : l'IA ne lit une mesure venue de Whoop que si la personne l'a
    // permis (réglage partage_whoop_ia). source_vfc le disait déjà pour la VFC ; source_fc et source_nuit le disent pour la FC
    // au repos et le sommeil ('whoop' : l'API de Whoop ou ce que l'appli Whoop dépose dans Santé Connect ; sinon la source de
    // la mesure, 'sante_connect' pour une nuit). Les nuits déjà là sont marquées depuis whoop_jour (même règle que
    // ecrireNuitsRecup : Whoop par-dessus) et repartent à la synchro.
    sql: `
      ALTER TABLE recup_nuit ADD COLUMN source_fc TEXT;
      ALTER TABLE recup_nuit ADD COLUMN source_nuit TEXT;
      DROP TRIGGER IF EXISTS sync_u_recup_nuit;
      CREATE TRIGGER sync_u_recup_nuit AFTER UPDATE ON recup_nuit WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND (
          OLD.rmssd IS NOT NEW.rmssd OR OLD.fc_repos IS NOT NEW.fc_repos OR OLD.sommeil_min IS NOT NEW.sommeil_min
          OR OLD.milieu_min IS NOT NEW.milieu_min OR OLD.besoin_min IS NOT NEW.besoin_min OR OLD.source_vfc IS NOT NEW.source_vfc
          OR OLD.source_sommeil IS NOT NEW.source_sommeil OR OLD.rang IS NOT NEW.rang
          OR OLD.source_fc IS NOT NEW.source_fc OR OLD.source_nuit IS NOT NEW.source_nuit) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('recup_nuit', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      UPDATE recup_nuit SET source_fc = 'whoop' WHERE fc_repos IS NOT NULL AND EXISTS (SELECT 1 FROM whoop_jour w
        WHERE date(w.jour / 1000, 'unixepoch', 'localtime') = recup_nuit.jour AND w.fc_repos IS NOT NULL);
      UPDATE recup_nuit SET source_nuit = 'whoop' WHERE sommeil_min IS NOT NULL AND EXISTS (SELECT 1 FROM whoop_jour w
        WHERE date(w.jour / 1000, 'unixepoch', 'localtime') = recup_nuit.jour AND w.sommeil_min > 0 AND w.sommeil_fin IS NOT NULL);
    `,
  },
  {
    version: 77,
    nom: "accord-journal",
    temoin: "accord_journal",
    // Conformité Whoop, point 5 (docs/CODE-CONFORMITE-WHOOP.md) : la trace de l'accord « Laisser l'IA lire tes mesures Whoop ».
    // Une ligne par geste, jamais modifiée : accord (avec la version du texte montré et la langue), retrait, ou « constate »
    // (l'interrupteur était déjà allumé avant ce journal : ni date ni version connues, rien n'est inventé). Aucune donnée de
    // santé. Synchronisée (sync/schema.ts) : action, version et langue chiffrées ; l'accord et l'heure en clair.
    sql: `
      CREATE TABLE accord_journal (
        id TEXT PRIMARY KEY NOT NULL,
        accord TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('accord', 'retrait', 'constate')),
        version TEXT,
        langue TEXT,
        ms INTEGER NOT NULL
      );
      CREATE INDEX idx_accord_journal ON accord_journal(accord, ms);
      CREATE TRIGGER sync_i_accord_journal AFTER INSERT ON accord_journal WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('accord_journal', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_accord_journal AFTER UPDATE ON accord_journal WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('accord_journal', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_accord_journal AFTER DELETE ON accord_journal WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('accord_journal', OLD.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      INSERT INTO accord_journal (id, accord, action, version, langue, ms)
        SELECT 'constate-whoop_ia', 'whoop_ia', 'constate', NULL, NULL, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        FROM reglages WHERE cle = 'partage_whoop_ia' AND valeur = '1';
    `,
  },
  {
    version: 90,
    nom: "seance-prevue-reglages",
    temoin: "programmation_reglages",
    // Réglages d'une séance prévue, parcours unifié (planche ajout-seance-v2, D4 et D11) : le sport choisi sur la feuille, la
    // durée voulue (NULL : « Définir durée », jusqu'à 48 h) et « sans heure » (séance d'aujourd'hui seulement : l'heure de
    // démarrage fixe le début). Une ligne par programmation (une séance propre est une règle « unique »). Synchronisée.
    sql: `
      CREATE TABLE programmation_reglages (
        id TEXT PRIMARY KEY NOT NULL,
        programmation_id TEXT NOT NULL UNIQUE REFERENCES programmations(id) ON DELETE CASCADE,
        sport TEXT,
        duree_min INTEGER CHECK (duree_min IS NULL OR (duree_min >= 0 AND duree_min <= 2880)),
        sans_heure INTEGER NOT NULL DEFAULT 0,
        maj_le INTEGER NOT NULL
      );
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_programmation_reglages AFTER ${quand} ON programmation_reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('programmation_reglages', ${r}.id, ${MS_SQL}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
    `,
  },
  {
    version: 100,
    nom: "exercice-coach",
    temoin: "exercices.coach",
    // Étiquette « De <coach> » (restes du coach) : le prénom du coach dont vient un exercice créé à l'ajout d'un envoi
    // (coach/ajout.ts). NULL : un exercice du catalogue ou à soi. Part avec la ligne (SELECT *), chiffré (sync/schema.ts).
    sql: `
      ALTER TABLE exercices ADD COLUMN coach TEXT;
    `,
  },
  {
    version: 160,
    nom: "withings-jour",
    temoin: "withings_jour",
    // Activité et sommeil lus chez Withings (montres et bracelets : API Measure v2 getactivity et Sleep v2 getsummary), un
    // résumé par jour comme whoop_jour (locale, jamais synchronisée). jour : minuit local (ms) de la date donnée par Withings
    // (le jour de réveil pour le sommeil, le jour de l'activité sinon). Un champ inconnu reste NULL et laisse l'ancien à la
    // relecture. Durées en minutes, distance en mètres, kcal actives (« calories » de Withings, sans le métabolisme).
    sql: `
      CREATE TABLE withings_jour (
        jour INTEGER PRIMARY KEY NOT NULL,
        pas INTEGER, distance_m REAL, kcal_actives REAL, kcal_totales REAL,
        fc_moy REAL, fc_min REAL, fc_max REAL,
        sommeil_debut INTEGER, sommeil_fin INTEGER, sommeil_min REAL, au_lit_min REAL,
        leger_min REAL, profond_min REAL, paradoxal_min REAL, eveil_min REAL, reveils INTEGER,
        score_sommeil REAL, fc_nuit_moy REAL, fc_nuit_min REAL, respiration REAL,
        maj_le INTEGER NOT NULL
      );
    `,
  },
  {
    version: 170,
    nom: "withings-fc-repos",
    temoin: "withings_jour.fc_repos",
    // FC au repos de la nuit, calculée sur la FC par minute de Withings (getintradayactivity) comme celle de Santé Connect
    // (fc-repos-nuit.ts) : la plus basse moyenne sur 30 minutes de la nuit. Distincte de fc_nuit_min (le plus bas de la nuit).
    sql: `ALTER TABLE withings_jour ADD COLUMN fc_repos REAL;`,
  },
  {
    version: 180,
    nom: "lieu-machines-signaux",
    temoin: "lieu_machine_signal",
    // Machines des lieux, estimées d'après les activités (docs/CODE-LIEU-MACHINES.md). Deux tables LOCALES, jamais synchronisées :
    // ce que ce téléphone a signalé au serveur (une ligne par lieu et machine : l'état, la fourchette de charge, envoyé ou non, pas
    // avant telle heure pour l'envoi différé), et les lieux dont les signaux restent à retirer (réglage éteint). Le serveur ne garde
    // que des jetons sans lien entre eux ; ces deux tables sont le seul endroit où le téléphone sait ce qu'il a signalé.
    sql: `
      CREATE TABLE lieu_machine_signal (
        lieu TEXT NOT NULL,
        machine TEXT NOT NULL,
        etat TEXT NOT NULL CHECK (etat IN ('p','a')),
        kg_min INTEGER,
        kg_max INTEGER,
        envoye INTEGER NOT NULL DEFAULT 0,
        apres INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (lieu, machine)
      );
      CREATE INDEX idx_lieu_machine_signal_attente ON lieu_machine_signal(envoye, apres);
      CREATE TABLE lieu_machine_retrait (
        lieu TEXT PRIMARY KEY NOT NULL
      );
    `,
  },
  {
    version: 181,
    nom: "message-seance",
    temoin: "seances.message",
    // Message d'une activité (planche Effort, D2 et D3) : le texte que la personne écrit à la fin d'une séance, lu avec l'activité
    // quand elle est partagée. 280 signes au plus (messageValable). Distinct de `note`, qui reste privée. Synchronisé avec la ligne
    // (SELECT *), chiffré comme la note.
    sql: `
      ALTER TABLE seances ADD COLUMN message TEXT;
    `,
  },
  {
    version: 182,
    nom: "horaires-modifiables",
    temoin: "sommeil_horaires",
    // Horaires modifiables de toute activité (planche Effort v2, D6 et D7). Une activité importée (Santé Connect, montre) que la
    // personne a modifiée garde ses horaires d'origine à côté (`debut_orig`, `fin_orig` : null tant qu'elle n'est pas modifiée) ;
    // « Rétablir » les remet, et l'import suivant met à jour l'original sans écraser la modification (clé : source et identifiant).
    // Une nuit n'a pas de ligne locale (elle est lue chez Whoop, Santé Connect, Withings) : ses horaires modifiés sont ici, par
    // jour de réveil d'origine (`jour`, AAAA-MM-JJ), avec l'original lu au moment de la modification. Synchronisée comme les autres.
    sql: `
      ALTER TABLE seances ADD COLUMN debut_orig INTEGER;
      ALTER TABLE seances ADD COLUMN fin_orig INTEGER;
      ALTER TABLE recup_activite ADD COLUMN debut_orig INTEGER;
      ALTER TABLE recup_activite ADD COLUMN fin_orig INTEGER;
      CREATE TABLE sommeil_horaires (
        jour TEXT PRIMARY KEY NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        debut_orig INTEGER NOT NULL,
        fin_orig INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE TRIGGER sync_i_sommeil_horaires AFTER INSERT ON sommeil_horaires WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('sommeil_horaires', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_u_sommeil_horaires AFTER UPDATE ON sommeil_horaires WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('sommeil_horaires', NEW.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
      CREATE TRIGGER sync_d_sommeil_horaires AFTER DELETE ON sommeil_horaires WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('sommeil_horaires', OLD.jour, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;
    `,
  },
  {
    version: 184,
    nom: "activites-gardees",
    temoin: "temoin_activites_gardees",
    // Réparation (6/11) : déconnecter Whoop supprimait les séances créées pour lui, dont celles qu'une activité validée (ou reconnue
    // d'office) avait fait naître : la ligne `activite_detectee` restait « associee » avec une séance disparue, et la FC de la montre
    // reproposait le même créneau (« Padel ? »). La séance est recréée, avec son id, SEULEMENT quand c'est sûr : l'activité est
    // associée, sa séance n'existe plus, aucune autre séance ne couvre son créneau (10 min près) et le choix de sport que la
    // personne a fait pour cette séance est encore là (reconnaissance_choix) : titre = nom du sport, une série de la durée. Les
    // reconnues d'office n'ont pas de choix gardé : rien n'est inventé, elles ne sont pas recréées (la reconnaissance les reposera
    // d'elle-même au prochain passage). La source (`whoop:`) devient
    // `ancien-whoop:` (la séance ne dépend plus de Whoop). Les propositions « à associer » que couvre une activité associée (dont la séance existe) sont retirées.
    sql: `
      CREATE TABLE temoin_activites_gardees (fait INTEGER);
      INSERT INTO seances (id, titre, debut, fin, source_ref, reconnu, maj_le)
        SELECT a.seance_id,
               e.nom,
               a.debut,
               a.fin,
               CASE WHEN a.cle LIKE 'whoop:%' THEN 'ancien-whoop:' || substr(a.cle, 7) ELSE a.cle END,
               '__repare__',
               CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        FROM activite_detectee a
        JOIN reconnaissance_choix c ON c.id = (SELECT c2.id FROM reconnaissance_choix c2 WHERE c2.seance_id = a.seance_id AND c2.detectee = 1 ORDER BY c2.le DESC LIMIT 1)
        JOIN exercices e ON e.id = c.sport
        WHERE a.etat = 'associee' AND a.seance_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM seances s WHERE s.id = a.seance_id)
          AND NOT EXISTS (SELECT 1 FROM seances s2 WHERE s2.fin IS NOT NULL AND s2.debut < a.fin + 600000 AND s2.fin > a.debut - 600000);
      INSERT INTO seance_exercices (seance_id, exercice_id, position)
        SELECT s.id, (SELECT c.sport FROM reconnaissance_choix c WHERE c.seance_id = s.id AND c.detectee = 1 ORDER BY c.le DESC LIMIT 1), 0
        FROM seances s WHERE s.reconnu = '__repare__';
      INSERT INTO series (id, seance_id, exercice_id, position, type, duree_s, faite, fait_le)
        SELECT lower(hex(randomblob(16))), s.id, x.exercice_id, 0, 'normale', (s.fin - s.debut) / 1000, 1, s.fin
        FROM seances s JOIN seance_exercices x ON x.seance_id = s.id WHERE s.reconnu = '__repare__';
      UPDATE seances SET reconnu = NULL WHERE reconnu = '__repare__';
      DELETE FROM activite_detectee
        WHERE etat = 'a-associer'
          AND EXISTS (SELECT 1 FROM activite_detectee b WHERE b.etat = 'associee' AND b.cle <> activite_detectee.cle AND EXISTS (SELECT 1 FROM seances s WHERE s.id = b.seance_id)
                      AND b.debut < activite_detectee.fin + 600000 AND activite_detectee.debut < b.fin + 600000);
    `,
  },
  {
    version: 185,
    nom: "eau-ajout",
    temoin: "eau_ajout",
    // Fibres et eau (planche Fibres et eau, D9 ; docs/CODE-FIBRES-EAU.md) : l'eau bue est une liste d'ajouts (un par verre ou
    // bouteille), jamais un total remis à zéro (D8 : jour local, un ajout rétroactif reste possible). `date` en clair pour
    // l'index, `heure_min` (minutes depuis minuit), `ml` (10 à 5 000) et `libelle` (facultatif) chiffrés en synchro. Synchronisée
    // par la collection générique « changements ». Les cinq réglages (suivi des fibres, objectif, astuce, suivi de l'eau, objectif)
    // rejoignent la liste figée des déclencheurs de « reglages » (aucune ligne à noter : les clés sont neuves).
    sql: `
      CREATE TABLE eau_ajout (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        heure_min INTEGER NOT NULL CHECK (heure_min >= 0 AND heure_min < 1440),
        ml INTEGER NOT NULL CHECK (ml >= 10 AND ml <= 5000),
        libelle TEXT,
        cree_le INTEGER NOT NULL
      );
      CREATE INDEX idx_eau_ajout_date ON eau_ajout (date, heure_min);
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_eau_ajout AFTER ${quand} ON eau_ajout WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('eau_ajout', ${r}.id, ${MS_SQL}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `DROP TRIGGER IF EXISTS sync_${quand[0]!.toLowerCase()}_reglages;
      CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_reglages AFTER ${quand} ON reglages WHEN NOT EXISTS (SELECT 1 FROM sync_silence) AND ${filtreReglages(r, [...REGLAGES_49, "nutri_gras_cible", ...REGLAGES_55, ...REGLAGES_57, ...REGLAGES_58, ...REGLAGES_60, ...REGLAGES_61, ...REGLAGES_185])} BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('reglages', ${r}.cle, ${MS_SQL}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
    `,
  },
  {
    version: 186,
    nom: "exercice-lie",
    temoin: "exercices.lie_a",
    // Exercice perso relié au catalogue (docs/CODE-PICTOS-PERSO.md) : `lie_a` est le slug de l'exercice du catalogue dont il
    // prend le picto et l'animation 3D. Ni fusion ni suppression : séries, records et routines restent sur l'exercice perso.
    // `lien_refuse` : la personne a dit que la suggestion n'était pas la bonne ; on ne la redemande plus. Les deux colonnes
    // voyagent avec la ligne (SELECT *), en clair.
    sql: `
      ALTER TABLE exercices ADD COLUMN lie_a TEXT;
      ALTER TABLE exercices ADD COLUMN lien_refuse INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 187,
    nom: "circuit",
    temoin: "circuit",
    // Circuits à soi (planche Circuits, D3 et D4 ; docs/CODE-CIRCUITS.md) : un GPX importé, une sortie gardée, un circuit à soi publié.
    // Le tracé est la polyline de 400 points au plus (`trace`) et ses altitudes en écarts (`profil`), pas le fichier. `activites` et
    // `bbox` sont du JSON. Tout voyage chiffré de bout en bout sauf l'identifiant et les deux dates : un circuit privé n'est lisible
    // que par la personne ; le serveur ne garde en clair que les circuits publiés (collection `circuits`, sans auteur). Synchronisée
    // par la collection générique « changements ». `source` « gpx » n'existe qu'ici (D4 : un GPX importé reste privé pour toujours).
    sql: `
      CREATE TABLE circuit (
        id TEXT PRIMARY KEY NOT NULL,
        nom TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('boucle', 'aller-retour', 'lineaire')),
        activites TEXT NOT NULL DEFAULT '[]',
        depart_lieu TEXT,
        depart_nom TEXT,
        commune TEXT,
        zone TEXT NOT NULL,
        trace TEXT NOT NULL,
        profil TEXT,
        bbox TEXT NOT NULL,
        distance_m INTEGER NOT NULL CHECK (distance_m >= 0),
        denivele_plus_m INTEGER,
        denivele_moins_m INTEGER,
        alt_min_m INTEGER,
        alt_max_m INTEGER,
        alt_source TEXT CHECK (alt_source IS NULL OR alt_source IN ('ign', 'trace')),
        source TEXT NOT NULL CHECK (source IN ('osm', 'pdipr', 'sortie', 'gpx')),
        source_ref TEXT,
        licence TEXT NOT NULL CHECK (licence IN ('odbl', 'lo2', 'propre')),
        source_maj TEXT,
        visibilite TEXT NOT NULL DEFAULT 'prive' CHECK (visibilite IN ('prive', 'public')),
        publie_le INTEGER,
        cree_le INTEGER NOT NULL,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_circuit_cree ON circuit (cree_le DESC);
      CREATE INDEX idx_circuit_zone ON circuit (zone);
      ${["INSERT", "UPDATE", "DELETE"]
        .map((quand) => {
          const r = quand === "DELETE" ? "OLD" : "NEW";
          return `CREATE TRIGGER sync_${quand[0]!.toLowerCase()}_circuit AFTER ${quand} ON circuit WHEN NOT EXISTS (SELECT 1 FROM sync_silence) BEGIN
        INSERT INTO sync_journal (tab, cle, ms, supprime) VALUES ('circuit', ${r}.id, ${MS_SQL}, ${quand === "DELETE" ? 1 : 0})
          ON CONFLICT (tab, cle) DO UPDATE SET ms = excluded.ms, supprime = excluded.supprime;
      END;`;
        })
        .join("\n      ")}
    `,
  },
  {
    version: 188,
    nom: "circuit_vu",
    temoin: "circuit_vu",
    // Circuits PUBLICS vus des autres (page d'un circuit, lot C) : la fiche telle que le serveur l'a rendue (`donnees`, JSON) et son ETag,
    // gardées pour ouvrir la page hors ligne et la revalider sans tout retélécharger. Un cache : jamais synchronisé (le serveur a déjà
    // le circuit en clair), vidé avec le reste des données du téléphone. `vu_le` date la dernière lecture (le bandeau « Hors ligne »).
    sql: `
      CREATE TABLE circuit_vu (
        id TEXT PRIMARY KEY NOT NULL,
        donnees TEXT NOT NULL,
        etag TEXT,
        vu_le INTEGER NOT NULL
      );
      CREATE INDEX idx_circuit_vu_le ON circuit_vu (vu_le DESC);
    `,
  },
  {
    version: 189,
    nom: "polar",
    temoin: "polar_seance",
    // Connexion directe Polar AccessLink (docs/POLAR.md) : ce qui est lu chez Polar, relu par l'appareil connecté (jetons sur
    // l'appareil), donc local comme whoop_* (jamais synchronisé tel quel). Ce qui en sort pour les calculs voyage chiffré par
    // les tables habituelles : VFC et FC de nuit dans mesure_corps (source « polar »), séances dans seances,
    // nuits de la Récupération dans recup_nuit. polar_seance : une séance Polar, la séance pepfit qu'elle crée ou enrichit, et
    // si sa FC et son tracé ont été écrits dans seance_fc et suivi_point (effacés avec elle à la déconnexion). polar_fc : la FC
    // continue (un point toutes les 5 min) et celle des nuits. polar_nuit : sommeil, stades et Nightly Recharge par nuit
    // (jour du réveil, AAAA-MM-JJ). polar_jour : pas et activité du jour.
    sql: `
      CREATE TABLE polar_seance (
        id TEXT PRIMARY KEY NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        sport TEXT,
        kcal REAL, distance_m REAL, fc_moy REAL, fc_max REAL,
        zones TEXT,
        seance_id TEXT REFERENCES seances(id) ON DELETE SET NULL,
        fc_ecrite INTEGER NOT NULL DEFAULT 0,
        trace_ecrite INTEGER NOT NULL DEFAULT 0,
        maj_le INTEGER NOT NULL
      );
      CREATE INDEX idx_polar_seance_debut ON polar_seance(debut);
      CREATE INDEX idx_polar_seance_seance ON polar_seance(seance_id);
      CREATE TABLE polar_fc (
        t INTEGER PRIMARY KEY NOT NULL,
        bpm INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE polar_nuit (
        jour TEXT PRIMARY KEY NOT NULL,
        debut INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        minutes REAL,
        leger_min REAL, profond_min REAL, paradoxal_min REAL, eveil_min REAL,
        etapes TEXT,
        fc_moy REAL, rmssd REAL, respiration REAL,
        maj_le INTEGER NOT NULL
      );
      CREATE TABLE polar_jour (
        jour TEXT PRIMARY KEY NOT NULL,
        pas INTEGER,
        kcal REAL, kcal_actives REAL, distance_m REAL, actif_min REAL,
        maj_le INTEGER NOT NULL
      );
    `,
  },
  {
    version: 190,
    nom: "salle_lieu_partage",
    temoin: "salle.lieu_partage",
    // Lieu privé partagé (planche lieu-prive C2 ; docs/CODE-LIEU-PRIVE.md) : la salle locale qu'on a partagée garde son historique chez elle
    // et pointe vers son lieu partagé (l'identifiant du lieu côté serveur). Les prochaines activités faites dans cette salle sont montrées
    // aux membres du lieu. NULL : une salle qui n'est pas partagée. Part avec la ligne (SELECT *), chiffrée comme le reste de la salle ; une ligne
    // reçue sans ce champ : NULL.
    sql: `
      ALTER TABLE salle ADD COLUMN lieu_partage TEXT;
    `,
  },
  {
    version: 191,
    nom: "produit_catalogue",
    temoin: "produits.catalogue",
    // Catalogue commun des produits (docs/CODE-CATALOGUE-COMMUN.md) : l'état du partage d'un produit perso. NULL : pas encore envoyé (il
    // partira dès qu'un compte est connecté et que la fiche s'y prête) ; « envoye » : envoyé ; « non » : partage coupé par la personne,
    // ou refus définitif du serveur. Part avec la ligne (en clair : un état, pas une donnée de santé) ; une ligne reçue sans ce champ : NULL.
    sql: `
      ALTER TABLE produits ADD COLUMN catalogue TEXT;
    `,
  },
];

export const VERSION_COURANTE = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** Le témoin d'une migration existe-t-il ? « table », « table.colonne », ou un index (migration qui ne crée que des index). */
export async function temoinPresent(db: Executeur, temoin: string): Promise<boolean> {
  const [table, colonne] = temoin.split(".") as [string, string | undefined];
  const t = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type IN ('table', 'index') AND name = ?", [table]);
  if (!t?.n) return false;
  if (!colonne) return true;
  const c = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?", [table, colonne]);
  return (c?.n ?? 0) > 0;
}

/**
 * Témoins vérifiés : l'empreinte de la liste des migrations (numéros, témoins, SQL) à la fin du dernier passage complet.
 * Base à jour et même liste : les témoins ne sont pas revérifiés au lancement (docs/AUDIT-PERF.md, M11). Une autre liste
 * (une branche installée par-dessus, une fusion qui renumérote) refait la vérification. Réglage de cache : ni synchronisé ni
 * sauvegardé, une restauration l'efface.
 */
export const CLE_MIGRATIONS_VERIFIEES = `${PREFIXE_CACHE}migrations_verifiees`;

export function empreinteMigrations(liste: readonly Migration[]): string {
  let h = 5381;
  for (const c of liste.map((m) => `${m.version}:${m.temoin ?? ""}:${m.sql}`).join("|")) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `${liste.length}-${h.toString(36)}`;
}

/**
 * Applique les migrations manquantes ; `jusqua` limite la version (tests de migration sur une base ancienne), `liste` remplace
 * celle de l'appli (tests). Règle des témoins : voir en tête du fichier.
 */
export async function migrer(db: Executeur, jusqua: number = VERSION_COURANTE, liste: readonly Migration[] = MIGRATIONS): Promise<number> {
  const ligne = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const depart = ligne?.user_version ?? 0;
  const derniere = liste[liste.length - 1]?.version ?? 0;
  const complete = jusqua >= derniere;
  const empreinte = empreinteMigrations(liste);
  if (complete && depart === derniere) {
    const v = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [CLE_MIGRATIONS_VERIFIEES]).catch(() => null);
    if (v?.valeur === empreinte) return depart;
  }
  let version = depart;
  for (const m of liste.filter((x) => x.version <= jusqua)) {
    const passee = m.version <= depart;
    if (m.temoin) {
      const present = await temoinPresent(db, m.temoin);
      if (passee && present) continue;
      if (passee) {
        // numéro pris par une autre branche : la migration s'applique, la version ne bouge pas
        await transaction(db, (db) => db.execAsync(m.sql));
        continue;
      }
      if (present) {
        // déjà faite sous un autre numéro : sautée, la version avance
        await db.execAsync(`PRAGMA user_version = ${m.version}`);
        version = m.version;
        continue;
      }
    } else if (passee) continue;
    await transaction(db, async (db) => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    version = m.version;
  }
  if (complete) {
    await db
      .runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", [CLE_MIGRATIONS_VERIFIEES, empreinte])
      .catch(() => {}); // liste de test sans table reglages : vérifiée à chaque fois
  }
  return version;
}
