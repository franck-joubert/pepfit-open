// Tables synchronisées (migration 12), parents d'abord : c'est l'ordre d'application des ajouts ; les suppressions vont
// dans l'ordre inverse. `cles` forme la clé de synchro (« a|b » pour une clé composée). `sensibles` : colonnes chiffrées de
// bout en bout (NOTES § 6.7 : poids et notes ; la fréquence cardiaque et le sommeil n'ont pas encore de table).
// Inventaire de toutes les tables, synchronisées ou locales et pourquoi : docs/SYNC-COMPLETE.md.

export interface TableSync {
  nom: string;
  cles: readonly string[];
  sensibles: readonly string[];
  /**
   * Index UNIQUE hors de la clé (docs/SYNC-COMPLETE.md § 3) : deux appareils, ou le téléphone et l'IA, peuvent créer la même
   * chose sous deux identifiants. Le plus ancien gagne (`anciennete`, puis la clé) ; l'autre est fusionné selon `fusion`.
   */
  uniques?: readonly (readonly string[])[];
  /** Colonne qui date la création (le plus ancien gagne) ; sans elle, la plus petite clé gagne. */
  anciennete?: string;
  /**
   * « doublon » : le perdant est supprimé partout (ses références suivent `renvois`). « remplace » : il reste, vidé de ses
   * colonnes uniques en conflit, avec `remplace_par` (les lignes qui arrivent encore vers lui ne cassent rien).
   */
  fusion?: "doublon" | "remplace";
  /** Références à réécrire vers le gagnant d'une fusion (table, colonne). */
  renvois?: readonly { table: string; colonne: string }[];
  /** Table synchronisée en partie : seules ces clés (exactes ou par préfixe) voyagent (réglages). */
  filtre?: { colonne: string; exactes: readonly string[]; prefixes: readonly string[] };
  /**
   * Règle de fusion propre à la table : vrai si la ligne locale doit rester malgré une version reçue plus récente (elle repart
   * alors au serveur, et l'autre appareil la reçoit). Sans elle, la plus récente gagne.
   */
  garderLocale?: (locale: Readonly<Record<string, unknown>>, recue: Readonly<Record<string, unknown>>) => boolean;
}

/**
 * Charge de l'Effort (migration 51) : une charge calculée avec la FC de la séance n'est jamais remplacée par une
 * charge calculée sans (un téléphone qui n'a pas la FC ne l'écrase pas) ; à égalité, la plus récente gagne. « Avec la FC » et
 * non « à la FC » : une muscu calculée par le téléphone qui a la FC se mesure au ressenti (D3 de la planche effort-pepfit).
 */
export const garderChargeAvecFc = (locale: Readonly<Record<string, unknown>>, recue: Readonly<Record<string, unknown>>): boolean =>
  Number(locale.avec_fc ?? 0) > Number(recue.avec_fc ?? 0);

/**
 * Activité de la journée (migration 52, docs/EFFORT-ACTIVITE.md) : une journée mesurée plus finement (FC 2, pas heure par
 * heure 1, total 0) n'est jamais remplacée par une mesure plus grossière ; à égalité, la plus récente gagne.
 */
export const garderActiviteMieuxMesuree = (locale: Readonly<Record<string, unknown>>, recue: Readonly<Record<string, unknown>>): boolean =>
  Number(locale.rang ?? 0) > Number(recue.rang ?? 0);

/**
 * Nuits de la Récupération (migration 56, planche recuperation) : une nuit mieux mesurée (VFC 4, FC 2, sommeil de montre 2,
 * du téléphone 1) n'est jamais remplacée par une nuit moins bien mesurée ; à égalité, la plus récente gagne.
 */
export const garderNuitMieuxMesuree = (locale: Readonly<Record<string, unknown>>, recue: Readonly<Record<string, unknown>>): boolean =>
  Number(locale.rang ?? 0) > Number(recue.rang ?? 0);

/**
 * Jours du cycle (migration 58, planche cycle, NOTES § 2.1) : une saisie l'emporte sur Santé Connect pour le même jour (la
 * personne corrige) ; à égalité de source, la plus récente gagne.
 */
export const garderSaisieCycle = (locale: Readonly<Record<string, unknown>>, recue: Readonly<Record<string, unknown>>): boolean =>
  locale.source === "saisie" && recue.source === "sante_connect";

/**
 * Partage des valeurs brutes de Whoop avec l'IA : « 1 » seulement si la personne l'a allumé (Réglages › Données et
 * confidentialité). Pas de préfixe « whoop_ » : ceux-là sont l'état local de la connexion Whoop (purgés à la déconnexion).
 */
export const CLE_PARTAGE_WHOOP_IA = "partage_whoop_ia";

/**
 * Tables des valeurs brutes de Whoop (migration 60) : elles ne voyagent que si le partage est allumé (moteur.ts, pousser) ; il
 * éteint, elles sont vidées sur chaque appareil et leurs suppressions partent au serveur (partage-whoop-ia.ts).
 */
export const TABLES_WHOOP_IA: readonly string[] = ["whoop_brut_jour", "whoop_brut_seance"];

/**
 * Réglages synchronisés (docs/SYNC-COMPLETE.md § 2) : ce que la personne règle et qui vaut sur tous ses appareils. Le reste
 * de `reglages` (curseurs, jetons, caches, état d'un import, affichage propre au téléphone) reste local.
 */
export const REGLAGES_SYNC: readonly string[] = [
  // Profil et parcours
  "prenom", "naissance", "annee_naissance", "sexe", "sexe_declare", "parcours_objectifs", "parcours_sports", "niveau_sport", "niveau_nutrition",
  "partie_train", "partie_food", "partie_health",
  // Région
  "unite", "unite_distance", "langue",
  // Entraînement : repos, effort, tempo, planification, zones de FC
  "repos_defaut", "demander_effort", "tempo_poly", "tempo_isolation", "planif_heure_defaut", "planif_rappel_min", "zones_methode", "fc_max", "fc_max_mode",
  // Santé : objectifs du jour, métabolisme
  "pas_objectif", "sommeil_objectif_min", "sante_bmr_methode", "sante_kcal_pas", "sante_kcal_pas_mode", "sante_digestion",
  // Nutrition : objectifs
  "nutri_auto", "nutri_poids_cible", "nutri_rythme", "nutri_activite", "nutri_gras_cible",
  // Fil (migration 55) : l'onglet allumé, qui voit le fil, ce qui s'y pose, réactions et commentaires, la date de reprise
  "partie_feed", "fil_visibilite", "fil_types", "fil_reactions", "fil_commentaires", "fil_depuis",
  // Calibration personnelle des kcal (migration 57, docs/KCAL-CALIBRATION.md) : les rapports mesure ÷ calcul par famille de sport
  "kcal_calibration",
  // Suivi du cycle (migration 58, planche cycle) : allumé ou non (null : d'après le sexe), Santé Connect, usages dans les calculs
  "cycle_suivi", "cycle_sante_connect", "cycle_recup", "cycle_poids", "cycle_prevision", "cycle_mention_effort",
  // Partage de Whoop brut avec l'IA (migration 60) : l'interrupteur de Données et confidentialité, éteint par défaut. Il voyage
  // pour valoir sur tous les appareils du compte, et pour que le MCP le lise (il ne sert les valeurs Whoop que s'il est « 1 »).
  CLE_PARTAGE_WHOOP_IA,
  // Macros (migration 61, D15) : le niveau d'entraînement choisi et l'alerte de glucides. Jamais « nutri_declarations » (D21).
  "nutri_niveau", "nutri_alerte_glucides",
  // Fibres et eau (migration 185, planche Fibres et eau, D9) : suivre les fibres, leur objectif, l'astuce masquée, suivre l'eau,
  // son objectif en ml. Ils voyagent pour valoir sur tous les appareils du compte.
  "nutri_fibres_suivi", "nutri_fibres_objectif_g", "nutri_fibres_astuce", "nutri_eau_suivi", "nutri_eau_objectif_ml",
];
/**
 * Réglages synchronisés par préfixe (clés fabriquées) : unité d'un exercice, jour d'entraînement ou de repos, règle de
 * répétition d'un repas et jour où elle a été appliquée (un repas vidé sur un appareil ne se remplit pas sur l'autre).
 */
export const PREFIXES_REGLAGES_SYNC: readonly string[] = ["unite:", "nutri_entrainement:", "nutri_repeter:", "nutri_repete_fait:"];

export const TABLES_SYNC: readonly TableSync[] = [
  // Position d'un lieu (29/10) : celle d'un lieu perso est prise sur place (le domicile) : chiffrée ; une ligne reçue d'avant,
  // position en clair, se lit toujours (deballer garde le clair).
  // Salle d'OpenStreetMap ajoutée sur deux téléphones (même source_id) : une seule reste, les séances la suivent.
  // Annuaire pepfit (migration 74) : source_id peut être « pepfit/<id> » ; annuaire_non (les fiches que la personne a dit ne
  // pas être ce lieu) est chiffré comme la position, qu'il trahirait.
  { nom: "salle", cles: ["id"], sensibles: ["lat", "lon", "annuaire_non"], uniques: [["source_id"]], anciennete: "cree_le", fusion: "doublon", renvois: [{ table: "seances", colonne: "salle_id" }, { table: "programmation_lieux", colonne: "lieu_id" }] },
  { nom: "appareil", cles: ["id"], sensibles: [], uniques: [["salle_id", "machine_id"]], fusion: "doublon", renvois: [{ table: "exercices", colonne: "appareil_id" }] },
  // Ancien inventaire des poids libres (migration 19) : plus écrit depuis la migration 66, lu une version, puis retiré.
  { nom: "salle_poids_libre", cles: ["salle_id", "type"], sensibles: [] },
  // Matériel d'un lieu (migration 66, planche materiel) : une ligne par élément. Ce que le lieu possède voyage chiffré (poids,
  // barres, disques) ; le genre et l'unité en clair. L'IA ne le lit pas.
  {
    nom: "salle_materiel", cles: ["id"],
    sensibles: ["forme", "nom", "poids", "poids_propre", "nombre", "charge_max", "max_par_cote", "trou", "prechargee", "disques", "a_verifier"],
  },
  { nom: "equipement_detecte", cles: ["id"], sensibles: [], uniques: [["salle_id", "type_equipement"]], anciennete: "detecte_le", fusion: "doublon" },
  // Colonne tempo (migration 36) : part avec la ligne (SELECT *), en clair comme celui des lignes de routine.
  // Photo et machine (migration 70, planche exercices-perso) : chemins et id en clair, comme pour un plat ; la photo part
  // chiffrée par le moteur (photos).
  { nom: "exercices", cles: ["id"], sensibles: ["note", "coach"] },
  { nom: "appareil_exercice", cles: ["appareil_id", "exercice_id"], sensibles: [] },
  // Barre choisie pour un exercice dans un lieu (migration 66, D8).
  { nom: "exercice_materiel", cles: ["exercice_id", "salle_id"], sensibles: [] },
  // Activités habituelles d'un lieu (migration 25) ; la colonne salle.type part avec la ligne (SELECT *).
  { nom: "lieu_activite", cles: ["lieu_id", "exercice_id"], sensibles: [] },
  { nom: "routine_sections", cles: ["id"], sensibles: [] },
  // Colonnes visible, origine, modifie_par, modifie_le (migration 62, agenda ≠ routines) : partent avec la ligne (SELECT *) ;
  // une routine cachée (le contenu d'une séance prévue) voyage comme les autres. version_origine (la version reçue d'un coach,
  // noms d'exercices et message compris) est chiffrée comme la note.
  { nom: "routines", cles: ["id"], sensibles: ["note", "version_origine"] },
  { nom: "routine_exercices", cles: ["id"], sensibles: ["note"] },
  { nom: "routine_series", cles: ["ligne_id", "rang"], sensibles: [] },
  { nom: "programmations", cles: ["id"], sensibles: [] },
  { nom: "programmation_exceptions", cles: ["id"], sensibles: [], uniques: [["programmation_id", "date_origine"]], fusion: "doublon" },
  // Lieu d'une séance prévue (migration 68) : le lieu dit où la personne sera tel jour, il voyage chiffré ; la programmation et
  // le jour restent en clair, comme une exception. Même occurrence réglée sur deux appareils : une seule ligne reste.
  { nom: "programmation_lieux", cles: ["id"], sensibles: ["lieu_id"], uniques: [["programmation_id", "date_origine"]], fusion: "doublon" },
  // Réglages d'une séance prévue (migration 90) : sport, durée voulue, sans heure ; une ligne par programmation.
  { nom: "programmation_reglages", cles: ["id"], sensibles: [], uniques: [["programmation_id"]], fusion: "doublon" },
  // Colonne score (migration 44, texte libre) : chiffrée comme la note.
  // Séance importée (Hevy) sur deux téléphones : même source_ref, la plus ancienne reste (l'autre part avec ses séries).
  { nom: "seances", cles: ["id"], sensibles: ["note", "score", "message"], uniques: [["source_ref"]], anciennete: "debut", fusion: "doublon" },
  // Colonnes remplace_id et raison_alternative (migration 18) : partent avec la ligne (SELECT *), comme tempo et repos_s.
  // Colonne rir (migration 70) : le ressenti visé de la séance seule, en clair comme celui de la ligne de routine.
  { nom: "seance_exercices", cles: ["seance_id", "exercice_id"], sensibles: ["note"] },
  { nom: "notes", cles: ["id"], sensibles: ["texte"] },
  // Colonne duree_cible_s (migration 38) : part avec la ligne (SELECT *).
  { nom: "series", cles: ["id"], sensibles: [] },
  // Charge de l'Effort de chaque séance (migrations 50 et 51) : en clair comme les séries ; jamais le score.
  { nom: "seance_charge", cles: ["seance_id"], sensibles: [], garderLocale: garderChargeAvecFc },
  // Activité de la journée hors séances (migration 52) : en clair comme seance_charge (des points et un nombre de pas).
  { nom: "jour_activite", cles: ["jour"], sensibles: [], garderLocale: garderActiviteMieuxMesuree },
  // Nuits de la Récupération (migration 56) : les mesures chiffrées comme mesure_corps ; le rang en clair (la règle de fusion).
  { nom: "recup_nuit", cles: ["jour"], sensibles: ["rmssd", "fc_repos", "sommeil_min", "milieu_min", "besoin_min"], garderLocale: garderNuitMieuxMesuree },
  // Récupérer (migration 59, planche recuperer) : la sieste et les activités de récupération. Les mesures (sommeil, FC) et le
  // ressenti voyagent chiffrés ; type, heures, mode et sources en clair, comme une séance. La même session importée sur deux
  // appareils (id_externe Whoop ou Santé Connect) : la plus ancienne reste.
  { nom: "recup_activite", cles: ["id"], sensibles: ["sommeil_min", "fc_moy", "fc_debut", "fc_fin", "ressenti"], uniques: [["id_externe"]], anciennete: "cree_le", fusion: "doublon" },
  // Horaires modifiés d'une nuit (migration 182, planche Effort v2) : la nuit est lue chez Whoop, Santé Connect ou Withings ; seuls ses horaires modifiés et l'original voyagent.
  { nom: "sommeil_horaires", cles: ["jour"], sensibles: ["debut", "fin", "debut_orig", "fin_orig"] },
  // Énergie de pepfit (migration 60, docs/PARITE-MCP.md) : ce que l'appli a calculé pour un jour (kcal de chaque séance, dépense,
  // Âge pepfit, VO2max), tout chiffré ; seule la date reste en clair (la clé). L'IA lit les chiffres de l'écran.
  { nom: "jour_energie", cles: ["jour"], sensibles: ["depense", "seances", "age", "vo2max"] },
  // Valeurs brutes de Whoop pour l'IA (migration 60) : un jour, une séance ; jamais les scores de Whoop (strain, récupération,
  // performance et régularité du sommeil). Tout chiffré ; derrière l'interrupteur « partage_whoop_ia ».
  { nom: "whoop_brut_jour", cles: ["jour"], sensibles: ["valeurs"] },
  { nom: "whoop_brut_seance", cles: ["id"], sensibles: ["valeurs"] },
  // Journal des accords (migration 77, conformité Whoop point 5) : un geste par ligne (accord, retrait), la version du texte
  // et la langue ; aucune donnée de santé. Il voyage toujours (la trace de l'accord vaut sur tous les appareils), chiffré.
  { nom: "accord_journal", cles: ["id"], sensibles: ["action", "version", "langue"] },
  { nom: "pesee", cles: ["id"], sensibles: ["kg"] },
  // Jours du cycle (migration 58, planche cycle) : tout part chiffré, le jour compris (la clé est un id tiré au hasard) ; le
  // serveur ne voit que la date de mise à jour. Le même jour créé sur deux appareils (ou par l'IA) : une seule ligne reste,
  // « ordre » fait gagner la saisie sur Santé Connect, puis la plus ancienne. Même ligne : la saisie n'est jamais remplacée par
  // une lecture de Santé Connect (garderSaisieCycle). Jamais lue par le Fil ni par les coachs (tests/cycle-garde.test.ts).
  {
    nom: "cycle_jour", cles: ["id"], sensibles: ["jour", "flux", "fin", "energie", "humeur", "gene", "source", "hc_id", "ordre", "auteur"],
    uniques: [["jour"]], anciennete: "ordre", fusion: "doublon", garderLocale: garderSaisieCycle,
  },
  { nom: "seance_photo", cles: ["id"], sensibles: [], uniques: [["seance_id"]], anciennete: "cree_le", fusion: "doublon" },
  // Santé (migration 25) : ce qui dit la blessure ou le traitement voyage chiffré (titre, zone, notes, journal, nom, dose) ;
  // statuts, dates et auteurs restent en clair (chiffrés au repos côté serveur, comme les séries).
  // Type et signes (migration 65, planche articulations D5) : chiffrés aussi, le type seul en dirait déjà trop sur la santé.
  { nom: "blessure", cles: ["id"], sensibles: ["titre", "zone", "cote", "notes", "type"] },
  { nom: "blessure_statut", cles: ["id"], sensibles: [] },
  { nom: "blessure_journal", cles: ["id"], sensibles: ["douleur", "texte", "signes"] },
  { nom: "traitement", cles: ["id"], sensibles: ["nom", "dose", "notes"] },
  { nom: "prise", cles: ["id"], sensibles: ["dose"] },
  // Plats (migration 46, planche plats du 30/10) : le nom du plat et le produit de chaque ingrédient (nom, valeurs) voyagent
  // chiffrés ; portions, poids, quantités et chemins de la photo en clair (comme les séries et seance_photo). La photo part
  // chiffrée par le moteur (photos), comme celle d'une séance.
  { nom: "plats", cles: ["id"], sensibles: ["nom", "nutriments_100g"], uniques: [["import_cle"]], anciennete: "cree_le", fusion: "doublon", renvois: [{ table: "consommations", colonne: "plat_id" }] },
  { nom: "plat_ingredients", cles: ["id"], sensibles: ["produit"] },
  // Nutrition, profil et réglages (migration 49, docs/SYNC-COMPLETE.md) : mêmes colonnes chiffrées que le MCP
  // (serveur/mcp/src/donnees.ts). Un produit en double (code-barres ou clé d'import) n'est jamais supprimé : le journal et
  // les plats qui le visent encore restent lisibles ; il est seulement remplacé par le plus ancien.
  {
    nom: "produits", cles: ["id"], sensibles: ["nom", "marque", "nutriments", "code_barres", "ingredients"],
    uniques: [["code_barres"], ["import_cle"]], anciennete: "cree_le", fusion: "remplace",
    renvois: [{ table: "consommations", colonne: "produit_id" }, { table: "plat_ingredients", colonne: "produit_id" }],
  },
  { nom: "repas", cles: ["id"], sensibles: ["nom"], uniques: [["cle"]], fusion: "doublon", renvois: [{ table: "consommations", colonne: "repas_id" }] },
  // Clé d'import (« fitatu:… ») importée sur deux appareils : la même ligne du journal, une seule reste.
  {
    nom: "consommations", cles: ["id"], sensibles: ["produit_id", "quantite_g", "unite", "nb_unites", "composition"],
    uniques: [["import_cle"]], anciennete: "cree_le", fusion: "doublon",
  },
  { nom: "objectifs", cles: ["jour"], sensibles: ["proteines", "glucides", "lipides", "sucres"] },
  // Eau bue (migration 185, planche Fibres et eau, D9) : un ajout par verre ou bouteille. La quantité, l'heure et le libellé
  // voyagent chiffrés ; la date reste en clair (l'index du jour), comme celle d'une pesée.
  { nom: "eau_ajout", cles: ["id"], sensibles: ["ml", "heure_min", "libelle"] },
  // Circuits à soi (migration 187, planche Circuits, D3 et D4) : un GPX importé ou une sortie gardée est privé, donc chiffré de bout
  // en bout ; seuls l'identifiant et les deux dates restent en clair. Le serveur ne lit que les circuits publiés, par une autre voie.
  {
    nom: "circuit", cles: ["id"],
    sensibles: [
      "nom", "type", "activites", "depart_lieu", "depart_nom", "commune", "zone", "trace", "profil", "bbox", "distance_m", "denivele_plus_m",
      "denivele_moins_m", "alt_min_m", "alt_max_m", "alt_source", "source", "source_ref", "licence", "source_maj", "visibilite", "publie_le",
    ],
  },
  { nom: "mensurations", cles: ["id"], sensibles: ["valeur"] },
  // Une mesure importée (Santé Connect, Withings, Whoop) sur deux téléphones : même (type, date, source), une seule reste.
  { nom: "mesure_corps", cles: ["id"], sensibles: ["valeur"], uniques: [["type", "date", "source"]], anciennete: "cree_le", fusion: "doublon" },
  // Programmes suivis : le plan (ses routines et ses programmations voyageaient déjà, plan_id compris).
  { nom: "plans", cles: ["id"], sensibles: [] },
  // Fil (migration 55, docs/CODE-FIL.md) : la publication, puis ses réactions et ses commentaires (parents d'abord). Ce qui
  // dit le contenu voyage chiffré : la légende, l'émoji, le texte ; type, jour, auteur et visibilité en clair, comme les
  // statuts des tables de santé. Publication générée sur deux appareils : même id (tiré de l'activité), une seule ligne.
  // Même réaction posée sur deux appareils (publication, auteur, émoji) : la plus ancienne reste.
  { nom: "publications", cles: ["id"], sensibles: ["legende"] },
  { nom: "reactions", cles: ["id"], sensibles: ["emoji"], uniques: [["publication_id", "auteur"]], anciennete: "cree_le", fusion: "doublon" },
  { nom: "commentaires", cles: ["id"], sensibles: ["texte"] },
  // Réglages qui valent pour la personne (profil, objectifs, zones de FC, VMA, unités, préférences) : la liste est figée
  // dans les déclencheurs de la migration 49 ; en ajouter une demande une migration qui les recrée (test « reglages »).
  { nom: "reglages", cles: ["cle"], sensibles: ["valeur"], filtre: { colonne: "cle", exactes: REGLAGES_SYNC, prefixes: PREFIXES_REGLAGES_SYNC } },
];

const PAR_NOM = new Map(TABLES_SYNC.map((t, i) => [t.nom, { ...t, rang: i }]));

export function tableSync(nom: string): (TableSync & { rang: number }) | null {
  return PAR_NOM.get(nom) ?? null;
}

/** La ligne de clé `cle` voyage-t-elle ? Toujours, sauf dans une table filtrée (réglages). */
export function voyage(t: TableSync, cle: string): boolean {
  const f = t.filtre;
  return !f || f.exactes.includes(cle) || f.prefixes.some((p) => cle.startsWith(p));
}

/** Condition SQL du filtre d'une table (« 1 » sans filtre) ; `alias` : « x. », « NEW. »… Préfixes par substr (« _ » n'est pas un joker). */
export function filtreSql(t: TableSync, alias = ""): string {
  const f = t.filtre;
  if (!f) return "1";
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const c = `${alias}${f.colonne}`;
  const parties = [
    ...(f.exactes.length ? [`${c} IN (${f.exactes.map(q).join(", ")})`] : []),
    ...f.prefixes.map((p) => `substr(${c}, 1, ${p.length}) = ${q(p)}`),
  ];
  return parties.length ? `(${parties.join(" OR ")})` : "0";
}

/** Expression SQL de la clé de synchro d'une ligne (même forme que les déclencheurs de la migration 12). */
export const cleSql = (t: TableSync, alias = "") => t.cles.map((c) => `${alias}${c}`).join(" || '|' || ");

/** Valeurs de la clé de synchro, dans l'ordre de `cles`. */
export const valeursCle = (cle: string) => cle.split("|");
